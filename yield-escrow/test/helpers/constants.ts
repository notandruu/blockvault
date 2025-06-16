// Base Mainnet — all fork tests run against these addresses

export const USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
export const AAVE_POOL = "0xA238Dd80C259a72e81d7e4664a9801593F98d1c5";
export const A_USDC = "0x4e65fE4DbA92790696d040ac24Aa414708F5c0AB";
export const CHAINLINK_ETH_USD = "0x71041dddad3595F9CEd3DcCFBe3D1F4b0a16Bb70";

// Aave V3 Base Pool Addresses Provider — used to fetch configurator + ACL manager in pause tests
export const AAVE_POOL_ADDRESSES_PROVIDER =
  "0xe20fCBdBfFC4Dd138cE8b2E6FBb6CB49777ad64b";

// USDC whale on Base mainnet — update this if the address runs dry at your fork block
// Check current top holders: https://basescan.org/token/0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913#balances
export const USDC_WHALE = "0xd0b53D9277642d899DF5C87A3966A349A798F224"; // Hyperliquid bridge

export const USDC_DECIMALS = 6;
export const RAY = BigInt("1000000000000000000000000000"); // 1e27

// Test amounts
export const ONE_USDC = BigInt(1_000_000); // 1 USDC
export const HUNDRED_USDC = BigInt(100_000_000); // 100 USDC
export const THOUSAND_USDC = BigInt(1_000_000_000); // 1000 USDC

// Time constants (seconds)
export const ONE_DAY = 86_400;
export const ONE_WEEK = 7 * ONE_DAY;
export const THIRTY_DAYS = 30 * ONE_DAY;
export const GRACE_PERIOD = ONE_WEEK; // matches YieldEscrow.GRACE_PERIOD

// Chainlink staleness threshold used in OracleCondition
export const STALENESS_THRESHOLD = 3600; // 1 hour

// ETH/USD threshold for demo: $4000 in Chainlink 8-decimal format
export const ETH_THRESHOLD_4000 = BigInt(4_000) * BigInt(10 ** 8);
