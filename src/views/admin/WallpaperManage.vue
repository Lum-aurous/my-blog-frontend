<script setup>
import { ref, onMounted, onUnmounted, reactive } from 'vue'
import { api } from '@/utils/api'
import { message } from '@/utils/message'

// ==================== 全局壁纸管理 ====================
const globalWallpaper = ref({
    mode: 'random',
    websiteUrl: '',
    dailyUrl: '',
    randomUrls: []
})

const isLoadingGlobal = ref(false)
const isSavingGlobal = ref(false)
const newWallpaperUrl = ref('')

// 🔥 文件上传相关
const isUploading = ref(false)
const uploadProgress = ref(0)
const fileInputRef = ref(null)

// 🔥 预览相关
const previewVisible = ref(false)
const previewImageUrl = ref('')

// 打开全屏预览
const openPreview = (url) => {
    if (!url) return
    previewImageUrl.value = url
    previewVisible.value = true
    document.body.style.overflow = 'hidden'
}

// 关闭全屏预览
const closePreview = () => {
    previewVisible.value = false
    document.body.style.overflow = 'auto'
}

const handleKeydown = (e) => {
    if (e.key === 'Escape' && previewVisible.value) closePreview()
}

// 复制链接
const copyImageUrl = async () => {
    try {
        await navigator.clipboard.writeText(previewImageUrl.value)
        message.success('链接已复制到剪贴板')
    } catch (error) {
        message.error('复制失败')
    }
}

// 获取全局配置
const fetchGlobalWallpaper = async () => {
    isLoadingGlobal.value = true
    try {
        const res = await api.get('/wallpaper/global')
        if (res.data.success) {
            const data = res.data.data
            globalWallpaper.value = {
                mode: data.mode || 'random',
                websiteUrl: data.websiteUrl || '',
                dailyUrl: data.dailyUrl || '',
                randomUrls: Array.isArray(data.randomUrls) ? data.randomUrls : []
            }
        }
    } catch (error) {
        message.error('加载配置失败')
    } finally {
        isLoadingGlobal.value = false
    }
}

// 添加URL
const addWallpaper = () => {
    const url = newWallpaperUrl.value.trim()
    if (!url) return message.warning('请输入图片链接')
    if (!url.startsWith('http')) return message.error('请输入有效的 HTTP/HTTPS 链接')
    if (globalWallpaper.value.randomUrls.includes(url)) return message.warning('该图片已存在')

    globalWallpaper.value.randomUrls.push(url)
    newWallpaperUrl.value = ''
    message.success('已添加到列表')
}

const triggerFileUpload = () => fileInputRef.value?.click()

// 批量上传
const handleFileUpload = async (event) => {
    const files = Array.from(event.target.files)
    if (files.length === 0) return

    const validFiles = files.filter(f => f.type.startsWith('image/'))
    if (validFiles.length === 0) return message.error('请选择图片文件')

    const oversized = validFiles.filter(f => f.size > 10 * 1024 * 1024)
    if (oversized.length > 0) return message.error('部分图片超过 10MB 限制')

    isUploading.value = true
    uploadProgress.value = 0
    let successCount = 0

    for (let i = 0; i < validFiles.length; i++) {
        const formData = new FormData()
        formData.append('image', validFiles[i])

        try {
            const res = await api.post('/upload', formData, {
                headers: { 'Content-Type': 'multipart/form-data' },
                onUploadProgress: (e) => {
                    uploadProgress.value = Math.round(((i + e.loaded / e.total) / validFiles.length) * 100)
                }
            })
            if (res.data.success) {
                globalWallpaper.value.randomUrls.push(res.data.data.url)
                successCount++
            }
        } catch (err) {
            console.error('Upload failed', err)
        }
    }

    isUploading.value = false
    uploadProgress.value = 0
    if (successCount > 0) message.success(`成功上传 ${successCount} 张图片`)
    event.target.value = ''
}

const removeWallpaper = (index) => {
    if (confirm('确定移除这张壁纸吗？')) {
        globalWallpaper.value.randomUrls.splice(index, 1)
    }
}

// 拖拽排序
let draggedIndex = null
const handleDragStart = (index) => { draggedIndex = index }
const handleDragOver = (e) => { e.preventDefault() }
const handleDrop = (index) => {
    if (draggedIndex === null || draggedIndex === index) return
    const items = [...globalWallpaper.value.randomUrls]
    const [item] = items.splice(draggedIndex, 1)
    items.splice(index, 0, item)
    globalWallpaper.value.randomUrls = items
    draggedIndex = null
}

// 单张上传 (全局背景)
const uploadSingleWallpaper = (type) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/*'
    input.onchange = async (e) => {
        const file = e.target.files[0]
        if (!file) return
        if (file.size > 10 * 1024 * 1024) return message.error('图片过大')

        isUploading.value = true
        try {
            const formData = new FormData()
            formData.append('image', file)
            const res = await api.post('/upload', formData)
            if (res.data.success) {
                if (type === 'website') globalWallpaper.value.websiteUrl = res.data.data.url
                else if (type === 'daily') globalWallpaper.value.dailyUrl = res.data.data.url
                message.success('上传成功')
            }
        } catch (err) {
            message.error('上传失败')
        } finally {
            isUploading.value = false
        }
    }
    input.click()
}

const saveGlobalWallpaper = async () => {
    isSavingGlobal.value = true
    try {
        await api.put('/admin/wallpaper/global', globalWallpaper.value)
        message.success('配置已保存并生效')
        fetchGlobalWallpaper()
    } catch (err) {
        message.error('保存失败')
    } finally {
        isSavingGlobal.value = false
    }
}

// 定义一个 key 种子
const listKey = ref(0)

const shuffleWallpapers = async () => {
    if (!confirm('确定要随机打乱所有壁纸顺序吗？')) return

    // 增加一个小状态，让按钮在处理时禁用
    isSavingGlobal.value = true

    try {
        const res = await api.post('/wallpaper/shuffle')
        if (res.data.success) {
            // 1. 先清空当前显示的列表（制造一个闪烁效果，让用户知道更新了）
            globalWallpaper.value.randomUrls = []

            // 2. 重新获取最新顺序的数据
            await fetchGlobalWallpaper()

            message.success('🎲 顺序已随机打乱')
        }
    } catch (err) {
        message.error('洗牌操作失败')
    } finally {
        isSavingGlobal.value = false
    }
}
const clearAllWallpapers = () => {
    if (!confirm('⚠️ 高危操作：确定清空所有轮播壁纸吗？')) return
    globalWallpaper.value.randomUrls = []
    message.warning('列表已清空，请保存生效')
}

// ==================== 栏目封面管理 (新功能) ====================
const categories = ref([])
const isLoadingCategories = ref(false)

// 获取分类列表
const fetchCategories = async () => {
    isLoadingCategories.value = true
    try {
        // 假设有一个获取分类列表的接口，包含 banner 字段
        const res = await api.get('/categories')
        if (res.data.success) {
            categories.value = res.data.data || []
        }
    } catch (err) {
        message.error('获取栏目列表失败')
    } finally {
        isLoadingCategories.value = false
    }
}

// 更新单个分类的 Banner (保存 URL)
const updateCategoryBanner = async (category) => {
    if (!category.banner) return message.warning('Banner 链接不能为空')
    try {
        // 假设后端有更新分类的接口
        await api.put(`/admin/categories/${category.id}`, {
            name: category.name,
            description: category.description,
            banner: category.banner,
            icon: category.icon,
            sort_order: category.sort_order
        })
        message.success(`[${category.name}] 封面更新成功`)
    } catch (err) {
        message.error('更新失败')
    }
}

// 为特定分类上传图片
const uploadCategoryBanner = (category) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/*'
    input.onchange = async (e) => {
        const file = e.target.files[0]
        if (!file) return
        if (file.size > 10 * 1024 * 1024) return message.error('图片过大，请小于10MB')

        isUploading.value = true
        try {
            const formData = new FormData()
            formData.append('image', file)
            const res = await api.post('/upload', formData)

            if (res.data.success) {
                // 1. 更新本地视图
                category.banner = res.data.data.url
                // 2. 自动保存到数据库
                await updateCategoryBanner(category)
            }
        } catch (err) {
            message.error('上传图片失败')
        } finally {
            isUploading.value = false
        }
    }
    input.click()
}

// ==================== 用户壁纸管理 ====================
const userWallpapers = ref([])
const isLoadingUsers = ref(false)
const activeTab = ref('global') // 默认 tab

const fetchUserWallpapers = async () => {
    isLoadingUsers.value = true
    try {
        const res = await api.get('/admin/wallpapers/users', { params: { page: 1, limit: 50 } })
        if (res.data.success) {
            userWallpapers.value = res.data.data.list || []
        }
    } catch (err) {
        message.error('获取用户壁纸失败')
    } finally {
        isLoadingUsers.value = false
    }
}

const deleteUserWallpaper = async (userId, username) => {
    if (!confirm(`确定删除用户 ${username} 的自定义壁纸吗？`)) return
    try {
        await api.delete(`/admin/wallpapers/users/${userId}`)
        message.success('已删除')
        fetchUserWallpapers()
    } catch (err) {
        message.error('删除失败')
    }
}

const isSavingCategories = ref(false)

// 保存所有分类的 Banner 修改
const saveAllCategoryChanges = async () => {
    isSavingCategories.value = true
    try {
        // 使用 Promise.all 并行保存所有被修改过的分类
        const promises = categories.value.map(cat =>
            api.put(`/admin/categories/${cat.id}`, cat)
        )
        await Promise.all(promises)
        message.success('所有栏目封面已保存生效')
        await fetchCategories() // 刷新数据
    } catch (err) {
        message.error('部分保存失败，请检查网络')
    } finally {
        isSavingCategories.value = false
    }
}

const isSyncing = ref(false) // 🔥 新增状态

// 🔥 新增：手动同步 Bing
const handleSyncBing = async () => {
    isSyncing.value = true
    try {
        const res = await api.post('/admin/wallpaper/sync-bing')
        if (res.data.success) {
            message.success('抓取成功！已更新今日美图')
            // 更新本地视图
            globalWallpaper.value.dailyUrl = res.data.data.url
            // 强制刷新一下全局配置
            fetchGlobalWallpaper()
        }
    } catch (err) {
        message.error('同步失败，请检查服务器日志')
    } finally {
        isSyncing.value = false
    }
}

const formatDate = (str) => new Date(str).toLocaleDateString()

onMounted(() => {
    fetchGlobalWallpaper()
    fetchUserWallpapers()
    fetchCategories() // 🔥 加载分类数据
    window.addEventListener('keydown', handleKeydown)
})
onUnmounted(() => window.removeEventListener('keydown', handleKeydown))
</script>

<template>
    <div class="wallpaper-manage-page">
        <Transition name="fade">
            <div v-if="previewVisible" class="preview-overlay" @click.self="closePreview">
                <div class="preview-content animate__animated animate__zoomIn">
                    <img :src="previewImageUrl" class="preview-img">
                    <button class="close-btn" @click="closePreview">×</button>
                    <div class="preview-actions">
                        <a :href="previewImageUrl" target="_blank" class="action-btn">🔍 原图</a>
                        <button class="action-btn" @click="copyImageUrl">📋 复制链接</button>
                    </div>
                </div>
            </div>
        </Transition>

        <div class="page-header animate__animated animate__fadeInDown">
            <div class="header-content">
                <h2>🖼️ 视觉中心</h2>
                <p>掌控全站视觉风格，管理背景与栏目封面</p>
            </div>
            <div class="tabs">
                <div class="tab" :class="{ active: activeTab === 'global' }" @click="activeTab = 'global'">
                    🌐 全局配置
                </div>
                <div class="tab" :class="{ active: activeTab === 'banners' }" @click="activeTab = 'banners'">
                    📑 栏目封面
                </div>
                <div class="tab" :class="{ active: activeTab === 'users' }" @click="activeTab = 'users'">
                    👤 用户上传
                </div>
            </div>
        </div>

        <Transition name="slide-down">
            <div v-if="isUploading" class="upload-bar">
                <div class="bar-inner" :style="{ width: uploadProgress + '%' }"></div>
                <span class="bar-text">正在上传... {{ uploadProgress > 0 ? uploadProgress : '处理中' }}%</span>
            </div>
        </Transition>

        <div v-show="activeTab === 'global'" class="content-area animate__animated animate__fadeIn">

            <div class="control-panel glass-card">
                <h3>🛠️ 展示模式</h3>
                <div class="mode-grid">
                    <label class="mode-card" :class="{ active: globalWallpaper.mode === 'website' }">
                        <input type="radio" value="website" v-model="globalWallpaper.mode">
                        <span class="icon">🏠</span>
                        <span class="name">固定背景</span>
                        <span class="desc">全站统一单张图</span>
                    </label>
                    <label class="mode-card" :class="{ active: globalWallpaper.mode === 'daily' }">
                        <input type="radio" value="daily" v-model="globalWallpaper.mode">
                        <span class="icon">📅</span>
                        <span class="name">每日一图</span>
                        <span class="desc">自动同步必应/Pexels</span>
                    </label>
                    <label class="mode-card" :class="{ active: globalWallpaper.mode === 'random' }">
                        <input type="radio" value="random" v-model="globalWallpaper.mode">
                        <span class="icon">🎲</span>
                        <span class="name">随机轮播</span>
                        <span class="desc">从图库随机切换</span>
                    </label>
                </div>
            </div>

            <div v-if="globalWallpaper.mode !== 'random'" class="glass-card mt-20 animate__animated animate__fadeInUp">
                <div class="card-header">
                    <h3>{{ globalWallpaper.mode === 'website' ? '固定壁纸设置' : '每日壁纸设置' }}</h3>

                    <div class="header-actions">
                        <button v-if="globalWallpaper.mode === 'daily'" class="btn-sync-bing" @click="handleSyncBing"
                            :disabled="isSyncing">
                            <span v-if="isSyncing" class="sync-icon spin">🔄</span>
                            <span v-else class="sync-icon">🌍</span>

                            <span class="btn-text-content">
                                {{ isSyncing ? '正在连接必应...' : '同步今日美图' }}
                            </span>
                        </button>

                        <button class="btn-outline" @click="uploadSingleWallpaper(globalWallpaper.mode)">
                            📤 上传替换
                        </button>
                    </div>
                </div>

                <div class="single-preview-box">
                    <div v-if="globalWallpaper.mode === 'website' ? globalWallpaper.websiteUrl : globalWallpaper.dailyUrl"
                        class="img-wrapper"
                        @click="openPreview(globalWallpaper.mode === 'website' ? globalWallpaper.websiteUrl : globalWallpaper.dailyUrl)">
                        <img
                            :src="globalWallpaper.mode === 'website' ? globalWallpaper.websiteUrl : globalWallpaper.dailyUrl">
                        <div class="hover-tip">点击预览大图</div>
                    </div>
                    <div v-else class="empty-placeholder">暂无图片，请上传或输入链接</div>

                    <input type="text" class="url-input" v-model="globalWallpaper[globalWallpaper.mode + 'Url']"
                        placeholder="在此输入图片 URL...">
                </div>
            </div>

            <div v-if="globalWallpaper.mode === 'random'" class="glass-card mt-20 animate__animated animate__fadeInUp">
                <div class="card-header">
                    <h3>🎨 轮播图库 <span class="count">({{ globalWallpaper.randomUrls.length }})</span></h3>
                    <div class="header-actions">
                        <button class="btn-text" @click="shuffleWallpapers">🔀 洗牌</button>
                        <button class="btn-text danger" @click="clearAllWallpapers">🗑️ 清空</button>
                    </div>
                </div>

                <div class="upload-toolbar">
                    <button class="btn-primary-large" @click="triggerFileUpload">
                        ☁️ 批量上传图片
                    </button>
                    <div class="input-wrapper">
                        <input type="text" v-model="newWallpaperUrl" @keyup.enter="addWallpaper"
                            placeholder="或输入网络图片 URL...">
                        <button @click="addWallpaper">添加</button>
                    </div>
                    <input ref="fileInputRef" type="file" multiple accept="image/*" hidden @change="handleFileUpload">
                </div>

                <div class="gallery-grid" v-if="globalWallpaper.randomUrls.length > 0" :key="listKey">
                    <div v-for="(url, index) in globalWallpaper.randomUrls" :key="url + index" class="gallery-item"
                        draggable="true" @dragstart="handleDragStart(index)" @dragover="handleDragOver"
                        @drop="handleDrop(index)" @click="openPreview(url)"> <img :src="url" loading="lazy">

                        <div class="item-overlay">
                            <span class="index-badge">#{{ index + 1 }}</span>
                            <button class="delete-btn" @click.stop="removeWallpaper(index)">🗑️</button>
                        </div>

                        <div class="hover-hint">点击阅览</div>
                    </div>
                </div>
                <div v-else class="empty-gallery">
                    🖼️ 图库空空如也，快去上传美图吧！
                </div>
            </div>

            <div class="sticky-footer">
                <button class="btn-save-all" @click="saveGlobalWallpaper" :disabled="isSavingGlobal">
                    {{ isSavingGlobal ? '正在保存...' : '💾 保存所有配置' }}
                </button>
            </div>
        </div>

        <div v-show="activeTab === 'banners'" class="content-area animate__animated animate__fadeIn">
            <div class="glass-card">
                <div class="card-header">
                    <h3>📑 栏目封面设置</h3>
                    <span class="sub-info">管理首页下拉菜单中各个分类的顶部 Banner 图</span>
                </div>

                <div v-if="isLoadingCategories" class="loading-state">
                    <div class="spinner"></div> 加载分类中...
                </div>

                <div v-else class="categories-grid">
                    <div v-for="cat in categories" :key="cat.id" class="category-card">
                        <div class="cat-header">
                            <span class="cat-icon">{{ cat.icon }}</span>
                            <div>
                                <div class="cat-name">{{ cat.name }} <span class="cat-key">({{ cat.category_key
                                }})</span></div>
                                <div class="cat-desc">{{ cat.subtitle || cat.description }}</div>
                            </div>
                        </div>

                        <div class="cat-banner-preview" @click="openPreview(cat.banner)">
                            <img :src="cat.banner || 'https://via.placeholder.com/800x400?text=No+Image'"
                                loading="lazy">
                            <div class="preview-mask">点击预览</div>
                        </div>

                        <div class="cat-actions">
                            <input type="text" v-model="cat.banner" class="mini-input" placeholder="输入图片链接...">
                            <div class="btn-group">
                                <button class="btn-mini-save" @click="updateCategoryBanner(cat)"
                                    title="保存链接">💾</button>
                                <button class="btn-mini-upload" @click="uploadCategoryBanner(cat)"
                                    title="上传图片">📤</button>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="sticky-footer" v-if="categories.length > 0">
                    <button class="btn-save-all" @click="saveAllCategoryChanges" :disabled="isSavingCategories">
                        {{ isSavingCategories ? '正在保存...' : '💾 保存所有栏目配置' }}
                    </button>
                </div>
            </div>
        </div>

        <div v-show="activeTab === 'users'" class="content-area animate__animated animate__fadeIn">
            <div class="glass-card">
                <div class="card-header">
                    <h3>用户自定义壁纸</h3>
                    <span class="sub-info">共 {{ userWallpapers.length }} 位用户使用了自定义背景</span>
                </div>

                <div v-if="isLoadingUsers" class="loading-state">
                    <div class="spinner"></div> 加载中...
                </div>

                <div v-else-if="userWallpapers.length === 0" class="empty-gallery">
                    还没有用户上传自定义壁纸 🍃
                </div>

                <div v-else class="user-list">
                    <div v-for="item in userWallpapers" :key="item.user_id" class="user-row">
                        <div class="user-profile">
                            <img :src="item.avatar || 'https://i.pravatar.cc/150'" class="avatar">
                            <div>
                                <div class="name">{{ item.nickname || item.username }}</div>
                                <div class="meta">ID: {{ item.user_id }} · {{ formatDate(item.updated_at) }}</div>
                            </div>
                        </div>

                        <div class="wallpaper-thumb" @click="openPreview(item.wallpaper_url)">
                            <img :src="item.wallpaper_url">
                            <div class="thumb-mask">🔍</div>
                        </div>

                        <button class="btn-delete-sm" @click="deleteUserWallpaper(item.user_id, item.username)">
                            删除
                        </button>
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>

<style scoped>
.wallpaper-manage-page {
    max-width: 1200px;
    margin: 0 auto;
    padding-bottom: 80px;
    color: #e2e8f0;
}

/* 头部设计 */
.page-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-end;
    margin-bottom: 30px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    padding-bottom: 20px;
}

.header-content h2 {
    margin: 0;
    font-size: 1.8rem;
    color: #fff;
    text-shadow: 0 2px 10px rgba(0, 0, 0, 0.3);
}

.header-content p {
    margin: 5px 0 0;
    color: #94a3b8;
    font-size: 0.95rem;
}

/* 标签页 */
.tabs {
    display: flex;
    background: rgba(30, 41, 59, 0.5);
    padding: 4px;
    border-radius: 12px;
    border: 1px solid rgba(255, 255, 255, 0.1);
}

.tab {
    padding: 8px 24px;
    cursor: pointer;
    border-radius: 8px;
    color: #94a3b8;
    transition: all 0.3s;
    font-weight: 600;
}

.tab.active {
    background: #6366f1;
    color: #fff;
    box-shadow: 0 2px 10px rgba(99, 102, 241, 0.3);
}

/* 卡片容器 */
.glass-card {
    background: rgba(30, 41, 59, 0.4);
    backdrop-filter: blur(10px);
    border-radius: 16px;
    padding: 25px;
    border: 1px solid rgba(255, 255, 255, 0.05);
}

.mt-20 {
    margin-top: 20px;
}

.card-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 20px;
}

.card-header h3 {
    margin: 0;
    color: #fff;
    font-size: 1.2rem;
}

.count {
    font-size: 0.9rem;
    color: #94a3b8;
    font-weight: normal;
}

/* 模式选择 */
.mode-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 15px;
    margin-top: 15px;
}

.mode-card {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 20px;
    background: rgba(255, 255, 255, 0.03);
    border: 2px solid transparent;
    border-radius: 12px;
    cursor: pointer;
    transition: 0.3s;
    text-align: center;
}

.mode-card input {
    display: none;
}

.mode-card:hover {
    background: rgba(255, 255, 255, 0.06);
}

.mode-card.active {
    background: rgba(99, 102, 241, 0.1);
    border-color: #6366f1;
}

.mode-card .icon {
    font-size: 2rem;
    margin-bottom: 10px;
}

.mode-card .name {
    font-weight: 700;
    color: #fff;
    margin-bottom: 4px;
}

.mode-card .desc {
    font-size: 0.8rem;
    color: #94a3b8;
}

/* 单图预览 */
.single-preview-box {
    background: rgba(0, 0, 0, 0.2);
    padding: 15px;
    border-radius: 12px;
    text-align: center;
}

.img-wrapper {
    height: 300px;
    border-radius: 8px;
    overflow: hidden;
    position: relative;
    cursor: pointer;
    border: 1px solid rgba(255, 255, 255, 0.1);
    margin-bottom: 15px;
}

.img-wrapper img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    transition: 0.5s;
}

.img-wrapper:hover img {
    transform: scale(1.02);
}

.hover-tip {
    position: absolute;
    inset: 0;
    background: rgba(0, 0, 0, 0.3);
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: 0;
    transition: 0.3s;
    color: #fff;
    font-weight: 600;
}

.img-wrapper:hover .hover-tip {
    opacity: 1;
}

.url-input {
    width: 100%;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.1);
    padding: 10px;
    border-radius: 8px;
    color: #fff;
    outline: none;
}

/* 图库操作栏 */
.upload-toolbar {
    display: flex;
    gap: 15px;
    margin-bottom: 20px;
    flex-wrap: wrap;
}

.btn-primary-large {
    background: linear-gradient(135deg, #8b5cf6, #6366f1);
    border: none;
    padding: 10px 24px;
    border-radius: 8px;
    color: #fff;
    font-weight: 600;
    cursor: pointer;
    transition: 0.2s;
    box-shadow: 0 4px 15px rgba(99, 102, 241, 0.3);
}

.btn-primary-large:hover {
    transform: translateY(-2px);
}

.input-wrapper {
    display: flex;
    flex: 1;
    background: rgba(255, 255, 255, 0.05);
    border-radius: 8px;
    overflow: hidden;
    border: 1px solid rgba(255, 255, 255, 0.1);
}

.input-wrapper input {
    flex: 1;
    background: transparent;
    border: none;
    padding: 0 15px;
    color: #fff;
    outline: none;
}

.input-wrapper button {
    background: rgba(255, 255, 255, 0.1);
    border: none;
    color: #fff;
    padding: 0 20px;
    cursor: pointer;
    transition: 0.2s;
}

.input-wrapper button:hover {
    background: rgba(255, 255, 255, 0.2);
}

/* 图片网格 */
.gallery-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
    gap: 15px;
}

.gallery-item {
    aspect-ratio: 16/9;
    border-radius: 8px;
    overflow: hidden;
    position: relative;
    border: 1px solid rgba(255, 255, 255, 0.1);
    cursor: zoom-in;
    /* 🔥 鼠标变成放大镜，提示可预览 */
    transition: transform 0.2s, border-color 0.2s;
}

/* 拖拽激活状态 */
.gallery-item:active {
    cursor: grabbing;
    transform: scale(0.95);
}

/* 悬停效果增强 */
.gallery-item:hover {
    border-color: #6366f1;
    /* 悬停边框变亮 */
    box-shadow: 0 4px 15px rgba(0, 0, 0, 0.3);
}

/* 🔥 新增：悬停时的文字提示 */
.hover-hint {
    position: absolute;
    bottom: 10px;
    left: 50%;
    transform: translateX(-50%);
    background: rgba(0, 0, 0, 0.7);
    color: #fff;
    font-size: 0.75rem;
    padding: 2px 8px;
    border-radius: 10px;
    opacity: 0;
    transition: opacity 0.2s;
    pointer-events: none;
    /* 防止遮挡点击 */
}

.gallery-item img {
    width: 100%;
    height: 100%;
    object-fit: cover;
}

.item-overlay {
    position: absolute;
    inset: 0;
    background: rgba(0, 0, 0, 0.0);
    transition: 0.3s;
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    padding: 8px;
}


.gallery-item:hover .hover-hint {
    opacity: 1;
}

.gallery-item:hover .item-overlay {
    background: rgba(0, 0, 0, 0.3);
}

.index-badge {
    background: rgba(0, 0, 0, 0.5);
    color: #fff;
    padding: 2px 6px;
    border-radius: 4px;
    font-size: 0.7rem;
    backdrop-filter: blur(2px);
}

.delete-btn {
    background: rgba(239, 68, 68, 0.8);
    border: none;
    width: 24px;
    height: 24px;
    border-radius: 4px;
    color: #fff;
    cursor: pointer;
    opacity: 0;
    transition: 0.2s;
}

.gallery-item:hover .delete-btn {
    opacity: 1;
}

.delete-btn:hover {
    background: #ef4444;
    transform: scale(1.1);
}

/* 底部栏 */
.sticky-footer {
    position: sticky;
    bottom: 20px;
    margin-top: 30px;
    display: flex;
    justify-content: center;
    z-index: 10;
}

.btn-save-all {
    background: #10b981;
    color: #fff;
    border: none;
    padding: 12px 40px;
    border-radius: 30px;
    font-weight: 700;
    font-size: 1rem;
    cursor: pointer;
    box-shadow: 0 10px 30px rgba(16, 185, 129, 0.4);
    transition: 0.3s;
}

.btn-save-all:hover {
    transform: translateY(-3px) scale(1.05);
}

.btn-save-all:disabled {
    opacity: 0.7;
    transform: none;
    cursor: wait;
}

/* 用户列表样式 */
.user-list {
    display: flex;
    flex-direction: column;
    gap: 10px;
}

.user-row {
    display: flex;
    align-items: center;
    padding: 12px;
    background: rgba(255, 255, 255, 0.03);
    border-radius: 12px;
    border: 1px solid rgba(255, 255, 255, 0.05);
}

.user-profile {
    display: flex;
    align-items: center;
    gap: 12px;
    flex: 1;
    object-fit: cover;
}

.avatar {
    width: 40px;
    height: 40px;
    border-radius: 50%;
    object-fit: cover;
}

.name {
    color: #fff;
    font-weight: 600;
}

.meta {
    color: #64748b;
    font-size: 0.8rem;
}

.wallpaper-thumb {
    width: 80px;
    height: 45px;
    border-radius: 6px;
    overflow: hidden;
    margin: 0 20px;
    cursor: zoom-in;
    position: relative;
    border: 1px solid rgba(255, 255, 255, 0.1);
}

.wallpaper-thumb img {
    width: 100%;
    height: 100%;
    object-fit: cover;
}

.btn-delete-sm {
    background: transparent;
    border: 1px solid #ef4444;
    color: #ef4444;
    padding: 4px 12px;
    border-radius: 6px;
    cursor: pointer;
    transition: 0.2s;
    font-size: 0.8rem;
}

.btn-delete-sm:hover {
    background: #ef4444;
    color: #fff;
}

/* 通用 */
.btn-text {
    background: none;
    border: none;
    color: #94a3b8;
    cursor: pointer;
    font-size: 0.9rem;
    margin-left: 10px;
}

.btn-text:hover {
    color: #fff;
}

.btn-text.danger:hover {
    color: #ef4444;
}

.btn-outline {
    background: transparent;
    border: 1px solid rgba(255, 255, 255, 0.2);
    color: #fff;
    padding: 6px 12px;
    border-radius: 6px;
    cursor: pointer;
    transition: 0.2s;
}

.btn-outline:hover {
    background: rgba(255, 255, 255, 0.1);
    border-color: #fff;
}

.empty-gallery {
    text-align: center;
    padding: 40px;
    color: #64748b;
    font-style: italic;
}

/* 预览模态框 - 增强版 */
.preview-overlay {
    position: fixed;
    /* inset: 0 这种写法在某些旧版浏览器可能有兼容问题，改用 top/left */
    top: 0;
    left: 0;
    width: 100vw;
    height: 100vh;
    height: 100dvh;
    /* 适配移动端动态高度 */
    background: rgba(0, 0, 0, 0.95);
    /* 加深背景，突出图片 */

    /* 🔥 核心修复：确保层级高于导航栏和侧边栏 */
    z-index: 99999;

    /* 🔥 核心修复：强制居中 */
    display: flex;
    align-items: center;
    justify-content: center;
    backdrop-filter: blur(10px);

    /* 防止预览时下方页面滚动 */
    overscroll-behavior: contain;
}

.preview-content {
    position: relative;
    width: 90vw;
    /* 限制最大宽度 */
    height: 90vh;
    /* 限制最大高度 */
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    /* 确保内容在容器内也居中 */
}

.preview-img {
    max-width: 100%;
    max-height: 100%;
    /* 让图片自适应容器，不超出屏幕 */
    object-fit: contain;
    /* 保持比例 */
    border-radius: 4px;
    box-shadow: 0 0 80px rgba(0, 0, 0, 0.8);
    /* 增加平滑入场动画 */
    animation: zoomIn 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.close-btn {
    position: fixed;
    /* 改为相对于屏幕固定 */
    top: 20px;
    right: 20px;
    width: 44px;
    height: 44px;
    font-size: 2.5rem;
    color: rgba(255, 255, 255, 0.7);
    background: rgba(255, 255, 255, 0.1);
    border: none;
    border-radius: 50%;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.3s;
    z-index: 100000;
    /* 比遮罩层更高 */
}

.close-btn:hover {
    background: rgba(255, 255, 255, 0.2);
    color: #fff;
    transform: rotate(90deg);
}

.preview-actions {
    margin-top: 20px;
    display: flex;
    gap: 15px;
}

.action-btn {
    background: rgba(255, 255, 255, 0.1);
    border: 1px solid rgba(255, 255, 255, 0.2);
    color: #fff;
    padding: 8px 20px;
    border-radius: 20px;
    text-decoration: none;
    cursor: pointer;
    transition: 0.2s;
    font-size: 0.9rem;
}

.action-btn:hover {
    background: #fff;
    color: #000;
}

/* 进度条 */
.upload-bar {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    height: 4px;
    background: rgba(99, 102, 241, 0.2);
    z-index: 3000;
}

.bar-inner {
    height: 100%;
    background: #6366f1;
    transition: width 0.3s;
}

.bar-text {
    position: absolute;
    top: 10px;
    right: 20px;
    background: #6366f1;
    color: #fff;
    padding: 4px 10px;
    border-radius: 4px;
    font-size: 0.8rem;
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

/* 🔥 新增：栏目封面管理样式 */
.categories-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
    gap: 20px;
    margin-top: 15px;
}

.category-card {
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 12px;
    padding: 15px;
    transition: 0.3s;
}

.category-card:hover {
    background: rgba(255, 255, 255, 0.06);
    border-color: rgba(99, 102, 241, 0.3);
    transform: translateY(-2px);
}

.cat-header {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 12px;
}

.cat-icon {
    font-size: 1.8rem;
    background: rgba(255, 255, 255, 0.05);
    width: 44px;
    height: 44px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 10px;
}

.cat-name {
    color: #fff;
    font-weight: 700;
    font-size: 1.05rem;
}

.cat-key {
    font-weight: normal;
    color: #94a3b8;
    font-size: 0.8rem;
}

.cat-desc {
    color: #64748b;
    font-size: 0.85rem;
    margin-top: 2px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 200px;
}

.cat-banner-preview {
    width: 100%;
    height: 140px;
    border-radius: 8px;
    overflow: hidden;
    position: relative;
    cursor: pointer;
    border: 1px solid rgba(255, 255, 255, 0.1);
}

.cat-banner-preview img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    transition: 0.5s;
}

.preview-mask {
    position: absolute;
    inset: 0;
    background: rgba(0, 0, 0, 0.3);
    color: #fff;
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: 0;
    transition: 0.3s;
    font-weight: 600;
}

.cat-banner-preview:hover .preview-mask {
    opacity: 1;
}

.cat-banner-preview:hover img {
    transform: scale(1.05);
}

.cat-actions {
    margin-top: 12px;
    display: flex;
    gap: 8px;
}

.mini-input {
    flex: 1;
    background: rgba(0, 0, 0, 0.2);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 6px;
    padding: 6px 10px;
    color: #cbd5e1;
    font-size: 0.85rem;
    outline: none;
    transition: 0.3s;
}

.mini-input:focus {
    border-color: #6366f1;
    background: rgba(0, 0, 0, 0.3);
}

.btn-group {
    display: flex;
    gap: 5px;
}

.btn-mini-save,
.btn-mini-upload {
    width: 32px;
    height: 32px;
    border-radius: 6px;
    border: none;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: 0.2s;
}

.btn-mini-save {
    background: rgba(16, 185, 129, 0.2);
    color: #34d399;
}

.btn-mini-save:hover {
    background: rgba(16, 185, 129, 0.4);
}

.btn-mini-upload {
    background: rgba(99, 102, 241, 0.2);
    color: #818cf8;
}

.btn-mini-upload:hover {
    background: rgba(99, 102, 241, 0.4);
}

.loading-state {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 40px;
    color: #94a3b8;
    gap: 10px;
}

.spinner {
    width: 20px;
    height: 20px;
    border: 2px solid rgba(99, 102, 241, 0.3);
    border-top-color: #6366f1;
    border-radius: 50%;
    animation: spin 1s linear infinite;
}

@keyframes spin {
    to {
        transform: rotate(360deg);
    }
}

/* ==================== 🔄 必应同步按钮美化 ==================== */
.btn-sync-bing {
    /* 🔥 关键修复：提升层级，防止被透明层遮挡 */
    position: relative; 
    z-index: 10; 
    
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 8px 20px;
    height: 36px;
    
    /* 微软必应蓝渐变风格 */
    background: linear-gradient(135deg, #0078D4 0%, #005a9e 100%);
    color: #fff;
    
    border: none;
    border-radius: 20px;
    font-size: 0.85rem;
    font-weight: 600;
    letter-spacing: 0.5px;
    
    cursor: pointer;
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    
    box-shadow: 0 4px 12px rgba(0, 120, 212, 0.3);
    
    white-space: nowrap;
    margin-right: 10px;
}

/* 悬停效果：上浮 + 变亮 */
.btn-sync-bing:hover {
    transform: translateY(-2px);
    box-shadow: 0 6px 16px rgba(0, 120, 212, 0.4);
    filter: brightness(1.1);
}

/* 点击效果 */
.btn-sync-bing:active {
    transform: translateY(0);
    box-shadow: 0 2px 6px rgba(0, 120, 212, 0.3);
}

/* 禁用/加载状态 */
.btn-sync-bing:disabled {
    opacity: 0.7;
    cursor: wait;
    background: #475569; /* 变成灰色 */
    box-shadow: none;
    transform: none;
}

/* 图标旋转动画 */
.sync-icon {
    font-size: 1rem;
    display: inline-block;
}

.spin {
    animation: rotate 1s linear infinite;
}

@keyframes rotate {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
}
</style>