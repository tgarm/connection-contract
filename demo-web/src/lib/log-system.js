// src/lib/log-system.js

import { ref } from 'vue';

// 存储历史日志
export const logs = ref([]); 
// 存储当前状态（最新消息）
export const currentStatus = ref('未初始化...'); 

/**
 * 记录日志消息并更新当前状态。
 * @param {string} text - 日志内容。
 * @param {('info'|'error'|'success'|'tx'|'block')} [type='info'] - 日志类型。
 */
export const logMessage = (text, type = 'info') => {
    const now = new Date();
    const time = now.toTimeString().split(' ')[0];
    
    logs.value.push({ time, text, type });
    currentStatus.value = text;
};

/**
 * 清空日志。
 */
export const clearLogs = () => {
    logs.value = [];
    currentStatus.value = '日志已清空。';
};