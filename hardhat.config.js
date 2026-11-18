// Hardhat config for AgentBoard.
// Networks: hardhat (local tests), bscTestnet (97), bsc mainnet (56).
// The deployer private key is NEVER committed: pass it via env PRIVATE_KEY
// (loaded from a mode-600 file outside the repo by the deploy wrapper).
require("@nomicfoundation/hardhat-toolbox");

const PRIVATE_KEY = process.env.PRIVATE_KEY || "";
const BSCSCAN_API_KEY = process.env.BSCSCAN_API_KEY || "";

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.30",
    settings: {
      optimizer: { enabled: true, runs: 200 },
      // OZ 5.6 uses the MCOPY opcode: needs a Cancun-compatible VM.
      // BSC mainnet/testnet both support Cancun opcodes (Haber fork, 2024).
      evmVersion: "cancun",
    },
  },
  networks: {
    hardhat: {},
    bscTestnet: {
      url: "https://bsc-testnet.publicnode.com",
      chainId: 97,
      accounts: PRIVATE_KEY ? [PRIVATE_KEY] : [],
    },
    bsc: {
      url: "https://bsc.publicnode.com",
      chainId: 56,
      accounts: PRIVATE_KEY ? [PRIVATE_KEY] : [],
    },
  },
  etherscan: {
    apiKey: {
      bscTestnet: BSCSCAN_API_KEY,
      bsc: BSCSCAN_API_KEY,
    },
  },
};
