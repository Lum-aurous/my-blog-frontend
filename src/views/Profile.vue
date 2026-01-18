<script setup>
import { ref, onMounted, onUnmounted, computed, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useUserStore } from '@/stores/user.js'
import { api } from '@/utils/api'
import { message } from '@/utils/message.js'
import ArticleItem from '@/components/ArticleItem.vue'

const route = useRoute()
const router = useRouter()
const userStore = useUserStore()

const targetUser = ref({})
const isFollowing = ref(false)

// ==================== 0. 分页状态管理 ====================
const pagination = ref({
    posts: { page: 1, pageSize: 12, hasMore: true, loading: false, list: [] },
    likes: { page: 1, pageSize: 12, hasMore: true, loading: false, list: [] },
    history: { page: 1, pageSize: 12, hasMore: true, loading: false, list: [] },
    columns: { page: 1, pageSize: 100, hasMore: false, loading: false, list: [] }
})

const activeTab = ref('posts')
const profileSearchQuery = ref('')
const LOAD_STEP = 8;
const visibleCounts = ref({ posts: LOAD_STEP, likes: LOAD_STEP, history: LOAD_STEP });

const bannerInput = ref(null)
const bannerUploading = ref(false)
const defaultBanner = 'https://images.unsplash.com/photo-1478760329108-5c3ed9d495a0?q=80&w=2000&auto=format&fit=crop'

// ✅ 修复版 isMyProfile
const isMyProfile = computed(() => {
    // 1. 必须有登录信息
    if (!userStore.token || !userStore.user) return false;

    // 2. 获取当前路由参数中的用户名
    const currentRouteUsername = route.params.username;

    // 3. 获取登录用户的用户名 (兼容 username 或 id 对比)
    const loggedInUsername = userStore.user.username;

    // 4. 对比 (转为字符串防止类型差异)
    return String(currentRouteUsername) === String(loggedInUsername);
})

// ✅ 修复版 getFullBannerUrl
const getFullBannerUrl = (path) => {
    if (!path || path === 'null' || path === 'undefined') return defaultBanner

    // 1. 网络图片直接返回
    if (path.startsWith('http')) return path

    // 2. 🔥🔥🔥 核心修复：清洗反斜杠 \ -> / 🔥🔥🔥
    let cleanPath = path.trim().replace(/\\/g, '/')

    // 3. 补全斜杠
    cleanPath = cleanPath.startsWith('/') ? cleanPath : '/' + cleanPath

    // 4. 确保指向 /api/uploads (适配 Nginx)
    if (!cleanPath.startsWith('/api')) {
        // 如果路径里包含 uploads 但没 api 前缀，加上它
        if (cleanPath.startsWith('/uploads') || cleanPath.includes('uploads/')) {
            return '/api' + cleanPath
        }
        // 兜底：假设是相对路径，也加上 /api
        return '/api' + cleanPath
    }

    return cleanPath
}

// ✅ 修复版 getProxyUrl (Profile.vue 专用)
const getProxyUrl = (url) => {
    // 1. 空值检查
    if (!url || url === 'null' || url === 'undefined' || typeof url !== 'string') {
        return 'https://images.unsplash.com/photo-1484417894907-623942c8ee29?w=500'
    }

    // 2. 如果是外部链接 (http/https) 或 base64，直接返回
    if (url.startsWith('http') || url.startsWith('data:')) {
        return url
    }

    // 3. 🔥🔥🔥 核心修复：把 Windows 的反斜杠 \ 全部强制替换为 / 🔥🔥🔥
    let cleanPath = url.trim().replace(/\\/g, '/')

    // 4. 补全 /uploads/ 前缀
    if (!cleanPath.startsWith('/') && !cleanPath.includes('uploads/')) {
        cleanPath = '/uploads/' + cleanPath
    } else if (!cleanPath.startsWith('/')) {
        cleanPath = '/' + cleanPath
    }

    // 5. 统一加上 /api 前缀 (适配 Nginx 反向代理)
    // 这样前端请求 /api/uploads/... -> Nginx 转发/alias -> 服务器文件
    if (!cleanPath.startsWith('/api')) {
        cleanPath = '/api' + cleanPath
    }

    return cleanPath
}

// ==================== 🛠️ 通用数据清洗 ====================

// ✅ 修复版 sanitizeItem (数据清洗)
const sanitizeItem = (item) => {
    let type = item.work_type || 'article';
    if (item.video_url) type = 'video';
    if (item.audio_url) type = 'audio';
    if (item.category === '游记') type = 'travel';
    let cover = item.cover_image || item.cover_url || item.cover;

    // 尝试从 Markdown 内容提取图片
    if (!cover && item.content) {
        const imgMatch = item.content.match(/!\[.*?\]\((.*?)\)/);
        if (imgMatch && imgMatch[1]) {
            cover = imgMatch[1];
        }
    }

    // 🔥🔥🔥 核心修复：如果封面是本地路径，立即清洗反斜杠！
    if (cover && typeof cover === 'string' && !cover.startsWith('http')) {
        cover = cover.replace(/\\/g, '/');
    }

    // 视频/音频路径清洗
    if (type === 'video' && item.video_url) {
        if (!item.video_url.startsWith('http')) {
            // 确保以 / 开头，并清洗反斜杠
            item.video_url = item.video_url.replace(/\\/g, '/');
            if (!item.video_url.startsWith('/')) item.video_url = '/' + item.video_url;
        }
    }
    if (type === 'audio' && item.audio_url) {
        if (!item.audio_url.startsWith('http')) {
            item.audio_url = item.audio_url.replace(/\\/g, '/');
            if (!item.audio_url.startsWith('/')) item.audio_url = '/' + item.audio_url;
        }
    }

    return {
        ...item,
        id: item.id,
        title: item.title || '无标题内容',
        summary: item.summary || item.description || '暂无简介...',
        work_type: type,
        cover_image: cover, // ✅ 这里传出去的已经是干净的路径了
        views: Number(item.views || 0),
        comments: Number(item.comments || 0),
        likes: Number(item.likes || 0),
        favorites: Number(item.favorites || 0),
        history_time: item.history_time,
        created_at: item.created_at
    };
}

const formatJoinedDate = (dateStr) => {
    if (!dateStr) return '加载中...'
    const date = new Date(dateStr)
    return isNaN(date.getTime()) ? '未知' : date.toLocaleDateString()
}

// ==================== 📡 数据获取逻辑 ====================

const fetchTargetUserInfo = async () => {
    try {
        const res = await api.get('/user/profile', { params: { username: route.params.username } })
        const serverData = (res.data && res.data.success !== undefined) ? res.data : res;
        if (serverData.success) {
            targetUser.value = serverData.data
            if (serverData.data.navConfig) navMenuConfig.value = serverData.data.navConfig
            if (!isMyProfile.value && userStore.user) checkFollowStatus()
        }
    } catch (error) { console.error("❌ 获取用户失败:", error) }
}

const fetchUserArticles = async (isLoadMore = false) => {
    const pager = pagination.value.posts
    if (pager.loading) return

    pager.loading = true
    if (!isLoadMore) {
        pager.page = 1
        pager.hasMore = true
        pager.list = []
    }

    try {
        const res = await api.get('/articles', {
            params: {
                author: route.params.username,
                limit: pager.pageSize,
                page: pager.page
            }
        })
        const serverData = (res.data && res.data.success !== undefined) ? res.data : res;

        if (serverData.success) {
            const newItems = (serverData.data.list || []).map(sanitizeItem)
            if (newItems.length < pager.pageSize) pager.hasMore = false
            if (isLoadMore) pager.list.push(...newItems)
            else pager.list = newItems
            pager.page++
        }
    } catch (err) { console.error(err) } finally { pager.loading = false }
}

const fetchUserFavorites = async (isLoadMore = false) => {
    const pager = pagination.value.likes
    if (pager.loading) return

    pager.loading = true
    if (!isLoadMore) {
        pager.page = 1
        pager.hasMore = true
        pager.list = []
    }

    try {
        const res = await api.get('/user/favorites', {
            params: {
                username: route.params.username,
                page: pager.page,
                limit: pager.pageSize
            }
        })
        const serverData = (res.data && res.data.success !== undefined) ? res.data : res;

        if (serverData.success) {
            let newItems = []
            if (Array.isArray(serverData.data)) newItems = serverData.data
            else if (serverData.data?.list) newItems = serverData.data.list

            newItems = newItems.map(sanitizeItem)
            if (newItems.length < pager.pageSize) pager.hasMore = false
            if (isLoadMore) pager.list.push(...newItems)
            else pager.list = newItems
            pager.page++
        }
    } catch (err) { console.error(err) } finally { pager.loading = false }
}

// ✅ 修复版 fetchUserHistory (增加调试日志与容错)
const fetchUserHistory = async (isLoadMore = false) => {
    // 1. 严格权限检查：只有看自己的主页才能看足迹
    if (!isMyProfile.value) {
        console.log('👀 不是本人或未登录，跳过获取历史记录');
        return;
    }

    const pager = pagination.value.history
    if (pager.loading) return

    pager.loading = true
    if (!isLoadMore) {
        pager.page = 1
        pager.hasMore = true
        pager.list = []
    }

    try {
        console.log('🚀 发起历史记录请求...');
        const res = await api.get('/user/history', {
            params: { page: pager.page, limit: pager.pageSize }
        })

        const serverData = (res.data && res.data.success !== undefined) ? res.data : res;

        if (serverData.success) {
            let newItems = []
            // 🔥 兼容后端可能返回的多种数据结构
            if (Array.isArray(serverData.data)) {
                newItems = serverData.data;
            } else if (serverData.data && Array.isArray(serverData.data.list)) {
                newItems = serverData.data.list;
            }

            console.log(`✅ 获取到 ${newItems.length} 条历史记录`, newItems);

            // 🔥 数据清洗 (复用刚才写的 sanitizeItem)
            newItems = newItems.map(item => {
                // 如果后端直接返回了 article 对象，就用它；如果是嵌套在 article 字段里，就解包
                const rawData = item.article || item;
                // 保留 history_time (这通常在关联表中)
                rawData.history_time = item.created_at || item.viewed_at || new Date();
                return sanitizeItem(rawData);
            });

            // 过滤掉无效数据 (比如文章被删了，但记录还在)
            newItems = newItems.filter(i => i.id);

            if (newItems.length < pager.pageSize) pager.hasMore = false

            if (isLoadMore) pager.list.push(...newItems)
            else pager.list = newItems

            pager.page++
        } else {
            console.warn('❌ 获取历史记录失败:', serverData.message);
        }
    } catch (err) {
        console.error('❌ 历史记录接口报错:', err)
    } finally {
        pager.loading = false
    }
}

const fetchUserColumns = async () => {
    const pager = pagination.value.columns
    try {
        const res = await api.get('/columns', { params: { author: route.params.username } })
        const serverData = (res.data && res.data.success !== undefined) ? res.data : res;
        if (serverData.success) pager.list = serverData.data || []
    } catch (err) { console.error(err) }
}

// ==================== 🖱️ 交互逻辑 ====================

const triggerBannerUpload = () => bannerInput.value.click()

// 🔥🔥🔥 核心修复：上传后强制刷新 Banner 🔥🔥🔥
const handleBannerChange = async (e) => {
    const file = e.target.files[0]
    if (!file) return

    // 限制图片大小 (例如 5MB)
    if (file.size > 5 * 1024 * 1024) {
        message.warning('图片太大了，请上传 5MB 以内的图片')
        return
    }

    const formData = new FormData()
    formData.append('banner', file)

    bannerUploading.value = true

    try {
        const res = await api.post('/user/update-banner', formData, {
            headers: { 'Content-Type': 'multipart/form-data' }
        })
        const serverData = (res.data && res.data.success !== undefined) ? res.data : res;

        if (serverData.success) {
            message.success('背景图更换成功')

            // 🔥 1. 获取新路径
            const newPath = serverData.data // 例如 "/uploads/xxx.jpg"

            // 🔥 2. 加上时间戳，强制浏览器重新加载图片 (破除缓存)
            const timestampUrl = `${newPath}?t=${Date.now()}`

            // 🔥 3. 更新当前页面的 targetUser
            targetUser.value.banner = timestampUrl

            // 🔥 4. 同步更新全局 UserStore (这样切到别的页面再切回来也是新的)
            if (userStore.user) {
                userStore.user.banner = timestampUrl
                // 如果 store 使用了 persist 插件，这会自动保存到 localStorage
            }
        }
    } catch (err) {
        console.error(err)
        message.error('上传失败: ' + (err.response?.data?.message || err.message))
    } finally {
        bannerUploading.value = false;
        // 清空 input，允许重复上传同一张图
        if (e.target) e.target.value = ''
    }
}

const checkFollowStatus = async () => {
    if (!targetUser.value?.id) return;
    try {
        const res = await api.get('/user/follow-status', { params: { targetUserId: targetUser.value.id } })
        const serverData = (res.data && res.data.success !== undefined) ? res.data : res;
        if (serverData.success) isFollowing.value = serverData.data.isFollowing
    } catch (err) { console.error(err) }
}

const handleFollowAction = async () => {
    if (!userStore.user) return message.warning('请先登录再操作')
    try {
        const res = await api.post('/user/follow', { targetUserId: targetUser.value.id })
        const serverData = (res.data && res.data.success !== undefined) ? res.data : res;
        if (serverData.success) {
            isFollowing.value = serverData.data.status === 'followed'
            message.success(serverData.message)
            if (targetUser.value.stats) targetUser.value.stats.fansCount += isFollowing.value ? 1 : -1
        }
    } catch (err) { message.error('操作失败') }
}

// 导航配置
const navMenuConfig = ref([
    { id: 'posts', name: '作品', visible: true },
    { id: 'columns', name: '专栏', visible: true },
    { id: 'likes', name: '收藏', visible: true },
    { id: 'history', name: '最近访问', visible: true },
    { id: 'code', name: '代码仓', visible: false },
    { id: 'resources', name: '资源', visible: false }
])
const showNavSettings = ref(false)
const visibleNavItems = computed(() => navMenuConfig.value.filter(item => item.visible))
const toggleNavVisibility = (item) => { item.visible = !item.visible }
const moveTab = (index, direction) => {
    const newIndex = index + direction
    if (newIndex < 0 || newIndex >= navMenuConfig.value.length) return
    const temp = navMenuConfig.value[index]
    navMenuConfig.value[index] = navMenuConfig.value[newIndex]
    navMenuConfig.value[newIndex] = temp
}
const saveNavSettings = async () => {
    try {
        await api.post('/user/nav-settings', { navConfig: navMenuConfig.value })
        message.success('导航配置已同步')
        showNavSettings.value = false
    } catch (err) { message.error('同步失败') }
}

// 专栏操作
const showCreateColumnModal = ref(false)
const newColumnForm = ref({ name: '', description: '', cover: '' })

const handleCreateColumn = async () => {
    if (!newColumnForm.value.name) return message.warning('请输入专栏名称')
    try {
        const res = await api.post('/columns', newColumnForm.value)
        const serverData = (res.data && res.data.success !== undefined) ? res.data : res;
        if (serverData.success) {
            message.success('创建成功')
            showCreateColumnModal.value = false
            newColumnForm.value = { name: '', description: '', cover: '' }
            fetchUserColumns()
        }
    } catch (err) { message.error('创建失败') }
}

const handleDeleteColumn = async (column) => {
    if (!confirm(`确定删除专栏【${column.name}】吗？`)) return
    try {
        const res = await api.delete(`/columns/${column.id}`)
        const serverData = (res.data && res.data.success !== undefined) ? res.data : res;
        if (serverData.success) {
            message.success('已删除')
            fetchUserColumns()
        }
    } catch (err) { message.error('删除失败') }
}

// ==================== 🧠 计算属性与监听 ====================

const residenceTime = computed(() => {
    if (!targetUser.value?.created_at) return '新晋博主'
    const start = new Date(targetUser.value.created_at)
    const now = new Date()
    const diffDays = Math.ceil(Math.abs(now - start) / (1000 * 60 * 60 * 24))
    if (diffDays < 30) return `${diffDays} 天`
    return `${Math.floor(diffDays / 30)} 个月`
})

const currentList = computed(() => {
    switch (activeTab.value) {
        case 'posts': return pagination.value.posts.list
        case 'likes': return pagination.value.likes.list
        case 'history':
            return [...pagination.value.history.list].sort((a, b) =>
                new Date(b.history_time) - new Date(a.history_time)
            )
        case 'columns': return pagination.value.columns.list
        default: return []
    }
})

const filteredList = computed(() => {
    const q = profileSearchQuery.value.trim().toLowerCase()
    const list = currentList.value
    if (!q) return list
    return list.filter(item => {
        const title = (item.title || '').toLowerCase()
        const category = (item.category || '').toLowerCase()
        const summary = (item.summary || item.description || '').toLowerCase()
        const type = (item.work_type || '').toLowerCase()
        return title.includes(q) || category.includes(q) || summary.includes(q) || type.includes(q)
    })
})

const displayedList = computed(() => {
    const q = profileSearchQuery.value.trim()
    if (!q) return filteredList.value
    const limit = visibleCounts.value[activeTab.value] || LOAD_STEP
    return filteredList.value.slice(0, limit)
})

const showLoadMoreBtn = computed(() => {
    const q = profileSearchQuery.value.trim()
    if (q) {
        return filteredList.value.length > displayedList.value.length
    } else {
        return pagination.value[activeTab.value]?.hasMore ?? false
    }
})

const handleStatClick = (type) => {
    if (isMyProfile.value) {
        let targetTab = '';
        if (type === 'original') targetTab = 'works';
        else if (type === 'fans') targetTab = 'fans';
        else if (type === 'follows') targetTab = 'follows';
        if (targetTab) router.push({ path: '/creation-center', query: { tab: targetTab } });
    } else {
        if (type === 'original') {
            profileSearchQuery.value = '';
            activeTab.value = 'posts';
            document.querySelector('.main-content')?.scrollIntoView({ behavior: 'smooth' });
        } else {
            message.info('🔒 为了隐私保护，暂不支持查看他人社交列表');
        }
    }
}

// 🔗 格式化显示链接 (去除 https:// 前缀，模仿 INS 风格)
const formatLinkDisplay = (url) => {
    if (!url) return ''
    // 去掉协议头和末尾斜杠
    return url.replace(/^https?:\/\//, '').replace(/\/$/, '')
}

const showSocialDropdown = ref(false) // 控制“更多”菜单显示
const parsedSocialLinks = computed(() => {
    const raw = targetUser.value?.social_link;
    if (!raw) return [];

    try {
        // 尝试解析 JSON
        if (raw.startsWith('[') && raw.endsWith(']')) {
            return JSON.parse(raw);
        }
        // 兼容旧数据（纯字符串）
        return [raw];
    } catch (e) {
        return [raw];
    }
})

const handleLoadMore = (e) => {
    if (e) {
        e.preventDefault();
        e.stopPropagation();
    }

    const q = profileSearchQuery.value.trim()
    if (q) {
        visibleCounts.value[activeTab.value] += LOAD_STEP
    } else {
        if (activeTab.value === 'posts') fetchUserArticles(true)
        else if (activeTab.value === 'likes') fetchUserFavorites(true)
        else if (activeTab.value === 'history') fetchUserHistory(true)
    }
}
watch(() => route.params.username, () => initData())
watch(profileSearchQuery, () => {
    visibleCounts.value[activeTab.value] = LOAD_STEP
})

watch(activeTab, (newTab) => {
    let targetKey = newTab
    if (newTab === 'columns') targetKey = 'columns'

    const pager = pagination.value[targetKey]
    if (pager && pager.list.length === 0 && pager.page === 1) {
        if (newTab === 'posts') fetchUserArticles()
        else if (newTab === 'likes') fetchUserFavorites()
        else if (newTab === 'history') fetchUserHistory()
    }
})

// ✅ 修复版 initData
const initData = async () => {
    await fetchTargetUserInfo() // 先获取当前页面用户的信息
    fetchUserArticles()
    fetchUserColumns()

    // 🔥 关键：等用户信息加载完，再判断一次是不是本人，如果是，就拉取历史
    if (isMyProfile.value) {
        fetchUserHistory()
    }
}

onMounted(() => {
    initData()
    // 点击任意地方关闭下拉菜单
    document.addEventListener('click', () => {
        showSocialDropdown.value = false
    })
})

// 在 onUnmounted 里
onUnmounted(() => {
    document.removeEventListener('click', () => {
        showSocialDropdown.value = false
    })
})
</script>

<template>
    <div class="profile-page">
        <header class="profile-header-flat">
            <div class="banner-box">
                <img :src="getFullBannerUrl(targetUser?.banner)" class="banner-img"
                    :class="{ 'loading-blur': bannerUploading }" alt="banner">
                <template v-if="isMyProfile">
                    <div class="banner-tag" @click="triggerBannerUpload">
                        {{ bannerUploading ? '上传中...' : '📷 更换主页背景' }}
                    </div>
                    <input type="file" ref="bannerInput" style="display: none" accept="image/*"
                        @change="handleBannerChange">
                </template>
            </div>

            <div class="header-info-container" v-if="targetUser">
                <div class="info-content-main">
                    <div class="avatar-box">
                        <img :src="targetUser?.avatar || 'https://w.wallhaven.cc/full/9o/wallhaven-9oog5d.jpg'"
                            class="avatar-img" alt="avatar">
                    </div>

                    <div class="user-detail">
                        <div class="name-row">
                            <h1 class="nickname">{{ targetUser?.nickname || targetUser?.username }}</h1>
                            <span class="user-badge">拾光纪 {{ residenceTime }}</span>
                        </div>

                        <div class="stats-action-row">
                            <div class="stats-group">
                                <span class="top-stat clickable" @click="handleStatClick('original')">
                                    <b>{{ targetUser?.stats?.originalCount || 0 }}</b> 原创
                                </span>
                                <span class="top-stat clickable" @click="handleStatClick('fans')">
                                    <b>{{ targetUser?.stats?.fansCount || 0 }}</b> 粉丝
                                </span>
                                <span class="top-stat clickable" @click="handleStatClick('follows')">
                                    <b>{{ targetUser?.stats?.followingCount || 0 }}</b> 关注
                                </span>
                            </div>

                            <button v-if="isMyProfile" class="mini-create-btn" @click="router.push('/creation-center')">
                                ✨ 创作
                            </button>
                            <button v-else class="mini-follow-btn" :class="{ 'followed': isFollowing }"
                                @click="handleFollowAction">
                                {{ isFollowing ? '已关注' : '+ 关注' }}
                            </button>
                        </div>

                        <div class="user-meta-row">
                            <div class="meta-item">
                                <span class="meta-icon">📍</span>
                                <span class="meta-label">IP:</span>
                                <span class="meta-value">{{ targetUser?.region || '未知' }}</span>
                            </div>
                            <div class="meta-divider"></div>
                            <div class="meta-item">
                                <span class="meta-icon">📅</span>
                                <span class="meta-label">加入:</span>
                                <span class="meta-value">{{ formatJoinedDate(targetUser?.created_at) }}</span>
                            </div>
                        </div>

                        <div class="bio-box">
                            <p class="user-bio">个人简介：{{ targetUser?.bio || '这家伙很神秘，什么都没写。' }}</p>
                        </div>

                        <div v-if="parsedSocialLinks.length > 0" class="social-link-box">
                            <a :href="parsedSocialLinks[0]" target="_blank" class="ins-style-link">
                                <svg viewBox="0 0 24 24" class="link-icon">
                                    <path
                                        d="M3.9 12c0-1.71 1.39-3.1 3.1-3.1h4V7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1zM8 13h8v-2H8v2zm9-6h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1s-1.39 3.1-3.1 3.1h-4V17h4c2.76 0 5-2.24 5-5s-2.24-5-5-5z"
                                        fill="currentColor" />
                                </svg>
                                <span class="link-text">{{ formatLinkDisplay(parsedSocialLinks[0]) }}</span>
                            </a>

                            <div v-if="parsedSocialLinks.length > 1" class="more-links-wrapper">
                                <div class="more-btn-pill" @click.stop="showSocialDropdown = !showSocialDropdown">
                                    <span class="more-text">更多</span>
                                    <span class="more-badge">{{ parsedSocialLinks.length - 1 }}</span>
                                </div>

                                <transition name="fade-slide">
                                    <div v-if="showSocialDropdown" class="social-dropdown-menu" @click.stop>
                                        <div class="dropdown-arrow"></div>
                                        <div class="dropdown-inner">
                                            <a v-for="(link, index) in parsedSocialLinks.slice(1)" :key="index"
                                                :href="link" target="_blank" class="dropdown-link-item">
                                                <span class="link-bullet">🔗</span>
                                                <span class="link-url">{{ formatLinkDisplay(link) }}</span>
                                                <span class="link-arrow">↗</span>
                                            </a>
                                        </div>
                                    </div>
                                </transition>
                            </div>
                        </div>

                        <div v-if="isMyProfile" class="secondary-actions">
                            <button class="action-btn outline small" @click="router.push('/account')">编辑资料</button>

                            <div class="nav-settings-wrapper">
                                <button class="action-btn outline small"
                                    @click.stop="showNavSettings = !showNavSettings">
                                    ⚙️ 导航设置
                                </button>
                                <transition name="fade-slide">
                                    <div v-if="showNavSettings" class="nav-settings-dropdown" @click.stop>
                                        <div class="dropdown-header"><span>导航菜单管理</span><span
                                                class="sub-hint">点击箭头调整顺序</span></div>
                                        <div class="setting-list">
                                            <div v-for="(item, index) in navMenuConfig" :key="item.id"
                                                class="setting-item">
                                                <div class="item-drag-icon">☰</div>
                                                <span class="item-name">{{ item.name }}</span>
                                                <div class="item-ops">
                                                    <span @click="toggleNavVisibility(item)" class="op-btn">{{
                                                        item.visible ? '👁️'
                                                            : '🚫' }}</span>
                                                    <span @click="moveTab(index, -1)" class="op-btn"
                                                        v-if="index !== 0">↑</span>
                                                    <span @click="moveTab(index, 1)" class="op-btn"
                                                        v-if="index !== navMenuConfig.length - 1">↓</span>
                                                </div>
                                            </div>
                                        </div>
                                        <button class="confirm-nav-btn" @click="saveNavSettings">完成并同步</button>
                                    </div>
                                </transition>
                            </div>
                        </div>
                    </div>

                    <div class="header-actions">
                        <template v-if="isMyProfile">
                            <button class="action-btn primary" @click="router.push('/creation-center')">✨ 创作中心</button>
                            <button class="action-btn outline" @click="router.push('/account')">编辑资料</button>
                            <div class="nav-settings-wrapper">
                                <button class="action-btn outline" @click.stop="showNavSettings = !showNavSettings">⚙️
                                    导航设置</button>
                                <transition name="fade-slide">
                                    <div v-if="showNavSettings" class="nav-settings-dropdown" @click.stop>
                                        <div class="dropdown-header"><span>导航菜单管理</span><span
                                                class="sub-hint">点击箭头调整顺序</span></div>
                                        <div class="setting-list">
                                            <div v-for="(item, index) in navMenuConfig" :key="item.id"
                                                class="setting-item">
                                                <div class="item-drag-icon">☰</div>
                                                <span class="item-name">{{ item.name }}</span>
                                                <div class="item-ops">
                                                    <span @click="toggleNavVisibility(item)" class="op-btn">{{
                                                        item.visible ? '👁️' : '🚫' }}</span>
                                                    <span @click="moveTab(index, -1)" class="op-btn"
                                                        v-if="index !== 0">↑</span>
                                                    <span @click="moveTab(index, 1)" class="op-btn"
                                                        v-if="index !== navMenuConfig.length - 1">↓</span>
                                                </div>
                                            </div>
                                        </div>
                                        <button class="confirm-nav-btn" @click="saveNavSettings">完成并同步</button>
                                    </div>
                                </transition>
                            </div>
                        </template>
                        <button v-else class="action-btn" :class="isFollowing ? 'outline' : 'primary'"
                            @click="handleFollowAction">
                            {{ isFollowing ? '已关注' : '+ 关注' }}
                        </button>
                    </div>
                </div>
            </div>
        </header>

        <main class="profile-layout" v-if="targetUser">
            <aside class="side-info">
                <div class="side-card achievement-card">
                    <h3 class="card-title-sm">个人成就</h3>
                    <div class="achieve-list">
                        <div class="achieve-item"><span class="icon">👍</span> 获得 {{ targetUser?.stats?.totalLikes || 0
                            }} 次点赞
                        </div>
                        <div class="achieve-item"><span class="icon">⭐</span> 内容被收藏 {{ targetUser?.stats?.totalFavorites
                            || 0 }}
                            次</div>
                        <div class="achieve-item"><span class="icon">💬</span> 内容获得 {{ targetUser?.stats?.totalComments
                            || 0 }}
                            次评论</div>
                        <div class="achieve-item"><span class="icon">🔥</span> 作品获得 {{ targetUser?.stats?.totalViews ||
                            0 }} 次浏览
                        </div>
                    </div>
                </div>
            </aside>

            <section class="main-content">
                <nav class="content-tabs">
                    <div v-for="tab in visibleNavItems" :key="tab.id" class="tab-link"
                        :class="{ active: activeTab === tab.id }" @click="activeTab = tab.id">
                        {{ tab.name }}
                    </div>
                    <div class="tab-search">
                        <input type="text" v-model="profileSearchQuery" placeholder="搜索我的动态...">
                    </div>
                </nav>

                <div class="content-body">
                    <template v-if="activeTab === 'columns'">
                        <div class="column-grid">
                            <div v-if="isMyProfile" class="column-card create-trigger"
                                @click="showCreateColumnModal = true">
                                <div class="create-inner"><span class="plus-icon">+</span>
                                    <p>新建专栏文件夹</p>
                                </div>
                            </div>
                            <div v-for="col in filteredList" :key="col.id" class="column-card"
                                @click="router.push(`/column/${col.id}`)">
                                <button v-if="isMyProfile" class="delete-column-btn"
                                    @click.stop="handleDeleteColumn(col)"><span>×</span></button>
                                <div class="column-cover"><img :src="getProxyUrl(col.cover)" alt="cover"><span
                                        class="count-badge">{{ col.articleCount || 0 }} 篇</span></div>
                                <div class="column-info">
                                    <h4 class="column-title">{{ col.name }}</h4>
                                    <p class="column-desc">{{ col.description || '这个专栏还没有描述~' }}</p>
                                </div>
                            </div>
                        </div>
                    </template>

                    <template v-else>
                        <div class="article-list-v2">
                            <ArticleItem v-for="(article, index) in displayedList"
                                :key="activeTab + '_' + article.id + '_' + article.work_type + '_' + index"
                                :data="article"
                                @click="router.push({ path: `/article/${article.id}`, query: { type: article.work_type } })">

                                <template #extra v-if="activeTab === 'history'">
                                    <span class="visit-time-tag">
                                        🕒 访问于: {{ new Date(article.history_time).toLocaleString() }}
                                    </span>
                                </template>
                            </ArticleItem>

                            <div v-if="displayedList.length === 0 && !pagination[activeTab]?.loading"
                                class="empty-hint">
                                <div class="empty-card">
                                    <div class="empty-icon">📖</div>
                                    <p class="hint-text">暂无相关内容～</p>
                                    <p class="sub-text">
                                        <template v-if="profileSearchQuery.trim()">
                                            试试换个关键词搜索吧
                                        </template>
                                        <template v-else-if="activeTab === 'posts'">
                                            这里会展示你的精作品哦
                                        </template>
                                        <template v-else-if="activeTab === 'likes'">
                                            收藏的内容会出现在这里
                                        </template>
                                        <template v-else-if="activeTab === 'history'">
                                            最近访问的足迹会记录在这里
                                        </template>
                                        <template v-else-if="activeTab === 'columns'">
                                            创建专栏后会显示在这里
                                        </template>
                                        <template v-else>
                                            内容会慢慢充实起来的
                                        </template>
                                    </p>
                                    <div class="decor-line"></div>
                                </div>
                            </div>

                            <div v-if="showLoadMoreBtn || pagination[activeTab]?.loading" class="load-more-container">
                                <button class="load-more-btn" :class="{ loading: pagination[activeTab]?.loading }"
                                    @click.stop="handleLoadMore($event)">

                                    <span v-if="pagination[activeTab]?.loading" class="loader"></span>

                                    <template v-if="profileSearchQuery.trim()">
                                        显示剩余的 {{ filteredList.length - displayedList.length }} 项搜索结果
                                    </template>
                                    <template v-else>
                                        {{ pagination[activeTab]?.loading ? '正在加载...' : '加载更多' }}
                                    </template>
                                </button>
                            </div>

                            <div v-if="!showLoadMoreBtn && displayedList.length > 0 && !pagination[activeTab]?.loading"
                                class="no-more-hint">
                                <div class="no-more-card">
                                    <div class="plant-icon">🌱</div>
                                    <p class="hint-text">到底啦～</p>
                                    <p class="sub-text">没有更多内容了，欢迎探索其他精彩</p>
                                    <div class="decor-line"></div>
                                </div>
                            </div>
                        </div>
                    </template>
                </div>
            </section>
        </main>

        <Transition name="fade-slide">
            <div v-if="showCreateColumnModal" class="column-modal-overlay" @click="showCreateColumnModal = false">
                <div class="column-modal art-modal" @click.stop>

                    <div class="art-modal-header">
                        <span class="decoration-line"></span>
                        <h3>新建藏书阁</h3>
                        <span class="decoration-line"></span>
                        <button class="art-close-btn" @click="showCreateColumnModal = false">✕</button>
                    </div>

                    <div class="art-modal-body">
                        <div class="art-create-form animate__animated animate__fadeIn">
                            <div class="input-group">
                                <input v-model="newColumnForm.name" type="text" class="art-input" placeholder=" "
                                    autofocus>
                                <label>给新文件夹起个名字</label>
                                <span class="input-underline"></span>
                            </div>

                            <div class="input-group">
                                <textarea v-model="newColumnForm.description" class="art-input textarea" placeholder=" "
                                    rows="3"></textarea>
                                <label>写一段简介（选填）...</label>
                                <span class="input-underline"></span>
                            </div>

                            <div class="art-form-ops">
                                <button class="art-btn-text" @click="showCreateColumnModal = false">取消</button>
                                <button class="art-btn-primary" @click="handleCreateColumn">
                                    确认建造
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </Transition>
    </div>
</template>

<style scoped>
/* ==================== 全局通用样式 (PC优先) ==================== */
.profile-page {
    background: #f4f6f8;
    min-height: 100vh;
    padding-bottom: 50px;
}

/* --- Header 区域 --- */
.profile-header-flat {
    background: #fff;
    box-shadow: 0 2px 10px rgba(0, 0, 0, 0.05);
    margin-bottom: 20px;
}

.banner-box {
    height: 180px;
    overflow: hidden;
    position: relative;
}

.banner-img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    transition: filter 0.5s ease;
}

.banner-img.loading-blur {
    filter: blur(5px);
}

.banner-tag {
    position: absolute;
    bottom: 10px;
    right: 20px;
    color: white;
    background: rgba(0, 0, 0, 0.3);
    padding: 4px 10px;
    border-radius: 4px;
    font-size: 12px;
    cursor: pointer;
    backdrop-filter: blur(4px);
}

/* --- 用户信息区域 --- */
.header-info-container {
    max-width: 1200px;
    margin: 0 auto;
    padding: 0 20px;
    position: relative;
    top: -50px;
}

.info-content-main {
    display: flex;
    align-items: flex-start;
    gap: 24px;
}

.avatar-box {
    width: 120px;
    height: 120px;
    border-radius: 20px;
    border: 5px solid #fff;
    background: #fff;
    overflow: hidden;
    flex-shrink: 0;
    box-shadow: 0 8px 25px rgba(0, 0, 0, 0.15);
}

.avatar-img {
    width: 100%;
    height: 100%;
    object-fit: cover;
}

.user-detail {
    flex: 1;
    padding-top: 60px;
}

.name-row {
    display: flex;
    align-items: center;
    gap: 15px;
    margin-bottom: 12px;
}

.nickname {
    font-size: 26px;
    font-weight: 800;
    color: #1a1a1a;
    margin: 0;
}

.user-badge {
    font-size: 11px;
    color: #3b82f6;
    background: rgba(59, 130, 246, 0.08);
    padding: 3px 12px;
    border-radius: 50px;
    font-weight: 600;
    white-space: nowrap;
    border: 1px solid rgba(59, 130, 246, 0.2);
}

/* --- 🔥 核心布局修正：统计与按钮行 --- */
.stats-action-row {
    display: flex;
    align-items: center;
    /* PC端默认不用两端对齐，因为右边的按钮PC端是隐藏的 */
    margin-bottom: 15px;
    color: #555;
    font-size: 14px;
}

.stats-group {
    display: flex;
    gap: 25px;
}

.top-stat b {
    color: #000;
    font-size: 18px;
    font-family: "Georgia", serif;
}

.top-stat.clickable {
    cursor: pointer;
    transition: color 0.2s;
}

.top-stat.clickable:hover,
.top-stat.clickable:hover b {
    color: #42b883;
}

/* --- 🔥 关键点：PC端强制隐藏这三个移动端专用按钮 --- */
.mini-create-btn,
.mini-follow-btn,
.secondary-actions {
    display: none !important;
    /* PC端不显示！ */
}

/* --- 用户元信息 --- */
.user-meta-row {
    display: flex;
    align-items: center;
    gap: 16px;
    margin-bottom: 15px;
    font-size: 13px;
    color: #8a919f;
}

.meta-value {
    color: #515767;
    font-weight: 500;
}

.meta-divider {
    width: 1px;
    height: 12px;
    background-color: #e5e6eb;
}

.bio-box {
    background: #f9f9f9;
    padding: 10px 15px;
    border-radius: 8px;
    border-left: 3px solid #eee;
}

.user-bio {
    font-size: 13.5px;
    color: #666;
    margin: 0;
    line-height: 1.6;
}

/* --- PC端右侧大按钮组 --- */
.header-actions {
    display: flex;
    gap: 12px;
    padding-top: 65px;
}

/* 按钮通用样式 */
.action-btn {
    padding: 8px 22px;
    border-radius: 50px;
    font-size: 13.5px;
    font-weight: 600;
    cursor: pointer;
    transition: 0.3s;
    white-space: nowrap;
}

.action-btn.outline {
    background: #fff;
    border: 1px solid #e0e0e0;
    color: #555;
}

.action-btn.primary {
    background: linear-gradient(135deg, #42b883 0%, #34a853 100%);
    color: white;
    border: none;
    box-shadow: 0 4px 15px rgba(66, 184, 131, 0.3);
}

/* --- 内容区域 --- */
.profile-layout {
    max-width: 1200px;
    margin: 0 auto;
    padding: 0 20px;
    display: grid;
    grid-template-columns: 300px 1fr;
    gap: 20px;
}

.side-card {
    background: #fff;
    border-radius: 12px;
    padding: 22px;
    box-shadow: 0 2px 10px rgba(0, 0, 0, 0.02);
}

.card-title-sm {
    font-size: 16px;
    font-weight: 700;
    margin-bottom: 18px;
    position: relative;
    padding-left: 12px;
}

.card-title-sm::before {
    content: '';
    position: absolute;
    left: 0;
    top: 4px;
    height: 14px;
    width: 4px;
    background: #42b883;
    border-radius: 2px;
}

.achieve-list {
    display: flex;
    flex-direction: column;
    gap: 15px;
    font-size: 13.5px;
    color: #555;
}

.main-content {
    background: #fff;
    border-radius: 12px;
    overflow: hidden;
    box-shadow: 0 2px 10px rgba(0, 0, 0, 0.02);
}

/* ==================== 🔗 社交链接样式 (Instagram 风格) ==================== */
.social-link-box {
    margin-top: 12px;
    display: flex;
    align-items: center;
    gap: 8px;
    /* 第一条链接和更多按钮的间距 */
    position: relative;
    /* 为下拉菜单定位 */
}

.ins-style-link {
    max-width: 240px;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    /* 图标和文字的间距 */
    text-decoration: none;
    color: #00376b;
    /* Instagram 经典的深蓝色链接色，显得很官方 */
    font-weight: 600;
    /* 加粗一点，增加质感 */
    font-size: 14px;
    background: rgba(0, 55, 107, 0.04);
    /* 极其淡的背景，增加点击区域感 */
    padding: 4px 10px;
    border-radius: 6px;
    transition: all 0.2s ease;
}

/* 悬停效果 */
.ins-style-link:hover {
    background: rgba(0, 55, 107, 0.08);
    text-decoration: underline;
    /* 传统的链接悬停下划线，符合直觉 */
}

/* --- 更多按钮 (Pill 胶囊样式) --- */
.more-links-wrapper {
    position: relative;
}

.more-btn-pill {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 4px 10px;
    background: #f0f2f5;
    border-radius: 20px;
    cursor: pointer;
    transition: all 0.2s;
    user-select: none;
}

.more-btn-pill:hover {
    background: #e4e6eb;
}

.more-text {
    font-size: 12px;
    color: #65676b;
    font-weight: 600;
}

.more-badge {
    background: #e4e6eb;
    color: #65676b;
    font-size: 10px;
    padding: 0 5px;
    border-radius: 10px;
    height: 14px;
    line-height: 14px;
    min-width: 10px;
    text-align: center;
}

.more-btn-pill:hover .more-badge {
    background: #d8dadf;
}

/* --- 下拉菜单 (气泡风格) --- */
.social-dropdown-menu {
    position: absolute;
    top: 100%;

    /* 🔥 核心：水平居中对齐 */
    left: 50%;
    transform: translateX(-50%);
    /* 向左回退 50%，实现居中 */

    margin-top: 12px;
    background: #fff;
    border-radius: 12px;
    box-shadow: 0 10px 40px rgba(0, 0, 0, 0.15);
    border: 1px solid rgba(0, 0, 0, 0.05);
    width: 240px;
    /* 稍微窄一点，适应手机 */
    z-index: 1000;
    padding: 8px;
}

/* 小三角 (水平居中) */
.dropdown-arrow {
    position: absolute;
    top: -6px;

    /* 🔥 三角也居中 */
    left: 50%;
    margin-left: -6px;
    /* 修正自身宽度的一半 */

    width: 12px;
    height: 12px;
    background: #fff;
    transform: rotate(45deg);
    border-top: 1px solid rgba(0, 0, 0, 0.05);
    border-left: 1px solid rgba(0, 0, 0, 0.05);
}

.dropdown-inner {
    position: relative;
    /* 盖住小三角的下半部分 */
    background: #fff;
    border-radius: 8px;
    z-index: 2;
    max-height: 200px;
    overflow-y: auto;
}

.dropdown-link-item {
    display: flex;
    align-items: center;
    padding: 10px 12px;
    text-decoration: none;
    border-radius: 8px;
    transition: background 0.2s;
    color: #1c1e21;
}

.dropdown-link-item:hover {
    background: #f7f8fa;
}

.link-bullet {
    margin-right: 10px;
    font-size: 14px;
}

.link-url {
    flex: 1;
    font-size: 13px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    font-weight: 500;
}

.link-arrow {
    font-size: 12px;
    color: #bcc0c4;
    margin-left: 8px;
}

/* 动画 */
.fade-slide-enter-active,
.fade-slide-leave-active {
    transition: all 0.2s ease;
}

.fade-slide-enter-from,
.fade-slide-leave-to {
    opacity: 0;
    transform: translateX(-50%) translateY(-10px);
}

/* 链接图标 */
.link-icon {
    width: 16px;
    height: 16px;
    color: #00376b;
    /* 图标颜色与文字一致 */
    opacity: 0.8;
    transform: rotate(-45deg);
    /* 让链条图标稍微斜一点，更有设计感 */
}

.link-text {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 280px;
    /* 防止链接太长撑破布局 */
}

/* ==================== 📱 移动端微调 ==================== */
@media (max-width: 900px) {
    .social-link-box {
        flex-wrap: wrap;
        margin-top: 10px;
        width: 100%;
       /* 允许换行，防止挤压 */
        position: relative;
    }

    .more-links-wrapper {
        position: relative !important;
    }

    .social-dropdown-menu {
        /* 🔥 核心策略：右对齐 (Anchor Right) */
        /* 让菜单的右边，对齐按钮的右边，这样菜单就会向左延伸，利用左侧空间 */
        left: auto;
        right: 0; 
        
        /* 取消之前的居中或左偏移 */
        transform: none;
        
        margin-top: 10px;
        width: 260px;
        max-width: 85vw; /* 防止屏幕太窄时撑破 */
        transform-origin: top right; /* 动画从右上角展开，更自然 */
    }

    .dropdown-arrow {
        /* 🔥 三角定位：也改为从右边计算 */
        left: auto;
        
        /* 按钮宽度大约 60-65px，中心点大约在右侧 30px 左右 */
        /* 这里的数值用于微调三角位置，使其对准按钮中心 */
        right: 26px; 
        
        margin-left: 0;
        
        border-top: 1px solid rgba(0, 0, 0, 0.05);
        border-left: 1px solid rgba(0, 0, 0, 0.05);
    }

    /* 动画适配 */
    .fade-slide-enter-from,
    .fade-slide-leave-to {
        transform: translateY(-10px);
    }

    .ins-style-link {
        font-size: 13.5px;
        padding: 4px 0;
        /* 手机端为了左对齐，去掉左padding，贴着边 */
        background: transparent;
        /* 手机端去掉背景色，更像原生 App */
    }

    .link-icon {
        width: 15px;
        height: 15px;
    }
}

/* 标签页导航 */
.content-tabs {
    display: flex;
    align-items: center;
    border-bottom: 1px solid #f0f0f0;
    padding: 0 20px;
    height: 55px;
}

.tab-link {
    padding: 0 20px;
    height: 100%;
    display: flex;
    align-items: center;
    cursor: pointer;
    color: #666;
    font-weight: 500;
    position: relative;
}

.tab-link.active {
    color: #1a1a1a;
    font-weight: 700;
}

.tab-link.active::after {
    content: '';
    position: absolute;
    bottom: 0;
    left: 20%;
    width: 60%;
    height: 3px;
    background: #42b883;
    border-radius: 3px 3px 0 0;
}

.tab-search {
    margin-left: auto;
}

.tab-search input {
    padding: 8px 16px;
    border-radius: 20px;
    border: 1px solid #eee;
    background: #f9f9f9;
    font-size: 13px;
    width: 160px;
}

/* 列表容器 */
.content-body {
    min-height: 300px;
}

.column-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    gap: 20px;
    padding: 20px;
}

.column-card {
    background: #fff;
    border: 1px solid #eee;
    border-radius: 12px;
    overflow: hidden;
    cursor: pointer;
    transition: transform 0.2s;
    position: relative;
}

.column-cover {
    height: 140px;
    position: relative;
}

.column-cover img {
    width: 100%;
    height: 100%;
    object-fit: cover;
}

.count-badge {
    position: absolute;
    right: 10px;
    bottom: 10px;
    background: rgba(0, 0, 0, 0.6);
    color: #fff;
    padding: 2px 8px;
    border-radius: 4px;
    font-size: 12px;
}

.column-info {
    padding: 15px;
}

.column-title {
    font-size: 16px;
    font-weight: 700;
    margin: 0 0 5px 0;
}

.column-desc {
    font-size: 13px;
    color: #888;
}

.create-trigger {
    border: 2px dashed #e0e0e0 !important;
    background: #fafafa !important;
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 200px;
}

.plus-icon {
    font-size: 40px;
    color: #ccc;
    display: block;
    text-align: center;
}

.delete-column-btn {
    position: absolute;
    top: 10px;
    right: 10px;
    width: 24px;
    height: 24px;
    background: rgba(0, 0, 0, 0.5);
    color: #fff;
    border: none;
    border-radius: 50%;
    cursor: pointer;
    z-index: 10;
}

/* 导航设置下拉 */
.nav-settings-wrapper {
    position: relative;
}

.nav-settings-dropdown {
    position: absolute;
    top: 100%;
    right: 0;
    /* PC端靠右，手机端后面会覆盖为靠左 */
    width: 240px;
    background: #fff;
    border: 1px solid #eee;
    border-radius: 8px;
    padding: 15px;
    box-shadow: 0 5px 20px rgba(0, 0, 0, 0.1);
    z-index: 100;
    margin-top: 5px;
}

.setting-item {
    display: flex;
    align-items: center;
    padding: 8px 0;
    border-bottom: 1px solid #f9f9f9;
}

.item-name {
    flex: 1;
    font-size: 14px;
    margin-left: 10px;
}

.item-ops span {
    cursor: pointer;
    margin-left: 8px;
    font-size: 16px;
}

.confirm-nav-btn {
    width: 100%;
    margin-top: 10px;
    padding: 8px;
    background: #42b883;
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
}

/* Load More */
.load-more-container {
    padding: 20px;
    text-align: center;
}

.load-more-btn {
    padding: 8px 24px;
    border-radius: 20px;
    background: #fff;
    border: 1px solid #eee;
    color: #666;
    cursor: pointer;
}

.no-more-text {
    font-size: 13px;
    color: #ccc;
}

/* ==================== 📱 移动端专属适配 (Mobile Only) ==================== */
@media (max-width: 900px) {

    /* 1. 页面容器 */
    .profile-page {
        background: #fff;
        padding-bottom: 120px;
    }

    /* 2. Banner与头像 */
    .banner-box {
        height: 140px;
    }

    .header-info-container {
        top: -40px;
        padding: 0 15px;
    }

    .info-content-main {
        flex-direction: column;
        align-items: flex-start;
        gap: 15px;
    }

    .avatar-box {
        width: 85px;
        height: 85px;
        border-width: 3px;
    }

    /* 3. 用户信息 */
    .user-detail {
        padding-top: 0;
        width: 100%;
    }

    .name-row {
        flex-wrap: wrap;
        margin-bottom: 15px;
    }

    .nickname {
        font-size: 22px;
    }

    /* 4. 🔥 核心：显示移动端按钮，隐藏PC端按钮 */
    .header-actions {
        display: none !important;
        /* 隐藏PC端右侧大按钮组 */
    }

    /* 4.1 统计数据行 + 创作按钮 */
    .stats-action-row {
        display: flex !important;
        justify-content: space-between;
        /* 左右排布 */
        padding-bottom: 15px;
        border-bottom: 1px solid #f5f5f5;
        margin-bottom: 15px;
    }

    .stats-group {
        gap: 15px;
        font-size: 13px;
    }

    .mini-create-btn {
        display: block !important;
        /* 显示创作按钮 */
        background: linear-gradient(135deg, #42b883 0%, #34a853 100%);
        color: white;
        border: none;
        padding: 8px 20px;
        border-radius: 20px;
        font-size: 13px;
        font-weight: 600;
        box-shadow: 0 4px 10px rgba(66, 184, 131, 0.3);
    }

    .mini-follow-btn {
        display: block !important;
    }

    /* 4.2 次级操作区 (编辑资料 + 导航设置) */
    .secondary-actions {
        display: flex !important;
        gap: 12px;
        margin-top: 15px;
        justify-content: flex-start;
    }

    .action-btn.small {
        padding: 6px 16px;
        font-size: 12px;
        height: 32px;
        border-radius: 4px;
        /* 稍微方一点 */
    }

    .nav-settings-dropdown {
        left: 0;
        /* 手机端下拉框靠左 */
        right: auto;
        width: 260px;
    }

    /* 5. 个人成就 (横向滚动) */
    .profile-layout {
        display: block;
        /* 取消Grid */
        padding: 0;
        margin-top: 20px;
    }

    .side-info {
        padding: 0 15px;
        margin-bottom: 10px;
    }

    .side-card {
        padding: 15px;
        border: 1px solid #f0f0f0;
        box-shadow: none;
    }

    .achieve-list {
        flex-direction: row;
        overflow-x: auto;
        white-space: nowrap;
        scrollbar-width: none;
        padding-bottom: 5px;
    }

    .achieve-item {
        background: #f9f9f9;
        padding: 6px 12px;
        border-radius: 20px;
        font-size: 12px;
    }

    /* 6. 内容列表 */
    .main-content {
        box-shadow: none;
        border-radius: 0;
        border-top: 10px solid #f4f6f8;
    }

    .content-tabs {
        overflow-x: auto;
        white-space: nowrap;
        scrollbar-width: none;
        padding: 0 10px;
    }

    .tab-search {
        display: none;
        /* 手机端隐藏搜索框 */
    }

    .article-list-v2 {
        padding: 10px 15px;
    }

    /* 专栏单列 */
    .column-grid {
        grid-template-columns: 1fr;
        padding: 15px;
    }

    .column-card {
        display: flex;
        height: 100px;
    }

    .column-cover {
        width: 110px;
        height: 100%;
    }

    .create-trigger {
        min-height: 80px;
    }
}

/* ==================== 🏛️ 文艺时尚风弹窗 (Art Modal - Profile版) ==================== */

/* 1. 遮罩层：深色毛玻璃，聚焦视线 */
.column-modal-overlay {
    position: fixed;
    top: 0;
    left: 0;
    width: 100vw;
    height: 100vh;
    background: rgba(44, 30, 20, 0.6);
    /* 深棕色半透明 */
    backdrop-filter: blur(6px);
    z-index: 3000;
    display: flex;
    justify-content: center;
    align-items: center;
    padding: 20px;
}

/* 2. 弹窗主体：羊皮纸质感 */
.art-modal {
    width: 100%;
    max-width: 400px;
    /* 稍微宽一点 */
    background-color: #fdfbf7;
    /* 暖白色/羊皮纸色 */
    border-radius: 12px;
    box-shadow: 0 20px 50px rgba(0, 0, 0, 0.2), 0 0 0 1px rgba(139, 90, 43, 0.1);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    position: relative;
    /* 增加噪点纹理 */
    background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)' opacity='0.05'/%3E%3C/svg%3E");
}

/* 3. 头部设计 */
.art-modal-header {
    padding: 25px 20px 15px;
    display: flex;
    align-items: center;
    justify-content: center;
    position: relative;
}

.art-modal-header h3 {
    margin: 0 15px;
    font-family: "Georgia", "Songti SC", serif;
    font-size: 1.2rem;
    color: #5c4033;
    font-weight: 700;
    letter-spacing: 1px;
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
    transition: color 0.3s;
}

.art-close-btn:hover {
    color: #8b5a2b;
}

.art-modal-body {
    padding: 10px 30px 35px;
    /* 底部留白稍微多一点 */
}

/* 4. 输入框组：Material 风格动态下划线 */
.input-group {
    position: relative;
    margin-bottom: 30px;
    /* 间距拉大一点 */
    padding-top: 10px;
}

.art-input {
    width: 100%;
    border: none;
    background: transparent;
    padding: 8px 0;
    font-size: 1rem;
    color: #2c1e0f;
    font-family: inherit;
    outline: none;
    border-bottom: 1px solid #d4c5b0;
    transition: border-color 0.3s;
}

.art-input.textarea {
    resize: none;
    line-height: 1.6;
}

/* 浮动 Label 效果 */
.input-group label {
    position: absolute;
    top: 18px;
    left: 0;
    color: #999;
    font-size: 0.95rem;
    transition: all 0.3s ease;
    pointer-events: none;
}

/* 输入框获得焦点或有内容时，Label 上浮 */
.art-input:focus~label,
.art-input:not(:placeholder-shown)~label {
    top: -5px;
    font-size: 0.75rem;
    color: #8b5a2b;
}

/* 底部线条动画 */
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

/* 5. 表单按钮 */
.art-form-ops {
    display: flex;
    justify-content: flex-end;
    gap: 20px;
    margin-top: 15px;
    align-items: center;
}

.art-btn-text {
    background: none;
    border: none;
    color: #888;
    cursor: pointer;
    font-size: 0.9rem;
    transition: color 0.2s;
}

.art-btn-text:hover {
    color: #555;
}

.art-btn-primary {
    background: #2c1e0f;
    /* 深咖啡色 */
    color: #f7f1e3;
    border: none;
    padding: 10px 28px;
    border-radius: 4px;
    font-size: 0.9rem;
    font-family: serif;
    letter-spacing: 1px;
    cursor: pointer;
    transition: all 0.3s;
    box-shadow: 0 4px 10px rgba(44, 30, 20, 0.2);
}

.art-btn-primary:hover {
    background: #4a3b2a;
    transform: translateY(-1px);
    box-shadow: 0 6px 15px rgba(44, 30, 20, 0.3);
}

/* 动画过渡 */
.fade-slide-enter-active,
.fade-slide-leave-active {
    transition: all 0.3s ease;
}

.fade-slide-enter-from,
.fade-slide-leave-to {
    opacity: 0;
    transform: translateY(10px);
}

/* ==================== 🛠️ 核心交互修复 (解决按钮点不动的问题) ==================== */

/* 1. 让覆盖在 Banner 上的透明容器“允许穿透点击” */
.header-info-container {
    /* 关键属性：让鼠标/手指点击穿过这个透明层，点到下面的 Banner 按钮 */
    pointer-events: none;
}

/* 2. 但容器里面的内容（头像、文字）必须“恢复点击” */
.info-content-main {
    /* 恢复子元素的交互能力，否则头像和按钮都点不动了 */
    pointer-events: auto;
}

/* ==================== 📱 移动端细节微调 (按钮瘦身) ==================== */
@media (max-width: 600px) {

    /* 3. 针对手机端：缩小“更换背景”按钮 */
    .banner-tag {
        /* 缩小字号 */
        font-size: 10px !important;

        /* 缩小内边距 (瘦身) */
        padding: 4px 10px !important;

        /* 调整位置，紧贴右下角，避免碰到中间的头像 */
        bottom: 10px !important;
        right: 10px !important;

        /* 稍微加深背景色，增加对比度 */
        background: rgba(0, 0, 0, 0.6) !important;

        /* 确保层级最高，防止意外遮挡 */
        z-index: 10;
    }
}

/* ==================== 美观的“已到底”提示 ==================== */
.no-more-hint {
    padding: 40px 20px;
    text-align: center;
}

.no-more-card {
    display: inline-flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
    padding: 24px 32px;
    background: linear-gradient(135deg, #f8fdf6 0%, #f0faf5 100%);
    border-radius: 20px;
    border: 1px solid #e8f5e9;
    box-shadow: 0 8px 25px rgba(120, 190, 140, 0.08);
    max-width: 320px;
    margin: 0 auto;
}

.plant-icon {
    font-size: 36px;
    filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.05));
}

.hint-text {
    font-size: 16px;
    font-weight: 600;
    color: #2d6a4f;
    margin: 0;
    letter-spacing: 0.5px;
}

.sub-text {
    font-size: 13px;
    color: #5a9a7a;
    margin: 0;
    line-height: 1.5;
}

.decor-line {
    width: 60px;
    height: 2px;
    background: linear-gradient(90deg, transparent, #95d5b2, transparent);
    border-radius: 1px;
    margin-top: 8px;
}

/* 移动端微调 */
@media (max-width: 900px) {
    .no-more-hint {
        padding: 30px 15px;
    }

    .no-more-card {
        padding: 20px 28px;
        border-radius: 16px;
    }

    .plant-icon {
        font-size: 32px;
    }

    .hint-text {
        font-size: 15px;
    }
}

/* ==================== 美观的“暂无内容”空状态提示 ==================== */
.empty-hint {
    padding: 60px 20px;
    text-align: center;
}

.empty-card {
    display: inline-flex;
    flex-direction: column;
    align-items: center;
    gap: 14px;
    padding: 32px 40px;
    background: linear-gradient(135deg, #f8fdf6 0%, #f0faf8 100%);
    border-radius: 24px;
    border: 1px solid #e8f5ef;
    box-shadow: 0 10px 30px rgba(120, 190, 140, 0.1);
    max-width: 360px;
    margin: 0 auto;
}

.empty-icon {
    font-size: 48px;
    filter: drop-shadow(0 3px 6px rgba(0, 0, 0, 0.06));
}

.hint-text {
    font-size: 17px;
    font-weight: 600;
    color: #2d6a4f;
    margin: 0;
    letter-spacing: 0.8px;
}

.sub-text {
    font-size: 14px;
    color: #5a9a7a;
    margin: 0;
    line-height: 1.6;
    max-width: 260px;
}

.decor-line {
    width: 80px;
    height: 2px;
    background: linear-gradient(90deg, transparent, #95d5b2, transparent);
    border-radius: 1px;
    margin-top: 10px;
}

/* 移动端适配 */
@media (max-width: 900px) {
    .empty-hint {
        padding: 50px 15px;
    }

    .empty-card {
        padding: 28px 32px;
        border-radius: 20px;
    }

    .empty-icon {
        font-size: 42px;
    }

    .hint-text {
        font-size: 16px;
    }
}
</style>