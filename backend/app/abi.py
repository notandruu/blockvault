from typing import Any

# Minimal ABI for YieldEscrow — functions called by the backend
YIELD_ESCROW_ABI: list[dict[str, Any]] = [
    {
        "name": "getEscrowInfo",
        "type": "function",
        "stateMutability": "view",
        "inputs": [],
        "outputs": [
            {"name": "_sender", "type": "address"},
            {"name": "_recipient", "type": "address"},
            {"name": "_amount", "type": "uint256"},
            {"name": "_conditionType", "type": "uint8"},
            {"name": "_conditionTarget", "type": "address"},
            {"name": "_releaseTimestamp", "type": "uint256"},
            {"name": "_deadline", "type": "uint256"},
            {"name": "_senderYieldBps", "type": "uint16"},
            {"name": "_state", "type": "uint8"},
            {"name": "_manuallyApproved", "type": "bool"},
            {"name": "_conditionMetTimestamp", "type": "uint256"},
            {"name": "_currentYield", "type": "uint256"},
            {"name": "_totalValue", "type": "uint256"},
            {"name": "_snapshotLiquidityIndex", "type": "uint256"},
            {"name": "_currentLiquidityIndex", "type": "uint256"},
        ],
    },
    {
        "name": "release",
        "type": "function",
        "stateMutability": "nonpayable",
        "inputs": [],
        "outputs": [{"name": "success", "type": "bool"}],
    },
    {
        "name": "refund",
        "type": "function",
        "stateMutability": "nonpayable",
        "inputs": [],
        "outputs": [{"name": "success", "type": "bool"}],
    },
    {
        "name": "isConditionMet",
        "type": "function",
        "stateMutability": "view",
        "inputs": [],
        "outputs": [{"name": "", "type": "bool"}],
    },
    {
        "name": "state",
        "type": "function",
        "stateMutability": "view",
        "inputs": [],
        "outputs": [{"name": "", "type": "uint8"}],
    },
    {
        "name": "deadline",
        "type": "function",
        "stateMutability": "view",
        "inputs": [],
        "outputs": [{"name": "", "type": "uint256"}],
    },
    {
        "name": "Released",
        "type": "event",
        "inputs": [
            {"name": "recipientAmount", "type": "uint256", "indexed": False},
            {"name": "senderYieldAmount", "type": "uint256", "indexed": False},
            {"name": "totalYield", "type": "uint256", "indexed": False},
        ],
    },
    {
        "name": "Refunded",
        "type": "event",
        "inputs": [
            {"name": "totalAmount", "type": "uint256", "indexed": False},
        ],
    },
]

# Minimal ABI for EscrowFactory — events read by the poller
ESCROW_FACTORY_ABI: list[dict[str, Any]] = [
    {
        "name": "EscrowCreated",
        "type": "event",
        "inputs": [
            {"name": "escrow", "type": "address", "indexed": True},
            {"name": "sender", "type": "address", "indexed": True},
            {"name": "recipient", "type": "address", "indexed": True},
            {"name": "amount", "type": "uint256", "indexed": False},
            {"name": "conditionType", "type": "uint8", "indexed": False},
            {"name": "conditionTarget", "type": "address", "indexed": False},
            {"name": "releaseTimestamp", "type": "uint256", "indexed": False},
            {"name": "deadline", "type": "uint256", "indexed": False},
            {"name": "senderYieldBps", "type": "uint16", "indexed": False},
            {"name": "createdAt", "type": "uint256", "indexed": False},
        ],
    },
    {
        "name": "isEscrow",
        "type": "function",
        "stateMutability": "view",
        "inputs": [{"name": "", "type": "address"}],
        "outputs": [{"name": "", "type": "bool"}],
    },
]
