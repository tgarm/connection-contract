<template>
  <div class="wallet-connect-panel">
    <button v-if="!walletAddress" @click="connectWallet" class="connect-btn">
      连接 MetaMask
    </button>

    <div v-else class="wallet-info">
      <div class="network-selector">
        <label for="network-select">目标网络:</label>
        <select id="network-select" :value="currentNetworkKey" @change="e => switchNetwork(e.target.value)">
          <option v-for="(net, key) in NETWORKS" :key="key" :value="key">
            {{ net.name }} ({{ net.nativeCurrency.symbol }})
          </option>
        </select>
      </div>

      <p><strong>地址:</strong> {{ shortAddr }}</p>
      <p><strong>{{ nativeSymbol }} 余额:</strong> {{ ai3Balance }}</p>
      <p><strong>CT 余额:</strong> {{ ctBalance }}</p>

      <div class="tags">
        <span v-if="isRegistered" class="tag registered">已注册 ({{ registeredUsername }})</span>
        <span v-if="isFeeReceiver" class="tag receiver">Fee Receiver</span>
        <span v-if="isOwner" class="tag owner">Owner</span>
      </div>

      <p class="warning-text">
        ⚠️ 当前网络: <strong>{{ NETWORKS[currentNetworkKey].name }}</strong><br>
        请确保有足够的 {{ nativeSymbol }} 支付 Gas 与注册费。
      </p>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import {
  walletAddress, ai3Balance, ctBalance, currentNetworkKey,
  connectWallet, switchNetwork
} from '../lib/wallet-and-rpc'; // 假设这些状态和方法已在 lib/wallet-and-rpc.js 中定义
import { NETWORKS } from '../lib/constants'; // 假设常量已定义

const props = defineProps({
    isRegistered: Boolean,
    registeredUsername: String,
    isFeeReceiver: Boolean,
    isOwner: Boolean,
});

const shortAddr = computed(() => walletAddress.value?.slice(0,6) + '...' + walletAddress.value?.slice(-4) || '');
const nativeSymbol = computed(() => NETWORKS[currentNetworkKey.value]?.nativeCurrency?.symbol || 'ETH');
</script>

<style scoped>
/* 样式应从 UserRegistration.vue 移动到这里，以保持组件的独立性 */
.network-selector {
    padding: 10px;
    background-color: #f0f8ff;
    border: 1px solid #cceeff;
    border-radius: 4px;
    margin-bottom: 15px;
    display: flex;
    align-items: center;
    gap: 10px;
}
.wallet-info {
    padding: 10px 0;
}
.tags {
    margin: 10px 0;
}
.tag {
    display: inline-block;
    padding: 3px 8px;
    margin-right: 8px;
    border-radius: 4px;
    font-size: 0.8em;
    font-weight: bold;
}
.registered { background-color: #E1F3D8; color: #67C23A; }
.receiver { background-color: #FAE5DD; color: #E6A23C; }
.owner { background-color: #F8F8A7; color: #9C9C22; }

.warning-text {
    margin-top: 15px;
    padding: 8px;
    border: 1px solid #F56C6C;
    background-color: #FEF0F0;
    border-radius: 4px;
    font-size: 0.9em;
}

.connect-btn {
    padding: 10px 20px;
    background-color: #409EFF;
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    width: 100%;
    margin-bottom: 15px;
}
</style>