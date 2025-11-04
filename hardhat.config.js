// hardhat.config.js

require('dotenv').config();
require("@nomiclabs/hardhat-ethers");
require("@nomicfoundation/hardhat-verify");

const PRIVATE_KEY = process.env.PRIVATE_KEY;
const BASE_SEPOLIA_RPC_URL = process.env.BASE_SEPOLIA_RPC_URL;
const AUTONOMYS_MAINNET_RPC_URL = process.env.AUTONOMYS_MAINNET_RPC_URL;
const BASE_SCAN_API_KEY = process.env.BASE_SCAN_API_KEY;

module.exports = {
  solidity: "0.8.28",
  defaultNetwork: "baseSepolia", // 默认使用测试网
  networks: {
    baseSepolia: {
      url: BASE_SEPOLIA_RPC_URL || "", 
      accounts: PRIVATE_KEY !== undefined ? [PRIVATE_KEY] : [],
      chainId: 84532, // Base Sepolia Chain ID
    },
    // Autonomys EVM Mainnet (使用 'ai3' 作为网络名称)
    ai3: {
      url: AUTONOMYS_MAINNET_RPC_URL || "", 
      accounts: PRIVATE_KEY !== undefined ? [PRIVATE_KEY] : [],
      chainId: 870,
    },
  },
  etherscan: {
    apiKey: {
      baseSepolia: BASE_SCAN_API_KEY || "",
    },
    customChains: [ 
      {
        network: "baseSepolia",
        chainId: 84532,
        urls: {
          apiURL: "https://api-sepolia.basescan.org/api",
          browserURL: "https://sepolia-explorer.base.org",
        },
      },
      {
        network: "ai3",
        chainId: 870,
        urls: {
          apiURL: "https://auto-evm.mainnet.autonomys.xyz/ws",
          browserURL: "https://explorer.auto-evm.mainnet.autonomys.xyz",
        },
      },
    ],
  },
};