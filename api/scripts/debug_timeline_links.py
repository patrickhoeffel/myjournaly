"""Debug script: check what events and links look like in Firestore (sync client)."""
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import firebase_admin
from firebase_admin import firestore
from app.config import settings


def debug():
    print(f"Project ID: '{settings.project_id}'")

    options = {}
    if settings.project_id:
        options["projectId"] = settings.project_id
        options["storageBucket"] = settings.storage_bucket
    app = firebase_admin.initialize_app(options=options)
    db = firestore.client(app)

    print(f"Firestore project: '{db.project}'")

    print("\n=== TIMELINE_EVENTS (old, first 3) ===")
    docs = db.collection("timeline_events").limit(3).get()
    for doc in docs:
        d = doc.to_dict()
        print(f"  id={doc.id} title={d.get('title')} event_date={d.get('event_date')}")
    if not docs:
        print("  (empty)")

    print("\n=== EVENTS (new, first 3) ===")
    docs = db.collection("events").limit(3).get()
    for doc in docs:
        d = doc.to_dict()
        print(f"  id={doc.id} title={d.get('title')} began_at={d.get('began_at')}")
    if not docs:
        print("  (empty)")

    print("\n=== LINKS (first 5) ===")
    docs = db.collection("links").limit(5).get()
    for doc in docs:
        d = doc.to_dict()
        print(f"  id={doc.id} from_type={d.get('from_type')} to_type={d.get('to_type')} deleted_at={d.get('deleted_at')} ({type(d.get('deleted_at')).__name__})")
    if not docs:
        print("  (empty)")


if __name__ == "__main__":
    debug()
