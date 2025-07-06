from datetime import datetime
from typing import Any

from sqlalchemy import BigInteger, Boolean, DateTime, Integer, Numeric, SmallInteger, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class Escrow(Base):
    __tablename__ = "escrows"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)

    # Contract identity
    escrow_address: Mapped[str] = mapped_column(String(42), unique=True, nullable=False, index=True)
    factory_address: Mapped[str] = mapped_column(String(42), nullable=False)
    sender: Mapped[str] = mapped_column(String(42), nullable=False, index=True)
    recipient: Mapped[str] = mapped_column(String(42), nullable=False, index=True)
    chain_id: Mapped[int] = mapped_column(Integer, nullable=False)

    # Escrow parameters (stored as strings to avoid float precision issues for large uint256 values)
    amount: Mapped[str] = mapped_column(String(78), nullable=False)
    condition_type: Mapped[int] = mapped_column(SmallInteger, nullable=False)  # 0=TIME, 1=MANUAL, 2=ORACLE
    condition_target: Mapped[str | None] = mapped_column(String(42), nullable=True)
    release_timestamp: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    deadline: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    sender_yield_bps: Mapped[int] = mapped_column(Integer, nullable=False)

    # Lifecycle state
    state: Mapped[str] = mapped_column(String(20), nullable=False, default="ACTIVE")  # ACTIVE | RELEASED | REFUNDED

    # Creation metadata
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    created_tx_hash: Mapped[str | None] = mapped_column(String(66), nullable=True)
    created_block: Mapped[int | None] = mapped_column(BigInteger, nullable=True)

    # Resolution metadata (populated on release or refund)
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    resolved_tx_hash: Mapped[str | None] = mapped_column(String(66), nullable=True)
    total_yield: Mapped[str | None] = mapped_column(String(78), nullable=True)
    sender_yield: Mapped[str | None] = mapped_column(String(78), nullable=True)
    recipient_yield: Mapped[str | None] = mapped_column(String(78), nullable=True)

    # Polling metadata
    last_polled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_polled_block: Mapped[int | None] = mapped_column(BigInteger, nullable=True)

    # Internal timestamps
    created_at_db: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at_db: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), onupdate=func.now(), nullable=True
    )


class WebhookEvent(Base):
    __tablename__ = "webhook_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)

    # Alchemy event ID — used for idempotency (unique index)
    event_id: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    event_type: Mapped[str] = mapped_column(String(100), nullable=False)  # EscrowCreated | Released | Refunded
    payload: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False)
    processed: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    received_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
