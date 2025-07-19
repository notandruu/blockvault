"""
POST /webhooks/alchemy — receives Alchemy Address Activity and Custom Webhook events.

Validates the HMAC-SHA256 signature, stores the raw payload idempotently, and
processes EscrowCreated / Released / Refunded events into the escrows table.
"""
import hashlib
import hmac
import logging
import uuid

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.models import WebhookEvent
from app.services import escrow_service

log = logging.getLogger(__name__)
router = APIRouter(prefix="/webhooks", tags=["webhooks"])


def _verify_signature(body: bytes, signature: str, signing_key: str) -> bool:
    expected = hmac.new(
        signing_key.encode(), body, hashlib.sha256
    ).hexdigest()
    return hmac.compare_digest(expected, signature)


@router.post("/alchemy")
async def alchemy_webhook(
    request: Request,
    session: AsyncSession = Depends(get_db),
) -> dict:
    body = await request.body()

    # Validate signature if signing key is configured
    if settings.alchemy_webhook_signing_key:
        signature = request.headers.get("X-Alchemy-Signature", "")
        if not _verify_signature(body, signature, settings.alchemy_webhook_signing_key):
            raise HTTPException(status_code=401, detail="Invalid webhook signature")

    payload: dict = await request.json()

    # Alchemy sends an array of events under "event.data.block.logs" or similar structure.
    # For Custom Webhooks (graphql-based), events are under payload["event"]["data"]["block"]["logs"].
    # For Address Activity webhooks, the structure is different.
    # We handle both by inspecting the top-level type.

    webhook_type: str = payload.get("type", "")
    event_data = payload.get("event", {})

    # Extract all decoded logs (Alchemy wraps them in different structures)
    logs: list[dict] = []
    if "data" in event_data:
        block = event_data["data"].get("block", {})
        logs = block.get("logs", [])

    # Deduplicate by transaction hash + log index
    for log_entry in logs:
        tx_hash: str = log_entry.get("transaction", {}).get("hash", "")
        log_index: int = log_entry.get("transaction", {}).get("index", 0)
        event_id = f"{tx_hash}:{log_index}"
        event_name: str = log_entry.get("topics", [{}])[0] if log_entry.get("topics") else ""

        # Idempotency: check if already stored
        from sqlalchemy import select
        existing = await session.execute(
            select(WebhookEvent).where(WebhookEvent.event_id == event_id)
        )
        if existing.scalar_one_or_none():
            continue

        # Store raw event
        webhook_event = WebhookEvent(
            event_id=event_id,
            event_type=webhook_type,
            payload=log_entry,
            processed=False,
        )
        session.add(webhook_event)

        # Process known event types
        try:
            decoded = log_entry.get("decoded", {})
            event_type_name = decoded.get("eventName", "")

            if event_type_name == "EscrowCreated":
                inputs = {i["name"]: i["value"] for i in decoded.get("inputs", [])}
                inputs["txHash"] = tx_hash
                inputs["blockNumber"] = log_entry.get("transaction", {}).get("blockNumber")
                await escrow_service.process_escrow_created_event(
                    session,
                    inputs,
                    event_id,
                    settings.factory_address,
                    settings.chain_id,
                )

            elif event_type_name == "Released":
                inputs = {i["name"]: i["value"] for i in decoded.get("inputs", [])}
                escrow_address = log_entry.get("account", {}).get("address", "")
                if escrow_address:
                    from sqlalchemy import select as sel
                    from app.models import Escrow
                    from datetime import datetime, timezone
                    result = await session.execute(
                        sel(Escrow).where(Escrow.escrow_address == escrow_address.lower())
                    )
                    escrow = result.scalar_one_or_none()
                    if escrow:
                        total_yield = inputs.get("totalYield", 0)
                        sender_yield = inputs.get("senderYieldAmount", 0)
                        recipient_yield = int(total_yield) - int(sender_yield) if total_yield else 0
                        escrow.state = "RELEASED"
                        escrow.resolved_at = datetime.now(tz=timezone.utc)
                        escrow.resolved_tx_hash = tx_hash
                        escrow.total_yield = str(total_yield)
                        escrow.sender_yield = str(sender_yield)
                        escrow.recipient_yield = str(recipient_yield)

            elif event_type_name == "Refunded":
                inputs = {i["name"]: i["value"] for i in decoded.get("inputs", [])}
                escrow_address = log_entry.get("account", {}).get("address", "")
                if escrow_address:
                    from sqlalchemy import select as sel
                    from app.models import Escrow
                    from datetime import datetime, timezone
                    result = await session.execute(
                        sel(Escrow).where(Escrow.escrow_address == escrow_address.lower())
                    )
                    escrow = result.scalar_one_or_none()
                    if escrow:
                        escrow.state = "REFUNDED"
                        escrow.resolved_at = datetime.now(tz=timezone.utc)
                        escrow.resolved_tx_hash = tx_hash
                        escrow.total_yield = str(inputs.get("totalAmount", 0))

            webhook_event.processed = True

        except Exception as e:
            log.error("Failed to process webhook event %s: %s", event_id, e)
            webhook_event.error = str(e)

    await session.commit()
    return {"ok": True}
