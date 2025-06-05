// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title ICondition
/// @notice Interface for pluggable release condition contracts
interface ICondition {
    /// @notice Returns true when the release condition is satisfied
    /// @return met Whether the condition is currently met
    function conditionMet() external view returns (bool met);
}
