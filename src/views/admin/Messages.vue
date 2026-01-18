<script setup>
import { ref, reactive, onMounted, computed } from 'vue'
import { api } from '@/utils/api'
import { message } from '@/utils/message'

// --- 状态定义 ---
const loading = ref(false)
const tableData = ref([])
const queryParams = reactive({
    page: 1,
    limit: 10,
    keyword: '',
    status: '' // unread, replied
})
const pagination = reactive({
    total: 0,
    totalPages: 0
})
// --- 回复弹窗状态 ---
const showReplyModal = ref(false)
const replyLoading = ref(false)
const currentMsg = ref({})
const replyForm = reactive({
    subject: '',
    content: ''
})

// --- 核心逻辑: 获取列表 ---
const fetchData = async () => {
    loading.value = true
    try {
        const res = await api.get('/admin/messages', { params: queryParams })
        if (res.data.success) {
            tableData.value = res.data.data.list
            const p = res.data.data.pagination
            pagination.total = p.total
            pagination.totalPages = p.totalPages
        }
    } catch (err) {
        message.error('获取消息失败')
    } finally {
        loading.value = false
    }
}

// --- 翻页与筛选 ---
const handleSearch = () => { queryParams.page = 1; fetchData() }
const changePage = (p) => {
    if (p < 1 || p > pagination.totalPages) return
    queryParams.page = p
    fetchData()
}

// --- 操作: 标为已读 ---
const handleMarkRead = async (item) => {
    if (item.is_read) return
    try {
        await api.patch(`/admin/messages/${item.id}/read`, { is_read: 1 })
        item.is_read = 1 // 本地更新
    } catch (e) { }
}

// --- 操作: 删除 ---
const handleBatchDelete = async () => {
    const count = selectedIds.value.length
    if (!confirm(`确定要删除选中的 ${count} 条留言吗？此操作不可恢复！`)) return

    try {
        // 调用即将编写的批量接口
        const res = await api.post('/admin/messages/batch-delete', { ids: selectedIds.value })
        if (res.data.success) {
            message.success(`成功删除 ${count} 条留言`)
            selectedIds.value = [] // 清空选中
            fetchData() // 刷新列表
        }
    } catch (e) {
        message.error('批量删除失败')
    }
}

// --- 核心操作: 打开回复弹窗 ---
const openReplyModal = (item) => {
    currentMsg.value = item
    // 自动把未读标记为已读
    handleMarkRead(item)

    // 初始化表单
    replyForm.subject = `Re: ${item.subject || '关于您的留言'}`
    replyForm.content = '' // 清空内容

    showReplyModal.value = true
}

// --- 核心操作: 发送回复 ---
const handleSendReply = async () => {
    if (!replyForm.content.trim()) return message.warning('请填写回信内容')

    replyLoading.value = true
    try {
        // 🔥 判断是网站表单还是外部邮件
        const msgId = currentMsg.value.id
        const isInboxEmail = msgId.startsWith('email_')

        let res;
        if (isInboxEmail) {
            // 外部邮件：直接发送邮件回复
            const realId = msgId.replace('email_', '')
            res = await api.post('/admin/emails/reply', {
                to: currentMsg.value.email,
                subject: replyForm.subject,
                content: replyForm.content,
                emailLogId: realId  // 关联原邮件记录
            })
        } else {
            // 网站表单：使用原有接口
            const realId = msgId.replace('msg_', '')
            res = await api.post(`/admin/messages/${realId}/reply`, replyForm)
        }

        if (res.data.success) {
            message.success('回信已寄出 📨')
            showReplyModal.value = false
            fetchData()
        } else {
            message.error(res.data.message)
        }
    } catch (e) {
        console.error(e)
        message.error('发送失败，请检查邮件服务')
    } finally {
        replyLoading.value = false
    }
}

// 记录选中的 ID 数组
const selectedIds = ref([])

// 全选/取消全选逻辑
const isAllSelected = computed(() => {
    return tableData.value.length > 0 && selectedIds.value.length === tableData.value.length
})

const toggleSelectAll = () => {
    if (isAllSelected.value) {
        selectedIds.value = []
    } else {
        selectedIds.value = tableData.value.map(item => item.id)
    }
}

// 监听数据变化，当重新获取数据时清空选中
const onDataFetched = () => {
    selectedIds.value = []
}

// 工具函数
const formatDate = (str) => new Date(str).toLocaleString('zh-CN', { hour12: false })
const truncate = (str, len = 20) => str && str.length > len ? str.substring(0, len) + '...' : str

onMounted(() => fetchData())
</script>

<template>
    <div class="messages-page">
        <div class="page-header animate__animated animate__fadeInDown">
            <div class="header-left">
                <h2>📬 留言信箱</h2>
                <span class="sub-text">倾听来自世界的声音</span>
            </div>
            <div class="header-right">
                <div class="search-group">
                    <input v-model="queryParams.keyword" type="text" placeholder="搜索姓名/内容..." class="glass-input"
                        @keyup.enter="handleSearch">
                </div>
                <div class="select-group">
                    <select v-model="queryParams.status" class="glass-select" @change="handleSearch">
                        <option value="">全部状态</option>
                        <option value="unread">🔴 未读消息</option>
                        <option value="replied">🟢 已回复</option>
                    </select>
                </div>
                <button class="btn-primary" @click="handleSearch">🔍 查询</button>
                <button v-if="selectedIds.length > 0" class="btn-danger animate__animated animate__fadeInRight"
                    style="margin-left: 10px;" @click="handleBatchDelete">
                    🗑 批量删除 ({{ selectedIds.length }})
                </button>
            </div>
        </div>

        <div class="table-container glass-panel animate__animated animate__fadeInUp">
            <table class="data-table">
                <thead>
                    <tr>
                        <th width="50" class="text-center">
                            <input type="checkbox" :checked="isAllSelected" @change="toggleSelectAll"
                                class="glass-checkbox">
                        </th>
                        <th width="70" class="text-center">状态</th>
                        <th width="180">📅 时间</th>
                        <th width="220">👤 访客</th>
                        <th>💬 留言摘要</th>
                        <th width="110" class="text-center">回复状态</th>
                        <th width="120" class="text-center">操作</th>
                    </tr>
                </thead>
                <tbody>
                    <tr v-if="loading">
                        <td colspan="6" class="state-cell">
                            <div class="loading-spinner"></div> 加载中...
                        </td>
                    </tr>
                    <tr v-else-if="tableData.length === 0">
                        <td colspan="6" class="state-cell">暂无留言 📭</td>
                    </tr>

                    <tr v-else v-for="item in tableData" :key="item.id" class="data-row"
                        :class="{ 'unread-row': !item.is_read }">
                        <td class="text-center">
                            <input type="checkbox" :value="item.id" v-model="selectedIds" class="glass-checkbox">
                        </td>

                        <td class="text-center">
                            <span class="dot" :class="item.is_read ? 'read' : 'unread'"
                                :title="item.is_read ? '已读' : '未读'"></span>
                        </td>

                        <td class="date-cell">{{ formatDate(item.created_at) }}</td>

                        <td class="user-cell">
                            <div class="user-info">
                                <!-- 🔥 如果是外部邮件，显示邮箱图标 -->
                                <span class="name">
                                    <span v-if="item.source === 'INBOX'" class="source-badge inbox">📥</span>
                                    <span v-else class="source-badge form">📝</span>
                                    {{ item.name || item.email }}
                                </span>
                                <span class="email">{{ item.email }}</span>
                            </div>
                        </td>

                        <td class="content-cell" :title="item.content">
                            <span class="subject-tag">{{ truncate(item.subject, 10) }}</span>
                            {{ truncate(item.content, 40) }}
                        </td>

                        <td class="text-center">
                            <span class="status-badge" :class="item.is_replied ? 'replied' : 'pending'">
                                {{ item.is_replied ? '✅ 已回复' : '⏳ 待回复' }}
                            </span>
                        </td>

                        <td class="text-center">
                            <div class="action-btns">
                                <button class="btn-icon reply" @click="openReplyModal(item)" title="写回信">✍️</button>
                                <button class="btn-icon delete" @click="handleDelete(item.id)" title="删除">🗑</button>
                            </div>
                        </td>
                    </tr>
                </tbody>
            </table>

            <div class="pagination-footer" v-if="pagination.total > 0">
                <div class="page-info">共 <b>{{ pagination.total }}</b> 条留言</div>
                <div class="page-btns">
                    <button :disabled="queryParams.page === 1" @click="changePage(queryParams.page - 1)">上一页</button>
                    <span class="curr-page">{{ queryParams.page }} / {{ pagination.totalPages }}</span>
                    <button :disabled="queryParams.page >= pagination.totalPages"
                        @click="changePage(queryParams.page + 1)">下一页</button>
                </div>
            </div>
        </div>

        <div v-if="showReplyModal" class="column-modal-overlay" @click.self="showReplyModal = false">
            <div class="art-modal animate__animated animate__zoomIn">
                <div class="art-modal-header">
                    <span class="decoration-line"></span>
                    <h3>见字如面 · 回信</h3>
                    <span class="decoration-line"></span>
                    <button class="art-close-btn" @click="showReplyModal = false">✕</button>
                </div>

                <div class="art-modal-body">
                    <div class="original-msg-box">
                        <p class="quote-label">来自 <strong>{{ currentMsg.name }}</strong> 的留言：</p>
                        <p class="quote-text">"{{ truncate(currentMsg.content, 100) }}"</p>
                    </div>

                    <div class="input-group">
                        <input v-model="replyForm.subject" type="text" class="art-input" placeholder=" " readonly>
                        <label>邮件标题</label>
                        <span class="input-underline"></span>
                    </div>

                    <div class="input-group">
                        <textarea v-model="replyForm.content" class="art-input textarea" placeholder=" "
                            rows="6"></textarea>
                        <label>回信内容 (支持换行)...</label>
                        <span class="input-underline"></span>
                    </div>

                    <div class="art-form-ops">
                        <button class="art-btn-text" @click="showReplyModal = false">取消</button>
                        <button class="art-btn-primary" @click="handleSendReply" :disabled="replyLoading">
                            {{ replyLoading ? '正在投递...' : '发送回信' }}
                        </button>
                    </div>
                </div>
            </div>
        </div>

    </div>
</template>

<style scoped>
/* ==================== 1. 深色磨砂列表样式 (复用 EmailLogs) ==================== */
.messages-page {
    max-width: 1200px;
    margin: 0 auto;
    color: #fff;
    padding-bottom: 40px;
}

.page-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 25px;
    flex-wrap: wrap;
    gap: 20px;
}

.header-left h2 {
    margin: 0;
    font-size: 1.6rem;
    color: #fff;
    font-weight: 700;
}

.sub-text {
    color: #94a3b8;
    font-size: 0.9rem;
    margin-top: 5px;
    display: block;
}

.header-right {
    display: flex;
    gap: 12px;
    align-items: center;
}

/* 输入框通用 */
.glass-input,
.glass-select {
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 8px;
    padding: 10px 16px;
    color: #fff;
    outline: none;
    transition: 0.3s;
    height: 40px;
}

.glass-input:focus,
.glass-select:focus {
    border-color: #8b5cf6;
    background: rgba(255, 255, 255, 0.1);
}

.glass-select option {
    background: #1e293b;
}

/* 按钮通用 */
.btn-primary {
    background: linear-gradient(135deg, #8b5cf6, #6366f1);
    border: none;
    padding: 0 24px;
    height: 40px;
    border-radius: 8px;
    color: #fff;
    font-weight: 600;
    cursor: pointer;
    transition: transform 0.2s;
}

.btn-primary:hover {
    transform: translateY(-2px);
}

/* 表格容器 */
.glass-panel {
    background: rgba(30, 41, 59, 0.4);
    border-radius: 16px;
    border: 1px solid rgba(255, 255, 255, 0.05);
    backdrop-filter: blur(10px);
    overflow: hidden;
}

.data-table {
    table-layout: fixed;
    /* 锁定布局，防止自动挤压 */
    width: 100%;
    border-collapse: collapse;
}

.data-table th {
    padding: 25px 15px;
    color: #94a3b8;
    background: rgba(0, 0, 0, 0.2);
    font-weight: 600;
    text-align: center;
}

.data-table td {
    padding: 25px 15px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.05);
    vertical-align: middle;
    color: #e2e8f0;
}

.data-row:hover {
    background: rgba(255, 255, 255, 0.03);
}

.unread-row {
    background: rgba(139, 92, 246, 0.05);
}

/* 未读高亮 */

/* 列表内组件 */
.dot {
    display: inline-block;
    width: 8px;
    height: 8px;
    border-radius: 50%;
}

.dot.unread {
    background: #ef4444;
    /* 红色：未读 */
    box-shadow: 0 0 10px rgba(239, 68, 68, 0.6);
}

.dot.read {
    background: #10b981;
    /* 绿色：已读 */
    box-shadow: 0 0 10px rgba(16, 185, 129, 0.4);
}

/* 来源标签 */
.source-badge {
    display: inline-block;
    font-size: 0.8rem;
    margin-right: 4px;
    opacity: 0.7;
}

.source-badge.inbox {
    color: #60a5fa;
}

.source-badge.form {
    color: #34d399;
}

/* 访客单元格优化 */
.user-cell {
    padding-right: 20px !important; /* 强制留出右侧间距，防止撞车 */
}

.user-info {
    display: flex;
    flex-direction: column;
    gap: 4px;
    /* 确保容器不会溢出 */
    overflow: hidden; 
}

.user-info .name {
    font-weight: 600;
    font-size: 0.95rem;
}

.user-info .email {
    font-size: 0.8rem;
    color: #94a3b8;
    opacity: 0.7;
    /* 邮箱过长时自动打点，不要往右挤 */
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

/* 留言摘要单元格优化 */
.content-cell {
    /* 确保摘要内容与访客列之间有明显的起始边界 */
    padding-left: 10px !important; 
}

.subject-tag {
    /* 之前的标签可能太占地方，稍微收敛一下 */
    display: inline-block;
    padding: 2px 8px;
    margin-right: 8px;
    background: rgba(139, 92, 246, 0.15);
    border-radius: 4px;
    font-size: 0.75rem;
    color: #a78bfa;
    vertical-align: middle;
}

.status-badge {
    padding: 4px 10px;
    border-radius: 20px;
    font-size: 0.75rem;
    font-weight: 600;
}

.status-badge.replied {
    background: rgba(16, 185, 129, 0.15);
    color: #34d399;
}

.status-badge.pending {
    background: rgba(245, 158, 11, 0.15);
    color: #fbbf24;
}

.action-btns {
    display: flex;
    justify-content: center;
    gap: 8px;
}

.btn-icon {
    width: 32px;
    height: 32px;
    border-radius: 6px;
    border: none;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    transition: 0.2s;
}

.btn-icon.reply {
    background: rgba(59, 130, 246, 0.1);
    color: #60a5fa;
}

.btn-icon.reply:hover {
    background: rgba(59, 130, 246, 0.25);
    transform: scale(1.05);
}

.btn-icon.delete {
    background: rgba(239, 68, 68, 0.1);
    color: #fb7185;
}

.btn-icon.delete:hover {
    background: rgba(239, 68, 68, 0.25);
    transform: scale(1.05);
}

/* 分页 */
.pagination-footer {
    display: flex;
    justify-content: space-between;
    padding: 20px 24px;
    color: #94a3b8;
    background: rgba(0, 0, 0, 0.1);
}

.page-btns button {
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.1);
    color: #fff;
    padding: 6px 14px;
    border-radius: 6px;
    cursor: pointer;
}

.page-btns button:hover:not(:disabled) {
    background: rgba(255, 255, 255, 0.1);
}

.page-btns button:disabled {
    opacity: 0.4;
    cursor: not-allowed;
}

.curr-page {
    margin: 0 10px;
    font-family: monospace;
}

.text-center {
    text-align: center;
}

/* ==================== 🏛️ 艺术弹窗 (复用 Login.vue 风格) ==================== */
.column-modal-overlay {
    position: fixed;
    top: 0;
    left: 0;
    width: 100vw;
    height: 100vh;
    background: rgba(0, 0, 0, 0.6);
    backdrop-filter: blur(6px);
    z-index: 3000;
    display: flex;
    justify-content: center;
    align-items: center;
}

.art-modal {
    width: 90%;
    max-width: 600px;
    /* 稍微宽一点方便写信 */
    background-color: #fdfbf7;
    border-radius: 12px;
    background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)' opacity='0.05'/%3E%3C/svg%3E");
    box-shadow: 0 25px 50px rgba(0, 0, 0, 0.25);
    overflow: hidden;
    display: flex;
    flex-direction: column;
}

.art-modal-header {
    padding: 25px 20px 10px;
    display: flex;
    align-items: center;
    justify-content: center;
    position: relative;
}

.art-modal-header h3 {
    margin: 0 15px;
    font-family: "Georgia", serif;
    font-size: 1.3rem;
    color: #5c4033;
    font-weight: 700;
}

.decoration-line {
    height: 1px;
    width: 30px;
    background: linear-gradient(90deg, transparent, #d4c5b0, transparent);
}

.art-close-btn {
    position: absolute;
    right: 15px;
    top: 15px;
    background: none;
    border: none;
    font-size: 1.2rem;
    color: #bca38a;
    cursor: pointer;
}

.art-close-btn:hover {
    color: #8b5a2b;
}

.art-modal-body {
    padding: 10px 40px 40px;
}

/* 原始内容引用框 */
.original-msg-box {
    background: rgba(139, 128, 107, 0.08);
    padding: 15px;
    border-radius: 6px;
    border-left: 3px solid #bca38a;
    margin-bottom: 25px;
}

.quote-label {
    font-size: 0.85rem;
    color: #8b5a2b;
    margin-bottom: 5px;
}

.quote-text {
    font-style: italic;
    color: #5c4033;
    font-size: 0.9rem;
    line-height: 1.5;
}

/* 输入框 */
.input-group {
    position: relative;
    margin-bottom: 30px;
    padding-top: 10px;
}

.art-input {
    width: 100%;
    border: none;
    background: transparent;
    padding: 8px 10px;
    font-size: 1rem;
    color: #2c1e0f;
    font-family: inherit;
    outline: none;
    border-bottom: 1px solid #d4c5b0;
    transition: border-color 0.3s;
    box-sizing: border-box;
}

.art-input.textarea {
    resize: none;
    line-height: 1.6;
}

.input-group label {
    position: absolute;
    top: 18px;
    left: 10px;
    color: #999;
    font-size: 0.95rem;
    transition: all 0.3s ease;
    pointer-events: none;
}

.art-input:focus~label,
.art-input:not(:placeholder-shown)~label {
    top: -8px;
    font-size: 0.75rem;
    color: #8b5a2b;
    left: 10px;
}

.input-underline {
    position: absolute;
    bottom: 0;
    left: 0;
    width: 0;
    height: 2px;
    background: #8b5a2b;
    transition: width 0.3s ease;
}

.art-input:focus~.input-underline {
    width: 100%;
}

/* 操作按钮 */
.art-form-ops {
    display: flex;
    justify-content: flex-end;
    gap: 20px;
    margin-top: 10px;
}

.art-btn-text {
    background: none;
    border: none;
    color: #888;
    cursor: pointer;
}

.art-btn-text:hover {
    color: #555;
}

.art-btn-primary {
    background: #2c1e0f;
    color: #f7f1e3;
    border: none;
    padding: 10px 24px;
    border-radius: 4px;
    font-family: serif;
    letter-spacing: 1px;
    cursor: pointer;
    transition: all 0.3s;
}

.art-btn-primary:hover:not(:disabled) {
    background: #4a3b2a;
    transform: translateY(-1px);
}

.art-btn-primary:disabled {
    background: #8d7e70;
    cursor: not-allowed;
}

/* 📱 移动端适配 */
@media (max-width: 600px) {
    .art-modal {
        width: 95%;
        max-height: 85vh;
        overflow-y: auto;
    }

    .art-modal-body {
        padding: 10px 20px 30px;
    }

    .page-header {
        flex-direction: column;
        align-items: flex-start;
    }

    .header-right {
        width: 100%;
        flex-direction: column;
    }

    .search-group,
    .select-group,
    .btn-primary {
        width: 100%;
    }
}

/* 批量删除按钮美化 */
.btn-danger {
    background: linear-gradient(135deg, #f87171 0%, #ef4444 100%);
    color: white;
    border: none;
    padding: 0 16px;
    height: 40px;
    border-radius: 8px;
    font-weight: 600;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 6px;
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    box-shadow: 0 4px 12px rgba(239, 68, 68, 0.2);
    margin-left: 10px;
    white-space: nowrap;
}

.btn-danger:hover {
    transform: translateY(-2px);
    box-shadow: 0 6px 20px rgba(239, 68, 68, 0.4);
    filter: brightness(1.1);
}

/* 按钮点击瞬间的反馈 */
.btn-danger:active {
    transform: scale(0.95);
}

/* 优化复选框样式 */
.glass-checkbox {
    width: 18px;
    height: 18px;
    cursor: pointer;
    accent-color: #8b5cf6;
    /* 紫色调，呼应整体风格 */
    transition: transform 0.2s;
}

.glass-checkbox:hover {
    transform: scale(1.1);
}
</style>