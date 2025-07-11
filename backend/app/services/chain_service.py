"""
Synchronous Web3 interactions with EscrowFactory and YieldEscrow contracts.
All public functions run synchronously — wrap in asyncio.to_thread() for async callers.
"""
import logging
import time
from dataclasses import dataclass
from typing import Any

from eth_account import Account
from web3 import Web3
from web3.contract import Contract
from web3.middleware import ExtraDataToPOAMiddleware

from app.abi import ESCROW_FACTORY_ABI, YIELD_ESCROW_ABI
from app.config import settings

log = logging.getLogger(__name__)

# ─── Singleton Web3 instance ──────────────────────────────────────────────────

def _build_w3() -> Web3:
    w3 = Web3(Web3.HTTPProvider(settings.rpc_url))
    w3.middleware_onion.inject(ExtraDataToPOAMiddleware, layer=0)
    return w3


_w3: Web3 | None = None


def get_w3() -> Web3:
    global _w3
    if _w3 is None:
        _w3 = _build_w3()
    return _w3


def get_account() -> Account:
    return Account.from_key(settings.backend_caller_private_key)


def get_factory() -> Contract:
    w3 = get_w3()
    return w3.eth.contract(
        address=Web3.to_checksum_address(settings.factory_address),
        abi=ESCROW_FACTORY_ABI,
    )


def get_escrow_contract(escrow_address: str) -> Contract:
    w3 = get_w3()
    return w3.eth.contract(
        address=Web3.to_checksum_address(escrow_address),
        abi=YIELD_ESCROW_ABI,
    )


# ─── Read functions ───────────────────────────────────────────────────────────

@dataclass
class OnchainEscrowInfo:
    sender: str
    recipient: str
    amount: int
    condition_type: int
    condition_target: str
    release_timestamp: int
    deadline: int
    sender_yield_bps: int
    state: int          # 0=ACTIVE 1=RELEASED 2=REFUNDED
    manually_approved: bool
    condition_met_timestamp: int
    current_yield: int
    total_value: int
    snapshot_liquidity_index: int
    current_liquidity_index: int


def get_escrow_info(escrow_address: str) -> OnchainEscrowInfo:
    contract = get_escrow_contract(escrow_address)
    result = contract.functions.getEscrowInfo().call()
    return OnchainEscrowInfo(
        sender=result[0],
        recipient=result[1],
        amount=result[2],
        condition_type=result[3],
        condition_target=result[4],
        release_timestamp=result[5],
        deadline=result[6],
        sender_yield_bps=result[7],
        state=result[8],
        manually_approved=result[9],
        condition_met_timestamp=result[10],
        current_yield=result[11],
        total_value=result[12],
        snapshot_liquidity_index=result[13],
        current_liquidity_index=result[14],
    )


def is_condition_met(escrow_address: str) -> bool:
    contract = get_escrow_contract(escrow_address)
    return contract.functions.isConditionMet().call()


def get_latest_block() -> int:
    return get_w3().eth.block_number


# ─── Write functions ──────────────────────────────────────────────────────────

def _send_tx(fn: Any) -> str:
    """Build, sign, and send a contract function call. Returns tx hash as hex string."""
    w3 = get_w3()
    account = get_account()

    gas_price_data = w3.eth.fee_history(1, "latest", [50])
    base_fee = gas_price_data["baseFeePerGas"][-1]
    priority_fee = Web3.to_wei(0.001, "gwei")
    max_fee = base_fee * 2 + priority_fee

    tx = fn.build_transaction(
        {
            "from": account.address,
            "nonce": w3.eth.get_transaction_count(account.address, "pending"),
            "gas": 400_000,
            "maxFeePerGas": max_fee,
            "maxPriorityFeePerGas": priority_fee,
            "chainId": settings.chain_id,
        }
    )
    signed = account.sign_transaction(tx)
    tx_hash = w3.eth.send_raw_transaction(signed.raw_transaction)
    return tx_hash.hex()


def call_release(escrow_address: str) -> str:
    log.info("Calling release() on %s", escrow_address)
    contract = get_escrow_contract(escrow_address)
    return _send_tx(contract.functions.release())


def call_refund(escrow_address: str) -> str:
    log.info("Calling refund() on %s", escrow_address)
    contract = get_escrow_contract(escrow_address)
    return _send_tx(contract.functions.refund())


# ─── Event scanning ───────────────────────────────────────────────────────────

@dataclass
class EscrowCreatedEvent:
    escrow: str
    sender: str
    recipient: str
    amount: int
    condition_type: int
    condition_target: str
    release_timestamp: int
    deadline: int
    sender_yield_bps: int
    created_at: int
    tx_hash: str
    block_number: int


def scan_escrow_created_events(
    from_block: int, to_block: int
) -> list[EscrowCreatedEvent]:
    if not settings.factory_address:
        return []
    factory = get_factory()
    try:
        logs = factory.events.EscrowCreated.get_logs(
            from_block=from_block, to_block=to_block
        )
    except Exception as e:
        log.warning("Event scan failed from %d to %d: %s", from_block, to_block, e)
        return []

    events = []
    for log_entry in logs:
        args = log_entry["args"]
        events.append(
            EscrowCreatedEvent(
                escrow=args["escrow"],
                sender=args["sender"],
                recipient=args["recipient"],
                amount=args["amount"],
                condition_type=args["conditionType"],
                condition_target=args["conditionTarget"],
                release_timestamp=args["releaseTimestamp"],
                deadline=args["deadline"],
                sender_yield_bps=args["senderYieldBps"],
                created_at=args["createdAt"],
                tx_hash=log_entry["transactionHash"].hex(),
                block_number=log_entry["blockNumber"],
            )
        )
    return events
