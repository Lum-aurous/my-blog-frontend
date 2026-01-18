<script setup>
import { ref, reactive, onMounted, computed } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { api } from '@/utils/api'
import { message } from '@/utils/message'
import LocationSelector from '@/components/LocationSelector.vue'

const router = useRouter()
const route = useRoute()

// =========================
// 1. 核心状态管理
// =========================
const activeTab = ref('article') // 选项: article, short, video, audio
const isSubmitting = ref(false)
const isEditMode = computed(() => !!route.query.id)
const sysCategories = ref([])
// 🔥 新增：大洲选项
const continentOptions = ['亚洲', '欧洲', '北美洲', '南美洲', '非洲', '大洋洲', '南极洲']
const isAudioPlaying = ref(false) // 🔥 新增：音频播放状态

// 简单的播放控制处理函数
const onAudioPlay = () => isAudioPlaying.value = true
const onAudioPause = () => isAudioPlaying.value = false

// 统一表单数据模型
const form = reactive({
    title: '',
    summary: '',
    content: '',
    category: '',
    cover_image: '',
    video_url: '',
    audio_url: '',
    lyrics: '',     // 🔥 新增：歌词
    location: '',   // 🔥 新增：旅行地点
    continent: '亚洲', // 🔥 新增：所属大洲 (默认亚洲)
    lat: null, // 🔥 新增
    lng: null,  // 🔥 新增
    images: []      // 图文模式暂存图片
})

// =========================
// 🔥 新增：重置表单函数
// =========================
const resetForm = () => {
    form.title = ''
    form.summary = ''
    form.content = ''
    form.category = sysCategories.value[0]?.name || ''
    form.cover_image = ''
    form.video_url = ''
    form.audio_url = ''
    form.images = []
    form.lyrics = ''     // 🔥 重置歌词
    form.location = ''
    form.continent = '亚洲'
    form.lat = null // 🔥 重置坐标
    form.lng = null // 🔥 重置坐标

    // 重置文件输入框
    if (fileInput.value) fileInput.value.value = ''
    if (mediaInput.value) mediaInput.value.value = ''
    if (shortImagesInput.value) shortImagesInput.value.value = ''
}

const handleGeoSelect = (data) => {
    form.location = data.location
    form.lat = data.lat
    form.lng = data.lng
    console.log('后台已锁定坐标:', data.lat, data.lng)
}

// 上传相关状态
const fileInput = ref(null)      // 封面上传DOM
const mediaInput = ref(null)     // 媒体上传DOM
const shortImagesInput = ref(null) // 图文多选DOM
const isUploading = ref(false)   // 通用上传Loading
const uploadProgress = ref(0)    // 进度条百分比

// =========================
// 2. 初始化逻辑
// =========================
const fetchCategories = async () => {
    try {
        const res = await api.get('/categories')
        if (res.data.success) {
            sysCategories.value = res.data.data
            // 默认选中第一个分类
            if (!isEditMode.value && sysCategories.value.length > 0 && !form.category) {
                form.category = sysCategories.value[0].name
            }
        }
    } catch (e) { console.error(e) }
}

// 获取详情回填 (编辑模式)
const fetchDetail = async () => {
    if (!isEditMode.value) return
    const id = route.query.id
    try {
        // 根据 URL query 或者 activeTab 判断调用哪个详情接口
        // 这里简化逻辑：先尝试从 articles 拿，拿不到再试别的，或者后端提供统一接口
        // 假设我们通过路由参数 type 来区分编辑类型，如 /admin/publish?id=1&type=video
        const type = route.query.type || 'article'
        activeTab.value = type === 'short' ? 'article' : type // short 也是一种 article

        const res = await api.get(`/articles/${id}?type=${type}`)
        if (res.data.success) {
            const data = res.data.data
            form.title = data.title
            form.summary = data.summary
            form.content = data.content || data.description // 视频音频存的是 description
            form.category = data.category
            form.cover_image = data.cover_image
            form.video_url = data.video_url
            form.audio_url = data.audio_url
            // 🔥 回填新字段
            form.lyrics = data.lyrics || ''
            form.location = data.location || ''
            form.continent = data.continent || '亚洲'
            // 🔥 识别旅行 Vlog 类型 (如果 category 是 '游记' 或者有 location)
            if (data.category === '游记' || type === 'travel') {
                activeTab.value = 'travel'
            }
            // 如果是图文，需要特殊处理 content 里的图片
            if (type === 'short') {
                activeTab.value = 'short'
            }
        }
    } catch (e) { message.error('加载详情失败') }
}

// =========================
// 3. 核心功能：编辑器图片上传 (适配 md-editor-v3)
// =========================
const handleEditorUpload = async (files, callback) => {
    // files: File[] 文件列表
    // callback: (urls: string[]) => void 回调函数，传入上传后的 url 数组

    if (!files || files.length === 0) return;

    const uploadedUrls = [];

    // 遍历上传
    for (const file of files) {
        if (!file.type.startsWith('image/')) {
            message.warning(`文件 ${file.name} 不是图片，已跳过`);
            continue;
        }

        const formData = new FormData();
        formData.append('image', file);

        try {
            const res = await api.post('/upload', formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });

            if (res.data.success) {
                // 获取完整 URL
                const url = getPreviewUrl(res.data.data.url);
                uploadedUrls.push(url);
            } else {
                message.error(res.data.message || '上传未成功');
            }
        } catch (e) {
            console.error('编辑器上传错误:', e);
            message.error(`图片 ${file.name} 上传出错`);
        }
    }

    // 🔥 核心：调用 md-editor-v3 的回调，回填图片 URL
    if (uploadedUrls.length > 0) {
        callback(uploadedUrls);
        message.success(`成功插入 ${uploadedUrls.length} 张图片`);
    }
};

// =========================
// 4. 各种上传逻辑
// =========================

// 辅助：获取完整预览地址
const getPreviewUrl = (url) => {
    if (!url) return ''
    if (url.startsWith('http') || url.startsWith('blob')) return url
    return `${window.location.origin}${url.startsWith('/') ? '' : '/'}${url}`
}

// A. 封面上传
const triggerCoverUpload = () => fileInput.value.click()
const handleCoverUpload = async (e) => {
    const file = e.target.files[0]
    if (!file) return

    // 压缩判断（略，保持简单，直接传）
    const formData = new FormData()
    formData.append('image', file)

    try {
        const res = await api.post('/upload', formData)
        if (res.data.success) {
            form.cover_image = res.data.data.url
            message.success('封面设置成功')
        }
    } catch (e) { message.error('封面上传失败') }
}

// B. 视频/音频上传 (带进度条)
const triggerMediaUpload = () => mediaInput.value.click()
const handleMediaUpload = async (e) => {
    const file = e.target.files[0]
    if (!file) return

    let endpoint = ''
    let field = ''

    if (activeTab.value === 'video') {
        if (!file.type.startsWith('video/')) return message.error('请选择视频文件')
        endpoint = '/upload/video'
        field = 'video'
    } else {
        if (!file.type.startsWith('audio/')) return message.error('请选择音频文件')
        endpoint = '/upload/audio'
        field = 'audio'
    }

    isUploading.value = true
    uploadProgress.value = 0

    try {
        const formData = new FormData()
        formData.append(field, file)

        const res = await api.post(endpoint, formData, {
            onUploadProgress: (progressEvent) => {
                const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total)
                uploadProgress.value = percentCompleted
            },
            timeout: 600000 // 10分钟超时，防止大文件中断
        })

        if (res.data.success) {
            if (activeTab.value === 'video') form.video_url = res.data.data.url
            if (activeTab.value === 'audio') form.audio_url = res.data.data.url
            message.success('媒体资源上传完毕')
        }
    } catch (e) {
        message.error('上传出错，请检查文件大小限制')
    } finally {
        isUploading.value = false
    }
}

// 🔥 新增：处理歌词文件上传 (读取文本内容)
const lrcInputRef = ref(null)
const handleLrcUpload = (e) => {
    const file = e.target.files[0]
    if (!file) return

    // 简单校验
    const ext = file.name.split('.').pop().toLowerCase()
    if (ext !== 'lrc' && ext !== 'txt') return message.error('请上传 .lrc 或 .txt 格式')

    const reader = new FileReader()
    reader.onload = (ev) => {
        form.lyrics = ev.target.result
        message.success('📝 歌词已导入')
    }
    reader.readAsText(file)
}

// C. 图文多图上传 (批量)
const handleShortImages = async (e) => {
    const files = Array.from(e.target.files)
    if (!files.length) return

    const formData = new FormData()
    files.forEach(f => formData.append('images', f))

    try {
        const res = await api.post('/upload/comment-images', formData)
        if (res.data.success) {
            const urls = res.data.data.urls
            // 自动追加到正文
            urls.forEach(u => {
                const fullUrl = getPreviewUrl(u)
                form.content += `\n![img](${fullUrl})\n`
            })
            message.success(`已插入 ${urls.length} 张图片`)
        }
    } catch (e) { message.error('图片批量上传失败') }
}

// =========================
// 5. 提交发布逻辑
// =========================
// ✅ 修正后的提交发布逻辑
const submitContent = async () => {
    // 1. 全局基础校验
    if (!form.title.trim()) return message.warning('请填写标题')
    if (!form.category) return message.warning('请选择分类')

    isSubmitting.value = true

    try {
        // 🔥 核心修正 1：所有类型统一走 /articles 接口
        let endpoint = '/articles'
        let method = isEditMode.value ? 'put' : 'post'

        // 构造基础 Payload
        let payload = { ...form }

        // 自动摘要生成
        if (!payload.summary && payload.content) {
            payload.summary = payload.content.replace(/[#*`>!\[\]\(\)]/g, '').substring(0, 100).trim() + '...'
        }

        // 🔥 核心修正 2：根据 tab 类型手动指定 work_type，并统一走 /articles
        switch (activeTab.value) {
            case 'video':
                payload.work_type = 'video'
                // 视频必须有 video_url
                if (!form.video_url) { isSubmitting.value = false; return message.warning('请上传视频文件'); }
                // 视频简介存入 content 字段 (后端会映射到 description)
                payload.content = form.description || form.summary || '视频分享'
                break;

            case 'audio':
                payload.work_type = 'audio'
                // 音频必须有 audio_url
                if (!form.audio_url) { isSubmitting.value = false; return message.warning('请上传音频文件'); }
                payload.content = form.description || form.summary || '音乐分享'
                // 确保歌词被正确携带
                payload.lyrics = form.lyrics
                break;

            case 'travel':
                payload.work_type = 'article'
                payload.category = '游记'

                // 🔥🔥🔥 核心修复：确保 location 和 continent 被正确传递
                // 虽然 ...form 应该已经包含了，但这里显式校验一下更安全
                payload.location = form.location;
                payload.continent = form.continent || '亚洲';

                payload.lat = form.lat || null;
                payload.lng = form.lng || null;

                // 游记校验
                if (!payload.location) {
                    isSubmitting.value = false;
                    return message.warning('请填写旅行地点');
                }
                break;

            case 'short':
                payload.work_type = 'short'
                // 图文校验
                if (form.images.length === 0 && !form.content) { isSubmitting.value = false; return message.warning('请至少添加一张图片或一段文字'); }
                // 确保 images 数组被序列化或正确传递（后端可能需要 JSON）
                // 但通常 content 里已经包含了 markdown 图片，所以这里主要依靠 content
                break;

            default: // article
                payload.work_type = 'article'
                if (!form.content) { isSubmitting.value = false; return message.warning('请填写文章内容'); }
        }

        // 如果是编辑模式，追加 ID
        if (isEditMode.value) endpoint += `/${route.query.id}`

        // 发送请求
        const res = await api[method](endpoint, payload)

        if (res.data.success) {
            message.success(isEditMode.value ? '修改已保存' : '发布成功！')

            if (isEditMode.value) {
                // 编辑完返回
                router.back()
            } else {
                // 新建完清空表单
                resetForm()
                // 可选：跳转到博客页或管理页
                // router.push('/blog')
            }
        }
    } catch (e) {
        console.error(e)
        const errorMsg = e.response?.data?.message || e.message || '未知错误';
        message.error(`提交失败: ${errorMsg}`)
    } finally {
        isSubmitting.value = false
    }
}

// 🔥🔥🔥 新增：取消修改逻辑 🔥🔥🔥
const handleCancelEdit = () => {
    // 1. 调用已有的重置函数
    resetForm()

    // 2. 核心：清除路由上的 query 参数 (id)，让页面变回 "新建模式"
    // 使用 replace 不会产生新的历史记录
    router.replace({ path: route.path, query: {} })

    // 3. 恢复默认 Tab
    activeTab.value = 'article'

    message.info('已退出编辑模式，当前为新建状态')
}

onMounted(async () => {
    await fetchCategories()
    await fetchDetail()
})
</script>

<template>
    <div class="publish-container">
        <div class="type-tabs">
            <div class="tab-item" :class="{ active: activeTab === 'article' }" @click="activeTab = 'article'">📝 写文章
            </div>
            <div class="tab-item" :class="{ active: activeTab === 'short' }" @click="activeTab = 'short'">📸 发图文</div>
            <div class="tab-item" :class="{ active: activeTab === 'travel' }" @click="activeTab = 'travel'">✈️ 旅行 Vlog
            </div>
            <div class="tab-item" :class="{ active: activeTab === 'video' }" @click="activeTab = 'video'">🎬 传视频</div>
            <div class="tab-item" :class="{ active: activeTab === 'audio' }" @click="activeTab = 'audio'">📻 录声音</div>
        </div>

        <div class="editor-grid">
            <div class="main-panel glass-card">
                <input v-model="form.title" class="title-input" placeholder="请输入精彩标题..." />

                <div v-if="activeTab === 'article' || activeTab === 'short'" class="editor-wrapper">
                    <MdEditor v-model="form.content" theme="dark" class="my-editor" :toolbarsExclude="['github']"
                        placeholder="开始你的创作... (支持 Markdown 语法)" @onUploadImg="handleEditorUpload" />
                </div>

                <div v-if="activeTab === 'video'" class="media-upload-area" @click="triggerMediaUpload">
                    <input type="file" ref="mediaInput" hidden accept="video/*" @change="handleMediaUpload">

                    <div v-if="form.video_url" class="media-preview" @click.stop>
                        <video :src="getPreviewUrl(form.video_url)" controls></video>
                        <button class="re-upload-btn" @click="triggerMediaUpload">更换视频</button>
                    </div>

                    <div v-else class="upload-placeholder">
                        <span class="icon">🎬</span>
                        <p v-if="!isUploading">点击上传视频文件 (MP4/MOV)</p>
                        <div v-else class="progress-box">
                            <p>正在上传... {{ uploadProgress }}%</p>
                            <div class="progress-bar">
                                <div class="fill" :style="{ width: uploadProgress + '%' }"></div>
                            </div>
                        </div>
                    </div>
                </div>

                <div v-if="activeTab === 'audio'" class="media-upload-area audio-mode" @click="triggerMediaUpload">
                    <input type="file" ref="mediaInput" hidden accept="audio/*" @change="handleMediaUpload">

                    <div v-if="form.audio_url" class="media-preview audio-preview" @click.stop>
                        <div class="admin-vinyl-record" :class="{ 'spinning': isAudioPlaying }">
                            <img v-if="form.cover_image" :src="getPreviewUrl(form.cover_image)" class="vinyl-cover">

                            <div v-else class="vinyl-default-label">
                                <span>♫</span>
                            </div>

                            <div class="vinyl-hole"></div>
                        </div>

                        <audio :src="getPreviewUrl(form.audio_url)" controls class="admin-audio-player"
                            @play="onAudioPlay" @pause="onAudioPause" @ended="onAudioPause"></audio>

                        <div class="audio-actions">
                            <button class="re-upload-btn" @click="triggerMediaUpload">更换音频</button>
                        </div>
                    </div>

                    <div v-else class="upload-placeholder">
                        <span class="icon">📻</span>
                        <p v-if="!isUploading">点击上传音频文件 (MP3/WAV)</p>
                        <div v-else class="progress-box">
                            <p>正在录入... {{ uploadProgress }}%</p>
                            <div class="progress-bar">
                                <div class="fill" :style="{ width: uploadProgress + '%' }"></div>
                            </div>
                        </div>
                    </div>
                </div>

                <div v-if="activeTab === 'audio'" class="lyrics-section glass-card">
                    <div class="section-header">
                        <span>📝 歌词设置 (LRC)</span>
                        <button class="mini-btn" @click="lrcInputRef.click()">📂 导入 LRC</button>
                        <input type="file" ref="lrcInputRef" hidden accept=".lrc,.txt" @change="handleLrcUpload">
                    </div>
                    <textarea v-model="form.lyrics" class="lyrics-textarea"
                        placeholder="[00:00.00] 暂无歌词...&#10;[00:10.50] 支持手动输入或导入文件..."></textarea>
                </div>

                <div v-if="activeTab === 'travel'" class="travel-form-area">
                    <div class="travel-meta-row">
                        <div class="meta-input-group">
                            <LocationSelector v-model="form.location" @select-geo="handleGeoSelect" />
                        </div>

                        <div class="meta-input-group">
                            <span class="prefix-icon">🌍</span>
                            <select v-model="form.continent" class="meta-select">
                                <option v-for="c in continentOptions" :key="c" :value="c">{{ c }}</option>
                            </select>
                        </div>
                    </div>

                    <div class="editor-wrapper">
                        <MdEditor v-model="form.content" theme="dark" class="my-editor" placeholder="记录旅行中的见闻、美食与感动..."
                            @onUploadImg="handleEditorUpload" />
                    </div>
                </div>
            </div>

            <div class="side-panel">
                <div class="action-card glass-card">
                    <button class="publish-btn" @click="submitContent" :disabled="isSubmitting">
                        {{ isSubmitting ? '发布中...' : (isEditMode ? '保存修改' : '立即发布') }}
                    </button>
                    <button class="draft-btn">存草稿</button>

                    <button v-if="isEditMode" class="cancel-edit-btn" @click="handleCancelEdit">
                        🚫 取消修改
                    </button>
                </div>

                <div class="setting-card glass-card">
                    <div class="card-title">封面设置</div>
                    <div class="cover-uploader" @click="triggerCoverUpload"
                        :style="form.cover_image ? { backgroundImage: `url(${getPreviewUrl(form.cover_image)})` } : {}">
                        <input type="file" ref="fileInput" hidden accept="image/*" @change="handleCoverUpload">
                        <span v-if="!form.cover_image" class="plus">+</span>
                        <span v-if="!form.cover_image" class="hint">上传封面</span>
                    </div>
                </div>

                <div class="setting-card glass-card">
                    <div class="card-title">基本信息</div>
                    <select v-model="form.category" class="admin-select">
                        <option value="" disabled>选择分类</option>
                        <option v-for="c in sysCategories" :key="c.id" :value="c.name">{{ c.icon }} {{ c.name }}
                        </option>
                    </select>
                    <textarea v-model="form.summary" class="admin-textarea" rows="4"
                        placeholder="摘要/简介 (选填)..."></textarea>
                </div>

                <div class="setting-card glass-card" v-if="activeTab === 'short'">
                    <div class="card-title">图文工具</div>
                    <button class="draft-btn" @click="shortImagesInput.click()">
                        📷 批量插入图片
                    </button>
                    <input type="file" ref="shortImagesInput" hidden multiple accept="image/*"
                        @change="handleShortImages">
                    <p class="hint-text">点击选择多张图片，会自动追加到正文中。</p>
                </div>
            </div>
        </div>
    </div>
</template>

<style scoped>
/* ================= 全局容器 ================= */
/* 1. 全局容器：增加内边距，防止贴边 */
.publish-container {
    max-width: 1400px;
    margin: 0 auto;
    padding: 20px;
    /* 🔥 新增：给左右留出呼吸空间 */
    animation: fadeIn 0.5s ease;
    color: #e0e0e0;
    box-sizing: border-box;
    /* 🔥 确保 padding 不会撑大总宽度 */
}

/* 3. 侧边栏：增加吸附效果 (Sticky) */
.side-panel {
    display: flex;
    flex-direction: column;
    gap: 20px;

    /* 🔥 体验优化：让侧边栏在滚动时固定住 */
    position: sticky;
    top: 20px;
    /* 距离顶部的距离 */
    z-index: 10;
}

@keyframes fadeIn {
    from {
        opacity: 0;
        transform: translateY(10px);
    }

    to {
        opacity: 1;
        transform: translateY(0);
    }
}

/* ================= MdEditor 样式微调 ================= */

/* 给编辑器一个固定的高度和圆角 */
.my-editor {
    height: 600px;
    border-radius: 12px;
    overflow: hidden;
    border: 1px solid rgba(255, 255, 255, 0.1);
    --md-bk-color: rgba(30, 41, 59, 0.4) !important;
    /* 背景透明 */
}

/* 强制覆盖深色模式下的背景，使其半透明 */
:deep(.md-editor-dark) {
    --md-bk-color: rgba(30, 41, 59, 0.4) !important;
    --md-content-bk-color: transparent !important;
}

/* 工具栏背景微调 */
:deep(.md-toolbar-wrapper) {
    background-color: rgba(15, 23, 42, 0.6) !important;
    border-bottom: 1px solid rgba(255, 255, 255, 0.05) !important;
}

/* 输入区域背景 */
:deep(.md-content) {
    background-color: transparent !important;
}

/* 预览区域背景 */
:deep(.md-preview) {
    background-color: rgba(0, 0, 0, 0.2) !important;
}

/* ================= 布局与组件样式 ================= */
.type-tabs {
    display: flex;
    gap: 10px;
    margin-bottom: 20px;
}

.tab-item {
    padding: 10px 25px;
    background: rgba(30, 41, 59, 0.4);
    border-radius: 8px;
    color: #a9abb0;
    cursor: pointer;
    transition: 0.3s;
    border: 1px solid rgba(255, 255, 255, 0.05);
}

.tab-item.active {
    background: #3b82f6;
    color: #fff;
    font-weight: 600;
    box-shadow: 0 4px 15px rgba(59, 130, 246, 0.3);
    border-color: #3b82f6;
}

/* 2. 栅格布局：核心修复 */
.editor-grid {
    display: grid;
    /* 🔥 关键修复：把 1fr 改为 minmax(0, 1fr) */
    /* 解释：这能强制主列在空间不足时自动收缩，而不是撑破容器 */
    grid-template-columns: minmax(0, 1fr) 300px;
    gap: 25px;
    align-items: start;
    /* 🔥 关键：防止侧边栏被拉伸到和编辑器一样高 */
}

.glass-card {
    background: rgba(30, 41, 59, 0.4);
    backdrop-filter: blur(10px);
    border: 1px solid rgba(255, 255, 255, 0.05);
    border-radius: 16px;
    padding: 25px;
}

.title-input {
    width: 100%;
    background: transparent;
    border: none;
    outline: none;
    font-size: 24px;
    font-weight: 700;
    color: #fff;
    margin-bottom: 20px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    padding-bottom: 10px;
}

.title-input::placeholder {
    color: #475569;
}

/* 侧边栏按钮 */
.publish-btn {
    width: 100%;
    padding: 12px;
    background: linear-gradient(135deg, #10b981 0%, #059669 100%);
    border: none;
    border-radius: 8px;
    color: #fff;
    font-weight: 600;
    cursor: pointer;
    margin-bottom: 10px;
    box-shadow: 0 4px 12px rgba(16, 185, 129, 0.3);
    transition: 0.3s;
}

.publish-btn:hover {
    transform: translateY(-2px);
    box-shadow: 0 6px 16px rgba(16, 185, 129, 0.4);
}

.publish-btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
}

.draft-btn {
    width: 100%;
    padding: 10px;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.1);
    color: #a9abb0;
    border-radius: 8px;
    cursor: pointer;
    transition: 0.3s;
}

.draft-btn:hover {
    background: rgba(255, 255, 255, 0.1);
    color: #fff;
}

.card-title {
    font-size: 14px;
    font-weight: 600;
    color: #cbd5e1;
    margin-bottom: 15px;
}

.cover-uploader {
    height: 160px;
    background: rgba(0, 0, 0, 0.2);
    border-radius: 8px;
    border: 2px dashed rgba(255, 255, 255, 0.1);
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    cursor: pointer;
    background-size: cover;
    background-position: center;
    transition: 0.3s;
}

.cover-uploader:hover {
    border-color: #3b82f6;
    background-color: rgba(59, 130, 246, 0.05);
}

.cover-uploader .plus {
    font-size: 30px;
    color: #64748b;
}

.cover-uploader .hint {
    font-size: 12px;
    color: #475569;
}

.admin-select,
.admin-textarea {
    width: 100%;
    background: rgba(15, 23, 42, 0.6);
    border: 1px solid rgba(255, 255, 255, 0.1);
    color: #a9abb0;
    padding: 10px;
    border-radius: 8px;
    outline: none;
    margin-bottom: 15px;
}

.admin-textarea {
    resize: none;
    font-family: inherit;
}

/* 媒体上传区 */
.media-upload-area {
    height: 400px;
    border: 2px dashed rgba(255, 255, 255, 0.1);
    border-radius: 12px;
    display: flex;
    justify-content: center;
    align-items: center;
    cursor: pointer;
    transition: 0.3s;
    background: rgba(0, 0, 0, 0.1);
    position: relative;
}

.media-upload-area:hover {
    border-color: #3b82f6;
}

.media-preview {
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
}

.media-preview video {
    max-width: 100%;
    max-height: 300px;
    border-radius: 8px;
    margin-bottom: 15px;
}

.re-upload-btn {
    padding: 8px 16px;
    background: rgba(255, 255, 255, 0.1);
    color: #fff;
    border: 1px solid rgba(255, 255, 255, 0.2);
    border-radius: 6px;
    cursor: pointer;
    transition: 0.3s;
}

.re-upload-btn:hover {
    background: #3b82f6;
    border-color: #3b82f6;
}

.upload-placeholder {
    text-align: center;
    color: #64748b;
}

.upload-placeholder .icon {
    font-size: 48px;
    display: block;
    margin-bottom: 10px;
    opacity: 0.5;
}

/* 进度条 */
.progress-box {
    width: 200px;
    text-align: center;
}

.progress-bar {
    width: 100%;
    height: 4px;
    background: rgba(255, 255, 255, 0.1);
    border-radius: 2px;
    margin-top: 10px;
    overflow: hidden;
}

.progress-bar .fill {
    height: 100%;
    background: #10b981;
    transition: width 0.2s;
}

.hint-text {
    font-size: 0.8rem;
    color: #64748b;
    margin-top: 5px;
}

@media (max-width: 1024px) {
    .editor-grid {
        grid-template-columns: 1fr;
        /* 平板/手机端变单列 */
    }

    .side-panel {
        display: grid;
        grid-template-columns: 1fr 1fr;
        /* 平板端侧边栏横向排列 */
        position: static;
        /* 移动端取消吸附 */
    }
}

@media (max-width: 768px) {
    .publish-container {
        padding: 10px;
        /* 手机端减小内边距 */
    }

    .side-panel {
        grid-template-columns: 1fr;
        /* 手机端垂直排列 */
    }
}

/* ================= 📻 后台黑胶唱片样式 ================= */
.audio-mode {
    flex-direction: column;
    height: auto !important;
    padding: 40px 0;
    cursor: default !important;
    /* 里面有按钮，外层取消手型 */
}

.admin-vinyl-record {
    width: 160px;
    height: 160px;
    background: radial-gradient(circle, #333 0%, #111 100%);
    border-radius: 50%;
    border: 4px solid #222;
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
    display: flex;
    justify-content: center;
    align-items: center;
    position: relative;
    margin-bottom: 25px;

    /* 🔥 关键修改：虽然定义了动画，但默认状态是 paused (暂停) */
    animation: vinyl-spin 8s linear infinite;
    animation-play-state: paused;
}

/* 🔥 新增：只有加上 spinning 类时，动画才开始跑 (running) */
.admin-vinyl-record.spinning {
    animation-play-state: running;
}

@keyframes vinyl-spin {
    to {
        transform: rotate(360deg);
    }
}

.vinyl-cover {
    width: 70px;
    height: 70px;
    border-radius: 50%;
    object-fit: cover;
    border: 2px solid #d4af37;
    /* 金边 */
    z-index: 2;
}

.vinyl-default-label {
    width: 70px;
    height: 70px;
    border-radius: 50%;
    background: #1a1a1a;
    /* 深灰底色 */
    border: 2px solid #333;
    display: flex;
    justify-content: center;
    align-items: center;
    color: #555;
    font-size: 20px;
    z-index: 2;
    box-shadow: inset 0 0 10px rgba(0, 0, 0, 0.8);
}

.vinyl-hole {
    position: absolute;
    width: 12px;
    height: 12px;
    background: #000;
    border-radius: 50%;
    z-index: 3;
}

.admin-audio-player {
    width: 80%;
    max-width: 400px;
    margin-bottom: 20px;
    filter: invert(0.9);
    /* 反色适配深色后台 */
}

.audio-actions {
    margin-top: 10px;
}

/* ================= 📝 歌词编辑器样式 ================= */
.lyrics-section {
    margin-top: 20px;
}

.section-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 10px;
    color: #cbd5e1;
    font-weight: 600;
    font-size: 14px;
}

.mini-btn {
    padding: 4px 10px;
    background: rgba(59, 130, 246, 0.2);
    border: 1px solid #3b82f6;
    color: #60a5fa;
    border-radius: 4px;
    font-size: 12px;
    cursor: pointer;
}

.lyrics-textarea {
    width: 100%;
    height: 200px;
    background: rgba(15, 23, 42, 0.6);
    border: 1px solid rgba(255, 255, 255, 0.1);
    color: #94a3b8;
    padding: 15px;
    border-radius: 8px;
    font-family: 'JetBrains Mono', monospace;
    font-size: 13px;
    line-height: 1.6;
    resize: vertical;
    outline: none;
}

.lyrics-textarea:focus {
    border-color: #3b82f6;
    background: rgba(15, 23, 42, 0.8);
}

/* ================= ✈️ 旅行 Vlog 样式 ================= */
.travel-meta-row {
    display: grid;
    grid-template-columns: 2fr 1fr;
    gap: 20px;
    margin-bottom: 20px;
}

.meta-input-group {
    display: flex;
    align-items: center;
    background: rgba(15, 23, 42, 0.6);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 8px;
    padding: 0 15px;
}

:deep(.geo-selector-wrapper .input-inner) {
    border-bottom: none;
    /* 你的 .meta-input-group 已经有边框了 */
}

:deep(.geo-selector-wrapper .geo-input) {
    color: #fff;
    /* 适配深色背景 */
    font-size: 14px;
}

:deep(.geo-selector-wrapper .prefix-icon) {
    color: #e0e0e0;
}

:deep(.geo-dropdown) {
    background: rgba(30, 41, 59, 0.95);
    border-color: rgba(255, 255, 255, 0.1);
}

:deep(.geo-item) {
    border-bottom-color: rgba(255, 255, 255, 0.05);
}

:deep(.geo-main) {
    color: #fff;
}

:deep(.geo-item:hover) {
    background: rgba(255, 255, 255, 0.1);
}

.prefix-icon {
    font-size: 18px;
    margin-right: 10px;
    opacity: 0.7;
}

.meta-input,
.meta-select {
    flex: 1;
    background: transparent;
    border: none;
    color: #fff;
    padding: 12px 0;
    outline: none;
    font-size: 14px;
}

.meta-select option {
    background: #1e293b;
    /* 适配深色下拉框 */
    color: #fff;
}

/* 🔥🔥🔥 新增：取消修改按钮样式 🔥🔥🔥 */
.cancel-edit-btn {
    width: 100%;
    padding: 10px;
    margin-top: 10px;
    /* 与上方按钮拉开距离 */
    background: rgba(239, 68, 68, 0.1);
    /* 淡红色背景 */
    border: 1px solid rgba(239, 68, 68, 0.3);
    /* 红色边框 */
    color: #f87171;
    /* 红色文字 */
    border-radius: 8px;
    cursor: pointer;
    transition: 0.3s;
    font-weight: 600;
    font-size: 14px;
}

.cancel-edit-btn:hover {
    background: rgba(239, 68, 68, 0.2);
    border-color: #ef4444;
    color: #fff;
    /* 悬停变白字 */
    transform: translateY(-1px);
}

.cancel-edit-btn:active {
    transform: scale(0.98);
}
</style>