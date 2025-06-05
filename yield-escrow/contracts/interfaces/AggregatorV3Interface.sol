// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title AggregatorV3Interface
/// @notice Minimal Chainlink price feed interface
interface AggregatorV3Interface {
    /// @notice Returns the number of decimals in the price feed
    function decimals() external view returns (uint8);

    /// @notice Returns the latest round data from the price feed
    /// @return roundId The round ID
    /// @return answer The price answer (in the feed's native decimals)
    /// @return startedAt Timestamp of when the round started
    /// @return updatedAt Timestamp of when the round was last updated
    /// @return answeredInRound The round ID in which the answer was computed
    function latestRoundData()
        external
        view
        returns (
            uint80 roundId,
            int256 answer,
            uint256 startedAt,
            uint256 updatedAt,
            uint80 answeredInRound
        );
}
