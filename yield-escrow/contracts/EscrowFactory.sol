// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {YieldEscrow} from "./YieldEscrow.sol";
import {IPool} from "./interfaces/IPool.sol";

/// @title EscrowFactory
/// @notice Deploys YieldEscrow instances and maintains a registry by sender and recipient.
///
///         Deployment flow per escrow:
///           1. Caller approves this factory for `amount` USDC
///           2. createEscrow() pulls USDC from caller
///           3. Factory deploys a new YieldEscrow (no Aave interaction yet)
///           4. Factory reads current Aave liquidity index (snapshotIndex)
///           5. Factory calls IPool.supply(usdc, amount, escrowAddress) — aUSDC goes to escrow
///           6. Factory calls escrow.initialize(snapshotIndex) — records yield baseline
///           7. EscrowCreated event emitted; escrow address returned
contract EscrowFactory is Ownable, Pausable {
    using SafeERC20 for IERC20;

    // ─── State ────────────────────────────────────────────────────────────────

    address public immutable pool;
    address public immutable usdc;
    address public immutable aUsdc;

    /// @notice Backend EOA authorized to interact with deployed escrows
    address public authorizedCaller;

    address[] private _allEscrows;
    mapping(address => address[]) private _escrowsBySender;
    mapping(address => address[]) private _escrowsByRecipient;

    /// @notice True if address was deployed by this factory
    mapping(address => bool) public isEscrow;

    // ─── Events ───────────────────────────────────────────────────────────────

    /// @notice Emitted on every successful escrow creation
    event EscrowCreated(
        address indexed escrow,
        address indexed sender,
        address indexed recipient,
        uint256 amount,
        YieldEscrow.ConditionType conditionType,
        address conditionTarget,
        uint256 releaseTimestamp,
        uint256 deadline,
        uint16 senderYieldBps,
        uint256 createdAt
    );

    /// @notice Emitted when the authorized caller is rotated
    event AuthorizedCallerUpdated(address indexed oldCaller, address indexed newCaller);

    // ─── Constructor ──────────────────────────────────────────────────────────

    /// @notice Deploys the factory
    /// @param _pool Aave V3 Pool address
    /// @param _usdc USDC token address
    /// @param _aUsdc aUSDC token address
    /// @param _authorizedCaller Backend EOA address set on each deployed escrow
    constructor(
        address _pool,
        address _usdc,
        address _aUsdc,
        address _authorizedCaller
    ) Ownable(msg.sender) {
        require(_pool != address(0), "EscrowFactory: zero pool");
        require(_usdc != address(0), "EscrowFactory: zero usdc");
        require(_aUsdc != address(0), "EscrowFactory: zero aUsdc");
        require(_authorizedCaller != address(0), "EscrowFactory: zero caller");
        pool = _pool;
        usdc = _usdc;
        aUsdc = _aUsdc;
        authorizedCaller = _authorizedCaller;
    }

    // ─── Core ─────────────────────────────────────────────────────────────────

    /// @notice Creates a new YieldEscrow and deposits USDC into Aave V3 on its behalf.
    ///         Caller must approve this contract for at least `amount` USDC before calling.
    /// @param recipient Beneficiary address
    /// @param amount USDC amount to escrow (6 decimals)
    /// @param conditionType Release condition type
    /// @param conditionTarget ICondition contract address (address(0) if not ORACLE)
    /// @param releaseTimestamp Timestamp for TIME_BASED release (0 if not TIME_BASED)
    /// @param deadline Auto-refund deadline as unix timestamp (0 = no deadline)
    /// @param senderYieldBps Sender's yield share in basis points (0–10000)
    /// @return escrow Address of the deployed YieldEscrow contract
    function createEscrow(
        address recipient,
        uint256 amount,
        YieldEscrow.ConditionType conditionType,
        address conditionTarget,
        uint256 releaseTimestamp,
        uint256 deadline,
        uint16 senderYieldBps
    ) external whenNotPaused returns (address escrow) {
        require(recipient != address(0), "EscrowFactory: zero recipient");
        require(amount > 0, "EscrowFactory: zero amount");
        require(senderYieldBps <= 10000, "EscrowFactory: invalid bps");

        IERC20(usdc).safeTransferFrom(msg.sender, address(this), amount);

        YieldEscrow newEscrow = new YieldEscrow(
            msg.sender,
            recipient,
            amount,
            conditionType,
            conditionTarget,
            releaseTimestamp,
            deadline,
            senderYieldBps,
            pool,
            usdc,
            aUsdc,
            authorizedCaller
        );

        IERC20(usdc).forceApprove(pool, amount);
        uint256 snapshotIndex = IPool(pool).getReserveNormalizedIncome(usdc);
        IPool(pool).supply(usdc, amount, address(newEscrow), 0);

        newEscrow.initialize(snapshotIndex);

        address escrowAddr = address(newEscrow);
        _allEscrows.push(escrowAddr);
        _escrowsBySender[msg.sender].push(escrowAddr);
        _escrowsByRecipient[recipient].push(escrowAddr);
        isEscrow[escrowAddr] = true;

        emit EscrowCreated(
            escrowAddr,
            msg.sender,
            recipient,
            amount,
            conditionType,
            conditionTarget,
            releaseTimestamp,
            deadline,
            senderYieldBps,
            block.timestamp
        );

        return escrowAddr;
    }

    // ─── Registry views ───────────────────────────────────────────────────────

    /// @notice Returns all escrow addresses where `addr` is the sender
    function getEscrowsBySender(address addr) external view returns (address[] memory) {
        return _escrowsBySender[addr];
    }

    /// @notice Returns all escrow addresses where `addr` is the recipient
    function getEscrowsByRecipient(address addr) external view returns (address[] memory) {
        return _escrowsByRecipient[addr];
    }

    /// @notice Returns all escrow addresses where `addr` is sender OR recipient (may include duplicates)
    function getEscrowsByAddress(address addr) external view returns (address[] memory) {
        address[] storage sent = _escrowsBySender[addr];
        address[] storage received = _escrowsByRecipient[addr];
        address[] memory combined = new address[](sent.length + received.length);
        for (uint256 i = 0; i < sent.length; i++) {
            combined[i] = sent[i];
        }
        for (uint256 i = 0; i < received.length; i++) {
            combined[sent.length + i] = received[i];
        }
        return combined;
    }

    /// @notice Returns the total number of escrows deployed by this factory
    function getEscrowCount() external view returns (uint256) {
        return _allEscrows.length;
    }

    /// @notice Returns the escrow address at a given index in the global registry
    /// @param index Index in the allEscrows array
    function getEscrowAtIndex(uint256 index) external view returns (address) {
        require(index < _allEscrows.length, "EscrowFactory: out of bounds");
        return _allEscrows[index];
    }

    // ─── Admin ────────────────────────────────────────────────────────────────

    /// @notice Updates the backend EOA used as authorizedCaller on newly deployed escrows.
    ///         Does not retroactively update existing escrows.
    /// @param _newCaller New authorized caller address
    function setAuthorizedCaller(address _newCaller) external onlyOwner {
        require(_newCaller != address(0), "EscrowFactory: zero address");
        address old = authorizedCaller;
        authorizedCaller = _newCaller;
        emit AuthorizedCallerUpdated(old, _newCaller);
    }

    /// @notice Pauses the factory — prevents new escrow creation
    function pause() external onlyOwner {
        _pause();
    }

    /// @notice Unpauses the factory
    function unpause() external onlyOwner {
        _unpause();
    }
}
