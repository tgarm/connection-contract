// src/lib/wallet-and-rpc.js

import { ref } from 'vue';
import { ethers } from 'ethers';
import { logMessage } from './log-system';
import { 
    REGISTRY_ADDRESS, CT_TOKEN_ADDRESS, DEPLOYER_PRIVATE_KEY, REGISTRY_ABI, CT_TOKEN_ABI,
    HARDHAT_CHAIN_ID, HARDHAT_RPC_URL, HARDHAT_NETWORK_NAME, MINE_BLOCK_METHOD, INCREASE_TIME_METHOD 
} from './constants';

// =================================================================
// 状态变量
// =================================================================
export const walletAddress = ref('');
export const isFauceting = ref(false);
export const isMining = ref(false);
export const ai3Balance = ref('0.0 AI3');
export const ctBalance = ref('0.0 CT');

// Hardhat 专用的 Provider 实例
const hardhatProvider = new ethers.JsonRpcProvider(HARDHAT_RPC_URL);

// =================================================================
// 辅助函数
// =================================================================

/**
 * 获取 Hardhat 当前区块信息并记录日志。
 */
export const getBlockInfo = async () => {
    try {
        const blockNumber = await hardhatProvider.getBlockNumber();
        const block = await hardhatProvider.getBlock(blockNumber);
        
        const blockTime = new Date(Number(block.timestamp) * 1000).toLocaleString(); 
        logMessage(`当前区块: #${blockNumber}, 时间: ${blockTime}`, 'block');
        return block;
    } catch (e) {
        logMessage(`无法连接或获取区块信息。请确认 Hardhat 节点正在运行: ${e.message}`, 'error');
        return null;
    }
};

/**
 * 增加 Hardhat 时间并挖矿。
 * @param {number} seconds - 要增加的秒数。
 * @param {number} count - 要挖的区块数。
 */
export const mineTimeAndBlocks = async (seconds = 1, count = 1) => {
    isMining.value = true;
    logMessage(`Hardhat RPC: 推进 ${seconds} 秒时间并挖 ${count} 个区块...`);
    
    try {
        if (seconds > 0) {
            await hardhatProvider.send(INCREASE_TIME_METHOD, [seconds]);
        }

        for (let i = 0; i < count; i++) {
            await hardhatProvider.send(MINE_BLOCK_METHOD, []);
        }
        
        await getBlockInfo();
        logMessage(`✅ Hardhat RPC 操作成功。`, 'success');

    } catch(e) {
        logMessage(`❌ Hardhat RPC 操作失败: ${e.message}`, 'error');
        throw e; // 抛出错误以供调用者捕获
    } finally {
        isMining.value = false;
    }
};

/**
 * 手动控制区块前进的函数 (对应按钮)。
 * @param {number} count - 要前进的区块数。
 */
export const mineBlocks = async (count = 1) => {
    if (!walletAddress.value) { logMessage('请先连接 MetaMask。'); return; }
    
    try {
        await mineTimeAndBlocks(count, count); // 每个区块默认前进 1 秒
        await fetchBalances(walletAddress.value);
    } catch (e) {
        // mineTimeAndBlocks 已记录日志
    }
};

/**
 * 获取钱包的 AI3 和 CT 余额。
 * @param {string} address - 钱包地址。
 */
export const fetchBalances = async (address) => {
    if (!address || typeof window.ethereum === 'undefined') return;
    
    try {
        const provider = new ethers.BrowserProvider(window.ethereum);
        
        // 1. 获取 AI3 (Gas 币) 余额
        const ethWei = await provider.getBalance(address);
        ai3Balance.value = `${ethers.formatEther(ethWei)} AI3`;

        // 2. 获取 CT Token 余额
        if (CT_TOKEN_ADDRESS) {
            const ctContract = new ethers.Contract(CT_TOKEN_ADDRESS, CT_TOKEN_ABI, provider);
            const ctWei = await ctContract.balanceOf(address);
            ctBalance.value = `${ethers.formatEther(ctWei)} CT`;
        } else {
            ctBalance.value = 'CT 地址未配置';
        }

    } catch (error) {
        logMessage(`获取余额失败: ${error.message}`, 'error');
        console.error("Error fetching balances:", error);
    }
};

// =================================================================
// 核心业务方法
// =================================================================

/**
 * 连接 MetaMask 钱包并切换到 Hardhat 网络。
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
        
        logMessage('钱包已连接，正在检查网络...');

        // 网络切换/添加逻辑
        const chainIdHex = '0x' + HARDHAT_CHAIN_ID.toString(16);
        try {
            await window.ethereum.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: chainIdHex }] });
        } catch (switchError) {
            if (switchError.code === 4902) {
                await window.ethereum.request({
                    method: 'wallet_addEthereumChain',
                    params: [{
                        chainId: chainIdHex,
                        chainName: HARDHAT_NETWORK_NAME,
                        rpcUrls: [HARDHAT_RPC_URL],
                        nativeCurrency: { name: 'AI3/ETH', symbol: 'AI3', decimals: 18 },
                    }],
                });
            } else {
                logMessage(`❌ 网络切换失败: ${switchError.message}`);
                return;
            }
        }
        await fetchBalances(walletAddress.value);
        await getBlockInfo();
        logMessage('✅ 钱包已连接，网络已就绪！', 'success');

     } catch(e) {
         logMessage(`连接失败: ${e.message}`, 'error');
     }
};


/**
 * Gas 费水龙头。
 */
export const faucetGas = async () => {
    if (!walletAddress.value || !DEPLOYER_PRIVATE_KEY || DEPLOYER_PRIVATE_KEY === 'YOUR_PRIVATE_KEY_HERE') {
        logMessage('错误: 请先连接钱包，并确保配置了部署者私钥。', 'error');
        return;
    }
    if (isFauceting.value) return;
    isFauceting.value = true;
    
    try {
        logMessage(`正在向 ${walletAddress.value.slice(0, 6)}... 充值 1 AI3 Gas...`);

        // 使用 Hardhat 部署者的私钥发送交易
        const faucetWallet = new ethers.Wallet(DEPLOYER_PRIVATE_KEY, hardhatProvider); 
        const amount = ethers.parseEther("1.0"); 

        const tx = await faucetWallet.sendTransaction({
            to: walletAddress.value,
            value: amount,
        });
        
        await tx.wait(); 
        
        logMessage(`水龙头交易哈希: ${tx.hash} 已确认。`, 'tx');

        // 交易完成后，前进 1 秒并挖矿，确保状态刷新
        await mineTimeAndBlocks(1, 1); 

        await fetchBalances(walletAddress.value);
        logMessage(`✅ Gas 费充值成功！`);

    } catch (error) {
        let errorMessage = error.reason || error.message;
        logMessage(`❌ 充值失败: ${errorMessage}`, 'error');
    } finally {
        isFauceting.value = false;
    }
};

/**
 * 注册用户并领取空投。
 * @param {string} username - 注册的用户名。
 */
export const registerUser = async (username) => {
    if (!walletAddress.value) { logMessage('请先连接钱包。', 'error'); return; }
    if (username.length < 3) { logMessage('用户名长度必须至少为 3 个字符。', 'error'); return; }

    try {
        logMessage(`正在准备注册用户 "${username}"...`, 'info');

        // 1. 确保有时间流逝，以便空投逻辑（timeElapsed > 0）生效
        await mineTimeAndBlocks(1, 1); 
        
        const provider = new ethers.BrowserProvider(window.ethereum);
        const signer = await provider.getSigner();

        const registryContract = new ethers.Contract(REGISTRY_ADDRESS, REGISTRY_ABI, signer);
        const registrationFeeWei = ethers.parseEther("0.01"); 
        
        logMessage(`正在发送注册交易 (支付 ${ethers.formatEther(registrationFeeWei)} AI3)...`, 'tx');

        const tx = await registryContract.registerUsername(
            username,
            { value: registrationFeeWei }
        );
        
        const receipt = await tx.wait(); 
        
        logMessage(`注册交易哈希: ${tx.hash}，区块: ${receipt.blockNumber} 已确认。`, 'tx');
        
        // 2. 交易确认后，再次前进 1 秒并挖矿，确保 MetaMask 状态同步
        await mineTimeAndBlocks(1, 1); 

        await fetchBalances(walletAddress.value);
        
        logMessage(`✅ 注册成功！空投应已发送。`, 'success');

    } catch (error) {
        console.error(error);
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
        window.ethereum.on('chainChanged', () => {
             logMessage('网络已更改，正在刷新页面...');
             window.location.reload(); 
        });
    }
};