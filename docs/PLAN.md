# Technical Plan: Yield-Bearing USDC Escrow on Base

One-line pitch: "escrow that earns while it waits." USDC locks in escrow, immediately deposits into Aave V3 to generate yield, releases to recipient when a condition is met (time-based, manual approval, or Chainlink oracle). Yield splits between sender and recipient according to rules set at escrow creation.

---

## 1. Contract Architecture

### Dependency Graph

```
┌─────────────────────────────────────────────────────────────────┐
│                        External Protocols                        │
│                                                                   │
│  Aave V3 IPool          IERC20 (USDC)       AggregatorV3Interface│
│  ─ supply()             ─ approve()          ─ latestRoundData() │
│  ─ withdraw()           ─ transfer()         ─ decimals()        │
│  ─ getReserveNormalized ─ transferFrom()                         │
│    Income()             ─ balanceOf()                             │
└────────┬──────────────────────┬───────────────────────┬──────────┘
         │                      │                       │
         ▼                      ▼                       ▼
┌──────────────────────────────────────────────────────────────────┐
│                        YieldEscrow.sol                            │
│  imports: IPool, IERC20, Ownable, Pausable, ReentrancyGuard     │
│  references: OracleCondition (if conditionType == ORACLE)        │
└────────────────────────────────────┬─────────────────────────────┘
                                     │ created by
                                     │
┌────────────────────────────────────┴─────────────────────────────┐
│                       EscrowFactory.sol                           │
│  imports: YieldEscrow, Ownable, Pausable                         │
└──────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────┐
│                      OracleCondition.sol                          │
│  imports: AggregatorV3Interface                                  │
│  standalone — referenced by YieldEscrow via ICondition interface  │
└──────────────────────────────────────────────────────────────────┘
```

### Shared Interface: ICondition

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface ICondition {
    /// @notice Returns true when the release condition is satisfied
    function conditionMet() external view returns (bool met);
}
```

### Shared Enum: ConditionType

```solidity
enum ConditionType {
    TIME_BASED,       // release after a specific timestamp
    MANUAL_APPROVAL,  // release when authorized caller approves
    ORACLE            // release when ICondition contract returns true
}
```

---

### Contract 1: EscrowFactory.sol

**Inherits:** `Ownable`, `Pausable`

#### State Variables

| Variable | Type | Visibility | Description |
|---|---|---|---|
| `allEscrows` | `address[]` | private | Ordered list of all deployed escrow addresses |
| `escrowsBySender` | `mapping(address => address[])` | private | Sender address to their escrow addresses |
| `escrowsByRecipient` | `mapping(address => address[])` | private | Recipient address to their escrow addresses |
| `isEscrow` | `mapping(address => bool)` | public | Quick lookup: is this address a factory-deployed escrow? |
| `pool` | `address` | public immutable | Aave V3 Pool address |
| `usdc` | `address` | public immutable | USDC token address |
| `aUsdc` | `address` | public immutable | aUSDC token address |

#### Events

```solidity
/// @notice Emitted when a new YieldEscrow is deployed
event EscrowCreated(
    address indexed escrow,
    address indexed sender,
    address indexed recipient,
    uint256 amount,
    ConditionType conditionType,
    address conditionTarget,
    uint256 releaseTimestamp,
    uint256 deadline,
    uint16 senderYieldBps,
    uint256 createdAt
);
```

#### Function Signatures

```solidity
constructor(address _pool, address _usdc, address _aUsdc);

/// @notice Creates a new YieldEscrow. Caller must approve factory for `amount` USDC first.
function createEscrow(
    address recipient,
    uint256 amount,
    ConditionType conditionType,
    address conditionTarget,
    uint256 releaseTimestamp,
    uint256 deadline,
    uint16 senderYieldBps
) external whenNotPaused returns (address escrow);

function getEscrowsBySender(address addr) external view returns (address[] memory);
function getEscrowsByRecipient(address addr) external view returns (address[] memory);
function getEscrowsByAddress(address addr) external view returns (address[] memory);
function getEscrowCount() external view returns (uint256 count);
function getEscrowAtIndex(uint256 index) external view returns (address escrow);
function pause() external onlyOwner;
function unpause() external onlyOwner;
```

---

### Contract 2: YieldEscrow.sol

**Inherits:** `Ownable`, `Pausable`, `ReentrancyGuard`

#### State Variables

| Variable | Type | Visibility | Description |
|---|---|---|---|
| `sender` | `address` | public immutable | Depositor / escrow creator |
| `recipient` | `address` | public immutable | Beneficiary |
| `amount` | `uint256` | public immutable | Principal USDC deposited (6 decimals) |
| `conditionType` | `ConditionType` | public immutable | Release condition type |
| `conditionTarget` | `address` | public immutable | ICondition contract address |
| `releaseTimestamp` | `uint256` | public immutable | Timestamp for TIME_BASED condition |
| `deadline` | `uint256` | public immutable | Auto-refund deadline (0 = none) |
| `senderYieldBps` | `uint16` | public immutable | Sender yield share in basis points (0–10000) |
| `pool` | `IPool` | public immutable | Aave V3 Pool |
| `usdc` | `IERC20` | public immutable | USDC token |
| `aUsdc` | `IERC20` | public immutable | aUSDC token |
| `authorizedCaller` | `address` | public | Backend EOA authorized to call release/refund |
| `snapshotLiquidityIndex` | `uint256` | public | Aave liquidity index at deposit time (RAY = 1e27) |
| `state` | `EscrowState` | public | Current lifecycle state |
| `manuallyApproved` | `bool` | public | Set by authorized caller for MANUAL_APPROVAL type |
| `conditionMetTimestamp` | `uint256` | public | Timestamp when condition was first recorded as met |
| `GRACE_PERIOD` | `uint256` | public constant | 7 days |

#### Enums

```solidity
enum EscrowState { ACTIVE, RELEASED, REFUNDED }
```

#### Events

```solidity
event Deposited(uint256 amount, uint256 liquidityIndex);
event Released(uint256 recipientAmount, uint256 senderYieldAmount, uint256 totalYield);
event Refunded(uint256 totalAmount);
event WithdrawalFailed(bytes reason);
event ManuallyApproved(address indexed caller);
event ConditionRecorded(uint256 timestamp);
event AuthorizedCallerUpdated(address indexed oldCaller, address indexed newCaller);
```

#### Function Signatures

```solidity
constructor(
    address _sender,
    address _recipient,
    uint256 _amount,
    ConditionType _conditionType,
    address _conditionTarget,
    uint256 _releaseTimestamp,
    uint256 _deadline,
    uint16 _senderYieldBps,
    address _pool,
    address _usdc,
    address _aUsdc,
    address _authorizedCaller
);

/// @notice Releases funds to recipient with yield split. If Aave is paused, emits WithdrawalFailed.
/// @dev Authorized caller: anytime condition met. Recipient: after conditionMetTimestamp + GRACE_PERIOD.
function release() external nonReentrant whenNotPaused onlyActive returns (bool success);

/// @notice Refunds full principal + yield to sender. If Aave is paused, emits WithdrawalFailed.
/// @dev Authorized caller: after deadline. Sender: after deadline + GRACE_PERIOD.
function refund() external nonReentrant whenNotPaused onlyActive returns (bool success);

/// @notice Sets manuallyApproved = true (MANUAL_APPROVAL type)
function approve() external onlyAuthorized onlyActive;

/// @notice Records conditionMetTimestamp if condition is met and not yet recorded. Callable by anyone.
function recordConditionMet() external onlyActive;

/// @notice Returns whether release condition is currently satisfied
function isConditionMet() public view returns (bool met);

/// @notice Returns current yield earned: (amount * currentIndex / snapshotIndex) - amount
function getCurrentYield() public view returns (uint256 totalYield);

/// @notice Returns principal + current yield
function getTotalValue() public view returns (uint256 totalValue);

/// @notice Full state dump for frontend
function getEscrowInfo() external view returns (EscrowInfo memory info);

function setAuthorizedCaller(address _newCaller) external onlyOwner;
function pause() external onlyOwner;
function unpause() external onlyOwner;

/// @notice Rescue accidentally sent tokens. Cannot rescue aUSDC.
function rescueToken(address token, address to, uint256 tokenAmount) external onlyOwner;
```

#### Return Struct

```solidity
struct EscrowInfo {
    address sender;
    address recipient;
    uint256 amount;
    ConditionType conditionType;
    address conditionTarget;
    uint256 releaseTimestamp;
    uint256 deadline;
    uint16 senderYieldBps;
    EscrowState state;
    bool manuallyApproved;
    uint256 conditionMetTimestamp;
    uint256 currentYield;
    uint256 totalValue;
    uint256 snapshotLiquidityIndex;
    uint256 currentLiquidityIndex;
}
```

---

### Contract 3: OracleCondition.sol

**Inherits:** `ICondition`

#### State Variables

| Variable | Type | Visibility | Description |
|---|---|---|---|
| `priceFeed` | `AggregatorV3Interface` | public immutable | Chainlink price feed |
| `threshold` | `int256` | public immutable | Price threshold (feed's native decimals) |
| `direction` | `Direction` | public immutable | ABOVE or BELOW |
| `stalenessThreshold` | `uint256` | public immutable | Max age in seconds (default 3600) |

#### Enums

```solidity
enum Direction { ABOVE, BELOW }
```

#### Events

```solidity
event StaleOracleData(uint256 updatedAt, uint256 currentTime);
```

#### Function Signatures

```solidity
constructor(address _priceFeed, int256 _threshold, Direction _direction, uint256 _stalenessThreshold);

/// @notice Returns false if oracle data is stale. Returns true if price satisfies threshold + direction.
function conditionMet() external view override returns (bool met);

/// @notice Returns latest price and updatedAt. Reverts if stale.
function getLatestPrice() external view returns (int256 price, uint256 updatedAt);

function feedDecimals() external view returns (uint8);
```

---

## 2. Yield Delta Calculation

### State Variables Involved

- **`snapshotLiquidityIndex`**: `IPool.getReserveNormalizedIncome(usdc)` captured at `supply()` time. RAY precision (1e27).
- **`amount`**: Principal USDC in 6 decimals.
- **`senderYieldBps`**: Sender's share of yield, 0–10000.

### Formula

```
currentIndex = IPool.getReserveNormalizedIncome(address(usdc))

totalValue   = (amount * currentIndex) / snapshotLiquidityIndex
totalYield   = totalValue - amount

senderYield    = (totalYield * senderYieldBps) / 10000
recipientYield = totalYield - senderYield           // subtraction avoids dust loss
```

On **release**:
- recipient receives: `amount + recipientYield`
- sender receives: `senderYield`

On **refund**:
- sender receives: `amount + totalYield`

### Zero Yield Scenario

When `currentIndex == snapshotLiquidityIndex`: `totalYield = 0`, both yield amounts are 0. Recipient receives exactly `amount`. No transfer to sender.

### Edge Cases

| senderYieldBps | Recipient gets | Sender gets |
|---|---|---|
| 0 | `amount + totalYield` | 0 |
| 5000 | `amount + totalYield/2` | `totalYield/2` |
| 10000 | `amount` | `totalYield` |

Max rounding loss: 1 wei USDC. Subtraction approach for `recipientYield` ensures all yield is accounted for.

---

## 3. Access Control Model

### Roles

| Role | Set By | Description |
|---|---|---|
| Owner | Constructor (Ownable) | Pause/unpause, rotate authorizedCaller, rescue tokens |
| Authorized Caller | Owner via `setAuthorizedCaller()` | Backend EOA — calls release(), refund(), approve() |
| Sender | Immutable at creation | Self-refund after `deadline + GRACE_PERIOD` |
| Recipient | Immutable at creation | Self-release after `conditionMetTimestamp + GRACE_PERIOD` |
| Anyone | N/A | `recordConditionMet()`, view functions |

### Function Access Matrix

| Function | authorizedCaller | sender | recipient | owner |
|---|---|---|---|---|
| `release()` | When condition met | — | After `conditionMetTimestamp + 7d` | — |
| `refund()` | After deadline | After `deadline + 7d` | — | — |
| `approve()` | Yes | — | — | Yes |
| `recordConditionMet()` | Yes | Yes | Yes | Yes (anyone) |
| `setAuthorizedCaller()` | — | — | — | Yes |
| `pause/unpause()` | — | — | — | Yes |

### Backend Authentication

Backend holds a dedicated EOA private key. This address is stored as `authorizedCaller` on each YieldEscrow at deploy time (passed through factory constructor call). Simple `msg.sender == authorizedCaller` check — no signature schemes.

### Onchain Fallback Paths

**Path A — Recipient Self-Release:**
1. Condition becomes true onchain
2. Anyone calls `recordConditionMet()` → sets `conditionMetTimestamp = block.timestamp` (only once)
3. After `conditionMetTimestamp + GRACE_PERIOD` (7 days), recipient calls `release()` directly

**Path B — Sender Self-Refund:**
1. `deadline` passes, backend hasn't called `refund()`
2. After `deadline + GRACE_PERIOD` (7 days), sender calls `refund()` directly

Grace period exists to let the backend act first and prevent frontrunning at the exact deadline second.

---

## 4. Hardhat Project Structure

### Directory Layout

```
yield-escrow/
├── contracts/
│   ├── interfaces/
│   │   └── ICondition.sol
│   ├── EscrowFactory.sol
│   ├── YieldEscrow.sol
│   └── OracleCondition.sol
├── test/
│   ├── EscrowFactory.test.ts
│   ├── YieldEscrow.test.ts
│   ├── OracleCondition.test.ts
│   └── helpers/
│       ├── constants.ts        // Base mainnet addresses, fork block
│       ├── fixtures.ts         // Shared deploy + escrow creation helpers
│       └── utils.ts            // Time manipulation, impersonation helpers
├── scripts/
│   ├── deploy-factory.ts
│   ├── deploy-oracle.ts
│   ├── create-escrow.ts
│   └── verify-contracts.ts
├── hardhat.config.ts
├── package.json
├── tsconfig.json
├── .env.example
└── .gitignore
```

### hardhat.config.ts Summary

```typescript
// Networks:
//   hardhat: forked from Base mainnet, pinned block for deterministic tests
//   baseSepolia: chainId 84532
//   base: chainId 8453
//
// Compiler: solc 0.8.20, optimizer 200 runs
// Etherscan: Basescan API key
```

### Dependencies (package.json)

```json
{
  "devDependencies": {
    "@nomicfoundation/hardhat-toolbox": "^5.0.0",
    "hardhat": "^2.22.0",
    "typescript": "^5.4.0",
    "ts-node": "^10.9.0",
    "@types/node": "^20.0.0"
  },
  "dependencies": {
    "@aave/v3-core": "^1.19.0",
    "@chainlink/contracts": "^1.1.0",
    "@openzeppelin/contracts": "^5.0.0",
    "dotenv": "^16.4.0"
  }
}
```

### Environment Variables (.env.example)

```
ALCHEMY_BASE_MAINNET_RPC=
ALCHEMY_BASE_SEPOLIA_RPC=
DEPLOYER_PRIVATE_KEY=
BACKEND_CALLER_PRIVATE_KEY=
BASESCAN_API_KEY=
FORK_BLOCK_NUMBER=
```

### constants.ts (test helpers)

```typescript
// Base Mainnet Addresses
export const USDC     = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
export const AAVE_POOL = "0xA238Dd80C259a72e81d7e4664a9801593F98d1c5";
export const A_USDC   = "0x4e65fE4DbA92790696d040ac24Aa414708F5c0AB";
export const CHAINLINK_ETH_USD = "0x71041dddad3595F9CEd3DcCFBe3D1F4b0a16Bb70";
export const USDC_WHALE = ""; // fill: Base mainnet address with significant USDC
```

---

## 5. Python FastAPI Backend Structure

### Project Layout

```
backend/
├── app/
│   ├── main.py                  # FastAPI app, startup/shutdown
│   ├── config.py                # Settings via pydantic-settings
│   ├── database.py              # SQLAlchemy engine + session
│   ├── models.py                # SQLAlchemy ORM models
│   ├── schemas.py               # Pydantic request/response schemas
│   ├── routers/
│   │   ├── webhooks.py          # POST /webhooks/alchemy
│   │   ├── escrows.py           # GET /escrows, GET /escrows/{address}
│   │   └── health.py            # GET /health
│   ├── services/
│   │   ├── escrow_service.py    # Business logic
│   │   ├── chain_service.py     # Web3 interactions
│   │   └── poller_service.py    # Periodic onchain state fallback
│   └── worker.py                # Background task runner
├── alembic/
├── requirements.txt
├── Dockerfile
└── .env.example
```

### API Endpoints

| Method | Path | Description |
|---|---|---|
| `POST` | `/webhooks/alchemy` | Alchemy webhook: EscrowCreated, Released, Refunded events |
| `GET` | `/escrows` | All tracked escrows (`?sender=`, `?recipient=`, `?state=`) |
| `GET` | `/escrows/{escrow_address}` | Single escrow full state |
| `GET` | `/health` | DB + RPC connectivity check |

### Alchemy Webhook Handler

```python
# POST /webhooks/alchemy
# 1. Validate X-Alchemy-Signature (HMAC-SHA256) against ALCHEMY_WEBHOOK_SIGNING_KEY
# 2. Parse event: EscrowCreated / Released / Refunded
# 3. Upsert into escrows table (idempotent by event_id)
# 4. Store raw payload in webhook_events table
# 5. Return 200 (Alchemy retries on non-2xx)
```

### Periodic Poller (60s interval, asyncio background task)

```python
# For each ACTIVE escrow in DB:
#   1. Read onchain state via YieldEscrow.getEscrowInfo()
#   2. If onchain state is RELEASED/REFUNDED but DB says ACTIVE → update DB (missed webhook)
#   3. If ACTIVE:
#      a. Check isConditionMet() → if true, send release() tx
#      b. Check deadline passed → if true, send refund() tx
#   4. Update last_polled_at
# Also: scan recent blocks for EscrowCreated events to catch any escrows not yet in DB
```

The dual-ingestion design (webhooks for speed + poller for reliability) ensures no missed webhook permanently stalls an escrow.

### Postgres Schema (SQLAlchemy Models)

```python
class Escrow(Base):
    __tablename__ = "escrows"

    id: Mapped[int]                       # PK, auto-increment
    escrow_address: Mapped[str]           # Contract address, unique index
    factory_address: Mapped[str]
    sender: Mapped[str]                   # indexed
    recipient: Mapped[str]                # indexed
    amount: Mapped[str]                   # USDC as string (no float precision issues)
    condition_type: Mapped[int]           # 0=TIME, 1=MANUAL, 2=ORACLE
    condition_target: Mapped[str | None]
    release_timestamp: Mapped[int | None]
    deadline: Mapped[int | None]
    sender_yield_bps: Mapped[int]
    state: Mapped[str]                    # "ACTIVE", "RELEASED", "REFUNDED"
    chain_id: Mapped[int]                 # 8453 or 84532

    # Creation
    created_at: Mapped[datetime]
    created_tx_hash: Mapped[str | None]
    created_block: Mapped[int | None]

    # Resolution
    resolved_at: Mapped[datetime | None]
    resolved_tx_hash: Mapped[str | None]
    total_yield: Mapped[str | None]
    sender_yield: Mapped[str | None]
    recipient_yield: Mapped[str | None]

    # Polling
    last_polled_at: Mapped[datetime | None]
    last_polled_block: Mapped[int | None]


class WebhookEvent(Base):
    __tablename__ = "webhook_events"

    id: Mapped[int]
    event_id: Mapped[str]                 # Alchemy event ID, unique index
    event_type: Mapped[str]               # "EscrowCreated", "Released", "Refunded"
    payload: Mapped[dict]                 # JSONB
    processed: Mapped[bool]
    received_at: Mapped[datetime]
    error: Mapped[str | None]
```

### Environment Variables

```
DATABASE_URL=postgresql+asyncpg://...
ALCHEMY_WEBHOOK_SIGNING_KEY=
ALCHEMY_BASE_MAINNET_RPC=
ALCHEMY_BASE_SEPOLIA_RPC=
BACKEND_CALLER_PRIVATE_KEY=
FACTORY_ADDRESS_BASE=
FACTORY_ADDRESS_BASE_SEPOLIA=
CHAIN_ID=8453
POLL_INTERVAL_SECONDS=60
```

---

## 6. React + TypeScript Frontend Structure

### Project Layout

```
frontend/
├── src/
│   ├── app/
│   │   ├── layout.tsx
│   │   ├── page.tsx                  # Dashboard / escrow list
│   │   ├── create/page.tsx           # Create escrow form
│   │   └── escrow/[address]/page.tsx # Single escrow detail
│   ├── components/
│   │   ├── ConnectWallet.tsx
│   │   ├── CreateEscrowForm.tsx      # Multi-step: approve USDC → createEscrow
│   │   ├── EscrowCard.tsx
│   │   ├── EscrowDetail.tsx
│   │   ├── EscrowList.tsx
│   │   ├── YieldDisplay.tsx          # Real-time yield counter
│   │   └── TransactionStatus.tsx
│   ├── hooks/
│   │   ├── useCreateEscrow.ts
│   │   ├── useEscrowInfo.ts
│   │   ├── useEscrowList.ts
│   │   ├── useCurrentYield.ts
│   │   └── useApproveUsdc.ts
│   ├── config/
│   │   ├── wagmi.ts                  # Chains, transports, connectors
│   │   ├── contracts.ts              # ABIs + addresses per chain
│   │   └── chains.ts                 # Base + Base Sepolia definitions
│   ├── lib/
│   │   ├── api.ts                    # Backend API client (optional supplement)
│   │   └── format.ts                 # USDC formatting, address truncation
│   └── providers/
│       └── Web3Provider.tsx
```

### Wagmi Hooks Usage

| Hook | Purpose |
|---|---|
| `useAccount` | Connected address, connection status |
| `useConnect` / `useDisconnect` | Wallet connect/disconnect |
| `useChainId` / `useSwitchChain` | Ensure user is on Base |
| `useReadContract` | Single escrow state, factory reads |
| `useReadContracts` | Batch-read multiple escrow infos |
| `useWriteContract` | createEscrow, USDC approve |
| `useWaitForTransactionReceipt` | Poll tx confirmation |
| `useBalance` | Show user's USDC balance |
| `useBlockNumber` | Trigger yield re-reads on new blocks |

### Create Escrow Transaction Sequence

1. User fills form (recipient, amount, condition type, yield split, deadline)
2. If ORACLE: deploy OracleCondition first (separate tx), capture address
3. **Tx 1**: `USDC.approve(factoryAddress, amount)`
4. Wait for Tx 1 confirmation
5. **Tx 2**: `EscrowFactory.createEscrow(...)`
6. Extract `EscrowCreated` event from receipt logs → get new escrow address
7. Navigate to `/escrow/[newEscrowAddress]`

### Data Fetching Strategy

- **Escrow list**: `EscrowFactory.getEscrowsByAddress(connectedAddress)` → batch `YieldEscrow.getEscrowInfo()` — fully onchain, no backend needed
- **Single escrow detail**: `useReadContract` on `getEscrowInfo()`, auto-refreshed by `useBlockNumber`
- **Yield counter**: `getCurrentYield()` polled every block via `query.refetchInterval`
- **Backend API** (optional): Historical metadata, resolved amounts, tx hashes

---

## 7. Test Plan (39 Tests)

All tests fork Base mainnet. No mocked Aave or Chainlink. Use `hardhat_impersonateAccount` for USDC whale funding and `evm_increaseTime`/`evm_mine` for time manipulation.

### EscrowFactory Tests (9)

| # | Test Name | Coverage |
|---|---|---|
| 1 | `should deploy factory with correct immutable addresses` | Constructor sets pool, usdc, aUsdc |
| 2 | `should create escrow and emit EscrowCreated with all params` | Factory deploys YieldEscrow, event has all fields |
| 3 | `should register escrow in sender and recipient mappings` | `getEscrowsBySender` + `getEscrowsByRecipient` |
| 4 | `should return all escrows for address that is both sender and recipient` | `getEscrowsByAddress` union |
| 5 | `should track escrow count correctly after multiple creations` | `getEscrowCount` + `getEscrowAtIndex` |
| 6 | `should revert createEscrow when factory is paused` | Pausable enforcement |
| 7 | `should revert createEscrow with zero amount` | Input validation |
| 8 | `should revert createEscrow with invalid senderYieldBps > 10000` | Input validation |
| 9 | `should revert createEscrow with zero recipient address` | Input validation |

### YieldEscrow Core Tests (11)

| # | Test Name | Coverage |
|---|---|---|
| 10 | `should deposit USDC into Aave and hold aUSDC on creation` | aUSDC balance > 0, USDC balance = 0 |
| 11 | `should snapshot liquidity index at deposit time` | `snapshotLiquidityIndex` matches `getReserveNormalizedIncome` |
| 12 | `should accrue yield over time via Aave supply` | Advance time, `getCurrentYield()` > 0 |
| 13 | `should release with correct yield split (50/50)` | senderYieldBps=5000, verify both amounts |
| 14 | `should release with 0% sender yield (all yield to recipient)` | senderYieldBps=0 |
| 15 | `should release with 100% sender yield (only principal to recipient)` | senderYieldBps=10000 |
| 16 | `should handle zero yield on immediate release` | Same-block release, exact principal returned |
| 17 | `should refund full principal and yield to sender after deadline` | Advance past deadline, refund |
| 18 | `should revert release when condition is not met` | TIME_BASED, before releaseTimestamp |
| 19 | `should revert release by unauthorized caller` | Random address reverts |
| 20 | `should revert refund before deadline` | Refund before deadline reverts |

### Aave Edge Cases (2)

| # | Test Name | Coverage |
|---|---|---|
| 21 | `should handle Aave reserve pause gracefully on release` | Pause USDC reserve → `WithdrawalFailed` event, escrow stays ACTIVE, retry succeeds |
| 22 | `should handle Aave reserve pause gracefully on refund` | Same for refund path |

### Onchain Fallback Tests (6)

| # | Test Name | Coverage |
|---|---|---|
| 23 | `should allow recipient to release after condition met + grace period` | Record condition met, advance 7d+1s, recipient self-releases |
| 24 | `should revert recipient release before grace period expires` | 7d-1s, recipient reverts |
| 25 | `should allow sender to refund after deadline + grace period` | Advance past deadline+7d, sender self-refunds |
| 26 | `should revert sender refund before deadline + grace period` | deadline+6d, sender reverts |
| 27 | `should allow anyone to call recordConditionMet when condition is true` | Random address sets conditionMetTimestamp |
| 28 | `should not overwrite conditionMetTimestamp on second call` | Timestamp immutable after first set |

### OracleCondition Tests (5)

| # | Test Name | Coverage |
|---|---|---|
| 29 | `should return true when price is above threshold (ABOVE direction)` | ETH/USD > threshold → true |
| 30 | `should return false when price is below threshold (ABOVE direction)` | Threshold above current → false |
| 31 | `should return true when price is below threshold (BELOW direction)` | BELOW direction, threshold above price → true |
| 32 | `should return false when oracle data is stale` | Advance time > stalenessThreshold → false |
| 33 | `should integrate with YieldEscrow for oracle-based release` | End-to-end oracle condition release |

### Security Tests (6)

| # | Test Name | Coverage |
|---|---|---|
| 34 | `should resist reentrancy on release` | Malicious receiver contract, ReentrancyGuard blocks |
| 35 | `should resist reentrancy on refund` | Same for refund path |
| 36 | `should not allow rescueToken to withdraw aUSDC` | Reverts on aUSDC rescue attempt |
| 37 | `should allow owner to rescue accidentally sent ERC20 tokens` | Non-aUSDC rescue succeeds |
| 38 | `should prevent double release` | Second release reverts (state=RELEASED) |
| 39 | `should prevent release after refund` | Refund then release reverts (state=REFUNDED) |

---

## 8. Deployment Order and Verification

### Dependency Graph

```
OracleCondition  ──  standalone (Chainlink feed address passed at constructor)
EscrowFactory    ──  standalone (Aave + USDC addresses passed at constructor)
YieldEscrow      ──  deployed by EscrowFactory at runtime (not deployed directly)
```

### Phase 1: Base Sepolia

1. **Deploy OracleCondition**
   - Constructor: `(chainlinkEthUsdSepolia, threshold, direction, 3600)`

2. **Deploy EscrowFactory**
   - Constructor: `(aavePoolSepolia, usdcSepolia, aUsdcSepolia)`

3. **Verify on Basescan Sepolia**
   ```bash
   npx hardhat verify --network baseSepolia <ORACLE_ADDRESS> <priceFeed> <threshold> <direction> 3600
   npx hardhat verify --network baseSepolia <FACTORY_ADDRESS> <aavePool> <usdc> <aUsdc>
   ```

4. Smoke test: create escrow → verify aUSDC deposit → wait → release → verify yield split

### Phase 2: Base Mainnet

5. **Deploy OracleCondition**
   - Constructor: `(0x71041dddad3595F9CEd3DcCFBe3D1F4b0a16Bb70, threshold, direction, 3600)`

6. **Deploy EscrowFactory**
   - Constructor: `(0xA238Dd80C259a72e81d7e4664a9801593F98d1c5, 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913, 0x4e65fE4DbA92790696d040ac24Aa414708F5c0AB)`

7. **Verify on Basescan Mainnet**
   ```bash
   npx hardhat verify --network base <ORACLE_ADDRESS> <priceFeed> <threshold> <direction> 3600
   npx hardhat verify --network base <FACTORY_ADDRESS> <aavePool> <usdc> <aUsdc>
   ```

### YieldEscrow Verification

YieldEscrow is deployed by the factory. After the first escrow is created, verify the deployed instance:

```bash
npx hardhat verify --network base <ESCROW_ADDRESS> \
  <sender> <recipient> <amount> <conditionType> <conditionTarget> \
  <releaseTimestamp> <deadline> <senderYieldBps> \
  <pool> <usdc> <aUsdc> <authorizedCaller>
```

### Constructor Args Summary

| Contract | Mainnet Constructor Args |
|---|---|
| OracleCondition | `priceFeed=0x71041ddd...`, `threshold`, `direction`, `stalenessThreshold=3600` |
| EscrowFactory | `pool=0xA238Dd80...`, `usdc=0x833589fC...`, `aUsdc=0x4e65fE4D...` |
| YieldEscrow | Deployed by factory — args passed through `createEscrow()` |

### Post-Deployment Checklist

1. Confirm contracts show "verified" on Basescan
2. Call `EscrowFactory.pool()`, `.usdc()`, `.aUsdc()` to confirm immutables
3. Configure Alchemy webhook: point to factory address, filter `EscrowCreated` + `Released` + `Refunded` event signatures
4. Fund backend EOA with ETH on Base for gas
5. Set `FACTORY_ADDRESS_BASE` in backend `.env`
6. Create a test escrow with minimal USDC, verify full flow end-to-end
