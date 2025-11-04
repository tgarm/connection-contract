<template>
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
    <p class="current-status-display"><strong>状态:</strong> {{ currentStatus }}</p>
  </div>
</template>

<script setup>
import { ref, watch, nextTick } from 'vue';
import { logs, currentStatus, clearLogs } from '../lib/log-system';

const logConsole = ref(null);

watch(logs, () => {
  nextTick(() => {
    // 自动滚动到底部
    if (logConsole.value) {
      logConsole.value.scrollTop = logConsole.value.scrollHeight;
    }
  });
}, { deep: true });
</script>

<style scoped>
/* 样式应从 UserRegistration.vue 移动到这里 */
.status-message-container {
    margin-top: 30px;
    border-top: 1px solid #eee;
    padding-top: 15px;
}
.clear-log-button {
    float: right;
    padding: 3px 8px;
    background-color: #f0f0f0;
    border: 1px solid #ccc;
    border-radius: 4px;
    cursor: pointer;
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
.log-console p { margin: 0; line-height: 1.4; word-break: break-all;}
.log-console p.info { color: #303133; }
.log-console p.error { color: #F56C6C; font-weight: bold; }
.log-console p.success { color: #67C23A; }

.current-status-display {
    margin-top: 10px;
    padding: 10px; 
    font-weight: bold;
    color: #303133;
    border: 1px solid #DCDFE6; 
    background-color: #ECF5FF; 
    border-radius: 4px;
    transition: background-color 0.3s;
}
</style>