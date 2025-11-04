// src/lib/wallet-and-rpc.js

import { ref } from 'vue';
import { ethers } from 'ethers';
import { logMessage } from './log-system';
import { 
    REGISTRY_ADDRESS, CT_TOKEN_ADDRESS, REGISTRY_ABI, CT_TOKEN_ABI,
    NETWORKS, DEFAULT_NETWORK_KEY
} from './constants';

// =================================================================
// 状态变量
// =================================================================
export const walletAddress = ref('');
export const ai3Balance = ref('0.0 AI3');
export const ctBalance = ref('0.0 CT');
export const currentNetworkKey = ref(DEFAULT_NETWORK_KEY); // 初始化为部署网络

// =================================================================
// 辅助函数
// =================================================================

/**
 * 切换 MetaMask 到指定网络。
 */
export const switchNetwork = async (networkKey) => {
    const network = NETWORKS[networkKey];
    if (!network || typeof window.ethereum === 'undefined') {
        logMessage(`无法切换：网络信息错误或未安装 MetaMask。`, 'error');
        return;
    }
    
    const chainIdHex = '0x' + network.chainId.toString(16);
    logMessage(`正在尝试切换到 ${network.name}...`);

    try {
        await window.ethereum.request({ 
            method: 'wallet_switchEthereumChain', 
            params: [{ chainId: chainIdHex }] 
        });
        
        currentNetworkKey.value = networkKey;
        logMessage(`✅ 成功切换到 ${network.name}。`);
        
        if (walletAddress.value) {
            await fetchBalances(walletAddress.value);
        }

    } catch (switchError) {
        if (switchError.code === 4902) {
            try {
                await window.ethereum.request({
                    method: 'wallet_addEthereumChain',
                    params: [{
                        chainId: chainIdHex,
                        chainName: network.name,
                        rpcUrls: [network.rpcUrl],
                        nativeCurrency: network.nativeCurrency,
                        blockExplorerUrls: [network.blockExplorerUrl],
                    }],
                });
                await switchNetwork(networkKey); // 添加后再次尝试切换

            } catch (addError) {
                 logMessage(`❌ 无法添加网络 ${network.name}: ${addError.message}`, 'error');
            }
        } else if (switchError.code !== 4001) { // 4001 是用户拒绝
             logMessage(`❌ 网络切换失败: ${switchError.message}`, 'error');
        } else {
            logMessage('用户拒绝了网络切换。', 'info');
        }
    }
};

/**
 * 获取钱包的 AI3 和 CT 余额。
 */
export const fetchBalances = async (address) => {
    if (!address || typeof window.ethereum === 'undefined') return;
    
    // 重置余额显示
    ai3Balance.value = '...';
    ctBalance.value = '...';
    
    try {
        const provider = new ethers.BrowserProvider(window.ethereum);
        
        // 1. 获取 Gas 币余额 (ETH/AI3)
        const ethWei = await provider.getBalance(address);
        const symbol = NETWORKS[currentNetworkKey.value]?.nativeCurrency?.symbol || 'Gas';
        ai3Balance.value = `${ethers.formatEther(ethWei)} ${symbol}`;

        // 2. 获取 CT Token 余额
        if (CT_TOKEN_ADDRESS) {
            try {
                const ctContract = new ethers.Contract(CT_TOKEN_ADDRESS, CT_TOKEN_ABI, provider);
                const ctWei = await ctContract.balanceOf(address);
                ctBalance.value = `${ethers.formatEther(ctWei)} CT`;

            } catch (ctError) {
                // 仅在日志中报告 CT 错误，不影响 Gas 余额显示
                if (ctError.code === 'BAD_DATA') {
                    logMessage(`❌ CT 余额查询失败：Ethers.js 无法解码合约返回值。请确保该地址 ${CT_TOKEN_ADDRESS} 在当前网络已部署。`, 'error');
                } else if (ctError.code !== 'CALL_EXCEPTION') {
                    logMessage(`❌ CT 余额查询发生未知错误: ${ctError.message}`, 'error');
                }
                ctBalance.value = '查询失败';
            }
        } else {
            ctBalance.value = 'CT 地址未配置';
        }

    } catch (globalError) {
        logMessage(`全局余额获取失败: ${globalError.message}`, 'error');
    }
};

// =================================================================
// 核心业务方法
// =================================================================

/**
 * 连接 MetaMask 钱包。
 */
export const connectWallet = async () => {
     if (typeof window.ethereum === 'undefined') {
         logMessage('请安装 MetaMask 钱包！', 'error');
         return;
     }
     
     try {
        const provider = new ethers.BrowserProvider(window.ethereum);
        await provider.send("eth_requestAccounts", []);
        const signer = await provider.getSigner();
        walletAddress.value = await signer.getAddress();
        
        logMessage('钱包已连接。');

        // 尝试切换到默认/部署网络
        await switchNetwork(currentNetworkKey.value);
        
        logMessage('✅ 钱包连接与网络就绪！', 'success');

     } catch(e) {
         logMessage(`连接失败: ${e.message}`, 'error');
     }
};


/**
 * 注册用户并领取空投。
 */
export const registerUser = async (username) => {
    if (!walletAddress.value) { logMessage('请先连接钱包。', 'error'); return; }
    if (username.length < 3) { logMessage('用户名长度必须至少为 3 个字符。', 'error'); return; }

    try {
        logMessage(`正在注册用户 "${username}"，网络: ${NETWORKS[currentNetworkKey.value].name}...`, 'info');

        const provider = new ethers.BrowserProvider(window.ethereum);
        const signer = await provider.getSigner();

        const registryContract = new ethers.Contract(REGISTRY_ADDRESS, REGISTRY_ABI, signer);
        const registrationFeeWei = ethers.parseEther("0.01"); 
        const nativeSymbol = NETWORKS[currentNetworkKey.value].nativeCurrency.symbol;
        
        logMessage(`正在发送注册交易 (支付 0.01 ${nativeSymbol})...`, 'tx');

        const tx = await registryContract.registerUsername(
            username,
            { value: registrationFeeWei }
        );
        
        const receipt = await tx.wait(); 
        
        logMessage(`注册交易哈希: ${tx.hash}，区块: ${receipt.blockNumber} 已确认。`, 'tx');
        
        await fetchBalances(walletAddress.value);
        
        logMessage(`✅ 注册成功！空投应已发送。`, 'success');

    } catch (error) {
        let errorMessage = error.reason || error.message;
        if (error.code === 4001) { errorMessage = '用户拒绝了交易。'; }
        logMessage(`❌ 注册失败: ${errorMessage}`, 'error');
    }
};


// =================================================================
// 监听事件
// =================================================================
export const setupEventListeners = () => {
    if (typeof window.ethereum !== 'undefined') {
        window.ethereum.on('accountsChanged', (accounts) => {
            if (accounts.length > 0) {
                walletAddress.value = accounts[0];
                fetchBalances(accounts[0]);
                logMessage(`钱包地址已切换到: ${accounts[0].slice(0, 6)}...`, 'info');
            } else {
                walletAddress.value = '';
                ai3Balance.value = '0.0 AI3';
                ctBalance.value = '0.0 CT';
                logMessage('钱包已断开连接。', 'info');
            }
        });
        window.ethereum.on('chainChanged', (chainId) => {
             const newKey = Object.keys(NETWORKS).find(key => NETWORKS[key].chainId === Number(chainId));
             if (newKey) {
                 currentNetworkKey.value = newKey;
                 logMessage(`网络已在 MetaMask 中更改为 ${NETWORKS[newKey].name}。正在刷新状态...`, 'block');
                 fetchBalances(walletAddress.value);
             } else {
                 logMessage(`网络已切换到未配置的 Chain ID: ${Number(chainId)}。`, 'error');
             }
        });
    }
};