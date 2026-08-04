"""One-time script to set a user as admin and approve their account."""
import asyncio
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.services.firestore import init_firebase, get_firestore_client, USERS

import firebase_admin
from firebase_admin import auth


async def make_admin(email: str):
    init_firebase()

    # Find user by email in Firebase Auth
    user = auth.get_user_by_email(email)
    print(f"Found user: {user.uid} ({user.email})")

    # Set admin custom claim
    auth.set_custom_user_claims(user.uid, {"admin": True, "provider": False})
    print(f"Set admin claim for {user.email}")

    # Update Firestore profile to approved + admin role
    db = get_firestore_client()
    doc_ref = db.collection(USERS).document(user.uid)
    doc = await doc_ref.get()
    if doc.exists:
        await doc_ref.update({"account_status": "approved", "role": "admin"})
        print(f"Account status set to 'approved', role set to 'admin'")
    else:
        print("No Firestore profile found (that's OK, status will be set on next save)")

    print("Done! User must sign out and back in for admin claim to take effect.")


if __name__ == "__main__":
    email = sys.argv[1] if len(sys.argv) > 1 else "patrick.hoeffel@gmail.com"
    asyncio.run(make_admin(email))
