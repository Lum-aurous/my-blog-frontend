<script setup>
import { ref, reactive, onMounted, computed } from 'vue'
import { getEmailLogs, deleteEmailLog, clearAllLogs } from '@/api/email'
import { message } from '@/utils/message'
import { api } from '@/utils/api' // 🔥 导入 api 用于调用批量接口

// --- 状态定义 ---
const loading = ref(false)
const tableData = ref([])
const queryParams = reactive({
    page: 1,
    limit: 10,
    keyword: '',
    status: '',
    type: '' // 🔥🔥🔥 新增：类型筛选参数
})
const pagination = reactive({
    total: 0,
    totalPages: 0
})
// 🔥 预览弹窗状态
const showPreview = ref(false)
const currentEmail = ref({})

// --- 核心逻辑 ---
const fetchData = async () => {
    loading.value = true
    selectedIds.value = []
    try {
        const res = await getEmailLogs(queryParams)
        let list = []
        let totalCount = 0

        if (res.data && res.data.data) {
            list = res.data.data.list
            totalCount = res.data.data.pagination?.total || 0
        } else if (res.data && res.data.list) {
            list = res.data.list
            totalCount = res.data.pagination?.total || 0
        } else if (res.list) {
            list = res.list
            totalCount = res.total || 0
        }

        tableData.value = Array.isArray(list) ? list : []

        // 🔥 调试：打印第一条数据看看结构
        if (tableData.value.length > 0) {
            console.log('📧 第一条邮件数据:', tableData.value[0])
        }
        pagination.total = totalCount
        pagination.totalPages = Math.ceil(totalCount / queryParams.limit)
    } catch (error) {
        console.error(error)
        message.error('数据加载失败')
    } finally {
        loading.value = false
    }
}

const handleSearch = () => {
    queryParams.page = 1
    fetchData()
}

const changePage = (newPage) => {
    if (newPage < 1 || newPage > pagination.totalPages) return
    queryParams.page = newPage
    fetchData()
}

const handleDelete = async (id) => {
    if (!confirm('⚠️ 确定要删除这条发送记录吗？')) return
    try {
        const res = await deleteEmailLog(id)
        if (res.data && res.data.success) {
            message.success('删除成功')
            fetchData()
        }
    } catch (e) {
        message.error('删除失败')
    }
}

const handleClearAll = async () => {
    const userInput = prompt('⚠️ 警告：这将清空所有历史邮件记录且无法恢复！\n请输入 "confirm" 确认操作：')
    if (userInput !== 'confirm') return
    try {
        const res = await clearAllLogs()
        if (res.data && res.data.success) {
            message.success('已清空所有日志')
            fetchData()
        }
    } catch (e) {
        message.error('清空失败')
    }
}

const formatType = (type) => {
    const map = {
        'INBOX': '📥 收件箱',
        'REPLY': '💌 回复邮件',      // 🔥 新增
        'AUTH': '🔵 安全验证',
        'CONTACT': '📤 用户留言',
        'NOTIFICATION': '🟣 系统通知',
        'GENERAL': '⚪ 普通邮件'
    }
    return map[type] || '未知类型'
}

// 🔥 打开预览弹窗
const openPreview = (email) => {
    currentEmail.value = email
    showPreview.value = true
}

const formatDate = (str) => {
    if (!str) return '-'
    return new Date(str).toLocaleString('zh-CN', { hour12: false })
}

const truncateText = (text, length = 30) => {
    if (!text) return ''
    return text.length > length ? text.substring(0, length) + '...' : text
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

// 批量删除执行函数
const handleBatchDelete = async () => {
    const count = selectedIds.value.length
    if (!confirm(`⚠️ 确定要永久删除选中的 ${count} 条邮件日志吗？`)) return

    try {
        const res = await api.post('/admin/emails/batch-delete', { ids: selectedIds.value })
        if (res.data && res.data.success) {
            message.success(`成功删除 ${count} 条记录`)
            selectedIds.value = [] // 清空选中
            fetchData() // 刷新列表
        }
    } catch (e) {
        message.error('批量删除失败')
    }
}

onMounted(() => fetchData())
</script>

<template>
    <div class="email-logs-page">
        <div class="page-header animate__animated animate__fadeInDown">
            <div class="header-left">
                <h2>📧 邮件投递监控</h2>
                <span class="sub-text">实时追踪系统邮件发送状态与日志详情</span>
            </div>
            <div class="header-right">
                <div class="search-group">
                    <input v-model="queryParams.keyword" type="text" placeholder="搜索收件人或标题..." class="glass-input"
                        @keyup.enter="handleSearch">
                </div>

                <div class="select-group">
                    <select v-model="queryParams.type" class="glass-select" @change="handleSearch">
                        <option value="">全部类型</option>
                        <option value="INBOX">📥 收件箱</option>
                        <option value="REPLY">💌 回复邮件</option> <!-- 🔥 新增 -->
                        <option value="CONTACT">📤 用户留言</option>
                        <option value="AUTH">🔵 安全验证</option>
                        <option value="NOTIFICATION">🟣 系统通知</option>
                        <option value="GENERAL">⚪ 普通邮件</option>
                    </select>
                </div>

                <div class="select-group">
                    <select v-model="queryParams.status" class="glass-select" @change="handleSearch">
                        <option value="">全部状态</option>
                        <option value="SUCCESS">✅ 发送成功</option>
                        <option value="FAILURE">❌ 发送失败</option>
                    </select>
                </div>
                <button class="btn-primary" @click="handleSearch">🔍 查询</button>

                <button v-if="selectedIds.length > 0" class="btn-danger animate__animated animate__fadeInRight"
                    @click="handleBatchDelete">
                    🗑 批量删除 ({{ selectedIds.length }})
                </button>

                <button class="btn-danger-outline" @click="handleClearAll">🗑️ 清空所有</button>
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
                        <th width="180">📅 发送时间</th>

                        <th width="120" class="text-center">🏷️ 类型</th>

                        <th width="180">👤 收件人</th>

                        <th width="140">🌐 触发 IP</th>

                        <th style="min-width: 200px;">📑 邮件标题</th>

                        <th width="110" class="text-center">状态</th>
                        <th width="200">📋 结果详情</th>
                        <th width="100" class="text-center">操作</th>
                    </tr>
                </thead>
                <tbody>
                    <tr v-if="loading">
                        <td colspan="9" class="state-cell">
                            <div class="loading-spinner"></div> 数据加载中...
                        </td>
                    </tr>
                    <tr v-else-if="tableData.length === 0">
                        <td colspan="9" class="state-cell">暂无发送记录 📭</td>
                    </tr>

                    <tr v-else v-for="item in tableData" :key="item.id" class="data-row">
                        <td class="text-center">
                            <input type="checkbox" :value="item.id" v-model="selectedIds" class="glass-checkbox">
                        </td>
                        <td class="date-cell">{{ formatDate(item.created_at) }}</td>
                        <td class="text-center">
                            <span class="type-badge" :class="item.type || 'GENERAL'">
                                {{ formatType(item.type) }}
                            </span>
                        </td>
                        <td class="user-cell">{{ item.to_email }}</td>
                        <td class="ip-cell">
                            <div class="ip-display-wrapper">
                                <span class="region-text">
                                    {{ item.type === 'INBOX' ? '外部收件' : (item.region || '未知地域') }}
                                </span>
                                <span class="ip-address-mini">
                                    {{ item.type === 'INBOX' ? '(IMAP)' : (item.request_ip || '0.0.0.0') }}
                                </span>
                            </div>
                        </td>
                        <td class="title-cell">
                            <div class="truncate-wrapper" :title="item.subject">
                                {{ item.subject }}
                            </div>
                        </td>
                        <td class="text-center">
                            <span class="status-badge" :class="item.status">
                                {{
                                    item.status === 'SUCCESS' ? '✅ 发送成功' :
                                        item.status === 'RECEIVED' ? '📥 已接收' :
                                            item.status === 'PENDING' ? '⏳ 发送中' :
                                                '❌ 发送失败'
                                }}
                            </span>
                        </td>
                        <td class="detail-cell">
                            <div class="truncate-wrapper" style="max-width: 250px;">
                                <!-- 收件：显示发件人 -->
                                <span v-if="item.type === 'INBOX' && item.from_email" class="inbox-from"
                                    :title="`来自: ${item.from_email}`">
                                    📨 {{ item.from_email }}
                                </span>
                                <!-- 收件但没有发件人信息 -->
                                <span v-else-if="item.type === 'INBOX'" class="empty-msg">
                                    (无发件人信息)
                                </span>
                                <!-- 发送失败：显示错误 -->
                                <span v-else-if="item.status === 'FAILURE'" class="error-msg"
                                    :title="item.error_message">
                                    ❌ {{ item.error_message || '发送失败' }}
                                </span>
                                <!-- 发送成功：显示 message_id -->
                                <span v-else-if="item.message_id" class="success-msg">
                                    ID: {{ item.message_id }}
                                </span>
                                <!-- 其他情况 -->
                                <span v-else class="empty-msg">-</span>
                            </div>
                        </td>
                        <td class="text-center">
                            <div class="action-btns">
                                <button class="btn-icon view" @click="openPreview(item)" title="查看内容">👁️</button>
                                <button class="btn-icon delete" @click="handleDelete(item.id)" title="删除">🗑</button>
                            </div>
                        </td>
                    </tr>
                </tbody>
            </table>

            <div class="pagination-footer" v-if="pagination.total > 0">
                <div class="page-info">共 <b>{{ pagination.total }}</b> 条记录</div>
                <div class="page-btns">
                    <button :disabled="queryParams.page === 1" @click="changePage(queryParams.page - 1)">上一页</button>
                    <span class="curr-page">{{ queryParams.page }} / {{ pagination.totalPages }}</span>
                    <button :disabled="queryParams.page >= pagination.totalPages"
                        @click="changePage(queryParams.page + 1)">下一页</button>
                </div>
            </div>
        </div>

        <div v-if="showPreview" class="modal-overlay animate__animated animate__fadeIn"
            @click.self="showPreview = false">
            <div class="preview-modal animate__animated animate__zoomIn">
                <div class="preview-header">
                    <div class="ph-info">
                        <h3>{{ currentEmail.subject }}</h3>
                        <p>收件人: <span class="highlight">{{ currentEmail.to_email }}</span></p>
                    </div>
                    <button class="close-btn" @click="showPreview = false">×</button>
                </div>

                <div class="preview-body custom-scrollbar">
                    <div v-if="currentEmail.html_content" v-html="currentEmail.html_content"
                        class="email-content-render"></div>
                    <div v-else class="empty-content">
                        该邮件没有记录内容，或者内容为空。<br>
                        <span style="font-size: 12px; opacity: 0.6">(功能上线前的老数据没有内容是正常的)</span>
                    </div>
                </div>

                <div class="preview-footer">
                    <span class="time-stamp">发送于: {{ formatDate(currentEmail.created_at) }}</span>
                    <button class="btn-primary" @click="showPreview = false">关闭预览</button>
                </div>
            </div>
        </div>

    </div>
</template>

<style scoped>
/* 复用之前的样式 */
.email-logs-page {
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

.glass-input,
.glass-select {
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 8px;
    padding: 10px 16px;
    color: #fff;
    outline: none;
    font-size: 0.9rem;
    transition: 0.3s;
    height: 40px;
}

.glass-input:focus,
.glass-select:focus {
    border-color: #8b5cf6;
    background: rgba(255, 255, 255, 0.1);
    box-shadow: 0 0 0 2px rgba(139, 92, 246, 0.2);
}

.glass-select {
    cursor: pointer;
    padding-right: 30px;
}

.glass-select option {
    background: #1e293b;
    color: #fff;
}

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
    box-shadow: 0 4px 15px rgba(139, 92, 246, 0.3);
}

.btn-primary:hover {
    transform: translateY(-2px);
    box-shadow: 0 6px 20px rgba(139, 92, 246, 0.5);
}

.btn-danger-outline {
    background: transparent;
    border: 1px solid rgba(239, 68, 68, 0.5);
    color: #f87171;
    padding: 0 16px;
    height: 40px;
    border-radius: 8px;
    cursor: pointer;
    transition: 0.2s;
}

.btn-danger-outline:hover {
    background: rgba(239, 68, 68, 0.1);
    color: #fff;
    border-color: #ef4444;
}

.glass-panel {
    background: rgba(30, 41, 59, 0.4);
    border-radius: 16px;
    border: 1px solid rgba(255, 255, 255, 0.05);
    backdrop-filter: blur(10px);
    overflow: hidden;
    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
}

.data-table {
    width: 100%;
    border-collapse: collapse;
    table-layout: fixed;
}

.truncate-wrapper {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    display: block;
    max-width: 100%;
}

.data-table th {
    text-align: center;
    padding: 25px 10px;
    color: #94a3b8;
    background: rgba(0, 0, 0, 0.2);
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    font-weight: 600;
    font-size: 0.9rem;
}

.data-table td {
    padding: 25px 9px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.05);
    vertical-align: middle;
    text-align: center;
}

.data-row:hover {
    background: rgba(255, 255, 255, 0.03);
}

.date-cell {
    color: #94a3b8;
    font-family: 'JetBrains Mono', monospace;
    /* 推荐用等宽字体，数字对齐更好看 */
    font-size: 0.85rem;
    white-space: nowrap;
    /* 🚫 绝对不允许换行 */
    letter-spacing: 0.5px;
}

.user-cell {
    color: #e2e8f0;
    font-weight: 500;
}

/* 🔥 新增 IP 样式 */
.ip-cell {
    font-family: monospace;
    color: #94a3b8;
    font-size: 0.85rem;
}

/* IP 属地组合样式 */
.ip-display-wrapper {
    display: flex;
    flex-direction: column;
    gap: 2px;
}

.region-text {
    color: #e2e8f0;
    font-size: 0.9rem;
    font-weight: 500;
}

.ip-address-mini {
    color: #64748b;
    font-size: 0.75rem;
    font-family: 'JetBrains Mono', monospace;
}

.ip-tag {
    background: rgba(255, 255, 255, 0.05);
    padding: 2px 6px;
    border-radius: 4px;
    border: 1px solid rgba(255, 255, 255, 0.1);
}

.title-cell {
    overflow: hidden;
    color: #cbd5e1;
}

.status-badge {
    padding: 4px 10px;
    border-radius: 20px;
    font-size: 0.75rem;
    font-weight: 600;
    display: inline-block;
}

.status-badge.SUCCESS {
    background: rgba(16, 185, 129, 0.15);
    color: #34d399;
    border: 1px solid rgba(16, 185, 129, 0.2);
}

.status-badge.FAILURE {
    background: rgba(239, 68, 68, 0.15);
    color: #fb7185;
    border: 1px solid rgba(239, 68, 68, 0.2);
}

.error-msg {
    color: #f87171;
    font-size: 0.85rem;
}

.success-msg {
    color: #10b981;
    font-family: monospace;
    font-size: 0.85rem;
    opacity: 0.8;
}

.inbox-from {
    color: #60a5fa;
    font-size: 0.85rem;
    font-family: monospace;
}

.empty-msg {
    color: #64748b;
    font-size: 0.85rem;
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
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    transition: 0.2s;
    border: none;
}

.btn-icon.delete {
    background: rgba(239, 68, 68, 0.1);
    border: 1px solid rgba(239, 68, 68, 0.2);
    color: #fb7185;
}

.btn-icon.delete:hover {
    background: rgba(239, 68, 68, 0.25);
    transform: scale(1.05);
}

.btn-icon.view {
    background: rgba(59, 130, 246, 0.1);
    border: 1px solid rgba(59, 130, 246, 0.2);
    color: #60a5fa;
}

.btn-icon.view:hover {
    background: rgba(59, 130, 246, 0.25);
    transform: scale(1.05);
}

.state-cell {
    text-align: center;
    padding: 60px;
    color: #94a3b8;
}

.loading-spinner {
    display: inline-block;
    width: 20px;
    height: 20px;
    border: 2px solid #8b5cf6;
    border-top-color: transparent;
    border-radius: 50%;
    animation: spin 1s linear infinite;
    margin-right: 10px;
    vertical-align: middle;
}

@keyframes spin {
    to {
        transform: rotate(360deg);
    }
}

.pagination-footer {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 20px 24px;
    color: #94a3b8;
    background: rgba(0, 0, 0, 0.1);
}

.page-info b {
    color: #8b5cf6;
    margin: 0 4px;
}

.page-btns {
    display: flex;
    align-items: center;
    gap: 12px;
}

.page-btns button {
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.1);
    color: #fff;
    padding: 6px 14px;
    border-radius: 6px;
    cursor: pointer;
    font-size: 0.85rem;
    transition: 0.2s;
}

.page-btns button:hover:not(:disabled) {
    background: rgba(255, 255, 255, 0.1);
    border-color: rgba(255, 255, 255, 0.2);
}

.page-btns button:disabled {
    opacity: 0.4;
    cursor: not-allowed;
}

.curr-page {
    font-family: monospace;
    font-weight: bold;
    color: #e2e8f0;
}

.text-center {
    text-align: center;
}

/* 预览模态框样式 */
.modal-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.7);
    backdrop-filter: blur(5px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 9999;
}

.preview-modal {
    background: #1e293b;
    width: 700px;
    max-width: 90%;
    max-height: 85vh;
    border-radius: 16px;
    border: 1px solid rgba(255, 255, 255, 0.1);
    box-shadow: 0 25px 50px rgba(0, 0, 0, 0.5);
    display: flex;
    flex-direction: column;
    overflow: hidden;
}

.preview-header {
    padding: 20px;
    background: rgba(0, 0, 0, 0.2);
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
}

.ph-info h3 {
    margin: 0 0 5px 0;
    color: #fff;
    font-size: 1.1rem;
}

.ph-info p {
    margin: 0;
    color: #94a3b8;
    font-size: 0.9rem;
}

.highlight {
    color: #8b5cf6;
    font-family: monospace;
}

.close-btn {
    background: none;
    border: none;
    color: #94a3b8;
    font-size: 1.8rem;
    cursor: pointer;
    line-height: 1;
}

.close-btn:hover {
    color: #fff;
}

.preview-body {
    flex: 1;
    overflow-y: auto;
    padding: 0;
    background: #fff;
    position: relative;
    min-height: 300px;
}

.email-content-render {
    padding: 20px;
    color: #333;
    line-height: 1.6;
}

.empty-content {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
    color: #999;
    text-align: center;
    padding: 40px;
}

.preview-footer {
    padding: 15px 20px;
    background: #0f172a;
    border-top: 1px solid rgba(255, 255, 255, 0.08);
    display: flex;
    justify-content: space-between;
    align-items: center;
}

.time-stamp {
    color: #64748b;
    font-size: 0.85rem;
    font-family: monospace;
}

/* 类型标签样式 */
.type-badge {
    padding: 3px 8px;
    border-radius: 4px;
    font-size: 0.75rem;
    font-weight: 600;
    border: 1px solid transparent;
    display: inline-block;
    min-width: 60px;
    /* 保证宽度统一 */
}

/* 📥 收件箱 (橙色 - 代表接收/输入) */
.type-badge.INBOX {
    background: rgba(251, 146, 60, 0.15);
    color: #fb923c;
    border-color: rgba(251, 146, 60, 0.2);
}

.status-badge.RECEIVED {
    background: rgba(59, 130, 246, 0.15);
    color: #60a5fa;
    border: 1px solid rgba(59, 130, 246, 0.2);
}

/* 🔵 安全验证 (蓝色) */
.type-badge.AUTH {
    background: rgba(59, 130, 246, 0.15);
    color: #60a5fa;
    border-color: rgba(59, 130, 246, 0.2);
}

/* 🟢 用户留言 (绿色 - 代表生机/连接) */
.type-badge.CONTACT {
    background: rgba(16, 185, 129, 0.15);
    color: #34d399;
    border-color: rgba(16, 185, 129, 0.2);
}

/* 🟣 系统通知 (紫色 - 代表管理/重要) */
.type-badge.NOTIFICATION {
    background: rgba(139, 92, 246, 0.15);
    color: #a78bfa;
    border-color: rgba(139, 92, 246, 0.2);
}

/* ⚪ 普通/其他 (灰色) */
.type-badge.GENERAL {
    background: rgba(148, 163, 184, 0.15);
    color: #94a3b8;
    border-color: rgba(148, 163, 184, 0.2);
}

/* 💌 回复邮件 (粉色/玫瑰金 - 代表温暖回应) */
.type-badge.REPLY {
    background: rgba(236, 72, 153, 0.15);
    color: #ec4899;
    border-color: rgba(236, 72, 153, 0.2);
}

/* 1. 批量删除按钮：深度同步 Messages.vue 的精致风格 */
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

.btn-danger:active {
    transform: scale(0.95);
}

/* 2. 优化复选框样式：让它在深色背景下更高级 */
.glass-checkbox {
    width: 18px;
    height: 18px;
    cursor: pointer;
    accent-color: #8b5cf6;
    /* 使用紫色呼应整体 UI */
    transition: transform 0.2s;
    background: rgba(255, 255, 255, 0.1);
    border: 1px solid rgba(255, 255, 255, 0.2);
}

.glass-checkbox:hover {
    transform: scale(1.1);
}

/* 3. 微调布局：确保顶部按钮排列整齐 */
.header-right {
    display: flex;
    gap: 12px;
    align-items: center;
    flex-wrap: wrap;
    /* 保证在小屏幕上自动换行 */
}

/* 4. 优化清空按钮：与批量删除按钮形成视觉梯队 */
.btn-danger-outline {
    background: rgba(239, 68, 68, 0.05);
    border: 1px solid rgba(239, 68, 68, 0.3);
    color: #fca5a5;
    padding: 0 16px;
    height: 40px;
    border-radius: 8px;
    cursor: pointer;
    transition: all 0.3s;
    font-weight: 500;
}

.btn-danger-outline:hover {
    background: rgba(239, 68, 68, 0.15);
    border-color: #ef4444;
    color: #fff;
    box-shadow: 0 0 15px rgba(239, 68, 68, 0.2);
}
</style>