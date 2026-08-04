"""Seed the admin Losses catalog with the starter list.

Runs against whatever Firestore project your ADC points to (see README).
Idempotent: skips losses already present by name.
"""
import asyncio
import sys
import os
from datetime import datetime

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.services.firestore import init_firebase, get_firestore_client, LOSSES


STARTER_LOSSES = [
    "Opportunities",
    "Time",
    "Skills",
    "Safety",
    "Love",
    "Security",
    "Encouragement",
    "Support",
    "Comfort",
    "Experiences",
    "Enjoyment",
    "Childhood",
    "Wisdom",
    "Validation",
    "Happiness",
    "Freedom",
    "Joy",
    "Affirmation",
    "Carefree Feeling",
    "Possessions",
    "Ability to Express Emotions",
    "Acceptance",
    "Innocence",
    "Nurturing",
    "Virtue",
    "Health",
    "Employment",
    "Truth",
    "Satisfaction",
    "Choice",
    "Identity",
    "Justice",
    "Protection",
    "Femininity or Masculinity",
    "Faith",
    "Intimacy",
    "Purity",
    "Authority",
    "Confidence",
    "Trust",
    "Hope",
    "Self-Respect",
    "Relationship",
    "Mentorship",
    "Life Skills",
    "Affection",
    "Family",
    "Memories",
    "Contentment",
    "Sense of Self",
]


async def seed():
    init_firebase()
    db = get_firestore_client()

    existing_names = set()
    async for doc in db.collection(LOSSES).stream():
        name = doc.to_dict().get("name")
        if name:
            existing_names.add(name)

    added = 0
    skipped = 0
    now = datetime.utcnow().isoformat()
    for idx, name in enumerate(STARTER_LOSSES):
        if name in existing_names:
            skipped += 1
            continue
        await db.collection(LOSSES).document().set({
            "name": name,
            "category": None,
            "description": None,
            "sort_order": idx,
            "created_at": now,
            "updated_at": now,
        })
        added += 1
        print(f"  + {name}")

    print(f"\nDone. Added {added}, skipped {skipped} (already present).")


if __name__ == "__main__":
    asyncio.run(seed())
