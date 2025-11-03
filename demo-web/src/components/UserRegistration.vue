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
            <button @click="clearLogs" class="clear-log-button">清空日志</button>
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

        <button @click="handleRegister" :disabled="!username || !walletAddress" class="register-button">
            注册并领取空投 (费用: 0.01 AI3)
        </button>

        <div class="status-message-container">
            <p><strong>调试日志:</strong></p>
            <div class="log-console" ref="logConsole">
                <p v-for="(message, index) in logs" :key="index" :class="message.type">
                    [{{ message.time }}] {{ message.text }}
                </p>
            </div>
            <p class="current-status"><strong>当前状态:</strong> {{ currentStatus }}</p>
        </div>
    </div>
</template>

<script setup>
import { ref, onMounted, watch, nextTick } from 'vue';
// 从子模块导入所有状态和方法
import { logs, currentStatus, clearLogs } from '../lib/log-system';
import { 
    walletAddress, ai3Balance, ctBalance, isFauceting, isMining, 
    connectWallet, faucetGas, mineBlocks, registerUser, setupEventListeners
} from '../lib/wallet-and-rpc';

// ------------------------------------------------
// 状态
// ------------------------------------------------
const username = ref('');
const logConsole = ref(null); // 用于引用日志滚动容器

// ------------------------------------------------
// 方法
// ------------------------------------------------

// 包装 registerUser 以传入用户名
const handleRegister = () => {
    registerUser(username.value);
};

// ------------------------------------------------
// 生命周期和监听
// ------------------------------------------------

// 监听日志变化，自动滚动到底部
watch(logs, () => {
    nextTick(() => {
        if (logConsole.value) {
            logConsole.value.scrollTop = logConsole.value.scrollHeight;
        }
    });
}, { deep: true });

onMounted(() => {
    setupEventListeners();
    connectWallet();
});
</script>

<style scoped>
.user-registration {
    padding: 20px;
    border: 1px solid #ccc;
    border-radius: 8px;
    max-width: 600px;
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

.clear-log-button {
    background-color: #909399;
    margin-top: 10px;
    width: 100%;
    padding: 6px;
    font-size: 12px;
}
.clear-log-button:hover:not(:disabled) {
    background-color: #797979;
}


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

/* 调试日志样式 */
.status-message-container {
    margin-top: 20px;
}

.log-console {
    max-height: 200px; 
    overflow-y: auto; 
    padding: 10px;
    border: 1px solid #d9ecff;
    background-color: #f8f8f8; 
    color: #333;
    border-radius: 4px;
    font-size: 0.8em;
    font-family: monospace; 
}

.log-console p {
    margin: 0;
    line-height: 1.4;
    word-break: break-all;
}

.log-console p.info { color: #303133; }
.log-console p.error { color: #F56C6C; font-weight: bold; }
.log-console p.success { color: #67C23A; }
.log-console p.tx { color: #409EFF; }
.log-console p.block { color: #E6A23C; }

.current-status {
    margin-top: 10px;
    padding: 5px 0;
    font-weight: bold;
    color: #303133;
    border-top: 1px dashed #ddd;
}
</style>