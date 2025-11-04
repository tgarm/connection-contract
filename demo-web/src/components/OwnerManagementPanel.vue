<template>
  <div class="owner-management-panel section">
    <h3>{{ isOwner ? 'Owner' : 'Fee Receiver' }} 管理面板</h3>

    <div class="admin-row" style="justify-content: flex-end; margin-bottom: 15px;">
        <button 
            @click="emit('withdrawFee')" 
            class="withdraw-btn"
            :disabled="contractNativeBal === '0'">
            提取 {{ contractNativeBal }} {{ nativeSymbol }} (作为 {{ isOwner ? 'Owner' : 'Fee Receiver' }})
        </button>
    </div>

    <template v-if="isOwner">
      
      <div class="admin-row">
        <div>
          <label>注册费 ({{ nativeSymbol }})</label>
          <input :value="adminRegFee" @input="e => adminRegFee = Number(e.target.value)" type="number" step="0.001" />
        </div>
        <div>
          <label>修改费 ({{ nativeSymbol }})</label>
          <input :value="adminModFee" @input="e => adminModFee = Number(e.target.value)" type="number" step="0.001" />
        </div>
        <button @click="emit('setFees', adminRegFee, adminModFee)">更新费用</button>
      </div>

      <div class="admin-row">
        <label>Fee Receiver 地址</label>
        <input 
            :value="adminFeeReceiver" 
            @input="e => adminFeeReceiver = e.target.value"
            placeholder="0x..." 
            style="flex: 1; padding: 8px; border-radius: 4px; border: 1px solid #ddd;"
        />
        <button @click="emit('setFeeReceiver', adminFeeReceiver)">更改</button>
      </div>
      
      <div class="admin-row">
        <label>开启新空投周期 (CT 数量)</label>
        <input :value="adminAirdropAmount" @input="e => adminAirdropAmount = Number(e.target.value)" type="number" />
        <button @click="emit('startAirdropCycle', adminAirdropAmount)">开启周期</button>
      </div>
    </template>
    
    <div class="contract-info">
      <h4>合约状态</h4>
      <p><strong>合约 {{ nativeSymbol }} 余额:</strong> {{ contractNativeBal }}</p>
      <p><strong>合约 CT 余额:</strong> {{ contractCTBal }}</p>
      <p><strong>已分发 CT:</strong> {{ distributedCT }}</p>
      <p><strong>当前周期剩余:</strong> {{ remainingCT }}</p>
      <p v-if="isFeeReceiver">
         <strong>总用户数:</strong> {{ totalRegisteredUsers }}
      </p>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import { currentNetworkKey } from '../lib/wallet-and-rpc'; 
import { NETWORKS } from '../lib/constants';

const props = defineProps({
    isOwner: Boolean,
    isFeeReceiver: Boolean,
    // 合约数据
    contractNativeBal: String,
    contractCTBal: String,
    distributedCT: String,
    remainingCT: String,
    totalRegisteredUsers: Number,
    // 管理数据
    initialRegFee: Number,
    initialModFee: Number,
    initialFeeReceiver: String,
    initialAirdropAmount: Number,
});

const emit = defineEmits([
    'withdrawFee', 
    'setFees', 
    'setFeeReceiver', 
    'startAirdropCycle'
]);

// 使用 ref 拷贝 props，以允许在组件内部修改输入框的值
const adminRegFee = ref(props.initialRegFee);
const adminModFee = ref(props.initialModFee);
const adminFeeReceiver = ref(props.initialFeeReceiver);
const adminAirdropAmount = ref(props.initialAirdropAmount);

watch(() => props.initialRegFee, (newVal) => { adminRegFee.value = newVal; });
watch(() => props.initialModFee, (newVal) => { adminModFee.value = newVal; });
watch(() => props.initialFeeReceiver, (newVal) => { adminFeeReceiver.value = newVal; });

const nativeSymbol = computed(() => NETWORKS[currentNetworkKey.value]?.nativeCurrency?.symbol || 'ETH');
</script>

<style scoped>
/* 样式应从 UserRegistration.vue 移动到这里 */
.owner-management-panel {
    border: 1px solid #dcdfe6;
    background-color: #fcfcfc;
}
.admin-row {
    display: flex;
    gap: 10px;
    align-items: flex-end;
    margin-bottom: 15px;
}
.admin-row > div {
    flex: 1;
}

.admin-row input, .admin-row select {
    width: 100%;
    padding: 8px;
}

.admin-row button {
    width: auto;
    padding: 8px 16px;
    margin-top: 0;
}
.withdraw-btn {
    background-color: #F56C6C;
    padding: 10px 15px;
}
.contract-info {
    margin-top: 20px;
    padding: 10px;
    border-top: 1px solid #eee;
    font-size: 0.9em;
}
</style>