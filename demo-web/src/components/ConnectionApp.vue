<template>
  <div class="connection-app">
    <h2>Connection 链上身份与社交仪表板</h2>

    <WalletConnectPanel 
        :isRegistered="isRegistered"
        :registeredUsername="registeredUsername"
        :isFeeReceiver="isFeeReceiver"
        :isOwner="isOwner"
        @refresh="loadAllData"
    />

    <hr>
    
    <el-tabs v-model="activeTab" type="border-card" class="main-tabs">
        
        <el-tab-pane label="👤 账户与注册" name="account">
            
            <div class="app-section">
                <h3>用户查询</h3>
                
                <div class="input-group query-group">
                    <input v-model="queryUsername" placeholder="输入用户名查询地址" />
                    <button @click="queryUsernameAddr" :disabled="!walletAddress || querying">查用户名</button>
                </div>
                <p v-if="queryUsernameResult" class="query-result">
                    <strong>{{ queryUsername }}</strong> → {{ queryUsernameResult || '未注册' }}
                </p>

                <div class="input-group query-group" style="margin-top: 15px;">
                    <input v-model="queryAddress" placeholder="输入地址 (0x...) 查询用户名" />
                    <button @click="queryAddressUsername" :disabled="!walletAddress || querying">查地址</button>
                </div>
                <p v-if="queryAddressResult" class="query-result">
                    <strong>{{ shortQueryAddr }}</strong> → {{ queryAddressResult || '未注册' }}
                </p>
            </div>

            <div class="app-section" v-if="walletAddress && !isRegistered">
                <h3>注册新用户</h3>
                <div class="input-group">
                    <label for="username">用户名 (3-32 字符)</label>
                    <input id="username" v-model="username" placeholder="输入用户名" :disabled="registering" />
                </div>

                <p class="airdrop-info" v-if="estimatedAirdrop > 0">
                    🎉 成功注册可获得约 <strong>{{ estimatedAirdrop }} CT</strong> 空投！
                </p>
                <p class="airdrop-info" v-else>
                    空投周期数据加载中，或当前空投周期已结束。
                </p>

                <button @click="handleRegister" :disabled="!canRegister" class="register-button">
                    {{ registering ? '注册中...' : `注册并领空投 (${adminRegFee} ${nativeSymbol})` }}
                </button>
            </div>

            <div class="app-section" v-if="isRegistered">
                <h3>已注册信息</h3>
                <p>注册时间: {{ formatTime(registrationTime) }}</p>

                <div class="input-group update-group">
                    <label for="new-username">修改用户名 ({{ adminModFee }} {{ nativeSymbol }})</label>
                    <input 
                    id="new-username" 
                    v-model="newUsername" 
                    placeholder="输入新用户名" 
                    :disabled="updating" 
                    />
                    <button @click="handleUpdateUsername" :disabled="!canUpdate" class="update-button">
                    {{ updating ? '修改中...' : '确认修改' }}
                    </button>
                </div>
            </div>
        </el-tab-pane>
        
        <el-tab-pane label="💬 消息墙" name="messages">
            <MessageBoard 
                :isRegistered="isRegistered"
                :defaultTipAmount="adminDefaultTipAmount"
                :loadAllData="loadAllData"
                :addressUsernameMap="addressUsernameMap"
            />
        </el-tab-pane>

        <el-tab-pane label="⚙️ 管理面板" name="admin" v-if="isOwner || isFeeReceiver">
             <OwnerManagementPanel 
                :isOwner="isOwner"
                :isFeeReceiver="isFeeReceiver"
                
                :contractNativeBal="contractNativeBal"
                :contractCTBal="contractCTBal"
                :userAirdropData="userAirdropData"
                :contentAirdropData="contentAirdropData"
                :tipAirdropData="tipAirdropData"
                :totalRegisteredUsers="totalRegisteredUsers"
                
                :initialRegFee="adminRegFee"
                :initialModFee="adminModFee"
                :initialFeeReceiver="adminFeeReceiver"
                :initialDefaultCommentFee="adminDefaultCommentFee"
                :initialDefaultTipAmount="adminDefaultTipAmount"
                :initialUserAirdropAmount="adminUserAirdropAmount"
                :initialContentAirdropAmount="adminContentAirdropAmount"
                
                @withdrawFee="withdrawFee"
                @setFees="setFees"
                @setDefaultTipAmount="setDefaultTipAmount"
                @setFeeReceiver="setFeeReceiver"
                @startAirdropCycle="startAirdropCycle"
                @setDefaultCommentFee="setDefaultCommentFee"
            />
        </el-tab-pane>

        <el-tab-pane label="📄 日志与状态" name="logs">
            <LogAndStatus />
        </el-tab-pane>

    </el-tabs>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue';
import { ethers } from 'ethers';

// --- 导入子组件 ---
import WalletConnectPanel from './WalletConnectPanel.vue';
import OwnerManagementPanel from './OwnerManagementPanel.vue';
import LogAndStatus from './LogAndStatus.vue';
import MessageBoard from './MessageBoard.vue'; 

// --- 导入 lib 模块 ---
import {
  walletAddress, currentNetworkKey,
  connectWallet, registerUser, setupEventListeners,
  fetchBalances,
  registry, getRegistryWithSigner,
  getProvider
} from '../lib/wallet-and-rpc';
import { logMessage } from '../lib/log-system';
import { NETWORKS, getContractAddresses, CT_TOKEN_ABI } from '../lib/constants';


// ==================== 状态 & 常量 ====================
const activeTab = ref('account'); // 默认显示账户 Tab

const username = ref('');
const newUsername = ref(''); 
const queryUsername = ref('');
const queryUsernameResult = ref('');
const queryAddress = ref(''); 
const queryAddressResult = ref('');
const querying = ref(false);
const registering = ref(false);
const updating = ref(false);

const isRegistered = ref(false);
const registeredUsername = ref('');
const registrationTime = ref(0);

const isFeeReceiver = ref(false);
const isOwner = ref(false);

// Owner 管理数据 
const adminRegFee = ref(0.01);
const adminModFee = ref(0.01);
const adminFeeReceiver = ref('');
const adminDefaultCommentFee = ref(0.001);
const adminDefaultTipAmount = ref(0.001);
const adminUserAirdropAmount = ref(10000);
const adminContentAirdropAmount = ref(100000);

// 合约实时数据
const contractNativeBal = ref('0');
const contractCTBal = ref('0');
const userAirdropData = ref({
    distributed: '0',
    remaining: '0',
    total: '0'
});
const contentAirdropData = ref({
    distributed: '0',
    remaining: '0',
    total: '0'
});
const tipAirdropData = ref({
    distributed: '0',
    remaining: '0',
    total: '0'
});
const totalRegisteredUsers = ref(0);
const addressUsernameMap = ref({}); // 用户名缓存
const estimatedAirdrop = ref('0');


// ==================== 计算属性 ===================
const shortQueryAddr = computed(() => queryAddress.value?.slice(0,6) + '...' + queryAddress.value?.slice(-4) || '');
const nativeSymbol = computed(() => NETWORKS[currentNetworkKey.value]?.nativeCurrency?.symbol || 'ETH');
const canRegister = computed(() => username.value.length >= 3 && !registering.value);
const canUpdate = computed(() => 
    newUsername.value.length >= 3 && 
    newUsername.value !== registeredUsername.value && 
    !updating.value
);

// ==================== 实用工具 & 合约实例 ===================

const formatTime = (timestamp) => {
  if (!timestamp || timestamp === 0) return 'N/A';
  const date = new Date(Number(timestamp) * 1000); 
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });
};



// ==================== 数据加载函数 ===================

const loadAllData = async () => {
  if (!walletAddress.value || !getProvider()) return;
  logMessage('正在刷新所有链上数据...', 'info');

  await Promise.allSettled([
    fetchBalances(walletAddress.value), 
    loadUserProfile(), 
    loadContractInfo(),
    updateEstimatedAirdrop()
  ]);
  
  logMessage('数据刷新完成。', 'success');
};

const loadUserProfile = async () => {
  try {
    const reg = registry(currentNetworkKey.value);
    if (!reg) return;

    // 1. 用户名和注册信息
    const name = await reg.getUsernameByAddress(walletAddress.value);
    isRegistered.value = name !== '';
    if (isRegistered.value) {
      registeredUsername.value = name;
      const profile = await reg.users(walletAddress.value);
      registrationTime.value = Number(profile.registrationTime);
      
      // 填充当前用户的用户名到 map
      addressUsernameMap.value[walletAddress.value.toLowerCase()] = name;
    } else {
      registeredUsername.value = '';
      registrationTime.value = 0;
    }

    // 2. 权限和费用
    const [owner, receiver, regFee, modFee, defCommentFee, defTipAmount] = await Promise.all([
      reg.owner(),
      reg.feeReceiver(),
      reg.registrationFee(),
      reg.modificationFee(),
      reg.defaultCommentFee(),
      reg.defaultTipAmount()
    ]);

    isOwner.value = owner.toLowerCase() === walletAddress.value.toLowerCase();
    isFeeReceiver.value = receiver.toLowerCase() === walletAddress.value.toLowerCase();
    adminFeeReceiver.value = receiver;

    adminDefaultTipAmount.value = Number(ethers.formatEther(defTipAmount));
    adminRegFee.value = Number(ethers.formatEther(regFee));
    adminModFee.value = Number(ethers.formatEther(modFee));
    adminDefaultCommentFee.value = Number(ethers.formatEther(defCommentFee));
  } catch (e) {
    logMessage(`身份加载失败: ${e.message}`, 'error');
  }
};

const loadContractInfo = async () => {
  try {
    const p = getProvider();
    const addresses = getContractAddresses(currentNetworkKey.value);
    if (!addresses) return;
    const ct = new ethers.Contract(addresses.ctTokenAddress, CT_TOKEN_ABI, p);
    const reg = registry(currentNetworkKey.value);

    // 关键修正：totalRegisteredUsers 变为 totalUsers
    const [nativeBal, ctBal, userCycle, contentCycle, tipCycle, totalUsersCount] = await Promise.all([
      p.getBalance(addresses.registryAddress),
      ct.balanceOf(addresses.registryAddress),
      reg.airdropCycles(0), // AirdropPool.User
      reg.airdropCycles(1), // AirdropPool.Content
      reg.airdropCycles(2), // AirdropPool.Tip
      reg.totalUsers() // ✅ 匹配合约 public totalUsers()
    ]);

    contractNativeBal.value = ethers.formatEther(nativeBal);
    contractCTBal.value = ethers.formatEther(ctBal);

    userAirdropData.value.total = ethers.formatEther(userCycle.cycleTotalCT);
    userAirdropData.value.distributed = ethers.formatEther(userCycle.distributedCT);
    const userRemaining = userCycle.cycleTotalCT > userCycle.distributedCT ? userCycle.cycleTotalCT - userCycle.distributedCT : 0n;
    userAirdropData.value.remaining = ethers.formatEther(userRemaining);

    contentAirdropData.value.total = ethers.formatEther(contentCycle.cycleTotalCT);
    contentAirdropData.value.distributed = ethers.formatEther(contentCycle.distributedCT);
    const contentRemaining = contentCycle.cycleTotalCT > contentCycle.distributedCT ? contentCycle.cycleTotalCT - contentCycle.distributedCT : 0n;
    contentAirdropData.value.remaining = ethers.formatEther(contentRemaining);

    tipAirdropData.value.total = ethers.formatEther(tipCycle.cycleTotalCT);
    tipAirdropData.value.distributed = ethers.formatEther(tipCycle.distributedCT);
    const tipRemaining = tipCycle.cycleTotalCT > tipCycle.distributedCT ? tipCycle.cycleTotalCT - tipCycle.distributedCT : 0n;
    tipAirdropData.value.remaining = ethers.formatEther(tipRemaining);

    totalRegisteredUsers.value = Number(totalUsersCount); 
  } catch (e) {
    logMessage(`合约数据加载失败: ${e.message}`, 'error');
  }
};

const updateEstimatedAirdrop = async () => {
    const reg = registry(currentNetworkKey.value);
    if (!reg) return;
    try {
        const amount = await reg.getEstimatedAirdrop(0); // AirdropPool.User
        // 将结果格式化为 ether 单位并保留4位小数
        estimatedAirdrop.value = parseFloat(ethers.formatEther(amount)).toFixed(4);
    } catch (e) {
        logMessage(`获取预估空投失败: ${e.message}`, 'error');
        estimatedAirdrop.value = '0';
    }
};


// ==================== 用户操作 ===================
const queryUsernameAddr = async () => {
  if (!queryUsername.value) return;
  querying.value = true;
  queryUsernameResult.value = '';
  try {
    const addr = await registry(currentNetworkKey.value).getAddressByUsername(queryUsername.value); 
    queryUsernameResult.value = addr === ethers.ZeroAddress ? null : addr;
    logMessage(`查询用户名 "${queryUsername.value}" → ${queryUsernameResult.value || '未注册'}`);
  } catch (e) {
    logMessage(`查询用户名失败: ${e.message}`, 'error');
  }
  querying.value = false;
};

const queryAddressUsername = async () => {
    if (!queryAddress.value || !ethers.isAddress(queryAddress.value)) {
        return logMessage('请输入有效的以太坊地址。', 'error');
    }
    querying.value = true;
    queryAddressResult.value = '';
    try {
        const reg = registry(currentNetworkKey.value);
        const username = await reg.getUsernameByAddress(queryAddress.value);
        queryAddressResult.value = username === '' ? null : username;
        logMessage(`查询地址 "${shortQueryAddr.value}" → ${queryAddressResult.value || '未注册'}`, 'info');
    } catch (e) {
        logMessage(`查询地址失败: ${e.message}`, 'error');
    }
    querying.value = false;
};

const handleRegister = async () => {
  registering.value = true;
  // 假设 registerUser 在 lib/wallet-and-rpc.js 中调用 reg.registerUsername
  // 并且使用 adminRegFee.value 作为 value
  await registerUser(username.value, adminRegFee.value); 
  username.value = '';
  registering.value = false;
  await loadAllData(); 
};

const handleUpdateUsername = async () => {
    if (!canUpdate.value) return;
    
    updating.value = true;
    const reg = await getRegistryWithSigner(currentNetworkKey.value);
    
    try {
        logMessage(`正在将用户名从 "${registeredUsername.value}" 修改为 "${newUsername.value}"...`, 'info');
        
        const modFeeValue = ethers.parseEther(adminModFee.value.toString()); 

        // 关键修正：updateUsername 变为 modifyUsername
        const tx = await reg.modifyUsername(newUsername.value, { value: modFeeValue });
        
        await tx.wait();
        
        logMessage(`✅ 用户名修改成功！`, 'success');
        
        newUsername.value = ''; 
        await loadAllData(); 
        
    } catch (error) {
        let errorMessage = error.reason || error.message;
        if (error.code === 4001) { errorMessage = '用户拒绝了交易。'; }
        logMessage(`❌ 用户名修改失败: ${errorMessage}`, 'error');
    }
    updating.value = false;
};


// ==================== Owner 管理操作 (事件处理) ===================

const setFees = async (regFee, modFee) => {
  const reg = await getRegistryWithSigner(currentNetworkKey.value);
  try {
    await (await reg.setRegistrationFee(ethers.parseEther(regFee.toString()))).wait();
    await (await reg.setModificationFee(ethers.parseEther(modFee.toString()))).wait();
    logMessage('费用更新成功', 'success');
    await loadAllData(); 
  } catch (e) { logMessage(`费用更新失败: ${e.message}`, 'error'); }
};

const setFeeReceiver = async (receiverAddr) => {
  if (!receiverAddr || !ethers.isAddress(receiverAddr)) {
    return logMessage('无效的 Fee Receiver 地址', 'error');
  }
  const reg = await getRegistryWithSigner(currentNetworkKey.value);
  try {
    await (await reg.setFeeReceiver(receiverAddr)).wait();
    logMessage(`FeeReceiver 已设为 ${receiverAddr}`, 'success');
    await loadAllData(); 
  } catch (e) { logMessage(`设置失败: ${e.message}`, 'error'); }
};

const startAirdropCycle = async (pool, amount) => {
  if (amount <= 0) return logMessage('无效数量', 'error');
  const reg = await getRegistryWithSigner(currentNetworkKey.value);
  try {
    const poolName = pool === 0 ? 'User' : 'Content';
    await (await reg.startNewAirdropCycle(pool, ethers.parseEther(amount.toString()))).wait(); 
    logMessage(`新 ${poolName} 空投周期开启！总额: ${amount} CT`, 'success');
    await loadAllData(); 
  } catch (e) { logMessage(`开启失败: ${e.message}`, 'error'); }
};

const withdrawFee = async () => {
  const reg = await getRegistryWithSigner(currentNetworkKey.value);
  try {
    await (await reg.withdrawFee()).wait();
    logMessage(`费用已提取 ${contractNativeBal.value} ${nativeSymbol.value}`, 'success');
    await loadAllData(); 
  } catch (e) { logMessage(`提取失败: ${e.message}`, 'error'); }
};

const setDefaultCommentFee = async (fee) => {
  const reg = await getRegistryWithSigner(currentNetworkKey.value);
  try {
    await (await reg.setDefaultCommentFee(ethers.parseEther(fee.toString()))).wait();
    logMessage('默认评论费用更新成功', 'success');
    await loadAllData(); 
  } catch (e) { logMessage(`费用更新失败: ${e.message}`, 'error'); }
};

const setDefaultTipAmount = async (tip) => {
  const reg = await getRegistryWithSigner(currentNetworkKey.value);
  try {
    await (await reg.setDefaultTipAmount(ethers.parseEther(tip.toString()))).wait();
    logMessage('默认小费金额更新成功', 'success');
    await loadAllData(); 
  } catch (e) { logMessage(`小费金额更新失败: ${e.message}`, 'error'); }
};


// ==================== 生命周期 ===================
onMounted(() => {
  setupEventListeners();
  connectWallet();
});

watch(walletAddress, () => {
  if (walletAddress.value) loadAllData();
});

watch(currentNetworkKey, () => {
  if (walletAddress.value) loadAllData();
});

// 自动切换到管理面板 Tab
watch([isOwner, isFeeReceiver], ([isO, isR]) => {
    if ((isO || isR) && activeTab.value === 'account') {
        activeTab.value = 'admin';
    }
});
</script>

<style scoped>
.connection-app {
    padding: 20px;
    border: 1px solid #ccc;
    border-radius: 8px;
    max-width: 650px; /* 略微放宽以适应 Element Plus 样式 */
    margin: 40px auto;
    font-family: sans-serif;
}
h2 {
    text-align: center;
    color: #303133;
    margin-bottom: 20px;
}
hr {
    margin: 15px 0;
    border: none;
    border-top: 1px solid #eee;
}
/* 新增的 .app-section 替换旧的 .section 样式 */
.app-section {
    padding: 10px 0;
    margin-bottom: 15px;
}
.input-group {
    margin-bottom: 15px;
    display: flex;
    flex-direction: column;
}
/* Element Plus Tabs 样式 */
.main-tabs {
    --el-tabs-header-height: 40px;
    margin-top: 20px;
}
/* 查询面板组样式 */
.query-group {
    flex-direction: row !important;
    gap: 10px;
    align-items: center;
}
.query-group input {
    flex-grow: 1;
    padding: 10px;
    border: 1px solid #DCDFE6;
    border-radius: 4px;
}
.query-group button {
    width: auto;
    margin-top: 0;
    padding: 10px 15px;
}
.query-result {
    margin-top: 5px;
    font-size: 0.9em;
    color: #333;
    word-break: break-all;
}
.register-button, .update-button {
    padding: 10px;
    background-color: #4CAF50;
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    width: 100%;
    transition: background-color 0.2s;
}
.update-group {
    margin-top: 15px;
    padding-top: 10px;
    border-top: 1px dashed #eee;
    display: flex;
    flex-direction: column;
    gap: 10px;
}
.update-button {
    background-color: #67C23A; 
}
/* 空投信息样式 */
.airdrop-info {
    font-size: 0.95em;
    color: #E6A23C;
    background-color: #FEF0E6;
    padding: 8px;
    border-radius: 4px;
    margin-bottom: 15px;
}
.airdrop-info strong {
    color: #D36A18;
}
</style>