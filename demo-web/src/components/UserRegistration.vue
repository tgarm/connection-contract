<template>
    <div class="user-registration">
        <h2>用户注册与空投领取</h2>
        
        <button v-if="!walletAddress" @click="connectWallet">
            连接 MetaMask 钱包
        </button>
        
        <div v-else class="wallet-info">
            <p><strong>已连接地址:</strong> {{ walletAddress.slice(0, 6) }}...{{ walletAddress.slice(-4) }}</p>
            <p><strong>AI3 余额:</strong> {{ ai3Balance }}</p>
            <p><strong>CT 余额:</strong> {{ ctBalance }}</p>
            
            <button @click="faucetGas" :disabled="isFauceting" class="faucet-button">
                {{ isFauceting ? '正在充值 Gas...' : '领取 1 AI3 Gas 费' }}
            </button>
        </div>

        <hr>

        <div class="block-control">
            <h3>Hardhat 区块控制 (仅限本地开发)</h3>
            <div class="block-buttons">
                <button @click="mineBlocks(1)" :disabled="isMining">
                    {{ isMining ? '挖矿中...' : '前进 1 区块' }}
                </button>
                <button @click="mineBlocks(10)" :disabled="isMining">
                    {{ isMining ? '挖矿中...' : '前进 10 区块' }}
                </button>
                <button @click="mineBlocks(100)" :disabled="isMining">
                    {{ isMining ? '挖矿中...' : '前进 100 区块' }}
                </button>
            </div>
        </div>

        <hr>

        <div class="input-group">
            <label for="username">用户名:</label>
            <input 
                id="username" 
                v-model="username" 
                placeholder="请输入您的用户名 (3-32 字符)" 
                required
                :disabled="!walletAddress"
            />
        </div>

        <button @click="registerUser" :disabled="!username || !walletAddress" class="register-button">
            注册并领取空投 (费用: 0.01 AI3)
        </button>

        <div class="status-message">
            <strong>状态:</strong> {{ status }}
        </div>
    </div>
</template>

<script>
import { ref, onMounted } from 'vue';
import { ethers } from 'ethers'; 

// 导入 ABI JSON 文件 (假设路径正确)
import RegistryJson from '../config/abi/ConnectionUserRegistry.json'; 

// 环境变量读取
const REGISTRY_ADDRESS = process.env.VUE_APP_REGISTRY_ADDRESS; 
const CT_TOKEN_ADDRESS = process.env.VUE_APP_CT_TOKEN_ADDRESS;
const DEPLOYER_PRIVATE_KEY = process.env.VUE_APP_DEPLOYER_PRIVATE_KEY;
const REGISTRY_ABI = RegistryJson.abi;

// Hardhat 配置
const HARDHAT_CHAIN_ID = 31337; 
const HARDHAT_RPC_URL = 'http://127.0.0.1:8545';
const HARDHAT_NETWORK_NAME = 'Hardhat Localhost';

// Hardhat RPC 方法
const MINE_BLOCK_METHOD = 'evm_mine'; 

// CT Token 的极简 ABI (只需要 balanceOf)
const CT_TOKEN_ABI = [
    {"inputs":[{"internalType":"address","name":"account","type":"address"}],"name":"balanceOf","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"}
];

export default {
    name: 'UserRegistration',
    setup() {
        const username = ref('');
        const status = ref('等待连接钱包...');
        const walletAddress = ref('');
        const isFauceting = ref(false);
        // 🚨 新增挖矿状态
        const isMining = ref(false);
        const ai3Balance = ref('0.0 AI3');
        const ctBalance = ref('0.0 CT');


        // =================================================================
        // 模块 1: 余额获取
        // =================================================================

        const fetchBalances = async (address) => {
            if (!address || !window.ethereum) return;
            
            try {
                const provider = new ethers.BrowserProvider(window.ethereum);
                
                // 1. 获取 AI3 (Gas 币) 余额
                const ethWei = await provider.getBalance(address);
                ai3Balance.value = `${ethers.formatEther(ethWei)} AI3`;

                if (CT_TOKEN_ADDRESS) {
                    // 2. 获取 CT Token 余额
                    const ctContract = new ethers.Contract(CT_TOKEN_ADDRESS, CT_TOKEN_ABI, provider);
                    const ctWei = await ctContract.balanceOf(address);
                    ctBalance.value = `${ethers.formatEther(ctWei)} CT`;
                } else {
                    ctBalance.value = 'CT 地址未配置';
                }

            } catch (error) {
                console.error("Error fetching balances:", error);
            }
        };


        // =================================================================
        // 模块 2: 钱包连接与网络切换 (保持不变)
        // =================================================================

        const connectWallet = async () => {
             if (typeof window.ethereum === 'undefined') {
                 status.value = '请安装 MetaMask 钱包！';
                 return;
             }
             
             try {
                const provider = new ethers.BrowserProvider(window.ethereum);
                await provider.send("eth_requestAccounts", []);
                const signer = await provider.getSigner();
                walletAddress.value = await signer.getAddress();
                
                status.value = '钱包已连接，正在检查网络...';

                // 网络切换/添加逻辑 (保持不变)
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
                         status.value = `❌ 网络切换失败: ${switchError.message}`;
                         return;
                    }
                }
                
                await fetchBalances(walletAddress.value);
                status.value = '✅ 钱包已连接，网络已就绪！';

             } catch(e) {
                 status.value = `连接失败: ${e.message}`;
             }
        }
        
        // =================================================================
        // 模块 3: Hardhat 区块控制
        // =================================================================
 
        const mineBlocks = async (count = 1) => {
            isMining.value = true;
            status.value = `正在生成 ${count} 个区块...`;
            
            try {
                // 🚨 关键修正：直接创建 JsonRpcProvider 连接到 Hardhat 节点
                const hardhatProvider = new ethers.JsonRpcProvider(HARDHAT_RPC_URL);
                
                for (let i = 0; i < count; i++) {
                    // 强制 Hardhat 挖矿，直接向 Hardhat RPC 发送请求
                    await hardhatProvider.send(MINE_BLOCK_METHOD, []);
                }
                
                // 挖矿完成后，使用 MetaMask 连接的 provider 更新余额
                if (walletAddress.value) {
                    await fetchBalances(walletAddress.value);
                }
                status.value = `✅ 成功生成 ${count} 个区块。`;

            } catch(e) {
                console.error("Block mining error:", e);
                // 错误处理更明确：如果 RPC 地址错误或 Hardhat 未运行，这里会捕获到
                status.value = `❌ 区块生成失败: 请确认 Hardhat 节点在 ${HARDHAT_RPC_URL} 上运行。错误详情: ${e.message}`;
            } finally {
                isMining.value = false;
            }
        };

        // =================================================================
        // 模块 4: Gas 费水龙头
        // =================================================================

        const faucetGas = async () => {
            if (!walletAddress.value || !DEPLOYER_PRIVATE_KEY || DEPLOYER_PRIVATE_KEY === 'YOUR_PRIVATE_KEY_HERE') {
                status.value = '错误: 请先连接钱包，并确保配置了部署者私钥。';
                return;
            }
            if (isFauceting.value) return;
            isFauceting.value = true;
            
            try {
                status.value = `正在向 ${walletAddress.value.slice(0, 6)}... 充值 1 AI3 Gas...`;

                const hardhatProvider = new ethers.JsonRpcProvider(HARDHAT_RPC_URL);
                const faucetWallet = new ethers.Wallet(DEPLOYER_PRIVATE_KEY, hardhatProvider); 
                const amount = ethers.parseEther("1.0"); // 1 AI3

                const tx = await faucetWallet.sendTransaction({
                    to: walletAddress.value,
                    value: amount,
                });
                
                await tx.wait(); // 交易被 Hardhat 处理

                status.value = `✅ Gas 费发送成功！请点击 "前进 1 区块" 按钮更新余额。交易哈希: ${tx.hash}`;
                
                // 🚨 移除此处的 evm_mine 调用，交给用户手动控制
                // 挖矿操作将由用户通过新的按钮执行
                
                // 立即更新状态，但余额可能不变，直到挖矿
                await fetchBalances(walletAddress.value);

            } catch (error) {
                console.error("Faucet Error:", error);
                let errorMessage = error.reason || error.message;
                status.value = `❌ 充值失败: ${errorMessage}`;
            } finally {
                isFauceting.value = false;
            }
        };


        // =================================================================
        // 模块 5: 用户注册 (保持不变)
        // =================================================================

        const registerUser = async () => {
            if (!walletAddress.value) { status.value = '请先连接钱包。'; return; }
            if (username.value.length < 3) { status.value = '用户名长度必须至少为 3 个字符。'; return; }

            try {
                const provider = new ethers.BrowserProvider(window.ethereum);
                const signer = await provider.getSigner();

                const registryContract = new ethers.Contract(REGISTRY_ADDRESS, REGISTRY_ABI, signer);
                const registrationFeeWei = ethers.parseEther("0.01"); 
                status.value = `正在注册用户 "${username.value}"，交易进行中...`;

                const tx = await registryContract.registerUsername(
                    username.value,
                    { value: registrationFeeWei }
                );
                
                const receipt = await tx.wait(); 
                status.value = `✅ 注册成功！交易哈希: ${tx.hash}，区块: ${receipt.blockNumber}`;

                // 注册成功后，Hardhat 已经挖矿生成了区块，因此直接获取余额是准确的
                await fetchBalances(walletAddress.value);

            } catch (error) {
                console.error(error);
                let errorMessage = error.reason || error.message;
                if (error.code === 4001) { errorMessage = '用户拒绝了交易。'; }
                status.value = `❌ 注册失败: ${errorMessage}`;
            }
        };

        // =================================================================
        // Vue 生命周期钩子和返回
        // =================================================================

        onMounted(() => {
            connectWallet();
            
            if (window.ethereum) {
                window.ethereum.on('accountsChanged', (accounts) => {
                    if (accounts.length > 0) {
                        walletAddress.value = accounts[0];
                        fetchBalances(accounts[0]);
                    } else {
                        walletAddress.value = '';
                        ai3Balance.value = '0.0 AI3';
                        ctBalance.value = '0.0 CT';
                        status.value = '钱包已断开连接。';
                    }
                });
                window.ethereum.on('chainChanged', () => {
                     window.location.reload(); 
                });
            }
        });

        return {
            username,
            status,
            walletAddress,
            isFauceting,
            isMining, // 🚨 返回挖矿状态
            ai3Balance,
            ctBalance,
            // 方法
            connectWallet,
            registerUser,
            faucetGas,
            mineBlocks, // 🚨 返回挖矿方法
            fetchBalances
        };
    }
};
</script>

<style scoped>
.user-registration {
    padding: 20px;
    border: 1px solid #ccc;
    border-radius: 8px;
    max-width: 500px;
    margin: 40px auto;
    font-family: sans-serif;
}

h2 {
    color: #333;
    border-bottom: 2px solid #eee;
    padding-bottom: 10px;
}

.wallet-info p {
    margin: 5px 0;
    font-size: 0.9em;
    color: #555;
}

hr {
    border: none;
    border-top: 1px solid #eee;
    margin: 20px 0;
}

/* 🚨 新增：区块控制样式 */
.block-control h3 {
    margin-top: 0;
    font-size: 1.1em;
    color: #909399;
}
.block-buttons {
    display: flex;
    gap: 10px;
}
.block-buttons button {
    flex: 1;
    padding: 8px;
    font-size: 13px;
    background-color: #F56C6C; /* 红色 */
    margin-top: 0;
}
.block-buttons button:hover:not(:disabled) {
    background-color: #E64343;
}
/* -------------------- */

.input-group {
    margin-bottom: 15px;
}

label {
    display: block;
    margin-bottom: 5px;
    font-weight: bold;
}

input {
    width: 100%;
    padding: 10px;
    box-sizing: border-box;
    border: 1px solid #ddd;
    border-radius: 4px;
}

button {
    background-color: #409EFF;
    color: white;
    padding: 10px 15px;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-size: 14px;
    transition: background-color 0.3s;
    width: 100%;
    margin-top: 10px;
}

.faucet-button {
    background-color: #67C23A;
    margin-top: 15px;
    margin-bottom: 5px;
}

.register-button {
    background-color: #E6A23C;
}

button:hover:not(:disabled) {
    opacity: 0.9;
}

button:disabled {
    background-color: #909399;
    cursor: not-allowed;
}

.status-message {
    margin-top: 20px;
    padding: 10px;
    border: 1px solid #d9ecff;
    background-color: #ecf5ff;
    color: #333;
    border-radius: 4px;
    word-break: break-all;
    font-size: 0.9em;
}
</style>