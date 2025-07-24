import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routers import escrows, health, webhooks
from app.services.poller_service import run_poller

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s — %(message)s",
)

_poller_task: asyncio.Task | None = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _poller_task
    _poller_task = asyncio.create_task(run_poller())
    yield
    if _poller_task:
        _poller_task.cancel()
        try:
            await _poller_task
        except asyncio.CancelledError:
            pass


app = FastAPI(
    title="Yield Escrow API",
    description="Backend for yield-bearing programmable escrow on Base",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(webhooks.router)
app.include_router(escrows.router)
app.include_router(health.router)
