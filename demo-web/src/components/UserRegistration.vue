<template>
  <div class="user-registration">
    <h2>Connection 用户注册 & 空投领取</h2>

    <!-- 网络选择 -->
    <div class="network-selector">
      <label for="network-select">目标网络:</label>
      <select id="network-select" :value="currentNetworkKey" @change="e => switchNetwork(e.target.value)">
        <option v-for="(net, key) in NETWORKS" :key="key" :value="key">
          {{ net.name }} ({{ net.nativeCurrency.symbol }})
        </option>
      </select>
    </div>

    <!-- 钱包连接 -->
    <button v-if="!walletAddress" @click="connectWallet" class="connect-btn">
      连接 MetaMask
    </button>

    <!-- 钱包信息 -->
    <div v-else class="wallet-info">
      <p><strong>地址:</strong> {{ shortAddr }}</p>
      <p><strong>{{ nativeSymbol }} 余额:</strong> {{ ai3Balance }}</p>
      <p><strong>CT 余额:</strong> {{ ctBalance }}</p>

      <!-- 身份标签 -->
      <div class="tags">
        <span v-if="isRegistered" class="tag registered">已注册</span>
        <span v-if="isFeeReceiver" class="tag receiver">Fee Receiver</span>
        <span v-if="isOwner" class="tag owner">Owner</span>
      </div>

      <p class="warning-text">
        当前网络: <strong>{{ NETWORKS[currentNetworkKey].name }}</strong><br>
        请确保有足够的 {{ nativeSymbol }} 支付 Gas 与注册费。
      </p>
    </div>

    <hr>

    <!-- 用户名查询 -->
    <div class="section">
      <h3>查询用户名</h3>
      <div class="input-group">
        <input v-model="queryUsername" placeholder="输入用户名查询地址" />
        <button @click="queryUsernameAddr" :disabled="!walletAddress || querying">查询</button>
      </div>
      <p v-if="queryResult" class="query-result">
        <strong>{{ queryUsername }}</strong> → {{ queryResult || '未注册' }}
      </p>
    </div>

    <!-- 注册表单 -->
    <div class="section" v-if="walletAddress && !isRegistered">
      <h3>注册新用户</h3>
      <div class="input-group">
        <label for="username">用户名 (3-32 字符)</label>
        <input id="username" v-model="username" placeholder="输入用户名" :disabled="registering" />
      </div>
      <button @click="handleRegister" :disabled="!canRegister" class="register-button">
        {{ registering ? '注册中...' : `注册并领空投 (0.01 ${nativeSymbol})` }}
      </button>
    </div>

    <!-- 已注册用户 -->
    <div class="section" v-if="isRegistered">
      <h3>已注册信息</h3>
      <p>用户名: <strong>{{ registeredUsername }}</strong></p>
      <p>注册时间: {{ formatTime(registrationTime) }}</p>
    </div>

    <!-- Owner 管理面板 -->
    <div class="section" v-if="isOwner">
      <h3>Owner 管理面板</h3>

      <!-- 费用设置 -->
      <div class="admin-row">
        <div>
          <label>注册费 ({{ nativeSymbol }})</label>
          <input v-model.number="adminRegFee" type="number" step="0.001" />
        </div>
        <div>
          <label>修改费 ({{ nativeSymbol }})</label>
          <input v-model.number="adminModFee" type="number" step="0.001" />
        </div>
        <button @click="setFees">更新费用</button>
      </div>

      <!-- 提取费用 -->
      <div class="admin-row" style="justify-content: flex-end; margin-top: 16px;">
        <button 
            @click="withdrawFee" 
            class="withdraw-btn"
            v-if="isOwner || isFeeReceiver"
            :disabled="contractNativeBal === '0'">
            {{ isOwner ? 'Owner' : 'FeeReceiver' }}：提取 {{ contractNativeBal }} {{ nativeSymbol }}
        </button>
      </div>
      <!-- FeeReceiver -->
      <div class="admin-row">
        <label>Fee Receiver</label>
        <input 
            v-model="adminFeeReceiver" 
            placeholder="0x..." 
            style="flex: 1; padding: 8px; border-radius: 4px; border: 1px solid #ddd;"
        />
        <button 
            @click="setFeeReceiver"
            style="margin-left: 8px; padding: 8px 16px; background: #409EFF; color: white; border: none; border-radius: 4px;"
        >
            更改
        </button>
      </div>
      <!-- 开启空投周期 -->
      <div class="admin-row">
        <label>开启新空投周期 (CT 数量)</label>
        <input v-model.number="adminAirdropAmount" type="number" />
        <button @click="startAirdropCycle">开启 4 年周期</button>
      </div>

      <!-- 提取费用 -->
      <button @click="withdrawFee" class="withdraw-btn">提取合约费用</button>

      <!-- 合约状态 -->
      <div class="contract-info">
        <p><strong>合约 {{ nativeSymbol }} 余额:</strong> {{ contractNativeBal }}</p>
        <p><strong>合约 CT 余额:</strong> {{ contractCTBal }}</p>
        <p><strong>已分发 CT:</strong> {{ distributedCT }}</p>
        <p><strong>当前周期剩余:</strong> {{ remainingCT }}</p>
      </div>
    </div>

    <!-- 日志区 -->
    <div class="status-message-container">
      <p>
        <strong>调试日志:</strong>
        <button @click="clearLogs" class="clear-log-button">清空</button>
      </p>
      <div class="log-console" ref="logConsole">
        <p v-for="(msg, i) in logs" :key="i" :class="msg.type">
          [{{ msg.time }}] {{ msg.text }}
        </p>
      </div>
      <p class="current-status"><strong>状态:</strong> {{ currentStatus }}</p>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch, nextTick } from 'vue';
import { ethers } from 'ethers';
import {
  walletAddress, ai3Balance, ctBalance, currentNetworkKey,
  connectWallet, registerUser, switchNetwork, setupEventListeners,
  fetchBalances
} from '../lib/wallet-and-rpc';
import { logs, currentStatus, clearLogs, logMessage } from '../lib/log-system';
import { NETWORKS, REGISTRY_ADDRESS, REGISTRY_ABI, CT_TOKEN_ADDRESS, CT_TOKEN_ABI } from '../lib/constants';

// ==================== 状态 ====================
const username = ref('');
const queryUsername = ref('');
const queryResult = ref('');
const querying = ref(false);
const registering = ref(false);

const isRegistered = ref(false);
const registeredUsername = ref('');
const registrationTime = ref(0);

const isFeeReceiver = ref(false);
const isOwner = ref(false);

// Owner 输入框
const adminRegFee = ref(0.01);
const adminModFee = ref(0.01);
const adminFeeReceiver = ref('');
const adminAirdropAmount = ref(10000);

// 合约实时数据
const contractNativeBal = ref('0');
const contractCTBal = ref('0');
const distributedCT = ref('0');
const remainingCT = ref('0');

const logConsole = ref(null);

// ==================== 计算属性（纯同步！）===================
const shortAddr = computed(() => walletAddress.value?.slice(0,6) + '...' + walletAddress.value?.slice(-4) || '');
const nativeSymbol = computed(() => NETWORKS[currentNetworkKey.value]?.nativeCurrency?.symbol || 'ETH');
const canRegister = computed(() => username.value.length >= 3 && !registering.value);

// ==================== 合约实例（同步）===================
const provider = () => walletAddress.value ? new ethers.BrowserProvider(window.ethereum) : null;
const registry = () => provider() ? new ethers.Contract(REGISTRY_ADDRESS, REGISTRY_ABI, provider()) : null;

// ==================== 异步加载函数 ===================
const loadAllData = async () => {
  if (!walletAddress.value || !provider()) return;
  await Promise.allSettled([fetchBalances(walletAddress.value), loadUserProfile(), loadContractInfo()]);
};

// 加载用户身份 & 资料
const loadUserProfile = async () => {
  try {
    const reg = registry();
    if (!reg) return;

    const name = await reg.getUsernameByAddress(walletAddress.value);
    isRegistered.value = name !== '';
    if (isRegistered.value) {
      registeredUsername.value = name;
      const profile = await reg.users(walletAddress.value);
      registrationTime.value = Number(profile.registrationTime);
    }

    const [owner, receiver, regFee, modFee] = await Promise.all([
      reg.owner(),
      reg.feeReceiver(),
      reg.registrationFee(),
      reg.modificationFee()
    ]);

    isOwner.value = owner.toLowerCase() === walletAddress.value.toLowerCase();
    isFeeReceiver.value = receiver.toLowerCase() === walletAddress.value.toLowerCase();
    adminFeeReceiver.value = receiver;

    adminRegFee.value = Number(ethers.formatEther(regFee));
    adminModFee.value = Number(ethers.formatEther(modFee));
  } catch (e) {
    logMessage(`身份加载失败: ${e.message}`, 'error');
  }
};

// 加载合约余额
const loadContractInfo = async () => {
  try {
    const p = provider();
    const ct = new ethers.Contract(CT_TOKEN_ADDRESS, CT_TOKEN_ABI, p);
    const reg = registry();

    const [nativeBal, ctBal, dist, total] = await Promise.all([
      p.getBalance(REGISTRY_ADDRESS),
      ct.balanceOf(REGISTRY_ADDRESS),
      reg.distributedCT(),
      reg.cycleTotalCT()
    ]);

    contractNativeBal.value = ethers.formatEther(nativeBal);
    contractCTBal.value = ethers.formatEther(ctBal);
    distributedCT.value = ethers.formatEther(dist);
    remainingCT.value = ethers.formatEther(total - dist);
  } catch (e) {
    logMessage(`合约数据加载失败: ${e.message}`, 'error');
  }
};

// ==================== 用户操作 ===================
const queryUsernameAddr = async () => {
  if (!queryUsername.value) return;
  querying.value = true;
  try {
    const addr = await registry().getAddressByUsername(queryUsername.value);
    queryResult.value = addr === ethers.ZeroAddress ? null : addr;
    logMessage(`查询 "${queryUsername.value}" → ${queryResult.value || '未注册'}`);
  } catch (e) {
    logMessage(`查询失败: ${e.message}`, 'error');
  }
  querying.value = false;
};

const handleRegister = async () => {
  registering.value = true;
  await registerUser(username.value);
  username.value = '';
  registering.value = false;
  await loadAllData();
};

// ==================== Owner 操作 ===================
const getSigner = async () => {
  const p = provider();
  return p ? await p.getSigner() : null;
};

const getRegistryWithSigner = async () => {
  const signer = await getSigner();
  return signer ? new ethers.Contract(REGISTRY_ADDRESS, REGISTRY_ABI, signer) : null;
};

const setFees = async () => {
  const reg = await getRegistryWithSigner();
  try {
    await (await reg.setRegistrationFee(ethers.parseEther(adminRegFee.value.toString()))).wait();
    await (await reg.setModificationFee(ethers.parseEther(adminModFee.value.toString()))).wait();
    logMessage('费用更新成功', 'success');
  } catch (e) { logMessage(`费用更新失败: ${e.message}`, 'error'); }
};

const setFeeReceiver = async () => {
  if (!ethers.isAddress(adminFeeReceiver.value)) return logMessage('无效地址', 'error');
  const reg = await getRegistryWithSigner();
  try {
    await (await reg.setFeeReceiver(adminFeeReceiver.value)).wait();
    logMessage(`FeeReceiver 已设为 ${adminFeeReceiver.value}`, 'success');
    isFeeReceiver.value = adminFeeReceiver.value.toLowerCase() === walletAddress.value.toLowerCase();
  } catch (e) { logMessage(`设置失败: ${e.message}`, 'error'); }
};

const startAirdropCycle = async () => {
  const amount = adminAirdropAmount.value;
  if (amount <= 0) return logMessage('无效数量', 'error');
  const reg = await getRegistryWithSigner();
  try {
    await (await reg.startNewAirdropCycle(ethers.parseEther(amount.toString()))).wait();
    logMessage(`新周期开启！${amount} CT`, 'success');
    await loadContractInfo();
  } catch (e) { logMessage(`开启失败: ${e.message}`, 'error'); }
};

const withdrawFee = async () => {
  const reg = await getRegistryWithSigner();
  try {
    await (await reg.withdrawFee()).wait();
    logMessage(`费用已提取 ${contractNativeBal.value} ${nativeSymbol.value}`, 'success');
    await loadContractInfo();
  } catch (e) { logMessage(`提取失败: ${e.message}`, 'error'); }
};

// ==================== 生命周期 ===================
onMounted(() => {
  setupEventListeners();
  connectWallet().then(loadAllData);
});

watch(walletAddress, () => {
  if (walletAddress.value) loadAllData();
});

watch(currentNetworkKey, () => {
  if (walletAddress.value) loadAllData();
});

watch(logs, () => {
  nextTick(() => {
    if (logConsole.value) logConsole.value.scrollTop = logConsole.value.scrollHeight;
  });
}, { deep: true });
</script>