import firebase_admin
from firebase_admin import firestore
from google.cloud.firestore_v1 import AsyncClient
from google.cloud.firestore_v1.async_client import AsyncClient as FirestoreAsyncClient

from app.config import settings

_app: firebase_admin.App | None = None
_async_client: AsyncClient | None = None


def init_firebase() -> None:
    global _app
    if _app is not None:
        return
    options = {}
    if settings.project_id:
        options["projectId"] = settings.project_id
        options["storageBucket"] = settings.storage_bucket
    _app = firebase_admin.initialize_app(options=options)


def get_firestore_client() -> AsyncClient:
    global _async_client
    init_firebase()
    if _async_client is None:
        _async_client = FirestoreAsyncClient(project=settings.project_id)
    return _async_client


# Collection name constants
USERS = "users"
BELIEFS = "beliefs"
EVENTS = "events"
EVENT_BELIEF_LINKS = "event_belief_links"
JOURNAL_ENTRIES = "journal_entries"
RESOURCES = "resources"
AGENTS = "agents"
PLAYBOOKS = "playbooks"
GUARDRAILS = "guardrails"
CONVERSATIONS = "conversations"
RESOURCE_GROUPS = "resource_groups"
RESOURCE_ACCESS = "resource_access"
TIMELINE_TYPES = "timeline_types"
TIMELINE_ZOOM_PRESETS = "timeline_zoom_presets"
USER_TIMELINES = "user_timelines"
TIMELINE_SEASONS = "timeline_seasons"
PEOPLE = "people"
PLACES = "places"
SURVEYS = "surveys"
SURVEY_SECTIONS = "survey_sections"
SURVEY_QUESTIONS = "survey_questions"
SURVEY_RESPONSES = "survey_responses"
SURVEY_ANSWERS = "survey_answers"
FEELINGS = "feelings"
USER_FEELINGS = "user_feelings"
LINKS = "links"
DEFAULT_BELIEFS = "default_beliefs"
SHELVES = "shelves"
NOTEBOOKS = "notebooks"
TAGS = "tags"
TEMPLATE_SETS = "template_sets"
SHELF_TEMPLATES = "shelf_templates"
NOTEBOOK_TEMPLATES = "notebook_templates"
DEFAULT_TAGS = "default_tags"
LOSSES = "losses"
USER_LOSSES = "user_losses"
PHOTOS = "photos"
