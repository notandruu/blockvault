// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title IPool
/// @notice Minimal Aave V3 Pool interface — only the functions used by this project
interface IPool {
    /// @notice Supplies an `amount` of underlying asset into the reserve
    /// @param asset The address of the underlying asset to supply
    /// @param amount The amount to be supplied
    /// @param onBehalfOf The address that will receive the aTokens
    /// @param referralCode Code used to register the integrator — 0 for no referral
    function supply(
        address asset,
        uint256 amount,
        address onBehalfOf,
        uint16 referralCode
    ) external;

    /// @notice Withdraws an `amount` of underlying asset from the reserve
    /// @param asset The address of the underlying asset to withdraw
    /// @param amount The underlying amount to be withdrawn (type(uint256).max = full balance)
    /// @param to The address that will receive the underlying
    /// @return The final amount withdrawn
    function withdraw(
        address asset,
        uint256 amount,
        address to
    ) external returns (uint256);

    /// @notice Returns the normalized income of the reserve
    /// @dev A value of 1e27 means there is no income. As time passes, the income is accrued.
    ///      A value of 2e27 means for each unit of asset, two units of income have been accrued.
    /// @param asset The address of the underlying asset of the reserve
    /// @return The reserve's normalized income expressed in ray (1e27 precision)
    function getReserveNormalizedIncome(address asset) external view returns (uint256);

    /// @notice Returns the addresses provider of the pool
    function ADDRESSES_PROVIDER() external view returns (address);
}
