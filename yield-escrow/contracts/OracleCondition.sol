// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {AggregatorV3Interface} from "./interfaces/AggregatorV3Interface.sol";
import {ICondition} from "./interfaces/ICondition.sol";

/// @title OracleCondition
/// @notice Chainlink-based release condition. Returns true when a price feed crosses a threshold.
/// @dev Implements ICondition. Stale data returns false rather than reverting, preventing false triggers.
contract OracleCondition is ICondition {
    /// @notice Direction of the price condition
    enum Direction {
        ABOVE, // conditionMet when price >= threshold
        BELOW  // conditionMet when price <= threshold
    }

    AggregatorV3Interface public immutable priceFeed;
    int256 public immutable threshold;
    Direction public immutable direction;
    uint256 public immutable stalenessThreshold;

    /// @notice Emitted when a conditionMet() call encounters stale data
    /// @param updatedAt Timestamp of the last valid price update
    /// @param currentTime Current block timestamp
    event StaleOracleData(uint256 updatedAt, uint256 currentTime);

    /// @notice Deploys an oracle condition
    /// @param _priceFeed Chainlink AggregatorV3Interface address (e.g. ETH/USD on Base)
    /// @param _threshold Price threshold in the feed's native decimals (8 decimals for ETH/USD)
    /// @param _direction ABOVE = release when price >= threshold; BELOW = release when price <= threshold
    /// @param _stalenessThreshold Maximum acceptable age of price data in seconds (recommended: 3600)
    constructor(
        address _priceFeed,
        int256 _threshold,
        Direction _direction,
        uint256 _stalenessThreshold
    ) {
        require(_priceFeed != address(0), "OracleCondition: zero feed");
        require(_stalenessThreshold > 0, "OracleCondition: zero staleness");
        priceFeed = AggregatorV3Interface(_priceFeed);
        threshold = _threshold;
        direction = _direction;
        stalenessThreshold = _stalenessThreshold;
    }

    /// @notice Checks if the price condition is currently satisfied
    /// @dev Returns false (does NOT revert) if oracle data is stale — prevents false triggers
    /// @return met True if price satisfies threshold + direction and data is fresh
    function conditionMet() external view override returns (bool met) {
        (, int256 price, , uint256 updatedAt, ) = priceFeed.latestRoundData();
        if (price <= 0) return false;
        if (block.timestamp - updatedAt > stalenessThreshold) return false;
        if (direction == Direction.ABOVE) {
            return price >= threshold;
        } else {
            return price <= threshold;
        }
    }

    /// @notice Returns the latest price and its update timestamp
    /// @dev Reverts if the price is zero or negative
    /// @return price Current price in feed's native decimals
    /// @return updatedAt Timestamp of the last price update
    function getLatestPrice() external view returns (int256 price, uint256 updatedAt) {
        (, int256 _price, , uint256 _updatedAt, ) = priceFeed.latestRoundData();
        require(_price > 0, "OracleCondition: invalid price");
        return (_price, _updatedAt);
    }

    /// @notice Returns the feed's decimal precision
    /// @return Number of decimals used by this price feed
    function feedDecimals() external view returns (uint8) {
        return priceFeed.decimals();
    }
}
