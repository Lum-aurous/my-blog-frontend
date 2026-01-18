<script setup>
import { ref, onMounted, reactive, computed } from 'vue'
import { api } from '@/utils/api'
import { message } from '@/utils/message'

const comments = ref([])
const isLoading = ref(false)
const selectedIds = ref([])

// 🔥 图片预览相关状态 (新增)
const showImageModal = ref(false)
const previewImageUrl = ref('')

const query = reactive({ page: 1, limit: 10, keyword: '' })
const pagination = reactive({ total: 0, totalPages: 1 })

const fetchComments = async () => {
    isLoading.value = true
    try {
        const res = await api.get('/admin/comments', { params: query })
        if (res.data.success) {
            comments.value = res.data.data.list
            pagination.total = res.data.data.pagination.total
            pagination.totalPages = res.data.data.pagination.totalPages
            selectedIds.value = []
        }
    } catch (error) {
        console.error(error)
        message.error('加载评论失败')
    } finally {
        isLoading.value = false
    }
}

const changePage = (newPage) => {
    if (newPage < 1 || newPage > pagination.totalPages) return
    query.page = newPage
    fetchComments()
}

const handleSearch = () => {
    query.page = 1
    fetchComments()
}

const handleDelete = async (id) => {
    if (!confirm('确定要删除这条评论吗？（相关子评论也会被删除）')) return
    await performDelete([id])
}

const handleBatchDelete = async () => {
    if (selectedIds.value.length === 0) return
    if (!confirm(`确定要删除选中的 ${selectedIds.value.length} 条评论吗？`)) return
    await performDelete(selectedIds.value)
}

const performDelete = async (ids) => {
    try {
        const promises = ids.map(id => api.delete(`/comments/${id}`))
        await Promise.all(promises)
        message.success('删除成功')
        fetchComments()
    } catch (error) {
        message.error('删除失败，请重试')
    }
}

const toggleSelectAll = (e) => {
    if (e.target.checked) {
        selectedIds.value = comments.value.map(item => item.id)
    } else {
        selectedIds.value = []
    }
}
const isAllSelected = computed(() => {
    return comments.value.length > 0 && selectedIds.value.length === comments.value.length
})

// 🔥 修改：在当前页面打开大图预览
const viewImage = (url) => {
    previewImageUrl.value = getProxyUrl(url)
    showImageModal.value = true
}

// 🔥 新增：关闭大图预览
const closeImageModal = () => {
    showImageModal.value = false
    // 延迟清空 URL，避免动画消失时图片突然闪烁
    setTimeout(() => {
        previewImageUrl.value = ''
    }, 300)
}

const getProxyUrl = (url) => {
    if (!url) return ''
    if (url.startsWith('http') || url.startsWith('data:')) return url
    const normalizedUrl = url.replace(/\\/g, '/')
    // 注意：生产环境需根据实际情况调整 API_BASE_URL
    // const host = import.meta.env.VITE_API_BASE_URL?.replace(/\/api\/?$/, '') || window.location.origin
    // 这里暂且假设后端返回的是相对路径 /uploads/...
    return normalizedUrl.startsWith('/') ? normalizedUrl : `/${normalizedUrl}`
}

const formatDate = (str) => new Date(str).toLocaleString()

onMounted(fetchComments)
</script>

<template>
    <div class="comment-list-page">
        <div class="page-header animate__animated animate__fadeInDown">
            <div class="header-title">
                <h2>💬 评论审核</h2>
                <span class="sub-text">共 {{ pagination.total }} 条留言</span>
            </div>
            <div class="search-box">
                <span class="search-icon">🔍</span>
                <input v-model="query.keyword" @keyup.enter="handleSearch" type="text" placeholder="搜索评论内容或用户...">
            </div>
        </div>

        <div class="table-container glass-panel animate__animated animate__fadeInUp">
            <table class="data-table">
                <thead>
                    <tr>
                        <th width="40" class="text-center">
                            <input type="checkbox" :checked="isAllSelected" @change="toggleSelectAll"
                                class="custom-checkbox">
                        </th>
                        <th width="200">用户</th>
                        <th>评论内容</th>
                        <th width="180">所属文章</th>
                        <th width="160">时间</th>
                        <th width="80" class="text-right">操作</th>
                    </tr>
                </thead>
                <tbody>
                    <tr v-if="isLoading">
                        <td colspan="6" class="state-cell">
                            <div class="loading-spinner"></div> 加载中...
                        </td>
                    </tr>
                    <tr v-else-if="comments.length === 0">
                        <td colspan="6" class="state-cell">暂无评论 🦗</td>
                    </tr>

                    <tr v-for="item in comments" :key="item.id" class="data-row"
                        :class="{ selected: selectedIds.includes(item.id) }">
                        <td class="text-center">
                            <input type="checkbox" v-model="selectedIds" :value="item.id" class="custom-checkbox">
                        </td>
                        <td>
                            <div class="user-info">
                                <img :src="getProxyUrl(item.avatar) || 'https://i.pravatar.cc/150?u=' + item.id"
                                    class="avatar">
                                <div class="user-meta">
                                    <span class="nickname">{{ item.nickname }}</span>
                                    <span class="region-badge" v-if="item.region">{{ item.region.split(' ')[0] || '未知'
                                        }}</span>
                                </div>
                            </div>
                        </td>
                        <td>
                            <div class="content-wrapper">
                                <div v-if="item.parent_id" class="reply-tag">
                                    ↳ 回复评论 #{{ item.parent_id }}
                                </div>
                                <div class="content-bubble" v-if="item.content">
                                    {{ item.content }}
                                </div>
                                <div v-else-if="!item.images || item.images.length === 0" class="content-bubble empty">
                                    (纯图片评论)
                                </div>

                                <div v-if="item.images && item.images.length > 0" class="image-gallery">
                                    <div v-for="(img, idx) in item.images" :key="idx" class="img-box"
                                        @click="viewImage(img)">
                                        <img :src="getProxyUrl(img)" loading="lazy">
                                    </div>
                                </div>
                            </div>
                        </td>
                        <td>
                            <a v-if="item.article_id" :href="`/article/${item.article_id}`" target="_blank"
                                class="article-link" title="点击跳转前台查看">
                                📄 {{ item.article_title || '未命名文章' }}
                            </a>
                            <span v-else class="article-link disabled">已删除文章</span>
                        </td>
                        <td class="date-cell">{{ formatDate(item.created_at) }}</td>
                        <td>
                            <div class="action-group">
                                <button class="btn-icon delete" @click="handleDelete(item.id)" title="删除">🗑</button>
                            </div>
                        </td>
                    </tr>
                </tbody>
            </table>

            <div class="table-footer" v-if="pagination.totalPages > 1 || selectedIds.length > 0">
                <div class="batch-actions" v-if="selectedIds.length > 0">
                    <span class="selected-count">已选 {{ selectedIds.length }} 项</span>
                    <button class="batch-btn delete" @click="handleBatchDelete">批量删除</button>
                </div>

                <div class="pagination-bar" v-else>
                    <button class="page-btn prev" :disabled="query.page === 1"
                        @click="changePage(query.page - 1)">Prev</button>
                    <span class="page-info">{{ query.page }} / {{ pagination.totalPages }}</span>
                    <button class="page-btn next" :disabled="query.page === pagination.totalPages"
                        @click="changePage(query.page + 1)">Next</button>
                </div>
            </div>
        </div>

        <Transition name="fade">
            <div v-if="showImageModal" class="image-modal-overlay" @click.self="closeImageModal">
                <button class="close-btn" @click="closeImageModal">×</button>
                <div class="modal-content">
                    <img :src="previewImageUrl" alt="Preview">
                </div>
            </div>
        </Transition>
    </div>
</template>

<style scoped>
.comment-list-page {
    max-width: 1400px;
    margin: 0 auto;
    color: #e0e0e0;
    padding-bottom: 40px;
}

/* 头部 */
.page-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-end;
    margin-bottom: 25px;
}

.header-title h2 {
    margin: 0;
    color: #fff;
    font-size: 1.6rem;
    font-weight: 700;
}

.sub-text {
    color: #94a3b8;
    font-size: 0.9rem;
    margin-top: 5px;
    display: block;
}

.search-box {
    display: flex;
    align-items: center;
    background: rgba(30, 41, 59, 0.4);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 8px;
    padding: 0 12px;
}

.search-box input {
    background: transparent;
    border: none;
    color: #fff;
    padding: 10px 0;
    width: 220px;
    outline: none;
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
    width: 100%;
    border-collapse: collapse;
    font-size: 0.95rem;
}

.data-table th {
    text-align: left;
    padding: 18px 20px;
    color: #94a3b8;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    background: rgba(0, 0, 0, 0.2);
}

.data-table td {
    padding: 16px 20px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.05);
    vertical-align: middle;
}

.data-row:hover {
    background: rgba(255, 255, 255, 0.03);
}

.data-row.selected {
    background: rgba(59, 130, 246, 0.1);
}

/* 复选框 */
.custom-checkbox {
    width: 16px;
    height: 16px;
    cursor: pointer;
    accent-color: #3b82f6;
}

.text-center {
    text-align: center;
}

/* 用户信息 */
.user-info {
    display: flex;
    align-items: center;
    gap: 12px;
}

.avatar {
    width: 40px;
    height: 40px;
    border-radius: 50%;
    object-fit: cover;
    border: 2px solid rgba(255, 255, 255, 0.1);
}

.user-meta {
    display: flex;
    flex-direction: column;
    gap: 2px;
}

.nickname {
    color: #fff;
    font-weight: 600;
    font-size: 0.95rem;
}

.region-badge {
    font-size: 0.75rem;
    color: #94a3b8;
    background: rgba(255, 255, 255, 0.05);
    padding: 1px 6px;
    border-radius: 4px;
    display: inline-block;
    width: fit-content;
}

/* 评论内容 */
.content-wrapper {
    display: flex;
    flex-direction: column;
    gap: 6px;
    max-width: 450px;
}

.reply-tag {
    font-size: 0.8rem;
    color: #60a5fa;
    margin-bottom: 2px;
}

.content-bubble {
    background: rgba(255, 255, 255, 0.05);
    padding: 10px 14px;
    border-radius: 0 12px 12px 12px;
    color: #e2e8f0;
    line-height: 1.6;
    font-size: 0.9rem;
    word-break: break-all;
}

.content-bubble.empty {
    color: #64748b;
    font-style: italic;
    background: transparent;
    padding: 0;
}

.image-gallery {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
    margin-top: 4px;
}

.img-box {
    width: 50px;
    height: 50px;
    border-radius: 6px;
    overflow: hidden;
    cursor: zoom-in;
    border: 1px solid rgba(255, 255, 255, 0.1);
    transition: transform 0.2s;
}

.img-box:hover {
    transform: scale(1.1);
    border-color: #3b82f6;
}

.img-box img {
    width: 100%;
    height: 100%;
    object-fit: cover;
}

/* 链接与时间 */
.article-link {
    color: #94a3b8;
    font-size: 0.9rem;
    text-decoration: none;
    display: block;
    max-width: 180px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    transition: 0.2s;
}

.article-link:hover {
    color: #3b82f6;
}

.article-link.disabled {
    color: #64748b;
    cursor: not-allowed;
}

.date-cell {
    color: #64748b;
    font-size: 0.85rem;
    font-family: monospace;
}

/* 底部工具栏 */
.table-footer {
    padding: 15px 20px;
    border-top: 1px solid rgba(255, 255, 255, 0.05);
    display: flex;
    justify-content: flex-end;
    align-items: center;
    min-height: 60px;
}

.batch-actions {
    display: flex;
    align-items: center;
    gap: 15px;
    animation: fadeInUp 0.3s ease;
}

.selected-count {
    color: #94a3b8;
    font-size: 0.9rem;
}

.batch-btn.delete {
    background: #f43f5e;
    color: #fff;
    border: none;
    padding: 6px 16px;
    border-radius: 6px;
    cursor: pointer;
    font-size: 0.85rem;
    transition: 0.2s;
}

.batch-btn.delete:hover {
    background: #e11d48;
}

.pagination-bar {
    display: flex;
    gap: 15px;
    align-items: center;
}

.page-btn {
    background: rgba(255, 255, 255, 0.1);
    border: none;
    color: #fff;
    padding: 5px 15px;
    border-radius: 6px;
    cursor: pointer;
    transition: 0.2s;
}

.page-btn:hover:not(:disabled) {
    background: rgba(255, 255, 255, 0.2);
}

.page-btn:disabled {
    opacity: 0.3;
    cursor: not-allowed;
}

.page-info {
    color: #94a3b8;
    font-size: 0.9rem;
}

/* 删除按钮 */
.action-group {
    display: flex;
    justify-content: flex-end;
}

.btn-icon.delete {
    width: 32px;
    height: 32px;
    border-radius: 8px;
    border: none;
    cursor: pointer;
    background: rgba(244, 63, 94, 0.15);
    color: #fb7185;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: 0.2s;
}

.btn-icon.delete:hover {
    background: #f43f5e;
    color: #fff;
}

/* 🔥 图片预览模态框样式 (新增) 🔥 */
.image-modal-overlay {
    position: fixed;
    top: 0;
    left: 0;
    width: 100vw;
    height: 100vh;
    background: rgba(0, 0, 0, 0.85);
    z-index: 9999;
    display: flex;
    justify-content: center;
    align-items: center;
    backdrop-filter: blur(5px);
}

.modal-content {
    position: relative;
    max-width: 90vw;
    max-height: 90vh;
}

.modal-content img {
    max-width: 100%;
    max-height: 90vh;
    object-fit: contain;
    box-shadow: 0 0 30px rgba(0, 0, 0, 0.5);
    border-radius: 8px;
}

.close-btn {
    position: absolute;
    top: 20px;
    right: 30px;
    background: transparent;
    border: none;
    color: #fff;
    font-size: 40px;
    cursor: pointer;
    z-index: 10000;
    transition: 0.2s;
}

.close-btn:hover {
    color: #f43f5e;
    transform: scale(1.1);
}

/* 模态框动画 */
.fade-enter-active,
.fade-leave-active {
    transition: opacity 0.3s ease;
}

.fade-enter-from,
.fade-leave-to {
    opacity: 0;
}

@keyframes fadeInUp {
    from {
        opacity: 0;
        transform: translateY(10px);
    }

    to {
        opacity: 1;
        transform: translateY(0);
    }
}
</style>