<script setup>
import { ref, onMounted, reactive, computed } from 'vue'
import { useRouter } from 'vue-router'
import { api } from '@/utils/api'
import { message } from '@/utils/message'

const router = useRouter()

// 1. 数据状态
const list = ref([])
const isLoading = ref(false)
const selectedIds = ref([]) // 存储被选中的 ID 数组

// 2. 查询参数
const query = reactive({
    page: 1,
    limit: 10,
    keyword: '',
    type: '' // 空字符串表示全部
})

const pagination = reactive({
    total: 0,
    totalPages: 1
})

const tabs = [
    { label: '全部', value: '' },
    { label: '文章', value: 'article' },
    { label: '图文', value: 'short' },  // 🔥 顺手把图文也补上，保持完整
    { label: '旅行 Vlog', value: 'travel' }, // 🔥🔥 新增：旅行 Vlog
    { label: '视频', value: 'video' },
    { label: '音频', value: 'audio' }
]

// 3. 获取列表 (智能兼容)
const fetchList = async () => {
    isLoading.value = true
    try {
        const res = await api.get('/articles', { params: query })

        if (res.data.success) {
            const data = res.data.data
            if (data.list) {
                list.value = data.list
                pagination.total = data.pagination.total
                pagination.totalPages = data.pagination.totalPages
            } else {
                list.value = Array.isArray(data) ? data : []
            }
            // 每次刷新列表清空选中状态
            selectedIds.value = []
        }
    } catch (e) {
        console.error(e)
        message.error('加载失败')
    } finally {
        isLoading.value = false
    }
}

// 4. 操作逻辑
const handleSearch = () => { query.page = 1; fetchList() }
const switchTab = (type) => { query.type = type; query.page = 1; fetchList() }
const changePage = (p) => {
    if (p < 1 || p > pagination.totalPages) return
    query.page = p
    fetchList()
}

// 编辑跳转
const handleEdit = (item) => {
    let type = item.work_type || 'article'

    // 🔥 如果分类是“游记”或者有地点信息，强制标记为 travel
    if (item.category === '游记' || item.location) {
        type = 'travel'
    }

    router.push({ path: '/admin/publish', query: { id: item.id, type } })
}

// 单个删除
const handleDelete = async (item) => {
    if (!confirm(`确定删除《${item.title}》吗？`)) return
    await performDelete([item])
}

// 批量删除
const handleBatchDelete = async () => {
    if (selectedIds.value.length === 0) return
    if (!confirm(`确定要删除选中的 ${selectedIds.value.length} 项内容吗？`)) return

    // 找出选中的完整 item 对象
    const itemsToDelete = list.value.filter(item => selectedIds.value.includes(item.id))
    await performDelete(itemsToDelete)
}

// 执行删除逻辑 (支持批量)
const performDelete = async (items) => {
    try {
        // 并行调用删除接口 (因为后端接口目前是分开的)
        const promises = items.map(item => {
            let endpoint = `/articles/${item.id}`
            if (item.work_type === 'video') endpoint = `/videos/${item.id}`
            if (item.work_type === 'audio') endpoint = `/audios/${item.id}`
            return api.delete(endpoint)
        })

        await Promise.all(promises)
        message.success('删除成功')
        fetchList()
    } catch (e) {
        message.error('部分删除失败，请重试')
    }
}

// 全选/反选逻辑
const toggleSelectAll = (e) => {
    if (e.target.checked) {
        selectedIds.value = list.value.map(item => item.id)
    } else {
        selectedIds.value = []
    }
}
const isAllSelected = computed(() => {
    return list.value.length > 0 && selectedIds.value.length === list.value.length
})

// 🔥 核心修复：更智能的图片路径处理
const getProxyUrl = (url) => {
    if (!url) return ''
    if (url.startsWith('http') || url.startsWith('data:')) return url

    // 这里的 import.meta.env.VITE_API_BASE_URL 需要你在 .env 文件里配置
    // 如果没有配置，这里用 window.location.origin 兜底，假设前后端同域或已做代理
    // 注意：如果你的后端是 3000，前端是 5173，且没有代理，这里直接拼 3000
    // 最稳妥的方式：直接返回相对路径，让 <img> 标签去请求，配合 vite.config.js 的 proxy
    return url.startsWith('/') ? url : `/${url}`
}

const formatDate = (str) => new Date(str).toLocaleDateString()

const typeMap = {
    article: { label: '文章', class: 'tag-blue', icon: '📝' },
    short: { label: '图文', class: 'tag-cyan', icon: '📸' },
    // 🔥🔥 新增：旅行 Vlog (用绿色 tag-green)
    travel: { label: '游记', class: 'tag-green', icon: '✈️' },
    video: { label: '视频', class: 'tag-red', icon: '🎬' },
    audio: { label: '音频', class: 'tag-orange', icon: '📻' }
}

onMounted(fetchList)
</script>

<template>
    <div class="content-list-page">
        <div class="page-header animate__animated animate__fadeInDown">
            <div class="header-left">
                <h2>🗂️ 内容管理</h2>
                <div class="filter-tabs">
                    <span v-for="tab in tabs" :key="tab.value" class="filter-tab"
                        :class="{ active: query.type === tab.value }" @click="switchTab(tab.value)">
                        {{ tab.label }}
                    </span>
                </div>
            </div>
            <div class="header-right">
                <div class="search-box">
                    <span class="icon">🔍</span>
                    <input v-model="query.keyword" @keyup.enter="handleSearch" type="text" placeholder="搜索标题...">
                </div>
                <button class="btn-create" @click="router.push('/admin/publish')">
                    <span class="plus">+</span> 发布
                </button>
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
                        <th width="60">封面</th>
                        <th width="30%">标题</th>
                        <th width="100">类型</th>
                        <th>分类</th>
                        <th>作者</th>
                        <th>数据</th>
                        <th>发布时间</th>
                        <th width="120" class="text-right">操作</th>
                    </tr>
                </thead>
                <tbody>
                    <tr v-if="isLoading">
                        <td colspan="9" class="state-cell">
                            <div class="state-wrapper">
                                <div class="loading-spinner"></div>
                                <span class="state-text">正在加载灵感...</span>
                            </div>
                        </td>
                    </tr>

                    <tr v-else-if="list.length === 0">
                        <td colspan="9" class="state-cell">
                            <div class="state-wrapper empty-mode">
                                <div class="empty-icon">🍃</div>
                                <p class="state-text">暂无相关内容</p>
                                <p class="sub-text">这个领域还是一片荒原，去开垦吧！</p>
                                <button class="mini-create-btn" @click="router.push('/admin/publish')">
                                    立即创作
                                </button>
                            </div>
                        </td>
                    </tr>

                    <tr v-for="item in list" :key="item.id + item.work_type" class="data-row"
                        :class="{ selected: selectedIds.includes(item.id) }">
                        <td class="text-center">
                            <input type="checkbox" v-model="selectedIds" :value="item.id" class="custom-checkbox">
                        </td>

                        <td>
                            <div class="cover-thumb">
                                <img v-if="item.cover_image || item.cover_url"
                                    :src="getProxyUrl(item.cover_image || item.cover_url)" loading="lazy"
                                    @error="$event.target.src = 'https://via.placeholder.com/50x35?text=No+Img'">
                                <div v-else class="no-cover">{{ typeMap[item.work_type || 'article']?.icon }}</div>
                            </div>
                        </td>

                        <td>
                            <div class="title-wrap">
                                <span class="main-title" :title="item.title">{{ item.title }}</span>
                                <span class="sub-summary">{{ item.summary?.substring(0, 20) }}...</span>
                            </div>
                        </td>

                        <td>
                            <span class="type-badge" :class="typeMap[item.work_type || 'article']?.class">
                                {{ typeMap[item.work_type || 'article']?.label }}
                            </span>
                        </td>

                        <td><span class="category-tag">{{ item.category || '未分类' }}</span></td>

                        <td>
                            <div class="author-info">
                                <img :src="getProxyUrl(item.author?.avatar || item.author_avatar)" class="avatar"
                                    @error="$event.target.src = 'https://i.pravatar.cc/150?u=' + item.id">
                                <span>{{ item.author?.nickname || item.author_name || 'Admin' }}</span>
                            </div>
                        </td>

                        <td>
                            <div class="stats-box">
                                <span title="阅读">👁️ {{ item.views || 0 }}</span>
                                <span title="评论">💬 {{ item.comments || 0 }}</span>
                            </div>
                        </td>

                        <td><span class="date">{{ formatDate(item.created_at) }}</span></td>

                        <td>
                            <div class="action-group">
                                <button class="btn-icon edit" title="编辑" @click="handleEdit(item)">✎</button>
                                <button class="btn-icon delete" title="删除" @click="handleDelete(item)">🗑</button>
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
                    <button class="page-btn" :disabled="query.page === 1"
                        @click="changePage(query.page - 1)">Prev</button>
                    <span class="page-info">{{ query.page }} / {{ pagination.totalPages }}</span>
                    <button class="page-btn" :disabled="query.page === pagination.totalPages"
                        @click="changePage(query.page + 1)">Next</button>
                </div>
            </div>
        </div>
    </div>
</template>

<style scoped>
/* 保持原有深色玻璃风格 */
.content-list-page {
    max-width: 1400px;
    margin: 0 auto;
    color: #e0e0e0;
    padding-bottom: 60px;
}

.page-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 25px;
}

.header-left h2 {
    margin: 0 0 15px 0;
    color: #fff;
    font-size: 1.6rem;
}

.filter-tabs {
    display: flex;
    gap: 5px;
    background: rgba(0, 0, 0, 0.2);
    padding: 4px;
    border-radius: 8px;
}

.filter-tab {
    padding: 6px 16px;
    border-radius: 6px;
    cursor: pointer;
    color: #94a3b8;
    transition: 0.3s;
}

.filter-tab.active {
    background: #3b82f6;
    color: #fff;
    font-weight: 600;
}

.header-right {
    display: flex;
    gap: 15px;
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
    width: 200px;
    outline: none;
}

.btn-create {
    background: #10b981;
    border: none;
    color: #fff;
    padding: 0 20px;
    border-radius: 8px;
    font-weight: 600;
    cursor: pointer;
}

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
    font-size: 0.9rem;
}

.data-table th {
    text-align: left;
    padding: 18px 20px;
    color: #94a3b8;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    background: rgba(0, 0, 0, 0.2);
}

.data-table td {
    padding: 15px 20px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.05);
    color: #e2e8f0;
    vertical-align: middle;
}

.data-row:hover {
    background: rgba(255, 255, 255, 0.03);
}

.data-row.selected {
    background: rgba(59, 130, 246, 0.1);
}

/* 图片修复样式 */
.cover-thumb {
    width: 50px;
    height: 35px;
    border-radius: 4px;
    overflow: hidden;
    background: rgba(0, 0, 0, 0.3);
    display: flex;
    align-items: center;
    justify-content: center;
}

.cover-thumb img {
    width: 100%;
    height: 100%;
    object-fit: cover;
}

.author-info {
    display: flex;
    align-items: center;
    gap: 8px;
}

.author-info .avatar {
    width: 24px;
    height: 24px;
    border-radius: 50%;
    object-fit: cover;
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
}

.page-btn:disabled {
    opacity: 0.3;
}

/* Checkbox 美化 */
.custom-checkbox {
    width: 16px;
    height: 16px;
    cursor: pointer;
    accent-color: #3b82f6;
}

.text-center {
    text-align: center;
}

.text-right {
    text-align: right;
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

/* 标签样式保持不变 */
.type-badge {
    padding: 2px 8px;
    border-radius: 4px;
    font-size: 0.75rem;
    border: 1px solid transparent;
}

.tag-blue {
    background: rgba(59, 130, 246, 0.15);
    color: #60a5fa;
    border-color: rgba(59, 130, 246, 0.3);
}

.tag-cyan {
    background: rgba(6, 182, 212, 0.15);
    color: #22d3ee;
    border-color: rgba(6, 182, 212, 0.3);
}

.tag-red {
    background: rgba(244, 63, 94, 0.15);
    color: #fb7185;
    border-color: rgba(244, 63, 94, 0.3);
}

.tag-orange {
    background: rgba(249, 115, 22, 0.15);
    color: #fb923c;
    border-color: rgba(249, 115, 22, 0.3);
}

.tag-green {
    background: rgba(16, 185, 129, 0.15);
    color: #34d399;
    border-color: rgba(16, 185, 129, 0.3);
}

.category-tag {
    background: rgba(255, 255, 255, 0.1);
    padding: 2px 8px;
    border-radius: 4px;
    font-size: 0.8rem;
    color: #cbd5e1;
}

.stats-box {
    display: flex;
    gap: 10px;
    color: #94a3b8;
    font-size: 0.85rem;
}

.date {
    font-family: monospace;
    color: #64748b;
}

.btn-icon {
    width: 30px;
    height: 30px;
    border-radius: 6px;
    border: none;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
}

.edit {
    background: rgba(59, 130, 246, 0.15);
    color: #60a5fa;
}

.delete {
    background: rgba(244, 63, 94, 0.15);
    color: #fb7185;
}

.action-group {
    display: flex;
    gap: 8px;
    justify-content: flex-end;
}

/* ================= 状态展示 (Loading / Empty) ================= */

/* 单元格容器：保证高度，确保居中 */
.state-cell {
    height: 400px;
    /* 给一个固定高度，防止表格塌陷 */
    text-align: center;
    vertical-align: middle !important;
    /* 表格垂直居中核心 */
    background: rgba(255, 255, 255, 0.01);
    /* 极淡的背景 */
}

/* 内容包装器：Flex 居中布局 */
.state-wrapper {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 15px;
    height: 100%;
}

/* --- Loading 样式 --- */
.loading-spinner {
    width: 40px;
    height: 40px;
    border: 3px solid rgba(59, 130, 246, 0.1);
    border-top: 3px solid #3b82f6;
    /* 蓝色高亮 */
    border-radius: 50%;
    animation: spin 1s linear infinite;
}

/* --- Empty 样式 --- */
.empty-mode .empty-icon {
    font-size: 4rem;
    opacity: 0.5;
    margin-bottom: 5px;
    animation: float 3s ease-in-out infinite;
    /* 悬浮动画 */
    filter: grayscale(0.5);
}

.state-text {
    font-size: 1rem;
    color: #cbd5e1;
    font-weight: 500;
}

.sub-text {
    font-size: 0.85rem;
    color: #64748b;
    margin-top: -10px;
}

/* 小巧的引导按钮 */
.mini-create-btn {
    margin-top: 10px;
    padding: 8px 24px;
    background: rgba(59, 130, 246, 0.1);
    border: 1px solid rgba(59, 130, 246, 0.3);
    color: #60a5fa;
    border-radius: 20px;
    font-size: 0.85rem;
    cursor: pointer;
    transition: all 0.3s;
}

.mini-create-btn:hover {
    background: #3b82f6;
    color: #fff;
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(59, 130, 246, 0.3);
}

/* 动画定义 */
@keyframes spin {
    0% {
        transform: rotate(0deg);
    }

    100% {
        transform: rotate(360deg);
    }
}

@keyframes float {

    0%,
    100% {
        transform: translateY(0);
    }

    50% {
        transform: translateY(-10px);
    }
}
</style>