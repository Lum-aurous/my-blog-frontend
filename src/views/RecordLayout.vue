<script setup>
import { ref, watch, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { api } from '@/utils/api'
import { useUserStore } from '@/stores/user'

const route = useRoute()
const router = useRouter()
const userStore = useUserStore()

// ... (JS 逻辑完全保持不变，直接复用原代码) ...
// ==================== 1. 页面配置 ====================
const currentConfig = ref({
    title: '', subtitle: '', desc: '', banner: '', icon: '', category: ''
})
const isConfigLoading = ref(true)

// ==================== 2. 列表状态 ====================
const isLoading = ref(true)
const isLoadingMore = ref(false)
const articles = ref([])
const page = ref(1)
const hasMore = ref(true)

// ... (工具函数：formatCount, getAvatarUrl, getCoverUrl, handleAvatarError 保持不变) ...
const formatCount = (count) => {
    if (!count) return '0';
    const num = Number(count);
    if (num >= 1000) return (num / 1000).toFixed(1) + 'k';
    return num;
}
const getAvatarUrl = (url) => {
    if (!url || url === 'null' || url === 'undefined' || url.trim() === '') {
        return 'https://api.dicebear.com/7.x/avataaars/svg?seed=Felix';
    }
    if (url.startsWith('http') || url.startsWith('data:')) return url;
    const isDev = import.meta.env.VITE_APP_ENV === 'development';
    const apiBase = isDev ? 'http://localhost:3000' : window.location.origin;
    const cleanPath = url.startsWith('/') ? url : `/${url}`;
    return `${apiBase}${cleanPath}`;
}
const getCoverUrl = (url) => {
    if (!url || url === 'null' || url === 'undefined' || url === '') return null;
    return getAvatarUrl(url);
}
const handleAvatarError = (e) => {
    if (e.target.src !== 'https://api.dicebear.com/7.x/avataaars/svg?seed=Felix') {
        e.target.src = 'https://api.dicebear.com/7.x/avataaars/svg?seed=Felix';
    }
}

// ... (fetchPageConfig, fetchData, fetchInteractionStatus 保持不变) ...
const fetchPageConfig = async (type) => {
    isConfigLoading.value = true
    articles.value = []
    page.value = 1
    hasMore.value = true
    try {
        const res = await api.get(`/page-config/record_${type}`)
        if (res.data.success) {
            currentConfig.value = res.data.data
            document.title = `${currentConfig.value.title} - Veritas`
            fetchData()
        }
    } catch (err) {
        currentConfig.value = {
            title: '记录', subtitle: 'Record', desc: '加载中...',
            banner: 'https://images.unsplash.com/photo-1496345962527-29157319e487',
            icon: '📂', category: ''
        }
        isLoading.value = false
        isConfigLoading.value = false
    }
}

const fetchData = async (isLoadMore = false) => {
    if (isLoadMore) isLoadingMore.value = true
    else isLoading.value = true
    try {
        const res = await api.get('/articles', {
            params: {
                category: currentConfig.value.category,
                page: page.value,
                limit: 12
            }
        })
        if (res.data.success) {
            const list = res.data.data.list
            list.forEach(item => {
                item.views = Number(item.views || 0)
                item.likes = Number(item.likes || 0)
                item.favorites = Number(item.favorites || 0)
                item.comments = Number(item.comments || 0)
                item.isLiked = false
                item.isFavorited = false
            })
            if (userStore.isLoggedIn && list.length > 0) {
                await fetchInteractionStatus(list)
            }
            if (isLoadMore) articles.value.push(...list)
            else articles.value = list
            hasMore.value = list.length >= 12
        }
    } catch (err) {
        console.error(err)
    } finally {
        isLoading.value = false
        isLoadingMore.value = false
        isConfigLoading.value = false
    }
}

const fetchInteractionStatus = async (list) => {
    try {
        const promises = list.map(item =>
            api.get(`/articles/${item.id}/interaction-status`, {
                params: { type: item.work_type || 'article' }
            }).catch(() => ({ data: { success: false } }))
        )
        const results = await Promise.all(promises)
        results.forEach((res, index) => {
            if (res.data && res.data.success) {
                const data = res.data.data
                articles.value[index].isLiked = data.isLiked
                articles.value[index].isFavorited = data.isFavorited
                if (data.likeCount !== undefined) articles.value[index].likes = data.likeCount
            }
        })
    } catch (e) { console.error(e) }
}

// ... (handleLike, handleFavorite, loadMore, goToDetail, goToProfile, watch 保持不变) ...
const handleLike = async (item, event) => {
    event.stopPropagation()
    if (!userStore.isLoggedIn) return router.push('/login')
    const oldState = item.isLiked
    const oldCount = item.likes
    item.isLiked = !item.isLiked
    item.likes += item.isLiked ? 1 : -1
    try {
        const res = await api.post(`/articles/${item.id}/like`, { type: item.work_type || 'article' })
        if (!res.data.success) {
            item.isLiked = oldState
            item.likes = oldCount
        }
    } catch (e) {
        item.isLiked = oldState
        item.likes = oldCount
    }
}

const handleFavorite = async (item, event) => {
    event.stopPropagation()
    if (!userStore.isLoggedIn) return router.push('/login')
    const oldState = item.isFavorited
    const oldCount = item.favorites
    item.isFavorited = !item.isFavorited
    item.favorites += item.isFavorited ? 1 : -1
    try {
        const res = await api.post(`/articles/${item.id}/favorite`, { type: item.work_type || 'article' })
        if (!res.data.success) {
            item.isFavorited = oldState
            item.favorites = oldCount
        }
    } catch (e) {
        item.isFavorited = oldState
        item.favorites = oldCount
    }
}

const loadMore = () => {
    if (!hasMore.value || isLoadingMore.value) return
    page.value++
    fetchData(true)
}

const goToDetail = (id) => {
    router.push(`/article/${id}`)
}

const goToProfile = (username) => {
    if (username) router.push(`/profile/${username}`)
}

watch(() => route.params.type, (newType) => {
    if (newType) fetchPageConfig(newType)
}, { immediate: true })
</script>

<template>
    <div class="record-page">
        <header class="record-hero"
            :style="{ backgroundImage: currentConfig.banner ? `url(${currentConfig.banner})` : '' }">
            <div class="hero-mask"></div>
            <div v-if="isConfigLoading" class="hero-content-loading animate__animated animate__fadeIn">
                <div class="skeleton-icon"></div>
                <div class="skeleton-title"></div>
                <div class="skeleton-text"></div>
            </div>
            <div v-else class="hero-content animate__animated animate__fadeInUp">
                <div class="category-icon">{{ currentConfig.icon }}</div>
                <h1 class="hero-title">{{ currentConfig.title }}</h1>
                <h2 class="hero-subtitle">{{ currentConfig.subtitle }}</h2>
                <p class="hero-desc">{{ currentConfig.desc }}</p>
            </div>
        </header>

        <main class="record-container">
            <div v-if="isLoading && page === 1" class="loading-box">
                <div class="spinner"></div>
            </div>

            <div v-else-if="articles.length > 0" class="article-grid animate__animated animate__fadeInUp">
                <div v-for="item in articles" :key="item.id" class="article-card" @click="goToDetail(item.id)">

                    <div class="card-image-wrapper">
                        <template v-if="getCoverUrl(item.cover_image)">
                            <img :src="getCoverUrl(item.cover_image)" loading="lazy" alt="cover"
                                @error="item.cover_image = null">
                            <div v-if="item.work_type === 'short'" class="type-badge-icon">📸</div>
                        </template>
                        <template v-else>
                            <div class="text-only-cover">
                                <div class="quote-mark">“</div>
                                <div class="text-preview">{{ item.title }}</div>
                            </div>
                        </template>

                        <div class="location-badge">
                            {{ item.location ? '📍 ' + item.location : '🏞️ ' + item.category }}
                        </div>
                    </div>

                    <div class="card-info">
                        <h3 class="card-title">{{ item.title }}</h3>

                        <div class="card-meta">
                            <span class="author clickable-author" @click.stop="goToProfile(item.author_username)">
                                <img :src="getAvatarUrl(item.author_avatar)" class="avatar-tiny"
                                    @error="handleAvatarError">
                                {{ item.author_name || item.author_username }}
                            </span>
                            <span class="date">{{ new Date(item.created_at).toLocaleDateString() }}</span>
                        </div>

                        <div class="card-stats-bar">
                            <div class="stat-unit" title="浏览">
                                <span class="icon">👁️</span> {{ formatCount(item.views) }}
                            </div>
                            <div class="stat-unit stat-interactive" :class="{ 'active-heart': item.isLiked }"
                                @click="handleLike(item, $event)" title="点赞">
                                <span class="icon">{{ item.isLiked ? '❤️' : '🤍' }}</span> {{ formatCount(item.likes) }}
                            </div>
                            <div class="stat-unit stat-interactive" :class="{ 'active-star': item.isFavorited }"
                                @click="handleFavorite(item, $event)" title="收藏">
                                <span class="icon">{{ item.isFavorited ? '⭐' : '☆' }}</span> {{
                                    formatCount(item.favorites) }}
                            </div>
                            <div class="stat-unit" title="评论">
                                <span class="icon">💬</span> {{ formatCount(item.comments) }}
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div v-if="articles.length > 0" class="load-more-container">
                <button v-if="hasMore" class="load-more-btn" :class="{ loading: isLoadingMore }" @click="loadMore">
                    <span v-if="isLoadingMore" class="loader"></span>
                    {{ isLoadingMore ? '正在加载...' : '探索更多' }}
                </button>
                <div v-else class="no-more-text">- THE END -</div>
            </div>

            <div v-else class="empty-state">
                <span class="empty-emoji">🍃</span>
                <p>这里暂时还是一片荒原...</p>
                <router-link v-if="currentConfig.category"
                    :to="{ path: '/creation-center', query: { category: currentConfig.category } }"
                    class="go-create-btn">
                    去耕耘 "{{ currentConfig.title }}"
                </router-link>
            </div>
        </main>
    </div>
</template>

<style scoped>
.record-page {
    /* 🔥 替换背景 */
    background-color: var(--bg-body);
    min-height: 100vh;
    font-family: 'Helvetica Neue', Helvetica, 'PingFang SC', sans-serif;
    color: var(--text-primary);
    /* 🔥 变量 */
    transition: background-color 0.3s ease, color 0.3s ease;
}

/* Hero Section */
.record-hero {
    height: 50vh;
    min-height: 400px;
    background-size: cover;
    background-position: center;
    background-attachment: fixed;
    position: relative;
    display: flex;
    justify-content: center;
    align-items: center;
    color: white;
    /* Hero 文字始终白色 */
    text-align: center;
    transition: background-image 0.5s ease-in-out;
    background-color: #333;
}

.hero-mask {
    position: absolute;
    inset: 0;
    background: rgba(0, 0, 0, 0.4);
    backdrop-filter: blur(2px);
}

:global(html.dark) .hero-mask {
    /* 深色模式遮罩加深，保证背景图不刺眼 */
    background: rgba(0, 0, 0, 0.6);
}

.hero-content {
    position: relative;
    z-index: 1;
    padding: 0 20px;
    max-width: 800px;
}

.category-icon {
    font-size: 3.5rem;
    margin-bottom: 15px;
    animation: bounceIn 1s;
    text-shadow: 0 4px 15px rgba(0, 0, 0, 0.3);
}

.hero-title {
    font-size: 3.5rem;
    font-weight: 800;
    letter-spacing: 6px;
    margin-bottom: 5px;
    /* 加强文字阴影，防止浅色壁纸看不清 */
    text-shadow: 0 4px 15px rgba(0, 0, 0, 0.6);
    font-family: 'Georgia', serif;
}

.hero-subtitle {
    font-size: 1.2rem;
    font-weight: 300;
    opacity: 0.9;
    letter-spacing: 3px;
    margin-bottom: 25px;
    text-transform: uppercase;
    text-shadow: 0 2px 5px rgba(0, 0, 0, 0.5);
}

.hero-desc {
    font-size: 1.1rem;
    opacity: 0.95;
    line-height: 1.8;
    text-shadow: 0 2px 4px rgba(0, 0, 0, 0.5);
}

.hero-content-loading {
    position: relative;
    z-index: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 15px;
}

.skeleton-icon {
    width: 60px;
    height: 60px;
    background: rgba(255, 255, 255, 0.2);
    border-radius: 50%;
}

.skeleton-title {
    width: 200px;
    height: 40px;
    background: rgba(255, 255, 255, 0.2);
    border-radius: 4px;
}

.skeleton-text {
    width: 300px;
    height: 20px;
    background: rgba(255, 255, 255, 0.2);
    border-radius: 4px;
}

/* 容器布局 */
.record-container {
    max-width: 1200px;
    margin: 40px auto 60px;
    padding: 0 20px;
    position: relative;
    z-index: 2;
}

/* 网格布局 */
.article-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
    gap: 24px;
    align-items: start;
}

/* 🔥🔥🔥 卡片样式 (核心适配) 🔥🔥🔥 */
.article-card {
    /* 🔥 玻璃拟态/表面色 */
    background: var(--bg-surface);
    border-radius: 16px;
    overflow: hidden;
    transition: all 0.3s ease;
    border: 1px solid var(--glass-border);
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.04);
    cursor: pointer;
    display: flex;
    flex-direction: column;
}

:global(html.dark) .article-card {
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.4);
    border-color: rgba(255, 255, 255, 0.08);
}

.article-card:hover {
    transform: translateY(-6px);
    box-shadow: 0 12px 30px rgba(0, 0, 0, 0.08);
}

:global(html.dark) .article-card:hover {
    box-shadow: 0 15px 40px rgba(0, 0, 0, 0.6);
}

.card-image-wrapper {
    position: relative;
    overflow: hidden;
    aspect-ratio: 4/3;
}

.card-image-wrapper img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
    transition: transform 0.6s ease;
}

.article-card:hover .card-image-wrapper img {
    transform: scale(1.08);
}

/* 胶囊标签 */
.location-badge {
    position: absolute;
    bottom: 12px;
    left: 12px;
    background: rgba(255, 255, 255, 0.9);
    color: #2c3e50;
    font-size: 0.75rem;
    padding: 6px 12px;
    border-radius: 30px;
    font-weight: 700;
    backdrop-filter: blur(4px);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

/* 艺术封面 (纯文字封面) */
.text-only-cover {
    width: 100%;
    height: 100%;
    background: #fdfaf2;
    /* 纹理背景图可以保留，深色模式下可能需要反色或变暗 */
    background-image: url('https://www.transparenttextures.com/patterns/natural-paper.png');
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    padding: 20px;
    text-align: center;
    border-bottom: 1px solid rgba(210, 166, 121, 0.2);
}

/* 深色模式下的文字封面 */
:global(html.dark) .text-only-cover {
    background-color: #2b2b2b;
    /* 深灰纸张色 */
    background-image: none;
    /* 去除亮色纹理，或者换一个深色的 */
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.quote-mark {
    font-family: "Georgia", serif;
    font-size: 3rem;
    color: #d2a679;
    opacity: 0.3;
    line-height: 1;
}

.text-preview {
    font-family: "STKaiti", "Georgia", serif;
    font-size: 1.2rem;
    color: #5d4a3b;
    font-weight: 700;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
    margin-top: -10px;
    padding: 0 10px;
}

:global(html.dark) .text-preview {
    color: #ccc;
}

.type-badge-icon {
    position: absolute;
    top: 10px;
    right: 10px;
    background: rgba(0, 0, 0, 0.6);
    color: #fff;
    font-size: 0.7rem;
    padding: 4px 8px;
    border-radius: 4px;
    backdrop-filter: blur(4px);
    font-weight: 600;
    pointer-events: none;
    z-index: 5;
}

/* 卡片内容区 */
.card-info {
    padding: 18px;
}

.card-title {
    font-size: 1.15rem;
    color: var(--text-primary);
    /* 🔥 变量 */
    margin: 0 0 12px 0;
    line-height: 1.5;
    font-weight: 700;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
}

/* 作者与时间 */
.card-meta {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 0.85rem;
    color: var(--text-tertiary);
    /* 🔥 变量 */
    margin-bottom: 12px;
}

.author {
    display: flex;
    align-items: center;
    gap: 8px;
    color: var(--text-secondary);
    /* 🔥 变量 */
    font-weight: 500;
}

.avatar-tiny {
    width: 24px;
    height: 24px;
    border-radius: 50%;
    object-fit: cover;
}

/* 统计栏 */
.card-stats-bar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-top: 1px solid var(--input-border);
    /* 🔥 变量 */
    padding-top: 12px;
    font-size: 0.8rem;
    color: var(--text-tertiary);
    /* 🔥 变量 */
}

.stat-unit {
    display: flex;
    align-items: center;
    gap: 4px;
    font-weight: 600;
    color: var(--text-secondary);
    /* 🔥 变量 */
    transition: transform 0.2s;
}

.stat-unit:hover {
    transform: scale(1.1);
}

.stat-unit .icon {
    font-size: 0.9rem;
}

.stat-interactive {
    cursor: pointer;
    user-select: none;
}

.stat-interactive:hover {
    color: var(--accent-color);
}

.active-heart {
    color: #ff6b6b !important;
}

.active-heart .icon {
    color: #ff6b6b;
}

.active-star {
    color: #f1c40f !important;
}

.active-star .icon {
    color: #f1c40f;
}

/* 跳转手型 */
.clickable-author {
    cursor: pointer;
    transition: color 0.3s;
}

.clickable-author:hover {
    color: var(--accent-color);
}

/* 底部按钮 */
.load-more-container {
    padding: 40px 0 20px;
    display: flex;
    justify-content: center;
    align-items: center;
    flex-direction: column;
}

.load-more-btn {
    padding: 10px 30px;
    background: var(--bg-surface);
    /* 🔥 变量 */
    border: 1px solid var(--input-border);
    /* 🔥 变量 */
    color: var(--text-secondary);
    /* 🔥 变量 */
    border-radius: 50px;
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.3s ease;
    display: flex;
    align-items: center;
    gap: 8px;
    box-shadow: var(--shadow-neumorphism-light);
}

.load-more-btn:hover {
    border-color: var(--accent-color);
    color: var(--accent-color);
    background: var(--bg-elevated);
    transform: translateY(-2px);
    box-shadow: var(--shadow-neumorphism-dark);
}

.load-more-btn.loading {
    opacity: 0.7;
    cursor: not-allowed;
    background: var(--bg-body);
}

.no-more-text {
    font-size: 13px;
    color: var(--text-tertiary);
    /* 🔥 变量 */
    padding: 10px;
    letter-spacing: 1px;
}

.loading-box {
    display: flex;
    justify-content: center;
    padding: 100px;
}

.spinner {
    width: 40px;
    height: 40px;
    border: 3px solid var(--input-border);
    border-top: 3px solid var(--accent-color);
    border-radius: 50%;
    animation: spin 1s linear infinite;
}

@keyframes spin {
    0% {
        transform: rotate(0deg);
    }

    100% {
        transform: rotate(360deg);
    }
}

.empty-state {
    text-align: center;
    padding: 100px 0;
    color: var(--text-secondary);
    /* 🔥 变量 */
}

.empty-emoji {
    font-size: 4rem;
    display: block;
    margin-bottom: 10px;
    opacity: 0.6;
}

.go-create-btn {
    display: inline-block;
    margin-top: 20px;
    padding: 12px 32px;
    background: var(--accent-color);
    color: white;
    border-radius: 50px;
    text-decoration: none;
    font-weight: 600;
    transition: 0.3s;
    box-shadow: 0 4px 15px rgba(66, 184, 131, 0.3);
}

.go-create-btn:hover {
    background: var(--accent-hover);
    transform: translateY(-2px);
}

@keyframes bounceIn {
    0% {
        transform: scale(0.3);
        opacity: 0;
    }

    50% {
        transform: scale(1.05);
    }

    70% {
        transform: scale(0.9);
    }

    100% {
        transform: scale(1);
        opacity: 1;
    }
}
</style>