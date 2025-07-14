"""
Business logic: process EscrowCreated webhook events, determine release/refund actions.
"""
import asyncio
import logging
import time
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Escrow, WebhookEvent
from app.services import chain_service

log = logging.getLogger(__name__)

STATE_MAP = {0: "ACTIVE", 1: "RELEASED", 2: "REFUNDED"}


# ─── DB helpers ───────────────────────────────────────────────────────────────

async def get_escrow_by_address(
    session: AsyncSession, escrow_address: str
) -> Escrow | None:
    result = await session.execute(
        select(Escrow).where(
            Escrow.escrow_address == escrow_address.lower()
        )
    )
    return result.scalar_one_or_none()


async def get_active_escrows(session: AsyncSession) -> list[Escrow]:
    result = await session.execute(
        select(Escrow).where(Escrow.state == "ACTIVE")
    )
    return list(result.scalars().all())


async def get_escrows_for_address(
    session: AsyncSession,
    address: str,
    state: str | None = None,
) -> list[Escrow]:
    addr = address.lower()
    stmt = select(Escrow).where(
        (Escrow.sender == addr) | (Escrow.recipient == addr)
    )
    if state:
        stmt = stmt.where(Escrow.state == state.upper())
    result = await session.execute(stmt)
    return list(result.scalars().all())


# ─── Event processing ─────────────────────────────────────────────────────────

async def process_escrow_created_event(
    session: AsyncSession,
    payload: dict,
    event_id: str,
    factory_address: str,
    chain_id: int,
) -> None:
    """
    Upsert an Escrow row from an EscrowCreated event payload.
    Idempotent: if the escrow already exists, skip.
    """
    existing = await get_escrow_by_address(session, payload["escrow"])
    if existing:
        log.debug("Escrow %s already tracked, skipping", payload["escrow"])
        return

    escrow = Escrow(
        escrow_address=payload["escrow"].lower(),
        factory_address=factory_address.lower(),
        sender=payload["sender"].lower(),
        recipient=payload["recipient"].lower(),
        chain_id=chain_id,
        amount=str(payload["amount"]),
        condition_type=payload["conditionType"],
        condition_target=payload.get("conditionTarget", "").lower() or None,
        release_timestamp=payload.get("releaseTimestamp") or None,
        deadline=payload.get("deadline") or None,
        sender_yield_bps=payload["senderYieldBps"],
        state="ACTIVE",
        created_at=datetime.fromtimestamp(payload["createdAt"], tz=timezone.utc),
        created_tx_hash=payload.get("txHash"),
        created_block=payload.get("blockNumber"),
    )
    session.add(escrow)
    await session.commit()
    log.info("Tracked new escrow %s", payload["escrow"])


async def upsert_from_chain_event(
    session: AsyncSession,
    event: chain_service.EscrowCreatedEvent,
    factory_address: str,
    chain_id: int,
) -> None:
    """Upsert an Escrow row from a directly scanned onchain event."""
    existing = await get_escrow_by_address(session, event.escrow)
    if existing:
        return

    escrow = Escrow(
        escrow_address=event.escrow.lower(),
        factory_address=factory_address.lower(),
        sender=event.sender.lower(),
        recipient=event.recipient.lower(),
        chain_id=chain_id,
        amount=str(event.amount),
        condition_type=event.condition_type,
        condition_target=event.condition_target.lower() if event.condition_target != "0x0000000000000000000000000000000000000000" else None,
        release_timestamp=event.release_timestamp or None,
        deadline=event.deadline or None,
        sender_yield_bps=event.sender_yield_bps,
        state="ACTIVE",
        created_at=datetime.fromtimestamp(event.created_at, tz=timezone.utc),
        created_tx_hash=event.tx_hash,
        created_block=event.block_number,
    )
    session.add(escrow)
    await session.commit()
    log.info("Recovered missed escrow %s from onchain scan", event.escrow)


# ─── Action determination ─────────────────────────────────────────────────────

async def determine_and_execute(
    session: AsyncSession,
    escrow: Escrow,
) -> None:
    """
    For a single ACTIVE escrow:
      1. Read onchain state
      2. Sync DB if state diverged (missed webhook)
      3. Execute release/refund if conditions are met
    """
    try:
        info = await asyncio.to_thread(
            chain_service.get_escrow_info, escrow.escrow_address
        )
    except Exception as e:
        log.error("Failed to read onchain state for %s: %s", escrow.escrow_address, e)
        return

    onchain_state = STATE_MAP.get(info.state, "ACTIVE")

    if onchain_state != "ACTIVE":
        escrow.state = onchain_state
        escrow.resolved_at = datetime.now(tz=timezone.utc)
        await session.commit()
        log.info("Synced escrow %s state to %s from chain", escrow.escrow_address, onchain_state)
        return

    now = int(time.time())

    # Check if condition is met → release
    try:
        condition_met = await asyncio.to_thread(
            chain_service.is_condition_met, escrow.escrow_address
        )
    except Exception:
        condition_met = False

    if condition_met:
        log.info("Condition met for %s, calling release()", escrow.escrow_address)
        try:
            tx_hash = await asyncio.to_thread(
                chain_service.call_release, escrow.escrow_address
            )
            log.info("release() tx sent: %s", tx_hash)
        except Exception as e:
            log.error("release() failed for %s: %s", escrow.escrow_address, e)
        return

    # Check if deadline passed → refund
    if escrow.deadline and now >= escrow.deadline:
        log.info("Deadline passed for %s, calling refund()", escrow.escrow_address)
        try:
            tx_hash = await asyncio.to_thread(
                chain_service.call_refund, escrow.escrow_address
            )
            log.info("refund() tx sent: %s", tx_hash)
        except Exception as e:
            log.error("refund() failed for %s: %s", escrow.escrow_address, e)
