# BlockVault

**Programmable escrow that earns yield while it waits.**

Lock USDC into an escrow — it deposits directly into Aave V3 on Base and earns interest until the release condition is met. Yield splits between sender and recipient at settlement. No idle capital.

**Live:** [blockvault.fyi](https://blockvault.fyi)

---

## How it works

1. Sender approves USDC and creates an escrow with a condition (time-based, manual approval, or Chainlink oracle price)
2. USDC deposits into Aave V3 immediately — aUSDC accrues to the escrow address
3. When the condition is met, anyone can trigger release
4. Recipient receives principal + their share of yield; sender receives their yield share
5. If conditions are never met, sender can reclaim funds after the deadline

Yield is calculated via Aave's liquidity index (`getReserveNormalizedIncome`) — not raw balance deltas — ensuring precision across any holding period.

---

## Condition types

| Type | Description |
|---|---|
| `TIME_BASED` | Releases automatically after a set timestamp |
| `MANUAL_APPROVAL` | Sender explicitly approves release |
| `ORACLE` | Chainlink price feed crosses a threshold (above or below) |

---

## Architecture

```
yield-escrow/        Solidity contracts (Hardhat, Base mainnet fork tests)
  EscrowFactory      Deploys escrows, handles USDC transfer + Aave deposit
  YieldEscrow        Core: yield accrual, release/refund logic, onchain fallbacks
  OracleCondition    Chainlink price feed condition (configurable direction + threshold)

backend/             Python FastAPI
  Alchemy webhooks   Real-time event ingestion (EscrowCreated, Released, Refunded)
  Onchain poller     60s fallback — scans last 300 blocks, syncs DB state
  Postgres + SQLAlchemy  Escrow + webhook event storage

frontend/            Next.js 14 App Router
  wagmi v2 + viem    Onchain reads/writes, live yield polling per block
  RainbowKit         Wallet connection
  Tailwind CSS       UI
```

---

## Tech stack

- **Chain:** Base (mainnet + Sepolia)
- **Contracts:** Solidity 0.8.20, OpenZeppelin v5, Hardhat
- **Yield:** Aave V3 (`IPool.supply` / `IPool.withdraw`, liquidity index math)
- **Oracle:** Chainlink Data Feeds
- **Backend:** Python, FastAPI, SQLAlchemy (async), asyncpg, web3.py
- **Frontend:** Next.js 14, TypeScript, wagmi v2, viem, RainbowKit, Tailwind CSS
- **Infra:** Alchemy (RPC + webhooks), Vercel (frontend), Postgres

---

## Contracts (Base mainnet)

| Contract | Address |
|---|---|
| USDC | `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` |
| Aave V3 Pool | `0xA238Dd80C259a72e81d7e4664a9801593F98d1c5` |
| aUSDC | `0x4e65fE4DbA92790696d040ac24Aa414708F5c0AB` |
| Chainlink ETH/USD | `0x71041dddad3595F9CEd3DcCFBe3D1F4b0a16Bb70` |

---

## Local development

### Contracts

```bash
cd yield-escrow
cp .env.example .env  # add ALCHEMY_BASE_MAINNET_RPC
npm install
npx hardhat test      # forks Base mainnet, 39 tests
```

### Backend

```bash
cd backend
cp .env.example .env  # add DATABASE_URL, ALCHEMY_API_KEY, BACKEND_EOA_PRIVATE_KEY
pip install -r requirements.txt
alembic upgrade head
uvicorn app.main:app --reload
```

### Frontend

```bash
cd frontend
cp .env.example .env.local  # add NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID, NEXT_PUBLIC_ALCHEMY_API_KEY
npm install
npm run dev
```

---

## Onchain fallbacks

Funds are never permanently locked — the backend is not a single point of failure:

- **Recipient:** can self-release 7 days after `conditionMetTimestamp` without backend
- **Sender:** can self-refund 7 days after `deadline` without backend
- **Aave reserve pause:** `withdraw()` failures are caught, state stays `ACTIVE`, retry on next poll
