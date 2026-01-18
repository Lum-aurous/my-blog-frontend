<script setup>
import { ref, onMounted, reactive, computed } from 'vue'
import { api } from '@/utils/api'
import { message } from '@/utils/message'

// --- 基础状态 ---
const notices = ref([])
const isLoading = ref(false)
const showModal = ref(false)
const isSubmitting = ref(false)
const isEditMode = ref(false)
const editingId = ref(null)

const form = reactive({
    content: '',
    is_active: true
})

// --- 分页与选择状态 ---
const pagination = reactive({
    page: 1,
    limit: 10,
    total: 0,
    totalPages: 0
})
const selectedIds = ref([])

// --- 获取列表 ---
const fetchNotices = async () => {
    isLoading.value = true
    try {
        const res = await api.get('/admin/notices', {
            params: { page: pagination.page, limit: pagination.limit }
        })
        if (res.data.success) {
            notices.value = res.data.data.list
            Object.assign(pagination, res.data.data.pagination)
            selectedIds.value = []
        }
    } catch (error) {
        message.error('加载失败')
    } finally {
        isLoading.value = false
    }
}

// --- 弹窗逻辑 (修复重点) ---

// 1. 打开发布
const openCreateModal = () => {
    isEditMode.value = false
    editingId.value = null
    form.content = ''
    form.is_active = true
    showModal.value = true
}

// 2. 打开编辑 (确保数据回显)
const openEditModal = (notice) => {
    isEditMode.value = true
    editingId.value = notice.id
    form.content = notice.content
    form.is_active = notice.is_active === 1
    showModal.value = true // 🔥 必须确保这一行执行，弹窗才会跳出来
}

// 3. 干净关闭
const closeModalDirectly = () => {
    showModal.value = false
    isEditMode.value = false
    editingId.value = null
    form.content = ''
}

// 4. 带拦截的关闭
const handleCloseModal = () => {
    if (form.content.trim() !== "" && !isSubmitting.value) {
        if (!confirm("内容尚未保存，确定要关闭吗？")) return
    }
    closeModalDirectly()
}

// --- 提交与操作 ---
const submitNotice = async () => {
    if (!form.content.trim()) return message.warning('写点什么吧...')
    isSubmitting.value = true
    try {
        const payload = {
            content: form.content,
            is_active: form.is_active ? 1 : 0
        }
        if (isEditMode.value) {
            await api.put(`/admin/notices/${editingId.value}`, payload)
            message.success('💾 修改已保存')
        } else {
            await api.post('/admin/notices', payload)
            message.success('🚀 公告已发布')
        }
        closeModalDirectly()
        fetchNotices()
    } catch (error) {
        message.error('保存失败')
    } finally {
        isSubmitting.value = false
    }
}

// 状态切换 (支持互斥逻辑)
const toggleStatus = async (notice) => {
    if (notice.isToggling) return
    notice.isToggling = true
    const willEnable = !notice.is_active
    try {
        await api.put(`/admin/notices/${notice.id}`, { is_active: willEnable ? 1 : 0 })
        message.success(willEnable ? '已启用，其他已自动关闭' : '已停用')
        await fetchNotices() // 刷新列表看开关状态同步
    } catch (error) {
        message.error('操作失败')
    } finally {
        notice.isToggling = false
    }
}

// 删除相关
const handleDelete = async (id) => {
    if (!confirm('确认删除这条公告吗？')) return
    try {
        await api.delete(`/admin/notices/${id}`)
        message.success('删除成功')
        fetchNotices()
    } catch (error) { message.error('删除失败') }
}

const handleBatchDelete = async () => {
    if (!selectedIds.value.length) return
    if (!confirm(`确定批量删除这 ${selectedIds.value.length} 项吗？`)) return
    try {
        await api.post('/admin/notices/batch-delete', { ids: selectedIds.value })
        message.success('批量删除成功')
        fetchNotices()
    } catch (error) { message.error('删除失败') }
}

// --- 辅助工具 ---
const isAllSelected = computed(() => notices.value.length > 0 && selectedIds.value.length === notices.value.length)
const toggleSelectAll = (e) => {
    selectedIds.value = e.target.checked ? notices.value.map(n => n.id) : []
}
const changePage = (p) => {
    pagination.page = p
    fetchNotices()
}
const formatDate = (str) => new Date(str).toLocaleString()
const truncateText = (text, length = 50) => {
    if (!text) return ''
    return text.length > length ? text.substring(0, length) + '...' : text
}

onMounted(fetchNotices)
</script>

<template>
    <div class="notice-list-page">
        <div class="page-header animate__animated animate__fadeInDown">
            <div class="header-left">
                <h2>📢 公告管理</h2>
                <span class="sub-text">系统会自动确保全站同时仅有一条公告生效</span>
            </div>
            <div class="header-right">
                <button class="btn-primary" @click="openCreateModal">
                    <span class="icon">+</span> 发布公告
                </button>
            </div>
        </div>

        <Transition name="fade">
            <div class="batch-actions" v-if="selectedIds.length > 0">
                <span>已选中 <b>{{ selectedIds.length }}</b> 项公告</span>
                <button class="btn-danger-sm" @click="handleBatchDelete">🗑️ 批量删除选中</button>
            </div>
        </Transition>

        <div class="table-container glass-panel animate__animated animate__fadeInUp">
            <table class="data-table">
                <thead>
                    <tr>
                        <th width="40"><input type="checkbox" @change="toggleSelectAll" :checked="isAllSelected"></th>
                        <th width="100">状态</th>
                        <th>公告内容</th>
                        <th width="200">发布时间</th>
                        <th width="120" class="text-right">操作</th>
                    </tr>
                </thead>
                <tbody>
                    <tr v-if="isLoading">
                        <td colspan="5" class="state-cell">
                            <div class="loading-spinner"></div> 加载中...
                        </td>
                    </tr>
                    <tr v-else-if="notices.length === 0">
                        <td colspan="5" class="state-cell">暂无公告 📭</td>
                    </tr>
                    <tr v-for="item in notices" :key="item.id" class="data-row"
                        :class="{ 'inactive': !item.is_active }">
                        <td><input type="checkbox" v-model="selectedIds" :value="item.id"></td>
                        <td>
                            <div class="toggle-switch" :class="{ active: item.is_active, loading: item.isToggling }"
                                @click="toggleStatus(item)">
                                <div class="knob"></div>
                            </div>
                        </td>
                        <td class="content-text-cell" @click="openEditModal(item)">
                            <div class="content-text" :title="item.content">{{ truncateText(item.content) }}</div>
                        </td>
                        <td class="date-cell">{{ formatDate(item.created_at) }}</td>
                        <td>
                            <div class="action-group">
                                <button class="btn-icon edit" @click.stop="openEditModal(item)" title="编辑">📝</button>
                                <button class="btn-icon delete" @click.stop="handleDelete(item.id)"
                                    title="删除">🗑</button>
                            </div>
                        </td>
                    </tr>
                </tbody>
            </table>

            <div class="pagination-footer" v-if="pagination.total > 0">
                <div class="page-info">共 <b>{{ pagination.total }}</b> 条</div>
                <div class="page-btns">
                    <button :disabled="pagination.page === 1" @click="changePage(pagination.page - 1)">上一页</button>
                    <span class="curr-page">{{ pagination.page }} / {{ pagination.totalPages }}</span>
                    <button :disabled="pagination.page >= pagination.totalPages"
                        @click="changePage(pagination.page + 1)">下一页</button>
                </div>
            </div>
        </div>

        <Transition name="fade">
            <div v-if="showModal" class="modal-overlay" @click.self="handleCloseModal">
                <div class="modal-card animate__animated animate__zoomIn">
                    <div class="modal-header">
                        <h3>{{ isEditMode ? '📝 编辑公告' : '📝 发布新公告' }}</h3>
                        <button class="close-btn" @click="handleCloseModal">×</button>
                    </div>
                    <div class="modal-body">
                        <textarea v-model="form.content" rows="5" placeholder="请输入公告内容..."
                            class="glass-input"></textarea>
                        <div class="form-item-switch">
                            <label>立即启用</label>
                            <div class="toggle-switch" :class="{ active: form.is_active }"
                                @click="form.is_active = !form.is_active">
                                <div class="knob"></div>
                            </div>
                        </div>
                    </div>
                    <div class="modal-actions">
                        <button class="btn-cancel" @click="handleCloseModal">取消</button>
                        <button class="btn-confirm" @click="submitNotice" :disabled="isSubmitting">
                            {{ isSubmitting ? '处理中...' : (isEditMode ? '保存发布' : '立即发布') }}
                        </button>
                    </div>
                </div>
            </div>
        </Transition>
    </div>
</template>

<style scoped>
.notice-list-page {
    max-width: 1200px;
    margin: 0 auto;
    color: #fff;
}

/* 头部 */
.page-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 25px;
}

.header-left h2 {
    margin: 0;
    font-size: 1.6rem;
    color: #fff;
}

.sub-text {
    color: #94a3b8;
    font-size: 0.9rem;
    margin-top: 5px;
    display: block;
}

.btn-primary {
    background: linear-gradient(135deg, #8b5cf6, #6366f1);
    border: none;
    padding: 10px 24px;
    border-radius: 8px;
    color: #fff;
    font-weight: 600;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 8px;
    transition: transform 0.2s;
    box-shadow: 0 4px 15px rgba(139, 92, 246, 0.3);
}

.btn-primary:hover {
    transform: translateY(-2px);
    box-shadow: 0 6px 20px rgba(139, 92, 246, 0.5);
}

/* 修改按钮样式 */
.btn-save {
    background: linear-gradient(135deg, #10b981, #059669) !important;
    /* 编辑状态变为绿色，代表保存 */
    box-shadow: 0 4px 15px rgba(16, 185, 129, 0.3) !important;
}

.header-right {
    display: flex;
    gap: 10px;
}

/* 表格 */
.glass-panel {
    background: rgba(30, 41, 59, 0.4);
    border-radius: 16px;
    border: 1px solid rgba(255, 255, 255, 0.05);
    backdrop-filter: blur(10px);
    overflow: hidden;
}

.data-table {
    width: 100%;
    border-collapse: collapse;
}

.data-table th {
    text-align: left;
    padding: 18px 24px;
    color: #94a3b8;
    background: rgba(0, 0, 0, 0.2);
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.data-table td {
    padding: 16px 24px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.05);
    vertical-align: middle;
}

.data-row:hover {
    background: rgba(255, 255, 255, 0.03);
}

/* 状态样式 */
.data-row.inactive .content-text {
    color: #64748b;
    text-decoration: line-through;
}

/* 开关 */
.toggle-switch {
    width: 44px;
    height: 24px;
    background: rgba(255, 255, 255, 0.1);
    border-radius: 20px;
    position: relative;
    cursor: pointer;
    transition: 0.3s;
    border: 1px solid rgba(255, 255, 255, 0.1);
}

.toggle-switch.active {
    background: #10b981;
    border-color: #10b981;
    box-shadow: 0 0 10px rgba(16, 185, 129, 0.4);
}

.toggle-switch.loading {
    opacity: 0.7;
    cursor: wait;
}

.knob {
    width: 18px;
    height: 18px;
    background: #fff;
    border-radius: 50%;
    position: absolute;
    top: 2px;
    left: 2px;
    transition: 0.3s cubic-bezier(0.4, 0.0, 0.2, 1);
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
}

.toggle-switch.active .knob {
    transform: translateX(20px);
}

/* 文本 & 日期 */
.content-text {
    font-size: 1rem;
    color: #e2e8f0;
    line-height: 1.5;
    max-width: 500px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.date-cell {
    color: #64748b;
    font-family: monospace;
}

/* 操作 */
.action-group {
    display: flex;
    justify-content: flex-end;
    /* 🔥 核心修改：设置按钮之间的间距为 12px */
    gap: 12px; 
}

.btn-icon.edit {
    width: 36px;
    height: 36px;
    background: rgba(16, 185, 129, 0.1); /* 降低背景饱和度 */
    border: 1px solid rgba(16, 185, 129, 0.2); /* 增加一层细边框 */
    color: #34d399;
    border-radius: 8px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: 0.2s;
}

.btn-icon.edit:hover {
    background: rgba(16, 185, 129, 0.25);
    transform: translateY(-2px); /* 悬停时轻微上浮 */
}

.btn-icon.delete {
    width: 36px;
    height: 36px;
    background: rgba(239, 68, 68, 0.1);
    border: 1px solid rgba(239, 68, 68, 0.2);
    color: #fb7185;
    border-radius: 8px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: 0.2s;
}

.btn-icon.delete:hover {
    background: rgba(239, 68, 68, 0.25);
    transform: translateY(-2px);
}

.state-cell {
    text-align: center;
    padding: 40px;
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

/* 模态框 */
.modal-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.7);
    backdrop-filter: blur(5px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
}

.modal-card {
    background: #1e293b;
    width: 500px;
    padding: 30px;
    border-radius: 20px;
    border: 1px solid rgba(255, 255, 255, 0.1);
    box-shadow: 0 25px 50px rgba(0, 0, 0, 0.5);
}

.modal-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 20px;
}

.modal-header h3 {
    margin: 0;
    font-size: 1.4rem;
    color: #fff;
}

.close-btn {
    background: none;
    border: none;
    color: #94a3b8;
    font-size: 1.5rem;
    cursor: pointer;
    transition: 0.2s;
}

.close-btn:hover {
    color: #fff;
}

.glass-input {
    width: 100%;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 12px;
    padding: 16px;
    color: #fff;
    outline: none;
    resize: vertical;
    font-size: 1rem;
    transition: 0.3s;
}

.glass-input:focus {
    border-color: #8b5cf6;
    background: rgba(255, 255, 255, 0.08);
}

.form-item-switch {
    display: flex;
    align-items: center;
    gap: 15px;
    margin-top: 20px;
    color: #cbd5e1;
    font-size: 0.9rem;
}

.modal-actions {
    display: flex;
    justify-content: flex-end;
    gap: 12px;
    margin-top: 30px;
}

.btn-cancel {
    background: transparent;
    border: 1px solid rgba(255, 255, 255, 0.2);
    color: #ccc;
    padding: 10px 20px;
    border-radius: 8px;
    cursor: pointer;
    transition: 0.2s;
}

.btn-cancel:hover {
    background: rgba(255, 255, 255, 0.05);
    color: #fff;
}

.btn-confirm {
    background: #8b5cf6;
    border: none;
    color: #fff;
    padding: 10px 24px;
    border-radius: 8px;
    cursor: pointer;
    font-weight: 600;
    transition: 0.2s;
}

.btn-confirm:hover {
    background: #7c3aed;
}

.btn-confirm:disabled {
    opacity: 0.6;
    cursor: not-allowed;
}

/* 动画 */
.fade-enter-active,
.fade-leave-active {
    transition: opacity 0.3s;
}

.fade-enter-from,
.fade-leave-to {
    opacity: 0;
}

.batch-actions {
    padding: 10px 24px;
    background: rgba(239, 68, 68, 0.1);
    border-radius: 8px;
    margin-bottom: 15px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    color: #f87171;
    border: 1px solid rgba(239, 68, 68, 0.2);
}

.btn-danger-sm {
    background: #ef4444;
    color: #fff;
    border: none;
    padding: 5px 12px;
    border-radius: 6px;
    cursor: pointer;
}

.pagination-footer {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 20px 24px;
    color: #94a3b8;
}

.page-btns {
    display: flex;
    align-items: center;
    gap: 15px;
}

.page-btns button {
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.1);
    color: #fff;
    padding: 5px 15px;
    border-radius: 6px;
    cursor: pointer;
}

.page-btns button:disabled {
    opacity: 0.3;
    cursor: not-allowed;
}

.curr-page {
    font-family: monospace;
    font-weight: bold;
}

/* 针对全选/单选框的简单美化 */
input[type="checkbox"] {
    width: 16px;
    height: 16px;
    cursor: pointer;
    accent-color: #8b5cf6;
    /* 统一主题紫色 */
}

/* 分页页码强调 */
.page-info b,
.curr-page {
    color: #8b5cf6;
    margin: 0 4px;
}

/* 批量删除按钮按压反馈 */
.btn-danger-sm:active {
    transform: scale(0.95);
}

/* 表格操作列宽度微调，防止按钮挤压 */
th.text-right,
.action-group {
    padding-right: 24px;
}
</style>