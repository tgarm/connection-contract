// src/lib/log-system.js

import { ref } from 'vue';

export const logs = ref([]); 
export const currentStatus = ref('未初始化...'); 

export const logMessage = (text, type = 'info') => {
    const now = new Date();
    const time = now.toTimeString().split(' ')[0];
    
    logs.value.push({ time, text, type });
    currentStatus.value = text;
    
    // 保持日志数量不超过 100 行
    if (logs.value.length > 100) {
        logs.value.splice(0, logs.value.length - 100);
    }
};

export const clearLogs = () => {
    logs.value = [];
    currentStatus.value = '日志已清空。';
};