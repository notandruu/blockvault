// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IPool} from "./interfaces/IPool.sol";
import {ICondition} from "./interfaces/ICondition.sol";

/// @title YieldEscrow
/// @notice Holds USDC deposited into Aave V3 while it earns yield.
///         Releases funds to recipient (with yield split) when a condition is met,
///         or refunds sender (with all yield) if a deadline passes.
///
///         Three condition types:
///           TIME_BASED      — releases after a specified timestamp
///           MANUAL_APPROVAL — releases when authorized caller sets approval
///           ORACLE          — releases when an ICondition contract returns true
///
///         Onchain fallback paths (no backend required):
///           Recipient can call release() after conditionMetTimestamp + GRACE_PERIOD
///           Sender can call refund() after deadline + GRACE_PERIOD
///
///         Aave reserve pause is handled gracefully: withdraw() failure emits
///         WithdrawalFailed and returns false, allowing a retry later.
contract YieldEscrow is Ownable, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ─── Types ────────────────────────────────────────────────────────────────

    enum ConditionType {
        TIME_BASED,
        MANUAL_APPROVAL,
        ORACLE
    }

    enum EscrowState {
        ACTIVE,
        RELEASED,
        REFUNDED
    }

    // ─── Immutable state ──────────────────────────────────────────────────────

    /// @notice Address of the depositor / escrow creator
    address public immutable sender;

    /// @notice Address of the escrow beneficiary
    address public immutable recipient;

    /// @notice USDC amount deposited (6 decimals)
    uint256 public immutable amount;

    /// @notice Type of release condition
    ConditionType public immutable conditionType;

    /// @notice ICondition contract address (address(0) if not ORACLE type)
    address public immutable conditionTarget;

    /// @notice Timestamp for TIME_BASED release (0 if not TIME_BASED)
    uint256 public immutable releaseTimestamp;

    /// @notice Auto-refund deadline as unix timestamp (0 = no deadline)
    uint256 public immutable deadline;

    /// @notice Sender's share of yield in basis points (0 = all yield to recipient; 10000 = all to sender)
    uint16 public immutable senderYieldBps;

    /// @notice Aave V3 Pool
    IPool public immutable pool;

    /// @notice USDC token
    IERC20 public immutable usdc;

    /// @notice aUSDC token
    IERC20 public immutable aUsdc;

    /// @notice The EscrowFactory that deployed this contract
    address public immutable factory;

    // ─── Mutable state ────────────────────────────────────────────────────────

    /// @notice Backend EOA authorized to call release(), refund(), and approve()
    address public authorizedCaller;

    /// @notice Aave liquidity index snapshot at deposit time (RAY = 1e27 precision)
    ///         Set by factory via initialize() after Aave supply. Used for yield calculation.
    uint256 public snapshotLiquidityIndex;

    /// @notice Current escrow lifecycle state
    EscrowState public state;

    /// @notice True once authorize() has been called (MANUAL_APPROVAL type only)
    bool public manuallyApproved;

    /// @notice Block timestamp when condition was first recorded as met.
    ///         Set via recordConditionMet(). Enables recipient's GRACE_PERIOD fallback path.
    uint256 public conditionMetTimestamp;

    // ─── Constants ────────────────────────────────────────────────────────────

    /// @notice Grace period after condition is met before recipient can self-release,
    ///         and after deadline before sender can self-refund.
    uint256 public constant GRACE_PERIOD = 7 days;

    // ─── Events ───────────────────────────────────────────────────────────────

    /// @notice Emitted when USDC is confirmed deposited into Aave
    event Deposited(uint256 amount, uint256 liquidityIndex);

    /// @notice Emitted when funds are distributed on release
    /// @param recipientAmount USDC sent to recipient (principal + recipient yield share)
    /// @param senderYieldAmount USDC sent to sender as yield share
    /// @param totalYield Total yield earned
    event Released(uint256 recipientAmount, uint256 senderYieldAmount, uint256 totalYield);

    /// @notice Emitted when funds are refunded to the sender
    /// @param totalAmount Total USDC refunded (principal + all yield)
    event Refunded(uint256 totalAmount);

    /// @notice Emitted when Aave withdraw() reverts (e.g. reserve paused). Funds are NOT lost.
    ///         Call release() or refund() again once the reserve is unpaused.
    event WithdrawalFailed(bytes reason);

    /// @notice Emitted when manual approval is granted
    event ManuallyApproved(address indexed caller);

    /// @notice Emitted when the condition-met timestamp is first recorded
    event ConditionRecorded(uint256 timestamp);

    /// @notice Emitted when the authorized caller address is updated
    event AuthorizedCallerUpdated(address indexed oldCaller, address indexed newCaller);

    // ─── Modifiers ────────────────────────────────────────────────────────────

    modifier onlyAuthorized() {
        require(
            msg.sender == authorizedCaller || msg.sender == owner(),
            "YieldEscrow: unauthorized"
        );
        _;
    }

    modifier onlyActive() {
        require(state == EscrowState.ACTIVE, "YieldEscrow: not active");
        _;
    }

    // ─── Constructor ──────────────────────────────────────────────────────────

    /// @notice Initializes the escrow parameters. Does NOT interact with Aave.
    ///         The factory calls initialize() after deploying and supplying to Aave.
    /// @dev msg.sender is recorded as the factory address.
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
    ) Ownable(_sender) {
        require(_sender != address(0), "YieldEscrow: zero sender");
        require(_recipient != address(0), "YieldEscrow: zero recipient");
        require(_amount > 0, "YieldEscrow: zero amount");
        require(_senderYieldBps <= 10000, "YieldEscrow: invalid bps");
        require(_authorizedCaller != address(0), "YieldEscrow: zero caller");

        sender = _sender;
        recipient = _recipient;
        amount = _amount;
        conditionType = _conditionType;
        conditionTarget = _conditionTarget;
        releaseTimestamp = _releaseTimestamp;
        deadline = _deadline;
        senderYieldBps = _senderYieldBps;
        pool = IPool(_pool);
        usdc = IERC20(_usdc);
        aUsdc = IERC20(_aUsdc);
        authorizedCaller = _authorizedCaller;
        factory = msg.sender;
    }

    // ─── Initialization ───────────────────────────────────────────────────────

    /// @notice Called once by the factory after deploying this contract and supplying USDC to Aave.
    ///         Records the liquidity index snapshot for yield calculation.
    /// @param _snapshotIndex Aave liquidity index (RAY) at the moment of supply()
    function initialize(uint256 _snapshotIndex) external {
        require(msg.sender == factory, "YieldEscrow: only factory");
        require(snapshotLiquidityIndex == 0, "YieldEscrow: already initialized");
        require(_snapshotIndex > 0, "YieldEscrow: invalid index");
        snapshotLiquidityIndex = _snapshotIndex;
        emit Deposited(amount, _snapshotIndex);
    }

    // ─── Core functions ───────────────────────────────────────────────────────

    /// @notice Releases funds to recipient with yield split applied.
    ///         If Aave withdraw reverts (reserve paused), emits WithdrawalFailed and returns false.
    ///         Funds remain accessible — call again once the reserve is unpaused.
    ///
    ///         Access rules:
    ///           authorizedCaller / owner — callable when isConditionMet() returns true
    ///           recipient                — callable after conditionMetTimestamp + GRACE_PERIOD
    ///
    /// @return success True if funds were successfully distributed
    function release()
        external
        nonReentrant
        whenNotPaused
        onlyActive
        returns (bool success)
    {
        if (msg.sender == recipient) {
            require(
                conditionMetTimestamp != 0 &&
                    block.timestamp >= conditionMetTimestamp + GRACE_PERIOD,
                "YieldEscrow: grace period not expired"
            );
        } else {
            require(
                msg.sender == authorizedCaller || msg.sender == owner(),
                "YieldEscrow: unauthorized"
            );
            require(isConditionMet(), "YieldEscrow: condition not met");
        }
        return _executeRelease();
    }

    /// @notice Refunds full principal + yield to sender.
    ///         If Aave withdraw reverts, emits WithdrawalFailed and returns false.
    ///
    ///         Access rules:
    ///           authorizedCaller / owner — callable once deadline has passed
    ///           sender                   — callable after deadline + GRACE_PERIOD
    ///
    /// @return success True if funds were successfully refunded
    function refund()
        external
        nonReentrant
        whenNotPaused
        onlyActive
        returns (bool success)
    {
        require(
            deadline != 0 && block.timestamp >= deadline,
            "YieldEscrow: deadline not passed"
        );

        if (msg.sender == sender) {
            require(
                block.timestamp >= deadline + GRACE_PERIOD,
                "YieldEscrow: sender grace period not expired"
            );
        } else {
            require(
                msg.sender == authorizedCaller || msg.sender == owner(),
                "YieldEscrow: unauthorized"
            );
        }
        return _executeRefund();
    }

    /// @notice Sets manuallyApproved = true, satisfying the MANUAL_APPROVAL condition.
    ///         Only meaningful when conditionType == MANUAL_APPROVAL.
    function approve() external onlyAuthorized onlyActive {
        require(
            conditionType == ConditionType.MANUAL_APPROVAL,
            "YieldEscrow: not manual type"
        );
        manuallyApproved = true;
        emit ManuallyApproved(msg.sender);
    }

    /// @notice Records that the release condition is currently met, setting conditionMetTimestamp.
    ///         Enables the recipient's GRACE_PERIOD fallback path.
    ///         Callable by anyone. Does not overwrite an existing timestamp.
    function recordConditionMet() external onlyActive {
        require(conditionMetTimestamp == 0, "YieldEscrow: already recorded");
        require(isConditionMet(), "YieldEscrow: condition not met");
        conditionMetTimestamp = block.timestamp;
        emit ConditionRecorded(block.timestamp);
    }

    // ─── View functions ───────────────────────────────────────────────────────

    /// @notice Returns whether the release condition is currently satisfied
    function isConditionMet() public view returns (bool) {
        if (conditionType == ConditionType.TIME_BASED) {
            return releaseTimestamp != 0 && block.timestamp >= releaseTimestamp;
        }
        if (conditionType == ConditionType.MANUAL_APPROVAL) {
            return manuallyApproved;
        }
        if (conditionType == ConditionType.ORACLE) {
            return
                conditionTarget != address(0) &&
                ICondition(conditionTarget).conditionMet();
        }
        return false;
    }

    /// @notice Computes the current accrued yield using the Aave liquidity index approach.
    ///         yield = (amount * currentIndex / snapshotIndex) - amount
    /// @return Current yield in USDC (6 decimals). Returns 0 if not yet initialized.
    function getCurrentYield() public view returns (uint256) {
        if (snapshotLiquidityIndex == 0) return 0;
        uint256 currentIndex = pool.getReserveNormalizedIncome(address(usdc));
        uint256 totalValue = (amount * currentIndex) / snapshotLiquidityIndex;
        return totalValue > amount ? totalValue - amount : 0;
    }

    /// @notice Returns total current value held (principal + accrued yield)
    /// @return Total USDC value (6 decimals)
    function getTotalValue() public view returns (uint256) {
        if (snapshotLiquidityIndex == 0) return amount;
        uint256 currentIndex = pool.getReserveNormalizedIncome(address(usdc));
        return (amount * currentIndex) / snapshotLiquidityIndex;
    }

    /// @notice Returns a complete snapshot of the escrow state for frontend consumption
    function getEscrowInfo()
        external
        view
        returns (
            address _sender,
            address _recipient,
            uint256 _amount,
            ConditionType _conditionType,
            address _conditionTarget,
            uint256 _releaseTimestamp,
            uint256 _deadline,
            uint16 _senderYieldBps,
            EscrowState _state,
            bool _manuallyApproved,
            uint256 _conditionMetTimestamp,
            uint256 _currentYield,
            uint256 _totalValue,
            uint256 _snapshotLiquidityIndex,
            uint256 _currentLiquidityIndex
        )
    {
        uint256 currentIndex = snapshotLiquidityIndex > 0
            ? pool.getReserveNormalizedIncome(address(usdc))
            : 0;
        uint256 totalVal = snapshotLiquidityIndex > 0
            ? (amount * currentIndex) / snapshotLiquidityIndex
            : amount;
        uint256 yieldVal = totalVal > amount ? totalVal - amount : 0;

        return (
            sender,
            recipient,
            amount,
            conditionType,
            conditionTarget,
            releaseTimestamp,
            deadline,
            senderYieldBps,
            state,
            manuallyApproved,
            conditionMetTimestamp,
            yieldVal,
            totalVal,
            snapshotLiquidityIndex,
            currentIndex
        );
    }

    // ─── Admin ────────────────────────────────────────────────────────────────

    /// @notice Updates the authorized backend caller address
    /// @param _newCaller New authorized caller (must not be zero address)
    function setAuthorizedCaller(address _newCaller) external onlyOwner {
        require(_newCaller != address(0), "YieldEscrow: zero address");
        address old = authorizedCaller;
        authorizedCaller = _newCaller;
        emit AuthorizedCallerUpdated(old, _newCaller);
    }

    /// @notice Emergency pause — freezes release() and refund()
    function pause() external onlyOwner {
        _pause();
    }

    /// @notice Unpauses the contract
    function unpause() external onlyOwner {
        _unpause();
    }

    /// @notice Rescues ERC20 tokens accidentally sent to this contract
    /// @dev Cannot rescue aUSDC, as that is the escrowed yield-bearing asset
    /// @param token Token contract address
    /// @param to Destination address
    /// @param tokenAmount Amount to transfer
    function rescueToken(
        address token,
        address to,
        uint256 tokenAmount
    ) external onlyOwner {
        require(token != address(aUsdc), "YieldEscrow: cannot rescue aUSDC");
        IERC20(token).safeTransfer(to, tokenAmount);
    }

    // ─── Internal ─────────────────────────────────────────────────────────────

    function _executeRelease() internal returns (bool) {
        try pool.withdraw(address(usdc), type(uint256).max, address(this)) returns (
            uint256 withdrawn
        ) {
            uint256 actualYield = withdrawn > amount ? withdrawn - amount : 0;
            uint256 senderYield = (actualYield * senderYieldBps) / 10000;
            uint256 recipientAmt = withdrawn - senderYield;

            state = EscrowState.RELEASED;
            usdc.safeTransfer(recipient, recipientAmt);
            if (senderYield > 0) {
                usdc.safeTransfer(sender, senderYield);
            }
            emit Released(recipientAmt, senderYield, actualYield);
            return true;
        } catch (bytes memory reason) {
            emit WithdrawalFailed(reason);
            return false;
        }
    }

    function _executeRefund() internal returns (bool) {
        try pool.withdraw(address(usdc), type(uint256).max, address(this)) returns (
            uint256 withdrawn
        ) {
            state = EscrowState.REFUNDED;
            usdc.safeTransfer(sender, withdrawn);
            emit Refunded(withdrawn);
            return true;
        } catch (bytes memory reason) {
            emit WithdrawalFailed(reason);
            return false;
        }
    }
}
