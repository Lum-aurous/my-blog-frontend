<script setup>
import { ref, onMounted, reactive } from 'vue'
import { api } from '@/utils/api'
import { message } from '@/utils/message'
import { useUserStore } from '@/stores/user' // 🔥 引入 Store 用于识别自己

const userStore = useUserStore()
const users = ref([])
const isLoading = ref(false)

const query = reactive({
    page: 1,
    limit: 10,
    keyword: ''
})

const pagination = reactive({
    total: 0,
    totalPages: 1
})

// 获取用户列表
const fetchUsers = async () => {
    isLoading.value = true
    try {
        const res = await api.get('/admin/users', { params: query })
        if (res.data.success) {
            users.value = res.data.data.list
            pagination.total = res.data.data.pagination.total
            pagination.totalPages = res.data.data.pagination.totalPages
        }
    } catch (error) {
        console.error(error)
        message.error('加载用户名单失败')
    } finally {
        isLoading.value = false
    }
}

// 切换角色 (提拔/降级)
const handleRoleChange = async (user) => {
    // 🔥 自我保护：不能修改自己的权限
    if (user.id === userStore.user.id) {
        return message.warning('您不能修改自己的权限等级')
    }

    const newRole = user.role === 'admin' ? 'user' : 'admin'
    const actionName = newRole === 'admin' ? '提拔为管理员' : '降级为普通用户'

    if (!confirm(`确定要将用户【${user.nickname || user.username}】${actionName}吗？`)) return

    try {
        const res = await api.patch(`/admin/users/${user.id}/role`, { role: newRole })
        if (res.data.success) {
            message.success('权限变更成功')
            user.role = newRole // 本地更新，无需刷新
        }
    } catch (error) {
        message.error('权限修改失败')
    }
}

// 🔥 新增：注销用户 (封号)
const handleDelete = async (user) => {
    if (user.id === userStore.user.id) return message.warning('无法注销自己的账号')

    // 双重确认，防止手滑
    const confirmName = prompt(`⚠️ 高危操作！\n这将彻底删除该用户及其所有文章、评论。\n请输入用户名 "${user.username}" 确认删除:`)
    if (confirmName !== user.username) {
        if (confirmName !== null) message.info('取消删除')
        return
    }

    try {
        // 调用后端删除接口 (对应后端 app.delete("/api/user/account") 逻辑，但需要管理员版接口)
        // 注意：您后端的 delete /api/admin/users/:id 接口还没写，建议用通用的或者补上
        // 这里暂时假设您会去后端补一个 DELETE /api/admin/users/:id
        // 如果后端还没写，这个操作会报 404
        const res = await api.delete(`/admin/users/${user.id}`)
        if (res.data.success) {
            message.success('用户已注销')
            fetchUsers() // 刷新列表
        }
    } catch (error) {
        message.error('删除失败 (可能后端接口未实装)')
    }
}

const handleSearch = () => {
    query.page = 1
    fetchUsers()
}

const changePage = (p) => {
    if (p < 1 || p > pagination.totalPages) return
    query.page = p
    fetchUsers()
}

// 头像处理
const getAvatar = (url) => {
    if (!url) return 'https://i.pravatar.cc/150?u=default' // 默认随机头像
    if (url.startsWith('http') || url.startsWith('data:')) return url
    const normalizedUrl = url.replace(/\\/g, '/')
    const apiBase = import.meta.env.VITE_API_BASE_URL || ''
    // 适配相对路径
    return `${apiBase}${normalizedUrl.startsWith('/') ? '' : '/'}${normalizedUrl}`
}

const formatDate = (str) => new Date(str).toLocaleDateString()

onMounted(fetchUsers)
</script>

<template>
    <div class="user-list-page">
        <div class="page-header animate__animated animate__fadeInDown">
            <div class="header-title">
                <h2>👥 公民管理</h2>
                <span class="sub-text">注册公民共 {{ pagination.total }} 位</span>
            </div>

            <div class="search-box">
                <span class="search-icon">🔍</span>
                <input v-model="query.keyword" @keyup.enter="handleSearch" type="text" placeholder="搜索用户名或昵称...">
            </div>
        </div>

        <div class="table-container glass-panel animate__animated animate__fadeInUp">
            <table class="data-table">
                <thead>
                    <tr>
                        <th width="80">头像</th>
                        <th width="200">用户身份</th>
                        <th>联络方式</th>
                        <th>IP 归属地</th>
                        <th>注册日期</th>
                        <th width="150" class="text-right">权限操作</th>
                    </tr>
                </thead>
                <tbody>
                    <tr v-if="isLoading">
                        <td colspan="6" class="state-cell">
                            <div class="loading-spinner"></div> 读取档案中...
                        </td>
                    </tr>
                    <tr v-for="user in users" :key="user.id" class="data-row"
                        :class="{ 'is-me': user.id === userStore.user.id }">
                        <td>
                            <div class="avatar-wrapper">
                                <img :src="getAvatar(user.avatar)" class="avatar" loading="lazy">
                                <div class="online-dot" title="当前用户"></div>
                            </div>
                        </td>
                        <td>
                            <div class="identity-col">
                                <div class="name-row">
                                    <span class="nickname">{{ user.nickname || '未命名' }}</span>
                                    <span class="username">@{{ user.username }}</span>
                                </div>
                                <span class="role-badge" :class="user.role">
                                    {{ user.role === 'admin' ? '🛡️ 管理员' : '😊 公民' }}
                                </span>
                            </div>
                        </td>
                        <td>
                            <div class="contact-info">
                                <div v-if="user.email" class="contact-item">📧 {{ user.email }}</div>
                                <div v-if="user.phone" class="contact-item">📱 {{ user.phone }}</div>
                                <div v-if="!user.email && !user.phone" class="contact-item empty">- 无联络信息 -</div>
                            </div>
                        </td>
                        <td>
                            <span class="region-tag" v-if="user.region">
                                📍 {{ user.region.includes(' - ') ? user.region.split(' - ').slice(1).join(' ') :
                                    user.region }}
                            </span>

                            <span v-else class="region-tag unknown">
                                🪐 未知星系
                            </span>
                        </td>
                        <td class="date-cell">{{ formatDate(user.created_at) }}</td>
                        <td>
                            <div class="action-group">
                                <button class="btn-icon role-switch" :title="user.role === 'admin' ? '降级为用户' : '提拔为管理'"
                                    @click="handleRoleChange(user)" :disabled="user.id === userStore.user.id">
                                    {{ user.role === 'admin' ? '⬇️' : '⬆️' }}
                                </button>

                                <button class="btn-icon delete" title="注销账号" @click="handleDelete(user)"
                                    :disabled="user.id === userStore.user.id">
                                    💀
                                </button>
                            </div>
                        </td>
                    </tr>
                </tbody>
            </table>

            <div class="pagination-bar" v-if="pagination.totalPages > 1">
                <button class="page-btn prev" :disabled="query.page === 1"
                    @click="changePage(query.page - 1)">Prev</button>
                <span class="page-info">{{ query.page }} / {{ pagination.totalPages }}</span>
                <button class="page-btn next" :disabled="query.page === pagination.totalPages"
                    @click="changePage(query.page + 1)">Next</button>
            </div>
        </div>
    </div>
</template>

<style scoped>
.user-list-page {
    max-width: 1400px;
    margin: 0 auto;
    color: #e0e0e0;
}

/* 头部样式 */
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
    padding: 15px 20px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.05);
    vertical-align: middle;
}

.data-row:hover {
    background: rgba(255, 255, 255, 0.03);
}

/* 高亮自己 */
.data-row.is-me {
    background: rgba(16, 185, 129, 0.05);
    border-left: 3px solid #10b981;
}

.data-row.is-me .online-dot {
    position: absolute;
    bottom: 0;
    right: 0;
    width: 10px;
    height: 10px;
    background: #10b981;
    border-radius: 50%;
    border: 2px solid #1e293b;
}

/* 头像与身份 */
.avatar-wrapper {
    position: relative;
    width: 40px;
    height: 40px;
}

.avatar {
    width: 100%;
    height: 100%;
    border-radius: 50%;
    object-fit: cover;
    border: 2px solid rgba(255, 255, 255, 0.1);
}

.identity-col {
    display: flex;
    flex-direction: column;
    gap: 4px;
}

.name-row {
    display: flex;
    align-items: baseline;
    gap: 8px;
}

.nickname {
    color: #fff;
    font-weight: 600;
}

.username {
    color: #64748b;
    font-size: 0.8rem;
}

/* 角色徽章 */
.role-badge {
    display: inline-block;
    padding: 2px 8px;
    border-radius: 4px;
    font-size: 0.75rem;
    width: fit-content;
}

.role-badge.admin {
    background: rgba(245, 158, 11, 0.15);
    color: #fbbf24;
    border: 1px solid rgba(245, 158, 11, 0.3);
}

.role-badge.user {
    background: rgba(148, 163, 184, 0.15);
    color: #94a3b8;
    border: 1px solid rgba(148, 163, 184, 0.2);
}

/* 联系信息 */
.contact-info {
    font-size: 0.85rem;
    color: #cbd5e1;
    display: flex;
    flex-direction: column;
    gap: 2px;
}

.contact-item.empty {
    color: #64748b;
    font-style: italic;
    font-size: 0.8rem;
}

/* IP 属地 */
.region-tag {
    font-size: 0.85rem;
    color: #a78bfa;
    background: rgba(139, 92, 246, 0.1);
    padding: 2px 6px;
    border-radius: 4px;
}

.region-tag.unknown {
    color: #64748b;
    background: rgba(255, 255, 255, 0.05);
}

.date-cell {
    color: #64748b;
    font-family: monospace;
    font-size: 0.85rem;
}

/* 操作按钮 */
.action-group {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
}

.btn-icon {
    width: 32px;
    height: 32px;
    border-radius: 8px;
    border: none;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: 0.2s;
}

.btn-icon:disabled {
    opacity: 0.3;
    cursor: not-allowed;
    filter: grayscale(1);
}

.role-switch {
    background: rgba(59, 130, 246, 0.15);
    color: #60a5fa;
}

.role-switch:hover:not(:disabled) {
    background: #3b82f6;
    color: #fff;
}

.delete {
    background: rgba(244, 63, 94, 0.15);
    color: #fb7185;
}

.delete:hover:not(:disabled) {
    background: #f43f5e;
    color: #fff;
}

/* 分页 */
.pagination-bar {
    display: flex;
    justify-content: flex-end;
    gap: 15px;
    padding: 15px 20px;
    align-items: center;
    border-top: 1px solid rgba(255, 255, 255, 0.05);
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

.page-btn:disabled {
    opacity: 0.3;
}

.text-right {
    text-align: right;
}
</style>