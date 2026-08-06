import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address

from app.config import settings
from app.services.firestore import init_firebase
from app.routers import users, beliefs, events, journal, resources, timeline, admin, agents, chat, admin_resources, admin_surveys, admin_timelines, admin_feelings, admin_beliefs, admin_services, admin_templates, admin_losses, surveys, people, places, google_import, feelings, links, images, shelves, notebooks, tags, timeline_zoom_presets, losses, photos

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

limiter = Limiter(key_func=get_remote_address, default_limits=["120/minute"])


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_firebase()
    yield


VERSION = "0.1.26"

app = FastAPI(
    title="My Journaly API",
    version=VERSION,
    lifespan=lifespan,
    redirect_slashes=False,
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error(f"Unhandled error: {exc}", exc_info=True)
    return JSONResponse(
        status_code=500,
        content={"detail": str(exc)},
    )


app.include_router(users.router, prefix="/api/v1")
app.include_router(beliefs.router, prefix="/api/v1")
app.include_router(events.router, prefix="/api/v1")
app.include_router(journal.router, prefix="/api/v1")
app.include_router(resources.router, prefix="/api/v1")
app.include_router(timeline.router, prefix="/api/v1")
app.include_router(admin.router, prefix="/api/v1")
app.include_router(agents.router, prefix="/api/v1")
app.include_router(chat.router, prefix="/api/v1")
app.include_router(admin_resources.router, prefix="/api/v1")
app.include_router(admin_surveys.router, prefix="/api/v1")
app.include_router(admin_timelines.router, prefix="/api/v1")
app.include_router(surveys.router, prefix="/api/v1")
app.include_router(people.router, prefix="/api/v1")
app.include_router(places.router, prefix="/api/v1")
app.include_router(google_import.router, prefix="/api/v1")
app.include_router(admin_feelings.router, prefix="/api/v1")
app.include_router(admin_beliefs.router, prefix="/api/v1")
app.include_router(admin_services.router, prefix="/api/v1")
app.include_router(feelings.router, prefix="/api/v1")
app.include_router(links.router, prefix="/api/v1")
app.include_router(images.router, prefix="/api/v1")
app.include_router(shelves.router, prefix="/api/v1")
app.include_router(notebooks.router, prefix="/api/v1")
app.include_router(tags.router, prefix="/api/v1")
app.include_router(admin_templates.router, prefix="/api/v1")
app.include_router(timeline_zoom_presets.router, prefix="/api/v1")
app.include_router(losses.router, prefix="/api/v1")
app.include_router(admin_losses.router, prefix="/api/v1")
app.include_router(photos.router, prefix="/api/v1")


@app.get("/health")
async def health():
    return {"status": "ok", "version": VERSION}
