<template>
  <div class="message-board section">
    <h3>📢 消息墙</h3>
    <!-- ... template content ... -->
    <p v-if="!isRegistered" class="info-alert">请先注册用户名，才能发布和点赞消息。</p>
    
    <div v-if="isRegistered" class="post-message-area">
      <textarea 
        v-model="newMessageContent" 
        placeholder="在这里发布你的新消息 (最多 280 字符)"
        :disabled="posting"
        maxlength="280"
      ></textarea>
      <div class="post-actions">
        <span class="char-count">{{ newMessageContent.length }}/280</span>
        <button @click="handlePostMessage" :disabled="!canPost || posting">
          {{ posting ? '发布中...' : '发布消息' }}
        </button>
      </div>
    </div>
    
    <hr>
    
    <div class="message-filter">
        <button @click="fetchLatestMessages" :class="{active: filterType === 'latest'}">最新消息</button>
        <button @click="fetchUserMessages" :class="{active: filterType === 'mine'}" v-if="isRegistered">我的消息</button>
        <button @click="fetchHotMessages" :class="{active: filterType === 'hot'}">最热消息 (点赞排序)</button>
    </div>

    <div class="messages-list">
      <div v-for="msg in displayedMessages" :key="msg.id" class="message-card">
        <p class="message-content">{{ msg.content }}</p>
        <div class="message-footer">
          <span class="author">
            👤 {{ msg.authorName || '加载中...' }} (ID: {{ msg.id }})
          </span>
          <span class="timestamp">{{ formatTime(msg.timestamp) }}</span>
          <button 
            @click="handleLike(msg.id)" 
            :disabled="msg.isAuthor || msg.hasLiked || liking"
            :class="{liked: msg.hasLiked}"
            class="like-button"
          >
            👍 {{ msg.likes }}
          </button>
        </div>
      </div>
      <p v-if="!displayedMessages.length && !loading">暂无消息。</p>
      <p v-if="loading">消息加载中...</p>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue';
import { logMessage } from '../lib/log-system';
import { registry, walletAddress, getRegistryWithSigner, currentNetworkKey } from '../lib/wallet-and-rpc';

const props = defineProps({
    isRegistered: Boolean,
    loadAllData: Function,
    // 从主组件获取的用户名信息
    addressUsernameMap: Object,
    isOwner: Boolean,
});

const newMessageContent = ref('');
const posting = ref(false);
const liking = ref(false);
const loading = ref(false);

const displayedMessages = ref([]);
const filterType = ref('latest'); // 'latest', 'mine', 'hot'

const canPost = computed(() => props.isRegistered && newMessageContent.value.length > 0);

// ==================== 实用工具 ====================

const formatTime = (timestamp) => {
    if (!timestamp || timestamp === 0) return 'N/A';
    const date = new Date(Number(timestamp) * 1000); 
    return date.toLocaleString('zh-CN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
};

// 增强消息数据，加入前端需要的状态
const enhanceMessage = async (msg) => {
    const reg = registry(currentNetworkKey.value);
    const user = walletAddress.value;
    const authorName = props.addressUsernameMap[msg.author] || await reg.getUsernameByAddress(msg.author);
    
    // 检查点赞状态和是否是作者
    const isAuthor = user.toLowerCase() === msg.author.toLowerCase();
    let hasLiked = false;
    if (user && !isAuthor) {
        try {
            hasLiked = await reg.hasLiked(msg.id, user);
        } catch (e) {
             // 忽略查询失败，可能是合约不支持或网络问题
        }
    }
    return {
        ...msg,
        id: Number(msg.id),
        likes: Number(msg.likes),
        authorName: authorName || '未注册用户',
        content: msg.content,
        isAuthor: isAuthor,
        hasLiked: hasLiked,
        timestamp: Number(msg.timestamp)
    };
};

// ==================== 交互函数 ====================

const handlePostMessage = async () => {
    if (!canPost.value){
        logMessage('不能发布消息');
        return;
    } 
    posting.value = true;
    const reg = await getRegistryWithSigner(currentNetworkKey.value);
    
    if (!reg) {
        logMessage('❌ 发布失败：无法获取签名者。请确保您的钱包已连接。', 'error');
        posting.value = false;
        return;
    }
    try {
        logMessage(`正在发布消息: ${newMessageContent.value.substring(0, 20)}...`, 'info');
        
        const tx = await reg.postMessage(newMessageContent.value);
        await tx.wait();
        
        logMessage(`✅ 消息发布成功!`, 'success');
        newMessageContent.value = '';
        await props.loadAllData(); // 刷新空投数据等
        await fetchLatestMessages(); // 刷新列表
        
    } catch (error) {
        logMessage(`❌ 消息发布失败: ${error.reason || error.message}`, 'error');
    } finally {
        posting.value = false;
    }
};

const handleLike = async (messageId) => {
    if (!props.isRegistered) return logMessage('请先注册才能点赞', 'error');
    
    // 乐观更新（可选）
    const msgIndex = displayedMessages.value.findIndex(m => m.id === messageId);
    if (msgIndex !== -1 && !displayedMessages.value[msgIndex].hasLiked) {
         displayedMessages.value[msgIndex].likes++;
         displayedMessages.value[msgIndex].hasLiked = true;
    }

    liking.value = true;
    const reg = await getRegistryWithSigner(currentNetworkKey.value);
    try {
        const tx = await reg.likeMessage(messageId);
        await tx.wait();
        logMessage(`👍 成功点赞消息 #${messageId}`, 'success');
        // 重新获取或仅更新该消息
        await fetchLatestMessages(); 

    } catch (error) {
        // 悲观回滚（如果乐观更新了）
        if (msgIndex !== -1) {
            displayedMessages.value[msgIndex].likes--;
            displayedMessages.value[msgIndex].hasLiked = false;
        }
        logMessage(`❌ 点赞失败: ${error.reason || error.message}`, 'error');
    }
    liking.value = false;
};


// ==================== 数据获取函数 ====================

const fetchMessagesData = async (messageIds) => {
    if (!messageIds || messageIds.length === 0) return [];
    
    const reg = registry(currentNetworkKey.value);
    const messagePromises = messageIds.map(id => reg.getMessage(id));
    const rawMessages = await Promise.all(messagePromises);
    
    // 批量增强数据
    const enhancedPromises = rawMessages.map(msg => enhanceMessage(msg));
    return await Promise.all(enhancedPromises);
};

// 获取最新消息 (最多 20 条)
const fetchLatestMessages = async () => {
    if (!registry(currentNetworkKey.value)) return;
    filterType.value = 'latest';
    loading.value = true;
    displayedMessages.value = [];
    try {
        const latestMsgs = await registry(currentNetworkKey.value).getLatestMessages(20); // 假设获取最新的 20 条
        
        logMessage(`获取到 ${latestMsgs.length} 条最新消息`, 'info');
        // 由于合约返回的是 Message[] 结构，可以直接处理
        const enhanced = await Promise.all(latestMsgs.map(msg => enhanceMessage(msg)));
        
        // 按时间戳从新到旧排序
        displayedMessages.value = enhanced.sort((a, b) => b.timestamp - a.timestamp);
        
    } catch (e) {
        logMessage(`获取最新消息失败: ${e.message}`, 'error');
    }
    loading.value = false;
};

// 获取我的消息
const fetchUserMessages = async () => {
    if (!props.isRegistered || !walletAddress.value) return;
    filterType.value = 'mine';
    loading.value = true;
    displayedMessages.value = [];
    try {
        const userMsgIds = await registry(currentNetworkKey.value).getUserMessageIds(walletAddress.value);
        logMessage(`获取到 ${userMsgIds.length} 条我的消息`, 'info');
        const enhanced = await fetchMessagesData(userMsgIds);
        // 按时间戳从新到旧排序
        displayedMessages.value = enhanced.sort((a, b) => b.timestamp - a.timestamp);
    } catch (e) {
        logMessage(`获取我的消息失败: ${e.message}`, 'error');
    }
    loading.value = false;
};

// 获取最热消息 (需要额外的查询和前端排序)
const fetchHotMessages = async () => {
    if (!registry(currentNetworkKey.value)) return;
    filterType.value = 'hot';
    loading.value = true;
    displayedMessages.value = [];
    try {
        // 🚨 警告：这是Demo方法。实际生产环境应使用 Subgraph 或索引服务查询。
        const messageCount = await registry(currentNetworkKey.value).messageCount();
        const ids = Array.from({length: Number(messageCount)}, (_, i) => i);
        logMessage(`开始获取全部 ${ids.length} 条消息用于排序...`, 'info');
        
        const allMessages = await fetchMessagesData(ids);
        logMessage(`已获取全部消息，正在按点赞数排序...`, 'info');
        // 前端排序：按点赞数从高到低
        displayedMessages.value = allMessages.sort((a, b) => b.likes - a.likes);

    } catch (e) {
        logMessage(`获取最热消息失败: ${e.message}`, 'error');
    }
    loading.value = false;
};


// ==================== 生命周期 & 观察者 ====================

onMounted(fetchLatestMessages); // 初始化时加载最新消息

watch(walletAddress, (newAddr, oldAddr) => {
    if (newAddr && newAddr !== oldAddr) {
        fetchLatestMessages(); // 钱包切换或连接后刷新
    }
});
watch(() => props.isRegistered, (newVal) => {
    if (newVal && filterType.value === 'mine') {
        fetchUserMessages();
    }
});

</script>

<style scoped>
/* 样式 */
.message-board {
    margin-top: 20px;
    padding: 15px;
}
.info-alert {
    color: #E6A23C;
    background-color: #FEF0E6;
    padding: 8px;
    border-radius: 4px;
    margin-bottom: 15px;
}
.post-message-area textarea {
    width: 100%;
    min-height: 80px;
    padding: 10px;
    margin-bottom: 5px;
    border: 1px solid #ddd;
    border-radius: 4px;
    box-sizing: border-box;
    resize: vertical;
}
.post-actions {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 10px;
}
.char-count {
    font-size: 0.8em;
    color: #999;
}
.message-filter {
    display: flex;
    gap: 10px;
    margin-bottom: 15px;
}
.message-filter button {
    padding: 8px 15px;
    background-color: #f0f0f0;
    border: 1px solid #ddd;
    border-radius: 4px;
    cursor: pointer;
}
.message-filter button.active {
    background-color: #409EFF;
    color: white;
    border-color: #409EFF;
}

.messages-list {
    display: flex;
    flex-direction: column;
    gap: 15px;
}
.message-card {
    border: 1px solid #eee;
    padding: 12px;
    border-radius: 6px;
    background-color: #fafafa;
}
.message-content {
    margin-top: 0;
    font-size: 1em;
    word-wrap: break-word;
}
.message-footer {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 0.8em;
    color: #888;
    margin-top: 8px;
    padding-top: 5px;
    border-top: 1px dashed #eee;
}
.like-button {
    background: none;
    border: 1px solid #ccc;
    color: #666;
    padding: 4px 10px;
    border-radius: 12px;
    cursor: pointer;
    transition: all 0.2s;
}
.like-button:hover:not(:disabled) {
    background-color: #ffe0b2;
    border-color: #ff9800;
}
.like-button:disabled {
    cursor: not-allowed;
    opacity: 0.6;
}
.like-button.liked {
    background-color: #FF9800;
    color: white;
    border-color: #FF9800;
}
</style>