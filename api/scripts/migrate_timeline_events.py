"""One-time migration: move timeline_events into the unified events collection
and create Links to associate each event with its timeline line."""
import asyncio
import sys
import os
from datetime import datetime

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.services.firestore import (
    init_firebase,
    get_firestore_client,
    EVENTS,
    LINKS,
)

# Hardcoded — this collection is being retired
TIMELINE_EVENTS = "timeline_events"


async def migrate():
    init_firebase()
    db = get_firestore_client()

    migrated = 0
    async for doc in db.collection(TIMELINE_EVENTS).stream():
        old = doc.to_dict()
        user_id = old.get("user_id", "")
        user_timeline_id = old.get("user_timeline_id", "")
        title = old.get("title", "")
        event_date_raw = old.get("event_date", "")
        description = old.get("description")
        image_url = old.get("image_url")

        # Map event_date (YYYY-MM-DD or ISO) -> began_at (ISO datetime)
        if event_date_raw and "T" not in str(event_date_raw):
            began_at = f"{event_date_raw}T00:00:00"
        else:
            began_at = str(event_date_raw) if event_date_raw else datetime.utcnow().isoformat()

        # Create unified Event
        event_data = {
            "user_id": user_id,
            "title": title,
            "description": description,
            "category": "personal",
            "began_at": began_at,
            "ended_at": None,
            "location": None,
            "image_url": image_url,
            "tags": [],
            "created_at": old.get("created_at", datetime.utcnow().isoformat()),
            "updated_at": datetime.utcnow().isoformat(),
        }
        event_ref = db.collection(EVENTS).document()
        await event_ref.set(event_data)

        # Create Link: event -> user_timeline
        if user_timeline_id:
            link_data = {
                "user_id": user_id,
                "from_id": event_ref.id,
                "from_type": "event",
                "from_name": title,
                "to_id": user_timeline_id,
                "to_type": "user_timeline",
                "to_name": "",
                "link_type": "association",
                "link_strength": 0.5,
                "link_description": None,
                "link_source": "migration",
                "link_source_confidence": 1.0,
                "valid_begin_date": None,
                "valid_end_date": None,
                "created_at": datetime.utcnow().isoformat(),
                "modified_at": datetime.utcnow().isoformat(),
                "deleted_at": None,
            }
            await db.collection(LINKS).document().set(link_data)

        migrated += 1
        print(f"  Migrated: {title} ({event_date_raw})")

    print(f"\nDone. Migrated {migrated} timeline events to unified events collection.")
    print("Old timeline_events documents have been left in place for safety.")
    print("Once verified, you can delete the timeline_events collection manually.")


if __name__ == "__main__":
    asyncio.run(migrate())
