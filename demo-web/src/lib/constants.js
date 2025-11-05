// src/lib/constants.js

import RegistryJson from '../config/abi/ConnectionUserRegistry.json';
import ContractConfig from '../config/contracts.json';

// =================================================================
// ABI & 合约地址 (从前端 .env 读取)
// =================================================================
export const CT_TOKEN_ABI = [
    {"inputs":[{"internalType":"address","name":"account","type":"address"}],"name":"balanceOf","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"}
];
export const REGISTRY_ABI = RegistryJson.abi;

// 从 JSON 文件动态获取地址
export const getContractAddresses = (networkKey) => {
    return ContractConfig.networks[networkKey] || null;
};

// =================================================================
// 多网络配置
// =================================================================
export const NETWORKS = {
    'baseSepolia': {
        name: 'Base Sepolia Testnet',
        chainId: 84532,
        rpcUrl: 'https://sepolia.base.org', // 公共 RPC
        nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
        blockExplorerUrl: 'https://sepolia-explorer.base.org',
    },
    'ai3': {
        name: 'Autonomys EVM Mainnet',
        chainId: 870,
        rpcUrl: 'https://auto-evm.mainnet.autonomys.xyz/ws',
        nativeCurrency: { name: 'AI3', symbol: 'AI3', decimals: 18 },
        blockExplorerUrl: 'https://explorer.auto-evm.mainnet.autonomys.xyz/',
    },
};

// 默认网络/当前部署网络 (从前端 .env 读取)
export const DEFAULT_NETWORK_KEY = ContractConfig.defaultNetwork || 'baseSepolia';

export { ContractConfig };