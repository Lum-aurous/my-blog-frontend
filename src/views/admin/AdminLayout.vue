<script setup>
import { ref, onMounted, onUnmounted, computed } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useUserStore } from '@/stores/user.js'
import { message } from '@/utils/message.js'

const router = useRouter()
const route = useRoute()
const userStore = useUserStore()

// 1. 🕒 实时时间逻辑
const currentTime = ref('')
const weekdays = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六']

const updateTime = () => {
    const now = new Date()
    const year = now.getFullYear()
    const month = String(now.getMonth() + 1).padStart(2, '0')
    const day = String(now.getDate()).padStart(2, '0')
    const hours = String(now.getHours()).padStart(2, '0')
    const minutes = String(now.getMinutes()).padStart(2, '0')
    const weekday = weekdays[now.getDay()]
    // 秒针跳动感：偶数秒显示冒号，奇数秒隐藏（可选，这里保持常显更稳重）
    currentTime.value = `${year}年${month}月${day}日 ${hours}:${minutes} ${weekday}`
}

let timer = null

// 2. 🛡️ 权限守门员 & 初始化
onMounted(() => {
    // 权限校验：非管理员禁止入内
    if (!userStore.isLoggedIn || userStore.user?.role !== 'admin') {
        message.error('⛔️ 权限不足：非管理员无法进入指挥舱')
        router.replace('/') // 使用 replace 防止后退回来
        return
    }

    updateTime()
    timer = setInterval(updateTime, 1000)
})

onUnmounted(() => {
    if (timer) clearInterval(timer)
})

// 3. 🗂️ 菜单配置 (分组式设计)
const menuGroups = [
    {
        title: '指挥中心',
        items: [
            { name: '数据仪表盘', path: '/admin/dashboard', icon: '📊' }
        ]
    },
    {
        title: '内容生态',
        items: [
            { name: '发布内容', path: '/admin/publish', icon: '✒️' }, // 复用 ArticlePublish
            { name: '内容管理', path: '/admin/contents', icon: '📚' }, // 对应 ContentList
            { name: '评论审核', path: '/admin/comments', icon: '💬' }, // 对应 CommentList
        ]
    },
    {
        title: '用户与权限',
        items: [
            { name: '公民管理', path: '/admin/users', icon: '👥' }, // 对应 UserList
        ]
    },
    {
        title: '系统基建',
        items: [
            { name: '公告板', path: '/admin/notices', icon: '📢' },
            { name: '留言信箱', path: '/admin/messages', icon: '📬' },
            { name: '邮件监控', path: '/admin/emails', icon: '📧' }, 
            { name: '外观与壁纸', path: '/admin/wallpapers', icon: '🖼️' },
            { name: '友链联盟', path: '/admin/friends', icon: '🤝' },
            { name: '百宝箱管理', path: '/admin/tools', icon: '📦' },
            { name: '诗词管理', path: '/admin/poems', icon: '📜' },
            { name: '版权声明', path: '/admin/copyright', icon: '⚖️' },
            { name: '全局配置', path: '/admin/config', icon: '⚙️' },
        ]
    }
]

// 4. 🖱️ 交互逻辑
const handleLogout = () => {
    if (confirm('🔒 确定要断开连接并退出后台吗？')) {
        userStore.logout()
        message.success('已安全退出')
        router.push('/login')
    }
}

const goHome = () => router.push('/')

// 获取当前路由对应的页面标题 (用于面包屑)
const currentTitle = computed(() => {
    // 遍历所有分组找到当前路径匹配的项
    for (const group of menuGroups) {
        const item = group.items.find(i => i.path === route.path)
        if (item) return item.name
    }
    return route.meta.title || '控制台'
})
</script>

<template>
    <div class="admin-layout">
        <aside class="admin-sidebar">
            <div class="logo-area" @click="goHome" title="返回前台首页">
                <div class="logo-icon">💠</div>
                <div class="logo-text">
                    <div class="logo-title">Veritas</div>
                    <div class="logo-subtitle">ADMIN CONSOLE</div>
                </div>
            </div>

            <nav class="menu-nav">
                <div v-for="(group, index) in menuGroups" :key="index" class="menu-group">
                    <div class="menu-section-title">{{ group.title }}</div>

                    <div v-for="item in group.items" :key="item.path" class="menu-item"
                        :class="{ active: route.path === item.path }" @click="router.push(item.path)">
                        <span class="menu-icon">{{ item.icon }}</span>
                        <span class="menu-name">{{ item.name }}</span>
                        <transition name="fade">
                            <div v-if="route.path === item.path" class="active-indicator"></div>
                        </transition>
                    </div>
                </div>
            </nav>

            <div class="user-area">
                <div class="avatar">
                    <img :src="userStore.user?.avatar || 'https://i.pravatar.cc/150'" alt="admin">
                    <div class="status-dot" title="系统在线"></div>
                </div>
                <div class="info">
                    <div class="name">{{ userStore.user?.nickname || 'Administrator' }}</div>
                    <div class="role">System Root</div>
                </div>
                <button class="logout-mini-btn" @click="handleLogout" title="退出">⏻</button>
            </div>
        </aside>

        <div class="admin-main">
            <header class="admin-header">
                <div class="header-left">
                    <div class="breadcrumb">
                        <span class="breadcrumb-root">系统管理</span>
                        <span class="breadcrumb-separator">/</span>
                        <span class="breadcrumb-item active">{{ currentTitle }}</span>
                    </div>
                </div>

                <div class="header-right">
                    <div class="header-time">{{ currentTime }}</div>
                    <div class="header-actions">
                        <button class="action-btn" @click="goHome">🌐 前台预览</button>
                    </div>
                </div>
            </header>

            <main class="admin-content custom-scrollbar">
                <router-view v-slot="{ Component }">
                    <transition name="fade-slide" mode="out-in">
                        <component :is="Component" />
                    </transition>
                </router-view>
            </main>
        </div>
    </div>
</template>

<style scoped>
/* ================= 🌌 全局布局 (深空主题) ================= */
.admin-layout {
    display: flex;
    height: 100vh;
    /* 背景色：深邃蓝紫渐变 */
    background: linear-gradient(135deg, #0f172a 0%, #1e1b4b 100%);
    color: #e2e8f0;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    overflow: hidden;
}

/* ================= 🗄️ 侧边栏 ================= */
.admin-sidebar {
    width: 260px;
    background: rgba(15, 23, 42, 0.6);
    backdrop-filter: blur(20px);
    border-right: 1px solid rgba(255, 255, 255, 0.05);
    display: flex;
    flex-direction: column;
    flex-shrink: 0;
    z-index: 100;
}

.logo-area {
    height: 80px;
    display: flex;
    align-items: center;
    padding: 0 24px;
    gap: 12px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.05);
    cursor: pointer;
    transition: background 0.3s;
}

.logo-area:hover {
    background: rgba(255, 255, 255, 0.05);
}

.logo-icon {
    font-size: 1.8rem;
    filter: drop-shadow(0 0 10px rgba(59, 130, 246, 0.5));
}

.logo-title {
    font-size: 1.2rem;
    font-weight: 700;
    color: #fff;
    letter-spacing: 1px;
}

.logo-subtitle {
    font-size: 0.6rem;
    color: #64748b;
    letter-spacing: 2px;
    font-weight: 600;
}

/* 菜单导航 */
.menu-nav {
    flex: 1;
    overflow-y: auto;
    padding: 20px 16px;
}

/* 隐藏侧边栏滚动条 */
.menu-nav::-webkit-scrollbar {
    display: none;
}

.menu-group {
    margin-bottom: 24px;
}

.menu-section-title {
    font-size: 0.7rem;
    color: #475569;
    padding: 0 12px 8px;
    font-weight: 700;
    letter-spacing: 1px;
}

.menu-item {
    position: relative;
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 16px;
    border-radius: 8px;
    margin-bottom: 4px;
    color: #94a3b8;
    font-size: 0.9rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.3s ease;
}

.menu-item:hover {
    background: rgba(255, 255, 255, 0.05);
    color: #e2e8f0;
}

.menu-item.active {
    background: linear-gradient(90deg, rgba(59, 130, 246, 0.15), transparent);
    color: #60a5fa;
    /* 亮蓝色 */
}

.active-indicator {
    position: absolute;
    left: 0;
    top: 50%;
    transform: translateY(-50%);
    width: 3px;
    height: 16px;
    background: #60a5fa;
    border-radius: 0 4px 4px 0;
    box-shadow: 0 0 10px rgba(96, 165, 250, 0.6);
}

.menu-icon {
    font-size: 1.1rem;
    min-width: 24px;
    text-align: center;
}

/* 用户区域 */
.user-area {
    padding: 20px;
    border-top: 1px solid rgba(255, 255, 255, 0.05);
    display: flex;
    align-items: center;
    gap: 12px;
    background: rgba(0, 0, 0, 0.2);
}

.user-area .avatar {
    position: relative;
    object-fit: cover;
}

.user-area img {
    width: 40px;
    height: 40px;
    border-radius: 50%;
    border: 2px solid rgba(255, 255, 255, 0.1);
    object-fit: cover;
}

.status-dot {
    position: absolute;
    bottom: 0;
    right: 0;
    width: 10px;
    height: 10px;
    background: #10b981;
    border-radius: 50%;
    border: 2px solid #0f172a;
}

.user-area .info {
    flex: 1;
    overflow: hidden;
}

.user-area .name {
    font-size: 0.9rem;
    font-weight: 600;
    color: #fff;
}

.user-area .role {
    font-size: 0.7rem;
    color: #64748b;
}

.logout-mini-btn {
    width: 32px;
    height: 32px;
    border-radius: 6px;
    color: #64748b;
    cursor: pointer;
    transition: all 0.2s;
    display: flex;
    align-items: center;
    justify-content: center;
}

.logout-mini-btn:hover {
    background: rgba(239, 68, 68, 0.2);
    color: #ef4444;
}

/* ================= 🖥️ 右侧主体 ================= */
.admin-main {
    flex: 1;
    display: flex;
    flex-direction: column;
    background: rgba(15, 23, 42, 0.3);
    /* 稍微透一点底色 */
    position: relative;
}

/* 顶栏 */
.admin-header {
    height: 70px;
    padding: 0 30px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    border-bottom: 1px solid rgba(255, 255, 255, 0.05);
}

.breadcrumb {
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 0.9rem;
}

.breadcrumb-root {
    color: #64748b;
}

.breadcrumb-separator {
    color: #475569;
}

.breadcrumb-item.active {
    color: #e2e8f0;
    font-weight: 600;
}

.header-right {
    display: flex;
    align-items: center;
    gap: 20px;
}

.header-time {
    font-size: 0.85rem;
    color: #64748b;
    font-family: monospace;
}

.action-btn {
    padding: 8px 16px;
    background: rgba(59, 130, 246, 0.1);
    color: #60a5fa;
    border: 1px solid rgba(59, 130, 246, 0.2);
    border-radius: 6px;
    font-size: 0.85rem;
    cursor: pointer;
    transition: all 0.3s;
}

.action-btn:hover {
    background: rgba(59, 130, 246, 0.2);
    box-shadow: 0 0 15px rgba(59, 130, 246, 0.2);
}

/* 内容区 */
.admin-content {
    flex: 1;
    padding: 30px;
    overflow-y: auto;
    position: relative;
}

/* 页面切换动画 */
.fade-slide-enter-active,
.fade-slide-leave-active {
    transition: all 0.3s ease;
}

.fade-slide-enter-from {
    opacity: 0;
    transform: translateY(10px);
}

.fade-slide-leave-to {
    opacity: 0;
    transform: translateY(-10px);
}

/* 自定义滚动条 */
.custom-scrollbar::-webkit-scrollbar {
    width: 6px;
    height: 6px;
}

.custom-scrollbar::-webkit-scrollbar-track {
    background: transparent;
}

.custom-scrollbar::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.1);
    border-radius: 10px;
}

.custom-scrollbar::-webkit-scrollbar-thumb:hover {
    background: rgba(255, 255, 255, 0.2);
}
</style>