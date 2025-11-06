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
        <div>
          <label>默认评论费 ({{ nativeSymbol }})</label>
          <input :value="adminDefaultCommentFee" @input="e => adminDefaultCommentFee = Number(e.target.value)" type="number" step="0.0001" />
        </div>
        <div>
          <label>默认小费 ({{ nativeSymbol }})</label>
          <input :value="adminDefaultTipAmount" @input="e => adminDefaultTipAmount = Number(e.target.value)" type="number" step="0.0001" />
        </div>
        <button @click="emit('setDefaultCommentFee', adminDefaultCommentFee); emit('setDefaultTipAmount', adminDefaultTipAmount)">更新默认值</button>
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
        <label>开启新空投周期</label>
        <select v-model="airdropPoolSelection">
            <option :value="0">用户池 (User)</option>
            <option :value="1">内容池 (Content)</option>
            <option :value="2">小费池 (Tip)</option>
        </select>
        <input :value="adminAirdropAmount" @input="e => adminAirdropAmount = Number(e.target.value)" type="number" placeholder="CT 数量" />
        <button @click="emit('startAirdropCycle', airdropPoolSelection, adminAirdropAmount)">开启周期</button>
      </div>
    </template>
    
    <div class="contract-info">
      <h4>合约状态</h4>
      <p><strong>合约 {{ nativeSymbol }} 余额:</strong> {{ contractNativeBal }}</p>
      <p><strong>合约 CT 余额:</strong> {{ contractCTBal }}</p>
      <div class="airdrop-pools">
        <p><strong>用户池 (User):</strong> {{ userAirdropData.distributed }} / {{ userAirdropData.total }} CT 已分发 (剩余 {{ userAirdropData.remaining }})</p>
        <p><strong>内容池 (Content):</strong> {{ contentAirdropData.distributed }} / {{ contentAirdropData.total }} CT 已分发 (剩余 {{ contentAirdropData.remaining }})</p>
        <p><strong>小费池 (Tip):</strong> {{ tipAirdropData.distributed }} / {{ tipAirdropData.total }} CT 已分发 (剩余 {{ tipAirdropData.remaining }})</p>
      </div>
      <p v-if="isOwner || isFeeReceiver">
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
    userAirdropData: Object,
    contentAirdropData: Object,
    tipAirdropData: Object,
    totalRegisteredUsers: Number,
    // 管理数据
    initialRegFee: Number,
    initialModFee: Number,
    initialFeeReceiver: String,
    initialDefaultCommentFee: Number,
    initialDefaultTipAmount: Number,
    initialUserAirdropAmount: Number,
    initialContentAirdropAmount: Number,
});

const emit = defineEmits([
    'withdrawFee', 
    'setFees', 
    'setFeeReceiver', 
    'startAirdropCycle',
    'setDefaultCommentFee',
    'setDefaultTipAmount'
]);

// 使用 ref 拷贝 props，以允许在组件内部修改输入框的值
const adminRegFee = ref(props.initialRegFee);
const adminModFee = ref(props.initialModFee);
const adminFeeReceiver = ref(props.initialFeeReceiver);
const adminDefaultCommentFee = ref(props.initialDefaultCommentFee);
const adminDefaultTipAmount = ref(props.initialDefaultTipAmount);
const adminAirdropAmount = ref(10000); // Default input value for new cycle
const airdropPoolSelection = ref(0); // Default to User pool

watch(() => props.initialRegFee, (newVal) => { adminRegFee.value = newVal; });
watch(() => props.initialModFee, (newVal) => { adminModFee.value = newVal; });
watch(() => props.initialFeeReceiver, (newVal) => { adminFeeReceiver.value = newVal; });
watch(() => props.initialDefaultCommentFee, (newVal) => { adminDefaultCommentFee.value = newVal; });
watch(() => props.initialDefaultTipAmount, (newVal) => { adminDefaultTipAmount.value = newVal; });


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
.airdrop-pools p {
    margin: 4px 0;
}
</style>