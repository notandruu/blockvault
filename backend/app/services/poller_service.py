"""
Periodic onchain poller — runs every POLL_INTERVAL_SECONDS as a background asyncio task.

Responsibilities:
  1. For every ACTIVE escrow in the DB, read onchain state and execute release/refund if needed.
  2. Scan recent blocks for EscrowCreated events — catches any escrows the webhook missed.

This is the safety net. Alchemy webhooks are fast but not guaranteed. The poller ensures
no escrow is permanently stuck even if webhooks fail entirely.
"""
import asyncio
import logging
from datetime import datetime, timezone

from app.config import settings
from app.database import AsyncSessionLocal
from app.services import chain_service, escrow_service

log = logging.getLogger(__name__)

# How many blocks to look back in each poller scan for missed EscrowCreated events
SCAN_LOOKBACK_BLOCKS = 300  # ~10 minutes of Base blocks at ~2s/block


async def _poll_once() -> None:
    async with AsyncSessionLocal() as session:
        # ── Step 1: Process all active escrows ────────────────────────────────
        active_escrows = await escrow_service.get_active_escrows(session)
        log.debug("Polling %d active escrows", len(active_escrows))

        for escrow in active_escrows:
            await escrow_service.determine_and_execute(session, escrow)

            # Update polling metadata
            try:
                latest_block = await asyncio.to_thread(chain_service.get_latest_block)
                escrow.last_polled_at = datetime.now(tz=timezone.utc)
                escrow.last_polled_block = latest_block
            except Exception:
                pass

        await session.commit()

        # ── Step 2: Scan for missed EscrowCreated events ─────────────────────
        if not settings.factory_address:
            return

        try:
            latest_block = await asyncio.to_thread(chain_service.get_latest_block)
            from_block = max(0, latest_block - SCAN_LOOKBACK_BLOCKS)

            events = await asyncio.to_thread(
                chain_service.scan_escrow_created_events, from_block, latest_block
            )

            for event in events:
                await escrow_service.upsert_from_chain_event(
                    session,
                    event,
                    settings.factory_address,
                    settings.chain_id,
                )
        except Exception as e:
            log.warning("Event scan failed: %s", e)


async def run_poller() -> None:
    """Entry point — runs forever, sleeping between iterations."""
    log.info(
        "Poller started (interval=%ds)", settings.poll_interval_seconds
    )
    while True:
        try:
            await _poll_once()
        except Exception as e:
            log.error("Poller iteration failed: %s", e)

        await asyncio.sleep(settings.poll_interval_seconds)
