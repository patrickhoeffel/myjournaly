"""Remove duplicate events created by running the migration twice."""
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import firebase_admin
from firebase_admin import firestore
from app.config import settings


def dedup():
    options = {}
    if settings.project_id:
        options["projectId"] = settings.project_id
        options["storageBucket"] = settings.storage_bucket
    app = firebase_admin.initialize_app(options=options)
    db = firestore.client(app)

    # Group events by (user_id, title, began_at)
    events_by_key: dict[tuple, list] = {}
    for doc in db.collection("events").stream():
        d = doc.to_dict()
        key = (d.get("user_id", ""), d.get("title", ""), str(d.get("began_at", "")))
        events_by_key.setdefault(key, []).append(doc)

    deleted_events = 0
    deleted_links = 0
    for key, docs in events_by_key.items():
        if len(docs) <= 1:
            continue
        # Keep the first, delete the rest
        for dup in docs[1:]:
            # Delete any links referencing this duplicate event
            for link_doc in db.collection("links").where("from_id", "==", dup.id).stream():
                db.collection("links").document(link_doc.id).delete()
                deleted_links += 1
            for link_doc in db.collection("links").where("to_id", "==", dup.id).stream():
                db.collection("links").document(link_doc.id).delete()
                deleted_links += 1
            db.collection("events").document(dup.id).delete()
            deleted_events += 1
            print(f"  Deleted duplicate: {key[1]} ({key[2][:10]})")

    print(f"\nDone. Removed {deleted_events} duplicate events and {deleted_links} orphaned links.")


if __name__ == "__main__":
    dedup()
