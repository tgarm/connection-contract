<template>
  <div class="wallet-connect-panel">
    <button v-if="!walletAddress" @click="connectWallet" class="connect-btn">
      连接 MetaMask
    </button>

    <div v-else class="wallet-info">
      <div class="network-selector">
        <label for="network-select">目标网络:</label>
        <select id="network-select" :value="currentNetworkKey" @change="e => switchNetwork(e.target.value)" :disabled="isDropdownDisabled">
          <option v-for="(net, key) in availableNetworks" :key="key" :value="key">
            {{ net.name }} ({{ net.nativeCurrency.symbol }})
          </option>
        </select>
      </div>

      <div class="balance-display">
        <span><strong>地址:</strong> {{ shortAddr }}</span>
        <span><strong>{{ nativeSymbol }}:</strong> {{ ai3Balance }}</span>
        <span><strong>CT:</strong> {{ ctBalance }}</span>

        <button @click="emit('refresh')" class="refresh-btn" title="刷新余额">🔄</button>
      </div>

      <div class="tags">
        <span v-if="isRegistered" class="tag registered">已注册 ({{ registeredUsername }})</span>
        <span v-if="isFeeReceiver" class="tag receiver">Fee Receiver</span>
        <span v-if="isOwner" class="tag owner">Owner</span>
      </div>

      <p class="warning-text">
        ⚠️ 当前网络: <strong>{{ currentNetwork ? currentNetwork.name : '未知' }}</strong><br>
        请确保有足够的 {{ nativeSymbol }} 支付 Gas 费。
      </p>
    </div>
  </div>
</template>

<script>
import { computed, defineComponent } from 'vue';
import {
  walletAddress, ai3Balance, ctBalance, currentNetworkKey, nativeSymbol,
  connectWallet, switchNetwork, currentNetwork
} from '../lib/wallet-and-rpc'; // 假设这些状态和方法已在 lib/wallet-and-rpc.js 中定义
import { NETWORKS, ContractConfig } from '../lib/constants';

export default defineComponent({
  name: 'WalletConnectPanel',
  props: {
      isRegistered: Boolean,
      registeredUsername: String,
      isFeeReceiver: Boolean,
      isOwner: Boolean,
  },
  emits: ['refresh'],
  setup(props, { emit }) {
    const availableNetworks = computed(() => {
      const result = Object.keys(NETWORKS).reduce((acc, key) => {
        if (ContractConfig.networks[key]) {
          acc[key] = NETWORKS[key];
        }
        return acc;
      }, {});
      return result;
    });

    const isDropdownDisabled = computed(() => {
      return Object.keys(availableNetworks.value).length <= 1;
    });

    const shortAddr = computed(() => walletAddress.value?.slice(0,6) + '...' + walletAddress.value?.slice(-4) || '');

    return {
      // Expose to template
      walletAddress,
      ai3Balance,
      ctBalance,
      currentNetworkKey,
      connectWallet,
      switchNetwork,
      availableNetworks,
      isDropdownDisabled,
      shortAddr,
      currentNetwork,
      nativeSymbol,
      emit
    };
  }
});
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
.balance-display {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 15px;
    background-color: #f9f9f9;
    padding: 8px 12px;
    border-radius: 4px;
    border: 1px solid #eee;
    font-size: 0.9em;
}
.refresh-btn {
    background: none;
    border: none;
    cursor: pointer;
    font-size: 1.2em;
    padding: 0 5px;
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