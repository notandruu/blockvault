import asyncio

from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.schemas import HealthResponse
from app.services import chain_service

router = APIRouter(tags=["health"])


@router.get("/health", response_model=HealthResponse)
async def health_check(session: AsyncSession = Depends(get_db)) -> HealthResponse:
    db_status = "ok"
    rpc_status = "ok"

    try:
        await session.execute(text("SELECT 1"))
    except Exception as e:
        db_status = f"error: {e}"

    try:
        block = await asyncio.to_thread(chain_service.get_latest_block)
        rpc_status = f"ok (block {block})"
    except Exception as e:
        rpc_status = f"error: {e}"

    return HealthResponse(
        status="ok" if db_status == "ok" and rpc_status.startswith("ok") else "degraded",
        db=db_status,
        rpc=rpc_status,
        chain_id=settings.chain_id,
    )
