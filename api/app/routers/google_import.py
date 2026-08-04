"""Google Contacts import via OAuth2.

Flow:
1. GET /google/auth-url  → returns the Google OAuth consent URL
2. Frontend redirects user there; Google redirects back with ?code=...
3. POST /google/contacts/import  → exchanges code, fetches contacts, returns preview
4. POST /google/contacts/save    → saves selected contacts as People
"""

import urllib.parse

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.config import settings
from app.models.person import Person
from app.services.auth import get_current_user
from app.services.firestore import get_firestore_client, PEOPLE

router = APIRouter(prefix="/google", tags=["google-import"])

GOOGLE_AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token"
GOOGLE_PEOPLE_API = "https://people.googleapis.com/v1/people/me/connections"
SCOPES = "https://www.googleapis.com/auth/contacts.readonly"


class AuthUrlResponse(BaseModel):
    url: str


class ImportRequest(BaseModel):
    code: str
    redirect_uri: str


class GoogleContact(BaseModel):
    resource_name: str
    first_name: str
    last_name: str | None = None
    email: str | None = None
    phone: str | None = None


class ImportResponse(BaseModel):
    contacts: list[GoogleContact]


class SaveRequest(BaseModel):
    contacts: list[GoogleContact]


@router.get("/auth-url", response_model=AuthUrlResponse)
async def get_auth_url(
    redirect_uri: str,
    user: dict = Depends(get_current_user),
):
    if not settings.google_client_id:
        raise HTTPException(status_code=501, detail="Google OAuth not configured")

    params = {
        "client_id": settings.google_client_id,
        "redirect_uri": redirect_uri,
        "response_type": "code",
        "scope": SCOPES,
        "access_type": "offline",
        "prompt": "consent",
    }
    url = f"{GOOGLE_AUTH_ENDPOINT}?{urllib.parse.urlencode(params)}"
    return AuthUrlResponse(url=url)


async def _exchange_code(code: str, redirect_uri: str) -> str:
    """Exchange authorization code for access token."""
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            GOOGLE_TOKEN_ENDPOINT,
            data={
                "code": code,
                "client_id": settings.google_client_id,
                "client_secret": settings.google_client_secret,
                "redirect_uri": redirect_uri,
                "grant_type": "authorization_code",
            },
        )
        if resp.status_code != 200:
            raise HTTPException(status_code=400, detail=f"Token exchange failed: {resp.text}")
        return resp.json()["access_token"]


async def _fetch_google_contacts(access_token: str) -> list[GoogleContact]:
    """Fetch all contacts from Google People API."""
    contacts: list[GoogleContact] = []
    page_token = None

    async with httpx.AsyncClient() as client:
        while True:
            params = {
                "personFields": "names,emailAddresses,phoneNumbers",
                "pageSize": 100,
            }
            if page_token:
                params["pageToken"] = page_token

            resp = await client.get(
                GOOGLE_PEOPLE_API,
                params=params,
                headers={"Authorization": f"Bearer {access_token}"},
            )
            if resp.status_code != 200:
                raise HTTPException(status_code=502, detail=f"Google API error: {resp.text}")

            data = resp.json()
            for person in data.get("connections", []):
                names = person.get("names", [])
                if not names:
                    continue
                name = names[0]
                emails = person.get("emailAddresses", [])
                phones = person.get("phoneNumbers", [])
                contacts.append(
                    GoogleContact(
                        resource_name=person.get("resourceName", ""),
                        first_name=name.get("givenName", ""),
                        last_name=name.get("familyName"),
                        email=emails[0]["value"] if emails else None,
                        phone=phones[0]["value"] if phones else None,
                    )
                )

            page_token = data.get("nextPageToken")
            if not page_token:
                break

    contacts.sort(key=lambda c: (c.last_name or "", c.first_name))
    return contacts


@router.post("/contacts/import", response_model=ImportResponse)
async def import_contacts(
    req: ImportRequest,
    user: dict = Depends(get_current_user),
):
    """Exchange OAuth code and return a preview of Google contacts."""
    if not settings.google_client_id:
        raise HTTPException(status_code=501, detail="Google OAuth not configured")

    access_token = await _exchange_code(req.code, req.redirect_uri)
    contacts = await _fetch_google_contacts(access_token)
    return ImportResponse(contacts=contacts)


@router.post("/contacts/save", response_model=list[Person])
async def save_imported_contacts(
    req: SaveRequest,
    user: dict = Depends(get_current_user),
):
    """Save selected Google contacts as People."""
    db = get_firestore_client()
    uid = user["uid"]
    saved: list[Person] = []

    for c in req.contacts:
        if not c.first_name:
            continue
        person = Person(
            user_id=uid,
            first_name=c.first_name,
            last_name=c.last_name,
            email=c.email,
            phone=c.phone,
            relationship="other",
        )
        data = person.to_firestore()
        doc_ref = db.collection(PEOPLE).document()
        await doc_ref.set(data)
        saved.append(Person.from_firestore(doc_ref.id, data))

    return saved
