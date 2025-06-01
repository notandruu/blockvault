# Doc Map

last updated: 2026-03-25

## structure

```
yield-escrow/          ← Hardhat project: 3 Solidity contracts
  contracts/
    interfaces/
      ICondition.sol   ← shared interface for release conditions
    EscrowFactory.sol  ← factory pattern, deploys YieldEscrow instances, registry
    YieldEscrow.sol    ← core: Aave V3 integration, yield calc, release/refund
    OracleCondition.sol ← Chainlink price feed, conditionMet() boolean
  test/
    EscrowFactory.test.ts
    YieldEscrow.test.ts
    OracleCondition.test.ts
    helpers/           ← constants, fixtures, utils (time manipulation, impersonation)
  scripts/             ← deploy-factory, deploy-oracle, verify-contracts

backend/               ← Python FastAPI, Alchemy webhooks, Postgres, onchain poller
  app/models.py        ← Escrow + WebhookEvent SQLAlchemy models
  app/routers/         ← webhooks, escrows, health
  app/services/        ← chain_service, poller_service, escrow_service

frontend/              ← Next.js App Router, wagmi/viem, wallet connect
  src/hooks/           ← useCreateEscrow, useEscrowInfo, useCurrentYield, useApproveUsdc
  src/components/      ← CreateEscrowForm, EscrowDetail, EscrowList, YieldDisplay
  src/config/          ← wagmi.ts, contracts.ts (ABIs + addresses), chains.ts

docs/
  PLAN.md              ← full technical plan (architecture, interfaces, schemas, test plan)
  ARCHITECTURE.md      ← append-only decisions log
  DOC-MAP.md           ← this file
```

## conventions

- Solidity: 0.8.20, OpenZeppelin v5, NatSpec on all public functions
- Yield calc: liquidity index via `getReserveNormalizedIncome()` — NOT raw balance deltas
- Basis points: `senderYieldBps` is sender's share (0–10000); recipient gets `10000 - senderYieldBps`
- Access control: owner + authorizedCaller (backend EOA) + onchain fallback paths for sender/recipient
- Tests: all fork Base mainnet at pinned block — no mocked protocols ever
- Backend ingestion: Alchemy webhooks (speed) + 60s onchain poller (reliability fallback)

## chain and protocol addresses (Base mainnet)

| Contract | Address |
|---|---|
| USDC | `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` |
| Aave V3 Pool | `0xA238Dd80C259a72e81d7e4664a9801593F98d1c5` |
| aUSDC | `0x4e65fE4DbA92790696d040ac24Aa414708F5c0AB` |
| Chainlink ETH/USD | `0x71041dddad3595F9CEd3DcCFBe3D1F4b0a16Bb70` |

## architectural decisions

See `docs/ARCHITECTURE.md`.

## recent changes

- 2026-03-25: project initialized, full technical plan written to docs/PLAN.md
