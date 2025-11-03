// src/lib/constants.js

import RegistryJson from '../config/abi/ConnectionUserRegistry.json';

// Ethers.js v6 需要的 CT Token 极简 ABI (只保留 balanceOf)
export const CT_TOKEN_ABI = [
    {"inputs":[{"internalType":"address","name":"account","type":"address"}],"name":"balanceOf","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"}
];

// Ethers.js v6 需要的 Registry 合约 ABI
export const REGISTRY_ABI = RegistryJson.abi; 

// Hardhat/部署 配置
export const REGISTRY_ADDRESS = process.env.VUE_APP_REGISTRY_ADDRESS; 
export const CT_TOKEN_ADDRESS = process.env.VUE_APP_CT_TOKEN_ADDRESS;
export const DEPLOYER_PRIVATE_KEY = process.env.VUE_APP_DEPLOYER_PRIVATE_KEY;

// Hardhat RPC 配置
export const HARDHAT_CHAIN_ID = 31337; 
export const HARDHAT_RPC_URL = 'http://127.0.0.1:8545';
export const HARDHAT_NETWORK_NAME = 'Hardhat Localhost';

// Hardhat RPC 方法
export const MINE_BLOCK_METHOD = 'evm_mine'; 
export const INCREASE_TIME_METHOD = 'evm_increaseTime';