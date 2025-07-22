from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import Escrow
from app.schemas import EscrowListResponse, EscrowResponse

router = APIRouter(prefix="/escrows", tags=["escrows"])


@router.get("", response_model=EscrowListResponse)
async def list_escrows(
    sender: str | None = Query(None, description="Filter by sender address"),
    recipient: str | None = Query(None, description="Filter by recipient address"),
    address: str | None = Query(None, description="Filter by sender OR recipient address"),
    state: str | None = Query(None, description="Filter by state: ACTIVE | RELEASED | REFUNDED"),
    session: AsyncSession = Depends(get_db),
) -> EscrowListResponse:
    stmt = select(Escrow)

    if address:
        addr = address.lower()
        stmt = stmt.where((Escrow.sender == addr) | (Escrow.recipient == addr))
    elif sender:
        stmt = stmt.where(Escrow.sender == sender.lower())
    elif recipient:
        stmt = stmt.where(Escrow.recipient == recipient.lower())

    if state:
        stmt = stmt.where(Escrow.state == state.upper())

    result = await session.execute(stmt)
    escrows = list(result.scalars().all())

    return EscrowListResponse(
        escrows=[EscrowResponse.model_validate(e) for e in escrows],
        total=len(escrows),
    )


@router.get("/{escrow_address}", response_model=EscrowResponse)
async def get_escrow(
    escrow_address: str,
    session: AsyncSession = Depends(get_db),
) -> EscrowResponse:
    result = await session.execute(
        select(Escrow).where(Escrow.escrow_address == escrow_address.lower())
    )
    escrow = result.scalar_one_or_none()
    if not escrow:
        raise HTTPException(status_code=404, detail="Escrow not found")
    return EscrowResponse.model_validate(escrow)
