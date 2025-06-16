import { ethers, network } from "hardhat";
import { IERC20 } from "../../typechain-types";

/// Advance the fork time by `seconds` and mine one block
export async function increaseTime(seconds: number): Promise<void> {
  await network.provider.send("evm_increaseTime", [seconds]);
  await network.provider.send("evm_mine");
}

/// Set the next block timestamp to an absolute unix timestamp
export async function setNextBlockTimestamp(timestamp: number): Promise<void> {
  await network.provider.send("evm_setNextBlockTimestamp", [timestamp]);
  await network.provider.send("evm_mine");
}

/// Mine `n` blocks without advancing time
export async function mineBlocks(n: number): Promise<void> {
  for (let i = 0; i < n; i++) {
    await network.provider.send("evm_mine");
  }
}

/// Impersonate an account and optionally fund it with ETH for gas
export async function impersonate(
  address: string,
  ethAmount = ethers.parseEther("10")
) {
  await network.provider.request({
    method: "hardhat_impersonateAccount",
    params: [address],
  });
  await network.provider.send("hardhat_setBalance", [
    address,
    ethers.toBeHex(ethAmount),
  ]);
  return ethers.getSigner(address);
}

/// Stop impersonating an account
export async function stopImpersonate(address: string): Promise<void> {
  await network.provider.request({
    method: "hardhat_stopImpersonatingAccount",
    params: [address],
  });
}

/// Transfer ERC20 tokens from a whale to a target address via impersonation
export async function dealToken(
  tokenAddress: string,
  whaleAddress: string,
  to: string,
  amount: bigint
): Promise<void> {
  const whale = await impersonate(whaleAddress);
  const token = (await ethers.getContractAt(
    "@openzeppelin/contracts/token/ERC20/IERC20.sol:IERC20",
    tokenAddress,
    whale
  )) as unknown as IERC20;
  await token.transfer(to, amount);
}

/// Returns the current block timestamp
export async function blockTimestamp(): Promise<number> {
  const block = await ethers.provider.getBlock("latest");
  return block!.timestamp;
}

/// Pauses or unpauses an Aave V3 reserve. Requires impersonating the Aave emergency admin.
/// addressesProviderAddr: the IPoolAddressesProvider for the target pool
export async function setAaveReservePause(
  addressesProviderAddr: string,
  assetAddr: string,
  paused: boolean
): Promise<void> {
  const IPoolAddressesProvider = [
    "function getPoolConfigurator() external view returns (address)",
    "function getACLManager() external view returns (address)",
  ];
  const IACLManager = [
    "function EMERGENCY_ADMIN_ROLE() external view returns (bytes32)",
    "function hasRole(bytes32 role, address account) external view returns (bool)",
    "function getRoleMember(bytes32 role, uint256 index) external view returns (address)",
    "function getRoleMemberCount(bytes32 role) external view returns (uint256)",
  ];
  const IPoolConfigurator = [
    "function setReservePause(address asset, bool paused) external",
  ];

  const provider = new ethers.Contract(
    addressesProviderAddr,
    IPoolAddressesProvider,
    ethers.provider
  );

  const configuratorAddr: string = await provider.getPoolConfigurator();
  const aclManagerAddr: string = await provider.getACLManager();

  const aclManager = new ethers.Contract(
    aclManagerAddr,
    IACLManager,
    ethers.provider
  );
  const role: string = await aclManager.EMERGENCY_ADMIN_ROLE();
  const count: bigint = await aclManager.getRoleMemberCount(role);

  if (count === BigInt(0)) {
    throw new Error("No emergency admin found for Aave pool");
  }

  const emergencyAdmin: string = await aclManager.getRoleMember(role, 0);
  const adminSigner = await impersonate(emergencyAdmin);

  const configurator = new ethers.Contract(
    configuratorAddr,
    IPoolConfigurator,
    adminSigner
  );
  await configurator.setReservePause(assetAddr, paused);
}
