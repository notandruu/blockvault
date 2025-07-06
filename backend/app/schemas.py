from datetime import datetime
from typing import Any

from pydantic import BaseModel


class EscrowResponse(BaseModel):
    escrow_address: str
    factory_address: str
    sender: str
    recipient: str
    chain_id: int
    amount: str
    condition_type: int
    condition_target: str | None
    release_timestamp: int | None
    deadline: int | None
    sender_yield_bps: int
    state: str
    created_at: datetime
    created_tx_hash: str | None
    resolved_at: datetime | None
    resolved_tx_hash: str | None
    total_yield: str | None
    sender_yield: str | None
    recipient_yield: str | None
    last_polled_at: datetime | None

    class Config:
        from_attributes = True


class EscrowListResponse(BaseModel):
    escrows: list[EscrowResponse]
    total: int


class HealthResponse(BaseModel):
    status: str
    db: str
    rpc: str
    chain_id: int
