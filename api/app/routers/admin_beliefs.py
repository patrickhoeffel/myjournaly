from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException

from app.models.default_belief import DefaultBelief
from app.services.auth import require_admin
from app.services.firestore import get_firestore_client, DEFAULT_BELIEFS

router = APIRouter(prefix="/admin", tags=["admin-beliefs"])


@router.get("/beliefs", response_model=list[DefaultBelief])
async def list_default_beliefs(admin: dict = Depends(require_admin)):
    db = get_firestore_client()
    results = []
    async for doc in db.collection(DEFAULT_BELIEFS).stream():
        results.append(DefaultBelief.from_firestore(doc.id, doc.to_dict()))
    results.sort(key=lambda b: (b.category.value, b.sort_order, b.name))
    return results


@router.post("/beliefs", response_model=DefaultBelief)
async def create_default_belief(belief: DefaultBelief, admin: dict = Depends(require_admin)):
    db = get_firestore_client()
    data = belief.to_firestore()
    doc_ref = db.collection(DEFAULT_BELIEFS).document()
    await doc_ref.set(data)
    return DefaultBelief.from_firestore(doc_ref.id, data)


@router.put("/beliefs/{belief_id}", response_model=DefaultBelief)
async def update_default_belief(belief_id: str, belief: DefaultBelief, admin: dict = Depends(require_admin)):
    db = get_firestore_client()
    doc_ref = db.collection(DEFAULT_BELIEFS).document(belief_id)
    doc = await doc_ref.get()
    if not doc.exists:
        raise HTTPException(status_code=404, detail="Belief not found")
    data = belief.to_firestore()
    data["updated_at"] = datetime.utcnow().isoformat()
    await doc_ref.update(data)
    return DefaultBelief.from_firestore(belief_id, data)


@router.delete("/beliefs/{belief_id}")
async def delete_default_belief(belief_id: str, admin: dict = Depends(require_admin)):
    db = get_firestore_client()
    doc_ref = db.collection(DEFAULT_BELIEFS).document(belief_id)
    doc = await doc_ref.get()
    if not doc.exists:
        raise HTTPException(status_code=404, detail="Belief not found")
    await doc_ref.delete()
    return {"deleted": belief_id}


@router.post("/beliefs/seed")
async def seed_default_beliefs(admin: dict = Depends(require_admin)):
    """Seed the default beliefs collection with starter beliefs."""
    db = get_firestore_client()

    # Check if already seeded
    existing = []
    async for doc in db.collection(DEFAULT_BELIEFS).limit(1).stream():
        existing.append(doc)
    if existing:
        raise HTTPException(status_code=409, detail="Default beliefs already exist. Delete them first to re-seed.")

    defaults = [
        # Beliefs about myself
        ("self", "I am worthy of love", "I deserve to be loved and accepted as I am", "positive"),
        ("self", "I am capable", "I have the ability to handle life's challenges", "positive"),
        ("self", "I have purpose", "My life has meaning and direction", "positive"),
        ("self", "I can grow and change", "I am not stuck; transformation is possible for me", "positive"),
        ("self", "I am enough", "I don't need to earn my value through performance", "positive"),
        ("self", "I am broken beyond repair", "Something is fundamentally wrong with me", "negative"),
        ("self", "I am unlovable", "If people really knew me, they would reject me", "negative"),
        ("self", "I am a failure", "I will never measure up or succeed", "negative"),
        ("self", "I don't matter", "My presence and contributions are insignificant", "negative"),
        ("self", "I am helpless", "I have no control over what happens to me", "negative"),

        # Beliefs about God
        ("god", "God loves me unconditionally", "God's love for me is not based on my performance", "positive"),
        ("god", "God has a plan for my life", "Even in difficulty, God is working things together for good", "positive"),
        ("god", "God is faithful", "God keeps His promises and will not abandon me", "positive"),
        ("god", "God forgives me", "When I confess, God removes my guilt completely", "positive"),
        ("god", "God is near in suffering", "God draws close to the brokenhearted", "positive"),
        ("god", "God is distant", "God doesn't hear my prayers or care about my pain", "negative"),
        ("god", "God is disappointed in me", "I have let God down too many times", "negative"),
        ("god", "God is punishing me", "My suffering is God's judgment for my mistakes", "negative"),
        ("god", "God plays favorites", "God blesses others more than me", "negative"),
        ("god", "God can't be trusted", "God has let me down before and will again", "negative"),

        # Beliefs about others
        ("others", "People are generally good", "Most people mean well and want to help", "positive"),
        ("others", "I can trust safe people", "There are trustworthy people I can be vulnerable with", "positive"),
        ("others", "Relationships can heal", "Broken relationships can be restored with effort", "positive"),
        ("others", "Others' opinions don't define me", "My identity is not determined by what people think", "positive"),
        ("others", "Community is essential", "I need meaningful connection with others to thrive", "positive"),
        ("others", "People always leave", "Everyone I get close to will eventually abandon me", "negative"),
        ("others", "People can't be trusted", "If I let my guard down, I will be hurt", "negative"),
        ("others", "I must please everyone", "My worth depends on others' approval", "negative"),
        ("others", "Others are against me", "People are out to take advantage of me", "negative"),
        ("others", "I am alone", "No one truly understands me or what I'm going through", "negative"),

        # Beliefs about the world
        ("world", "The world has beauty", "There is goodness and wonder to be found in life", "positive"),
        ("world", "Justice will prevail", "Wrongs will eventually be made right", "positive"),
        ("world", "Hard times are temporary", "Seasons of difficulty do not last forever", "positive"),
        ("world", "Life has meaning", "There is a larger story and purpose to existence", "positive"),
        ("world", "Good can come from suffering", "Pain and struggle can produce growth and resilience", "positive"),
        ("world", "The world is unsafe", "Danger is everywhere and I must always be on guard", "negative"),
        ("world", "Nothing ever changes", "The problems I see will never get better", "negative"),
        ("world", "Life is unfair", "The deck is stacked against me and people like me", "negative"),
        ("world", "The future is hopeless", "Things will only get worse from here", "negative"),
        ("world", "I have no impact", "Nothing I do can make a difference in the world", "negative"),
    ]

    batch = db.batch()
    for i, (cat, name, desc, valence) in enumerate(defaults):
        doc_ref = db.collection(DEFAULT_BELIEFS).document()
        batch.set(doc_ref, {
            "category": cat,
            "name": name,
            "description": desc,
            "valence": valence,
            "sort_order": i % 10,
            "created_at": datetime.utcnow().isoformat(),
        })
    await batch.commit()
    return {"seeded": len(defaults)}
