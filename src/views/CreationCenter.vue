<script setup>
import { ref, computed, onMounted, watch, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { api } from '@/utils/api'
import { message } from '@/utils/message.js'
import MarkdownIt from 'markdown-it'
import 'github-markdown-css/github-markdown-light.css'
import ArticleItem from '@/components/ArticleItem.vue'
// 🔥 1. 引入 Markdown 编辑器及其样式
import { MdEditor } from 'md-editor-v3';
import 'md-editor-v3/lib/style.css';
import LocationSelector from '@/components/LocationSelector.vue'

const router = useRouter()
const route = useRoute()
const md = new MarkdownIt({ html: true, linkify: true, breaks: true })
// ==================== 状态管理 ====================
const activeTab = ref('article')
const isSubmitting = ref(false)
const isUploading = ref(false)
const isAudioUploading = ref(false)
const uploadProgress = ref(0)
const audioUploadProgress = ref(0)
const isSuccess = ref(false)
const isEditing = ref(false)
const currentEditingId = ref(route.query.id || null)

const sysCategories = ref([])
const userColumns = ref([])
const showNewColumnModal = ref(false)
const newColumnName = ref('')
const newColumnDesc = ref('')

// 表单
const articleForm = ref({ title: '', summary: '', content: '', category: '', column_id: null, cover_image: '' })
const shortForm = ref({ title: '', summary: '', content: '', category: '', column_id: null, images: [], cover_image: '' })
const videoForm = ref({ title: '', description: '', video_url: '', cover_url: '', category: '', column_id: null })
const audioForm = ref({ title: '', description: '', audio_url: '', cover_url: '', lyrics: '', category: '', column_id: null })

// 🔥🔥🔥 视频监视器增强逻辑 🔥🔥🔥
const videoDuration = ref(0)      // 视频总时长
const videoCurrentTime = ref(0)   // 当前播放时间
const isPreviewPlaying = ref(false) // 是否正在播放

// ⏱️ 时间格式化函数：将秒数转为 HH:MM:SS
const formatTimeCode = (seconds) => {
    // 🔥 核心修复：增加 !isFinite(seconds) 判断
    // 很多浏览器在视频未完全加载元数据时，duration 会返回 Infinity，导致计算错误
    if (!seconds || isNaN(seconds) || !isFinite(seconds)) return '00:00:00'

    const h = Math.floor(seconds / 3600)
    const m = Math.floor((seconds % 3600) / 60)
    const s = Math.floor(seconds % 60)
    // 补零操作
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
}

// 🔥 新增：专门监听时长变化的事件
const onPreviewDurationChange = (e) => {
    const d = e.target.duration
    // 只有当时长是一个有效的有限数值时，才更新
    if (d && isFinite(d)) {
        videoDuration.value = d
    }
}

// 🎯 计算属性：决定 REC 右边显示什么
// 逻辑：显示 "当前时间 / 总时长" (例如 00:00:12 / 00:03:45) 这样最专业
const monitorTimeDisplay = computed(() => {
    // 如果还没上传视频，显示空
    if (!videoForm.value.video_url) return '00:00:00'

    // 生成时间码
    const current = formatTimeCode(videoCurrentTime.value)
    const total = formatTimeCode(videoDuration.value)

    return `${current} / ${total}`
})

// 🎬 视频事件监听
const onPreviewLoadedMetadata = (e) => {
    videoDuration.value = e.target.duration
    videoCurrentTime.value = 0
}

const onPreviewTimeUpdate = (e) => {
    videoCurrentTime.value = e.target.currentTime
}

const onPreviewPlay = () => { isPreviewPlaying.value = true }
const onPreviewPause = () => { isPreviewPlaying.value = false }
const onPreviewEnded = () => { isPreviewPlaying.value = false }

const travelForm = ref({
    title: '',
    summary: '',
    content: '',
    category: '游记',
    column_id: null,
    cover_image: '',
    location: '',
    continent: '亚洲',
    lat: null, // 🔥 新增
    lng: null  // 🔥 新增
})

// 新增：处理组件回调的函数
const handleGeoSelect = (data) => {
    travelForm.value.location = data.location // 只存城市名，如 "Tokyo"
    travelForm.value.lat = data.lat
    travelForm.value.lng = data.lng

    // 可选：如果 API 返回了国家，你可以自动判断大洲（这里暂时手动选）
    console.log('前端已锁定精准坐标:', data.lat, data.lng)
}

// 配合下拉框的大洲选项
const continentOptions = ['亚洲', '欧洲', '北美洲', '南美洲', '非洲', '大洋洲', '南极洲']
const travelCoverInput = ref(null) // 用于触发文件上传

// ==================== 数据获取 ====================
const fetchCategories = async () => {
    try {
        const res = await api.get('/categories')
        if (res.data.success) {
            sysCategories.value = res.data.data
            if (sysCategories.value.length > 0) {
                const defaultCategory = sysCategories.value[0].name
                    ;[articleForm, shortForm, videoForm, audioForm].forEach(form => {
                        if (!form.value.category) form.value.category = defaultCategory
                    })
            }
        }
    } catch (err) {
        console.error('加载频道失败:', err)
    }
}

const fetchUserColumns = async () => {
    try {
        const res = await api.get('/user/columns/simple')
        if (res.data.success) userColumns.value = res.data.data
    } catch (err) {
        console.error('加载专栏失败:', err)
    }
}

// ==================== 专栏管理 ====================
const getCurrentForm = () => {
    const map = {
        article: articleForm,
        short: shortForm,
        video: videoForm,
        audio: audioForm
    }
    return map[activeTab.value] || articleForm
}

const handleColumnChange = () => {
    const form = getCurrentForm()
    if (form.value.column_id === '__new_column__') {
        showNewColumnModal.value = true
        form.value.column_id = null
    }
}

const confirmAddColumn = async () => {
    if (!newColumnName.value.trim()) return message.warning('请输入专栏名称')
    try {
        const res = await api.post('/columns', {
            name: newColumnName.value,
            description: newColumnDesc.value
        })
        if (res.data.success) {
            const newId = res.data.data.id
            message.success('新专栏已开启')
            await fetchUserColumns()
            getCurrentForm().value.column_id = newId
            showNewColumnModal.value = false
            newColumnName.value = newColumnDesc.value = ''
        }
    } catch (err) {
        message.error('创建失败: ' + err.message)
    }
}

// ==================== 公共工具 ====================
const getProxyUrl = (url) => {
    if (!url || url === 'null' || url === 'undefined')
        return 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=200&h=200'
    if (url.startsWith('http') || url.startsWith('data:')) return url
    const isDev = import.meta.env.VITE_APP_ENV === 'development'
    const apiBase = isDev ? 'http://localhost:3000' : window.location.origin
    const cleanPath = url.startsWith('/') ? url : '/' + url
    return cleanPath.startsWith('/uploads') ? `${apiBase}${cleanPath}` : `/api/proxy-image?url=${encodeURIComponent(url)}`
}

const resetForm = () => {
    isEditing.value = false
    currentEditingId.value = null
    const defaultCat = sysCategories.value[0]?.name || ''
    articleForm.value = { title: '', summary: '', content: '', category: defaultCat, column_id: null, cover_image: '' }
    shortForm.value = { title: '', summary: '', content: '', category: defaultCat, column_id: null, images: [], cover_image: '' }
    videoForm.value = { title: '', description: '', video_url: '', cover_url: '', category: defaultCat, column_id: null }
    audioForm.value = { title: '', description: '', audio_url: '', cover_url: '', category: defaultCat, column_id: null }
    // 🔥 [补充] 重置旅行表单
    travelForm.value = {
        title: '', summary: '', content: '',
        category: '游记', column_id: null, cover_image: '',
        location: '', continent: '亚洲',
        lat: null, lng: null // 🔥 记得重置坐标
    }
}

// ==================== 发布逻辑 ====================
const renderedPreview = computed(() => md.render(articleForm.value.content || '*灵感实时预览...*'))
const isEditMode = computed(() => !!route.query.id)

// ✅ 修复版 submitContent
const submitContent = async () => {
    isSubmitting.value = true

    try {
        let endpoint = '/articles'
        let method = isEditing.value ? 'put' : 'post'

        // 1. 获取当前表单数据
        let activeFormData = {}
        let workType = 'article'

        if (activeTab.value === 'video') {
            activeFormData = videoForm.value;
            workType = 'video';
        } else if (activeTab.value === 'audio') {
            activeFormData = audioForm.value;
            workType = 'audio';
        } else if (activeTab.value === 'short') {
            activeFormData = shortForm.value;
            workType = 'short';
        } else if (activeTab.value === 'travel') {
            activeFormData = travelForm.value;
            workType = 'article';
        } else {
            activeFormData = articleForm.value;
            workType = 'article';
        }

        // 2. 构造 Payload
        let payload = {
            ...activeFormData,
            work_type: activeTab.value === 'travel' ? 'article' : activeTab.value,
            // 游记强制分类
            category: activeTab.value === 'travel' ? '游记' : activeFormData.category,
            // 🔥🔥🔥 重点：确保把 lat/lng 传给后端
            lat: activeFormData.lat || null,
            lng: activeFormData.lng || null
        }

        // 🔥🔥🔥 [关键修复] 统一封面字段名 🔥🔥🔥
        // 如果表单里有 cover_url (视频/音频)，强制赋值给 cover_image (后端通用字段)
        if (activeFormData.cover_url) {
            payload.cover_image = activeFormData.cover_url;
        }

        // 🔥🔥🔥 [关键修复] 内容兜底 🔥🔥🔥
        // 视频/音频如果没有 content，必须用 description 或 summary 填充，否则后端插入失败
        if (workType === 'video' || workType === 'audio') {
            payload.content = activeFormData.description || activeFormData.summary || '分享了一个作品';

            // 确保后端能收到 description 字段 (虽然大部分用 content，但 videos/audios 表有 description)
            payload.description = payload.content;
        }

        // 3. 校验逻辑 (保持不变)
        switch (activeTab.value) {
            case 'video':
                if (!payload.title?.trim()) throw new Error('请填写视频标题')
                if (!payload.video_url) throw new Error('请上传视频文件')
                if (!payload.category) throw new Error('请选择分类')
                break

            case 'audio':
                if (!payload.title?.trim()) throw new Error('请填写音频标题')
                if (!payload.audio_url) throw new Error('请上传音频文件')
                if (!payload.category) throw new Error('请选择分类')
                break

            case 'travel':
                if (!payload.title?.trim()) throw new Error('请填写游记标题')
                if (!payload.location) throw new Error('请填写旅行地点')
                if (!payload.content?.trim()) throw new Error('请填写游记正文')
                break

            case 'short':
                if (!payload.category) throw new Error('请选择分类')
                if (activeFormData.images.length === 0 && !activeFormData.content?.trim()) {
                    throw new Error('图文作品至少需要一张图片或一段文字')
                }
                if (!payload.cover_image && activeFormData.images.length > 0) {
                    payload.cover_image = activeFormData.images[0]
                }
                break

            default: // article
                if (!payload.title?.trim()) throw new Error('请填写文章标题')
                if (!payload.category) throw new Error('请选择分类')
                if (!payload.content?.trim()) throw new Error('请填写文章正文')
        }

        // 自动摘要
        if (!payload.summary && payload.content) {
            payload.summary = payload.content.replace(/[#*`>!\[\]\(\)]/g, '').substring(0, 100).trim() + '...'
        }

        // 编辑模式追加ID
        if (isEditing.value) {
            endpoint += `/${currentEditingId.value}`
        }

        // 发送请求
        const res = await api[method](endpoint, payload)

        if (res.data.success) {
            message.success(isEditing.value ? '修改已保存！' : '发布成功！') // 🔥 修复点 3：提示语也同步

            setTimeout(() => {
                if (isEditing.value) {
                    // 修改完后，刷新列表并切回作品管理
                    resetForm()
                    activeTab.value = 'works'
                    // 这一步很重要，刷新列表才能看到旧的被覆盖了
                    fetchUserWorks()
                } else {
                    resetForm()
                    // router.push('/blog') // 如果需要跳转
                }
            }, 1000)
        }

    } catch (err) {
        console.error(err)
        const msg = err.message || (err.response?.data?.message) || '发布失败'
        message.warning(msg)
    } finally {
        isSubmitting.value = false
    }
}

// 图文发布（含上传、拖拽、删除同步）
const shortImagesInput = ref(null)
const shortContentRef = ref(null)
const dragStartIndex = ref(null)

const handleShortImagesUpload = async (e) => {
    const files = Array.from(e.target.files)
    if (!files.length) return
    if (shortForm.value.images.length + files.length > 9) return message.warning('一次最多只能上传 9 张图片哦')

    const formData = new FormData()
    files.forEach(file => formData.append('images', file))
    isSubmitting.value = true

    try {
        const res = await api.post('/upload/comment-images', formData, {
            headers: { 'Content-Type': 'multipart/form-data' }
        })
        if (res.data.success) {
            const isDev = import.meta.env.VITE_APP_ENV === 'development'
            const apiBase = isDev ? 'http://localhost:3000' : window.location.origin
            const fullUrls = res.data.data.urls.map(url => `${apiBase}${url}`)
            shortForm.value.images.push(...fullUrls)

            const imageMarkdown = fullUrls.map(url => `![图片](${url})\n`).join('')
            const textarea = shortContentRef.value
            const current = shortForm.value.content || ''

            if (textarea) {
                const start = textarea.selectionStart
                const needNewLine = start > 0 && current[start - 1] !== '\n'
                const insert = (needNewLine ? '\n' : '') + imageMarkdown
                shortForm.value.content = current.substring(0, start) + insert + current.substring(textarea.selectionEnd)
                setTimeout(() => {
                    const pos = start + insert.length
                    textarea.focus()
                    textarea.setSelectionRange(pos, pos)
                }, 0)
            } else {
                shortForm.value.content = current + imageMarkdown
            }

            message.success(`📸 成功添加 ${fullUrls.length} 张图片`)
            if (!shortForm.value.cover_image) shortForm.value.cover_image = fullUrls[0]
        }
    } catch (err) {
        message.error('上传失败')
    } finally {
        isSubmitting.value = false
        e.target.value = ''
    }
}

const removeShortImage = (index) => {
    const url = shortForm.value.images[index]
    if (url) {
        const escaped = url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        shortForm.value.content = shortForm.value.content.replace(new RegExp(`!\\[.*?\\]\\(${escaped}\\)\\n?`, 'g'), '')
    }
    shortForm.value.images.splice(index, 1)
    if (shortForm.value.images.length > 0) {
        if (shortForm.value.cover_image === url) shortForm.value.cover_image = shortForm.value.images[0]
    } else {
        shortForm.value.cover_image = ''
    }
}

const handleDragStart = (i) => dragStartIndex.value = i
const handleDrop = (dropIndex) => {
    const dragIndex = dragStartIndex.value
    if (dragIndex === null || dragIndex === dropIndex) return
    const [moved] = shortForm.value.images.splice(dragIndex, 1)
    shortForm.value.images.splice(dropIndex, 0, moved)
    shortForm.value.cover_image = shortForm.value.images[0]
    const urlDrag = shortForm.value.images[dropIndex]
    const urlDrop = shortForm.value.images[dragIndex === dropIndex ? dropIndex + 1 : dragIndex]
    shortForm.value.content = shortForm.value.content.split(urlDrop).join('___TMP___').split(urlDrag).join(urlDrop).split('___TMP___').join(urlDrag)
    dragStartIndex.value = null
    message.success('排序已更新')
}

watch(() => shortForm.value.content, (newVal) => {
    if (!shortForm.value.images.length) return
    const urls = [...newVal.matchAll(/!\[.*?\]\((.*?)\)/g)].map(m => m[1])
    const surviving = shortForm.value.images.filter(img => urls.includes(img))
    if (surviving.length !== shortForm.value.images.length) {
        shortForm.value.images = surviving
        if (shortForm.value.images.length && !shortForm.value.images.includes(shortForm.value.cover_image)) {
            shortForm.value.cover_image = shortForm.value.images[0]
        } else if (!shortForm.value.images.length) {
            shortForm.value.cover_image = ''
        }
    }
})

// 视频、音频发布（略微精简重复代码）
const videoInput = ref(null), coverInput = ref(null)
const onVideoFileChange = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    if (!['video/mp4', 'video/quicktime'].includes(file.type)) return message.error('仅支持 MP4/MOV')
    if (file.size > 500 * 1024 * 1024) return message.error('文件过大')
    const formData = new FormData()
    formData.append('video', file)
    isUploading.value = true
    videoForm.value.video_url = URL.createObjectURL(file)
    try {
        const res = await api.post('/upload/video', formData, {
            headers: { 'Content-Type': undefined },
            onUploadProgress: p => uploadProgress.value = Math.round(p.loaded * 100 / p.total)
        })
        if (res.data.success) {
            videoForm.value.video_url = res.data.data.url
            message.success('🎬 素材已入库')
        }
    } catch (err) {
        message.error('上传失败')
    } finally {
        isUploading.value = false
    }
}

const onCoverFileChange = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    const formData = new FormData()
    formData.append('image', file)
    try {
        const res = await api.post('/upload', formData)
        if (res.data.success) {
            videoForm.value.cover_url = res.data.data.url
            message.success('✨ 海报已就绪')
        }
    } catch (err) {
        message.error('上传失败')
    }
}

const isAudioPlaying = ref(false)
const isVinylActive = ref(false) // ✨ 新增：控制唱片是否处于“激活/旋转”模式（含暂停态）

const handleAudioPlay = () => {
    isAudioPlaying.value = true
    isVinylActive.value = true   // ✨ 开始播放时，激活唱片动画
}
const handleAudioPause = () => isAudioPlaying.value = false

// ✨ 新增：专门处理播放结束，复位封面
const handleAudioEnded = () => {
    isAudioPlaying.value = false
    isVinylActive.value = false  // ✨ 只有结束后，才移除动画，让其归零
}

const audioFileRef = ref(null), audioCoverRef = ref(null)

const onAudioFileChange = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    const formData = new FormData()
    formData.append('audio', file)
    isAudioUploading.value = true
    try {
        const res = await api.post('/upload/audio', formData, {
            headers: { 'Content-Type': undefined },
            onUploadProgress: p => audioUploadProgress.value = Math.round(p.loaded * 100 / p.total)
        })
        if (res.data.success) {
            audioForm.value.audio_url = res.data.data.url
            message.success('📻 旋律已载入')
        }
    } catch (err) {
        message.error('上传失败')
    } finally {
        isAudioUploading.value = false
    }
}

// 🔥 新增：处理歌词文件上传 (读取文本内容)
const onLrcUpload = (e) => {
    const file = e.target.files[0]
    if (!file) return

    // 检查后缀
    const ext = file.name.split('.').pop().toLowerCase()
    if (ext !== 'lrc' && ext !== 'txt') return message.error('请上传 .lrc 或 .txt 格式歌词')

    const reader = new FileReader()
    reader.onload = (ev) => {
        // 读取成功，填入文本框
        audioForm.value.lyrics = ev.target.result
        message.success('📝 歌词已导入')
    }
    reader.readAsText(file) // 按文本读取
}
// 创建一个 ref 引用 input
const lrcInputRef = ref(null)

const onAudioCoverChange = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    const formData = new FormData()
    formData.append('image', file)
    try {
        const res = await api.post('/upload', formData)
        if (res.data.success) {
            audioForm.value.cover_url = res.data.data.url
            message.success('✨ 封面已就绪')
        }
    } catch (err) {
        message.error('上传失败')
    }
}

// ==================== 作品 & 社交管理 ====================
const worksSubTab = ref('article')
const userWorks = ref([])
const worksPagination = ref({ current: 1, pageSize: 10, total: 0, totalPages: 1 })
const isLoadingWorks = ref(false)

const worksNavItems = [
    { id: 'article', label: '📝 文章', count: 0 },
    { id: 'travel', label: '✈️ 游记', count: 0 }, // ✨ 新增这一行
    { id: 'short', label: '📸 图文', count: 0 },
    { id: 'video', label: '🎬 视频', count: 0 },
    { id: 'audio', label: '📻 音频', count: 0 }
]

const sanitizeWorkItem = (item) => {
    const type = item.work_type || worksSubTab.value

    // 🔥 调试：确保 work_type 正确
    if (!item.work_type) {
        console.warn('作品缺少 work_type 字段:', item)
    }

    let cover = item.cover_image
    if (type === 'short' && !cover && item.content) {
        const match = item.content.match(/!\[.*?\]\((.*?)\)/)
        if (match) cover = match[1]
    }

    return {
        ...item,
        work_type: type, // ✅ 确保有 work_type
        cover_image: cover,
        video_url: type === 'video' && item.video_url && !/^http/.test(item.video_url) ? '/' + item.video_url : item.video_url,
        audio_url: type === 'audio' && item.audio_url && !/^http/.test(item.audio_url) ? '/' + item.audio_url : item.audio_url,
        likes: Number(item.likes || 0),
        favorites: Number(item.favorites || 0),
        comments: Number(item.comments || 0),
        author_name: item.author_name || '我',
        author_avatar: item.author_avatar || '',
        author_username: item.author_username || ''
    }
}
const fetchUserWorks = async () => {
    isLoadingWorks.value = true
    try {
        const res = await api.get('/user/my-works', {
            params: { type: worksSubTab.value, page: worksPagination.value.current, limit: worksPagination.value.pageSize }
        })
        if (res.data.success) {
            userWorks.value = (res.data.data.list || []).map(sanitizeWorkItem)
            const p = res.data.data.pagination
            worksPagination.value = { ...p }
        }
    } catch (err) {
        message.error('作品加载失败')
    } finally {
        isLoadingWorks.value = false
    }
}

const handleWorksTabChange = (type) => {
    if (worksSubTab.value === type) return
    worksSubTab.value = type
    worksPagination.value.current = 1
    fetchUserWorks()

    // 🔥 新增：移动端自动滚动到当前激活项
    nextTick(() => {
        const activeItem = document.querySelector('.sub-nav-item.active')
        if (activeItem && window.innerWidth <= 900) {
            activeItem.scrollIntoView({
                behavior: 'smooth',
                block: 'nearest',
                inline: 'center'           // 🔥 关键：水平居中
            })
        }
    })
}

const changePage = (page) => {
    if (page < 1 || page > worksPagination.value.totalPages) return
    worksPagination.value.current = page
    fetchUserWorks()
    document.querySelector('.works-container')?.scrollTo({ top: 0, behavior: 'smooth' })
}

const handleDeleteWork = async (work) => {
    if (!confirm(`确定要删除《${work.title}》吗？`)) return

    try {
        // ✅ 根据作品自身类型决定删除接口
        let endpoint

        switch (work.work_type) {
            case 'video':
                endpoint = `/videos/${work.id}`
                break
            case 'audio':
                endpoint = `/audios/${work.id}`
                break
            default:
                endpoint = `/articles/${work.id}`
                break
        }

        const res = await api.delete(endpoint)

        if (res.data.success) {
            message.success('✅ 已删除')
            // 刷新当前列表
            fetchUserWorks()
        }
    } catch (err) {
        console.error('删除失败:', err)
        const errMsg = err.response?.data?.message || err.message || '删除失败'
        message.error('❌ ' + errMsg)
    }
}

const handleEditWork = (work) => {
    isEditing.value = true
    currentEditingId.value = work.id

    // 基础字段
    const base = { category: work.category, column_id: work.column_id || null }

    // 🔥 核心修改：优先判断是否为游记
    // 如果 category 是 '游记'，或者我们是在 'travel' tab 下管理的，就回显到 travelForm
    if (work.category === '游记' || worksSubTab.value === 'travel') {
        activeTab.value = 'travel' // 切换到旅行 Tab
        travelForm.value = {
            ...base,
            title: work.title,
            summary: work.summary,
            content: work.content,
            cover_image: work.cover_image,
            // ✨ 回显旅行专属字段 (确保后端列表接口返回了这些字段)
            location: work.location || '',
            continent: work.continent || '亚洲'
        }
    }
    // 下面是原有的判断逻辑
    else if (work.work_type === 'article') {
        activeTab.value = 'article'
        articleForm.value = { ...base, title: work.title, summary: work.summary, content: work.content, cover_image: work.cover_image }
    } else if (work.work_type === 'short') {
        activeTab.value = 'short'
        // 处理图文图片列表
        let images = []
        if (work.images && Array.isArray(work.images)) {
            images = work.images
        } else if (work.content) {
            // 尝试从 markdown 中提取图片
            const matches = [...work.content.matchAll(/!\[.*?\]\((.*?)\)/g)]
            images = matches.map(m => m[1])
        }
        shortForm.value = { ...base, title: work.title, summary: work.summary, content: work.content, cover_image: work.cover_image, images: images }
    } else if (work.work_type === 'video') {
        activeTab.value = 'video'
        videoForm.value = { ...base, title: work.title, description: work.summary, video_url: work.video_url, cover_url: work.cover_image }
    } else if (work.work_type === 'audio') {
        activeTab.value = 'audio'
        audioForm.value = { ...base, title: work.title, description: work.summary, audio_url: work.audio_url, cover_url: work.cover_image, lyrics: work.lyrics || '' }
    }

    message.info('已进入编辑模式')
    // 滚动到顶部
    const topEl = document.querySelector('.creation-page')
    if (topEl) topEl.scrollIntoView({ behavior: 'smooth' })
}

// 社交列表
const socialList = ref([])
const socialPagination = ref({ current: 1, pageSize: 12, total: 0, totalPages: 1 })
const isLoadingSocial = ref(false)

const fetchSocialList = async (type) => {
    isLoadingSocial.value = true
    const endpoint = type === 'fans' ? '/user/followers' : '/user/following'
    try {
        const res = await api.get(endpoint, { params: { page: socialPagination.value.current, limit: socialPagination.value.pageSize } })
        if (res.data.success) {
            socialList.value = res.data.data.list
            const p = res.data.data.pagination
            socialPagination.value = { ...p }
        }
    } catch (err) {
        message.error('加载列表失败')
    } finally {
        isLoadingSocial.value = false
    }
}

const changeSocialPage = (page) => {
    if (page < 1 || page > socialPagination.value.totalPages) return
    socialPagination.value.current = page
    fetchSocialList(activeTab.value)
}

// ==================== 🔥 2. 编辑器图片上传处理 ====================
const onEditorUpload = async (files, callback) => {
    const res = await Promise.all(
        files.map((file) => {
            return new Promise(async (resolve, reject) => {
                const formData = new FormData();
                formData.append('image', file); // 假设后端通用上传接口字段是 image
                try {
                    // 使用你现有的上传接口
                    const { data } = await api.post('/upload', formData);
                    if (data.success) {
                        // 获取完整 URL (兼容开发环境和生产环境)
                        const url = getProxyUrl(data.data.url);
                        resolve(url);
                    } else {
                        message.error('部分图片上传失败');
                        reject(data.message);
                    }
                } catch (error) {
                    reject(error);
                }
            });
        })
    );

    // 回调将图片插入编辑器
    callback(res.map((url) => url));
};

// 🔥 [第四步] 逻辑实现

// 1. 专门处理游记封面上传
const onTravelCoverChange = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    const formData = new FormData()
    formData.append('image', file)
    try {
        // 复用后端的通用上传接口
        const res = await api.post('/upload', formData)
        if (res.data.success) {
            travelForm.value.cover_image = res.data.data.url
            message.success('📷 旅拍封面已上传')
        }
    } catch (err) { message.error('上传失败') }
}

// 🔥 [补充] 通用成功处理函数
const handleSuccess = (type) => {
    isSuccess.value = true
    setTimeout(() => {
        message.success(isEditing.value ? '📝 修改已保存！' : '✨ 发布成功！')

        if (isEditing.value) {
            resetForm()
            activeTab.value = 'works'
        } else {
            // 如果是旅行，跳转到游记页；否则跳转博客页
            if (type === 'travel') {
                router.push('/travel')
            } else {
                router.push('/blog')
            }
        }

        isSuccess.value = false
    }, 1500)
}

// 可选：添加取消修改前的确认
const confirmCancel = () => {
    if (confirm('确定要取消修改吗？所有未保存的更改将丢失。')) {
        resetForm();
        activeTab.value = 'works';
    }
}

// ==================== 生命周期 & 监听 ====================
watch(activeTab, (newVal) => {
    if (newVal === 'works') fetchUserWorks()
    else if (newVal === 'fans' || newVal === 'follows') {
        socialPagination.value.current = 1
        fetchSocialList(newVal)
    }
    if (isEditing.value && newVal === 'works') resetForm()
})

watch(() => route.query.tab, (newTab) => {
    if (newTab && ['article', 'video', 'audio', 'short', 'works', 'fans', 'follows'].includes(newTab)) {
        activeTab.value = newTab
    }
}, { immediate: true })

onMounted(() => {
    fetchCategories()
    fetchUserColumns()
    if (route.query.category) articleForm.value.category = route.query.category
    const addRippleEffect = (e) => {
        const button = e.currentTarget
        const ripple = document.createElement('span')

        const rect = button.getBoundingClientRect()
        const size = Math.max(rect.width, rect.height)
        const x = e.clientX - rect.left - size / 2
        const y = e.clientY - rect.top - size / 2

        ripple.style.width = ripple.style.height = size + 'px'
        ripple.style.left = x + 'px'
        ripple.style.top = y + 'px'
        ripple.classList.add('ripple-effect')

        button.appendChild(ripple)

        setTimeout(() => ripple.remove(), 600)
    }

    // 给所有按钮添加效果
    document.querySelectorAll('.med-cancel-btn, .med-publish-btn').forEach(btn => {
        btn.addEventListener('click', addRippleEffect)
    })

    // 🔥 新增：监听导航栏滚动，动态显示左侧渐变
    const worksNav = document.querySelector('.works-sub-nav')
    if (worksNav && window.innerWidth <= 900) {
        worksNav.addEventListener('scroll', () => {
            const scrollLeft = worksNav.scrollLeft
            const beforeGradient = worksNav.parentElement.querySelector('.works-sub-nav::before')

            // 滚动超过20px时显示左侧渐变
            if (scrollLeft > 20) {
                worksNav.style.setProperty('--left-gradient-opacity', '1')
            } else {
                worksNav.style.setProperty('--left-gradient-opacity', '0')
            }
        })
    }

    // 🔥 页面加载完成后，自动滚动到当前激活的Tab
    setTimeout(() => {
        const activeItem = document.querySelector('.sub-nav-item.active')
        if (activeItem && window.innerWidth <= 900) {
            activeItem.scrollIntoView({
                behavior: 'smooth',
                block: 'nearest',
                inline: 'center'
            })
        }
    }, 300)  // 延迟300ms确保DOM完全渲染
})
</script>

<template>
    <div class="creation-page">
        <!-- 顶部区 -->
        <header class="creation-header crystal-card animate__animated animate__fadeInDown">
            <div class="header-left" @click="router.back()">
                <div class="back-btn">←</div>
                <h2 class="hub-title">创作中心 <small>CREATOR HUB</small></h2>
            </div>
            <div class="header-right">
                <span class="user-slogan">今天，记录点什么呢？</span>
            </div>
        </header>

        <!-- 内容区 -->
        <div class="creation-main-layout">
            <!-- 侧边栏（左） -->
            <aside class="creation-sidebar crystal-card animate__animated animate__fadeInLeft">
                <div class="nav-group">
                    <p class="group-label">✨ 发布灵感</p>
                    <div class="nav-item" :class="{ active: activeTab === 'article' }" @click="activeTab = 'article'">
                        <span class="icon">📝</span> 文章
                    </div>
                    <div class="nav-item" :class="{ active: activeTab === 'travel' }" @click="activeTab = 'travel'">
                        <span class="icon">✈️</span> 旅行 Vlog
                    </div>
                    <div class="nav-item" :class="{ active: activeTab === 'video' }" @click="activeTab = 'video'">
                        <span class="icon">🎬</span> 视频
                    </div>
                    <div class="nav-item" :class="{ active: activeTab === 'audio' }" @click="activeTab = 'audio'">
                        <span class="icon">📻</span> 音频
                    </div>
                    <div class="nav-item" :class="{ active: activeTab === 'short' }" @click="activeTab = 'short'">
                        <span class="icon">📸</span> 图文
                    </div>
                </div>
                <div class="nav-group">
                    <p class="group-label">📦 我的作品</p>
                    <div class="nav-item" :class="{ active: activeTab === 'works' }" @click="activeTab = 'works'">
                        <span class="icon">📁</span> 作品管理
                    </div>
                </div>
                <div class="nav-group">
                    <p class="group-label">🤝 互动社区</p>
                    <div class="nav-item" :class="{ active: activeTab === 'fans' }" @click="activeTab = 'fans'">
                        <span class="icon">💖</span> 粉丝
                    </div>
                    <div class="nav-item" :class="{ active: activeTab === 'follows' }" @click="activeTab = 'follows'">
                        <span class="icon">🎈</span> 关注
                    </div>
                </div>
            </aside>

            <!-- 主内容（右） -->
            <main class="creation-workspace animate__animated animate__fadeIn">
                <!-- 文章 -->
                <section v-if="activeTab === 'article'" class="workspace-card mediterranean-theme animate__animated"
                    :class="{ 'is-sealed': isSuccess }">
                    <div v-if="isSuccess" class="wax-seal-stamp animate__animated animate__bounceInDown">
                        <div class="seal-inner">V</div>
                    </div>
                    <div class="studio-header">
                        <input v-model="articleForm.title" class="elegant-title-input"
                            placeholder="Per favore, 输入灵感标题...">
                        <div class="summary-input-container">
                            <input v-model="articleForm.summary" class="elegant-summary-input"
                                placeholder="Breve riassunto / 输入这段灵感的引言 (可选)...">
                        </div>
                        <div class="header-divider"></div>
                    </div>


                    <div class="studio-body full-editor-layout">
                        <MdEditor v-model="articleForm.content" class="med-editor"
                            placeholder="在此流淌你的思绪... (支持 Markdown / 粘贴图片)" :toolbarsExclude="['github', 'save']"
                            @onUploadImg="onEditorUpload" :preview="true" />
                    </div>
                    <div class="studio-footer">
                        <div class="footer-inner-layout">
                            <div class="config-group">
                                <div class="med-select-wrapper">
                                    <span class="med-label">Canale / 公共频道</span>
                                    <div class="select-box-styled">
                                        <select v-model="articleForm.category" class="med-select">
                                            <option v-for="cat in sysCategories" :key="cat.id" :value="cat.name">
                                                {{ cat.icon }} {{ cat.name }}
                                            </option>
                                        </select>
                                    </div>
                                </div>
                                <div class="med-select-wrapper">
                                    <span class="med-label">Collezione / 个人专栏</span>
                                    <div class="select-box-styled">
                                        <select v-model="articleForm.column_id" class="med-select"
                                            @change="handleColumnChange">
                                            <option :value="null">-- 不归入专栏 --</option>
                                            <option v-for="col in userColumns" :key="col.id" :value="col.id">📘 {{
                                                col.name }}</option>
                                            <option value="__new_column__" class="new-col-opt">+ 开启新专栏...</option>
                                        </select>
                                    </div>
                                </div>
                            </div>
                            <div class="action-group">
                                <button v-if="isEditing" class="med-cancel-btn"
                                    @click="resetForm(); activeTab = 'works'"> 取消修改 </button>
                                <button class="med-publish-btn" @click="submitContent" :disabled="isSubmitting">
                                    <span>{{ isSubmitting ? '处理中...' : (isEditing ? 'SAVE / 保存修改' : 'PUBLISH / 立即发布')
                                        }}</span>
                                </button>
                            </div>
                        </div>
                    </div>
                </section>

                <!-- 旅行 Vlog -->
                <section v-else-if="activeTab === 'travel'"
                    class="workspace-card travel-theme animate__animated animate__fadeIn"
                    :class="{ 'is-sealed': isSuccess }">

                    <div v-if="isSuccess" class="wax-seal-stamp">
                        <div class="seal-inner">✈️</div>
                    </div>

                    <div class="studio-header">
                        <div class="travel-badge">TRAVEL LOG</div>
                        <input v-model="travelForm.title" class="elegant-title-input" placeholder="给这次旅程起个名字...">

                        <!-- 🔥 新增：引言输入框（与文章/图文页面一致） -->
                        <div class="summary-input-container">
                            <input v-model="travelForm.summary" class="elegant-summary-input"
                                placeholder="为这次旅程写一段简短的引言... (可选)">
                        </div>

                        <div class="location-bar">
                            <div class="loc-input-group">
                                <LocationSelector v-model="travelForm.location" @select-geo="handleGeoSelect" />
                            </div>

                            <div class="loc-input-group">
                                <span class="loc-icon">🌍</span>
                                <select v-model="travelForm.continent" class="loc-select">
                                    <option v-for="c in continentOptions" :key="c" :value="c">{{ c }}</option>
                                </select>
                            </div>
                        </div>
                    </div>

                    <div class="studio-body full-editor-layout">
                        <div class="travel-cover-upload" @click="travelCoverInput.click()">
                            <img v-if="travelForm.cover_image" :src="getProxyUrl(travelForm.cover_image)"
                                class="cover-preview">
                            <div v-else class="upload-hint">
                                <span class="icon">📷</span>
                                <span>上传旅拍封面 (用于地图展示)</span>
                            </div>
                            <input type="file" ref="travelCoverInput" hidden accept="image/*"
                                @change="onTravelCoverChange">
                        </div>

                        <MdEditor v-model="travelForm.content" class="med-editor travel-editor"
                            placeholder="记录旅行中的见闻、美食与感动..." @onUploadImg="onEditorUpload" />
                    </div>

                    <div class="studio-footer">
                        <div class="footer-inner-layout">
                            <div class="config-group">
                                <div class="med-select-wrapper">
                                    <span class="med-label">Canale / 公共频道</span>
                                    <div class="select-box-styled">
                                        <select v-model="articleForm.category" class="med-select">
                                            <option v-for="cat in sysCategories" :key="cat.id" :value="cat.name">
                                                {{ cat.icon }} {{ cat.name }}
                                            </option>
                                        </select>
                                    </div>
                                </div>
                                <div class="med-select-wrapper">
                                    <span class="med-label">Collezione / 个人专栏</span>
                                    <div class="select-box-styled">
                                        <select v-model="articleForm.column_id" class="med-select"
                                            @change="handleColumnChange">
                                            <option :value="null">-- 不归入专栏 --</option>
                                            <option v-for="col in userColumns" :key="col.id" :value="col.id">📘 {{
                                                col.name }}</option>
                                            <option value="__new_column__" class="new-col-opt">+ 开启新专栏...</option>
                                        </select>
                                    </div>
                                </div>
                            </div>
                            <div class="action-group">
                                <!-- 添加取消修改按钮 -->
                                <button v-if="isEditing" class="med-cancel-btn" @click="confirmCancel">
                                    取消修改
                                </button>
                                <button class="med-publish-btn travel-btn" @click="submitContent"
                                    :disabled="isSubmitting">
                                    {{ isSubmitting ? '处理中...' : (isEditing ? 'SAVE / 保存修改' : 'PUBLISH / 立即发布') }}
                                </button>
                            </div>
                        </div>
                    </div>
                </section>

                <!-- 图文 -->
                <section v-else-if="activeTab === 'short'"
                    class="workspace-card mediterranean-theme animate__animated animate__fadeIn"
                    :class="{ 'is-sealed': isSuccess }">
                    <div v-if="isSuccess" class="wax-seal-stamp animate__animated animate__bounceInDown">
                        <div class="seal-inner">V</div>
                    </div>
                    <div class="studio-header">
                        <input v-model="shortForm.title" class="elegant-title-input" placeholder="Galleria / 图文标题...">
                        <div class="summary-input-container">
                            <input v-model="shortForm.summary" class="elegant-summary-input"
                                placeholder="Didascalia / 写一段简短的描述...">
                        </div>
                        <div class="header-divider"></div>
                    </div>
                    <div class="studio-body short-layout">
                        <div class="photo-upload-zone" @click="shortImagesInput.click()">
                            <div class="upload-placeholder" v-if="shortForm.images.length === 0">
                                <span class="upload-icon">📸</span>
                                <p>点击添加图片 (支持多选)</p>
                                <small>记录美好瞬间</small>
                            </div>
                            <div class="photo-grid" v-else>
                                <div v-for="(img, index) in shortForm.images" :key="img" class="photo-item"
                                    :class="{ 'is-dragging': dragStartIndex === index }" draggable="true"
                                    @dragstart="handleDragStart(index)" @dragover.prevent @dragenter.prevent
                                    @drop="handleDrop(index)" @click.stop>
                                    <img :src="getProxyUrl(img)" />
                                    <div class="delete-btn" @click.stop="removeShortImage(index)"> × </div>
                                    <div class="drag-handle">
                                        <span>⋮⋮</span>
                                    </div>
                                </div>
                                <div class="photo-add-btn">
                                    <span>+</span>
                                </div>
                            </div>
                            <input type="file" ref="shortImagesInput" hidden multiple accept="image/*"
                                @change="handleShortImagesUpload" @click.stop>
                        </div>
                        <div class="text-editor-zone">
                            <div class="editor-pane">
                                <div class="label-tag">Story / 故事详情</div>
                                <MdEditor v-model="shortForm.content" class="med-editor-mini"
                                    placeholder="在这里写下图片的故事..."
                                    :toolbars="['bold', 'italic', 'quote', 'link', 'code', 'emoji']" :preview="false"
                                    @onUploadImg="onEditorUpload" />
                            </div>
                        </div>
                    </div>
                    <div class="studio-footer">
                        <div class="footer-inner-layout">
                            <div class="config-group">
                                <div class="med-select-wrapper">
                                    <span class="med-label">Canale / 公共频道</span>
                                    <div class="select-box-styled">
                                        <select v-model="shortForm.category" class="med-select">
                                            <option v-for="cat in sysCategories" :key="cat.id" :value="cat.name">
                                                {{ cat.icon }} {{ cat.name }}
                                            </option>
                                        </select>
                                    </div>
                                </div>
                                <div class="med-select-wrapper">
                                    <span class="med-label">Collezione / 个人专栏</span>
                                    <div class="select-box-styled">
                                        <select v-model="shortForm.column_id" class="med-select"
                                            @change="handleColumnChange">
                                            <option :value="null">-- 不归入专栏 --</option>
                                            <option v-for="col in userColumns" :key="col.id" :value="col.id">📘 {{
                                                col.name }}</option>
                                            <option value="__new_column__" class="new-col-opt">+ 开启新专栏...</option>
                                        </select>
                                    </div>
                                </div>
                            </div>
                            <div class="action-group">
                                <button v-if="isEditing" class="med-cancel-btn"
                                    @click="resetForm(); activeTab = 'works'"> 取消修改 </button>
                                <button class="med-publish-btn" @click="submitContent" :disabled="isSubmitting">
                                    <span>{{ isSubmitting ? '定格中...' : (isEditing ? 'SAVE / 保存修改' : 'SHARE / 分享此刻')
                                        }}</span>
                                </button>
                            </div>
                        </div>
                    </div>
                </section>

                <!-- 视频 -->
                <section v-else-if="activeTab === 'video'"
                    class="workspace-card mediterranean-theme animate__animated animate__fadeIn"
                    :class="{ 'is-sealed': isSuccess }">
                    <div v-if="isSuccess" class="wax-seal-stamp animate__animated animate__bounceInDown">
                        <div class="seal-inner">V</div>
                    </div>
                    <div class="studio-header">
                        <input v-model="videoForm.title" class="elegant-title-input"
                            placeholder="Cinematografia / 灵感映画标题...">
                        <div class="summary-input-container">
                            <input v-model="videoForm.description" class="elegant-summary-input"
                                placeholder="Breve trama / 为这段光影写一段引言...">
                        </div>
                        <div class="header-divider"></div>
                    </div>
                    <div class="studio-body video-studio-layout">
                        <div class="upload-top-row">
                            <div class="studio-upload-box" @click="videoInput.click()">
                                <div class="box-content">
                                    <span class="box-icon">📽️</span>
                                    <p>{{ videoForm.video_url ? '🎬 素材已载入' : '选择视频文件' }}</p>
                                    <small>MP4 / MOV (500MB以内)</small>
                                </div>
                                <input type="file" ref="videoInput" hidden accept="video/*" @change="onVideoFileChange">
                            </div>
                            <div class="studio-upload-box" @click="coverInput.click()">
                                <div class="box-content">
                                    <span class="box-icon">🎨</span>
                                    <p>{{ videoForm.cover_url ? '✨ 海报已就绪' : '设置视频海报' }}</p>
                                    <small>建议比例 16:9</small>
                                </div>
                                <input type="file" ref="coverInput" hidden accept="image/*" @change="onCoverFileChange">
                            </div>
                        </div>
                        <div class="cinema-monitor-section">
                            <div class="label-tag">Cinema Preview / 监视器预览</div>
                            <div class="theater-display-frame">
                                <div class="film-strip-edge left"><span></span><span></span><span></span></div>
                                <div class="monitor-screen-glass">
                                    <template v-if="videoForm.video_url">
                                        <div class="rec-status-indicator animate__animated animate__fadeIn">
                                            <span class="rec-dot" :class="{ 'is-recording': isPreviewPlaying }"></span>
                                            REC
                                            <span class="rec-time">{{ monitorTimeDisplay }}</span>
                                        </div>

                                        <video ref="previewVideoRef" :src="videoForm.video_url" controls
                                            class="studio-video-player" :poster="videoForm.cover_url" preload="metadata"
                                            @loadedmetadata="onPreviewLoadedMetadata"
                                            @durationchange="onPreviewDurationChange" @timeupdate="onPreviewTimeUpdate"
                                            @play="onPreviewPlay" @pause="onPreviewPause"
                                            @ended="onPreviewEnded"></video>
                                    </template>

                                    <div v-else class="standby-screen">
                                        <div class="noise-effect"></div>
                                        <p>等待映画素材导入... / STANDBY</p>
                                    </div>
                                </div>
                                <div class="film-strip-edge right"><span></span><span></span><span></span></div>
                            </div>
                            <Transition name="fade">
                                <div v-if="isUploading" class="upload-hud">
                                    <div class="hud-inner">
                                        <span>正在录制灵感... {{ uploadProgress }}%</span>
                                        <div class="hud-progress-track">
                                            <div class="hud-bar" :style="{ width: uploadProgress + '%' }"></div>
                                        </div>
                                    </div>
                                </div>
                            </Transition>
                        </div>
                    </div>
                    <div class="studio-footer">
                        <div class="footer-inner-layout">
                            <div class="config-group">
                                <div class="med-select-wrapper">
                                    <span class="med-label">Canale / 公共频道</span>
                                    <div class="select-box-styled">
                                        <select v-model="videoForm.category" class="med-select">
                                            <option v-for="cat in sysCategories" :key="cat.id" :value="cat.name">
                                                {{ cat.icon }} {{ cat.name }}
                                            </option>
                                        </select>
                                    </div>
                                </div>
                                <div class="med-select-wrapper">
                                    <span class="med-label">Collezione / 个人专栏</span>
                                    <div class="select-box-styled">
                                        <select v-model="videoForm.column_id" class="med-select"
                                            @change="handleColumnChange">
                                            <option :value="null">-- 不归入专栏 --</option>
                                            <option v-for="col in userColumns" :key="col.id" :value="col.id">📘 {{
                                                col.name }}</option>
                                            <option value="__new_column__" class="new-col-opt">+ 开启新专栏...</option>
                                        </select>
                                    </div>
                                </div>
                            </div>
                            <div class="action-group">
                                <button v-if="isEditing" class="med-cancel-btn"
                                    @click="resetForm(); activeTab = 'works'"> 取消修改 </button>
                                <button class="med-publish-btn" @click="submitContent"
                                    :disabled="isSubmitting || isUploading">
                                    <span>{{ isSubmitting ? '处理中...' : (isEditing ? 'SAVE / 保存修改' : 'EXHIBIT / 立即发布')
                                        }}</span>
                                </button>
                            </div>
                        </div>
                    </div>
                </section>

                <!-- 音频 -->
                <section v-else-if="activeTab === 'audio'"
                    class="workspace-card mediterranean-theme animate__animated animate__fadeIn"
                    :class="{ 'is-sealed': isSuccess }">
                    <div class="studio-header">
                        <input v-model="audioForm.title" class="elegant-title-input"
                            placeholder="Composizione / 给这段旋律起个名字...">
                        <textarea v-model="audioForm.description" class="elegant-summary-input"
                            placeholder="在此写下音乐背后的故事..."></textarea>

                        <div class="lyrics-input-area">
                            <div class="lyrics-toolbar">
                                <span class="label">Lyrics / 歌词 (LRC格式)</span>
                                <button class="upload-lrc-btn" @click="lrcInputRef.click()">📂 导入 LRC 文件</button>
                                <input type="file" ref="lrcInputRef" hidden accept=".lrc,.txt" @change="onLrcUpload">
                            </div>
                            <textarea v-model="audioForm.lyrics" class="elegant-lyrics-input"
                                placeholder="[00:00.00] 暂无歌词...&#10;[00:12.50] 点击上方按钮导入 LRC 文件..."></textarea>
                        </div>

                    </div>
                    <div class="studio-body audio-layout">
                        <div class="upload-top-row">
                            <div class="studio-upload-box audio-box" @click="audioFileRef.click()">
                                <div class="box-content">
                                    <span class="box-icon">🎶</span>
                                    <p>{{ audioForm.audio_url ? '🎵 旋律已载入' : '选择音频文件' }}</p>
                                </div>
                                <input type="file" ref="audioFileRef" hidden accept="audio/*"
                                    @change="onAudioFileChange">
                            </div>
                            <div class="studio-upload-box" @click="audioCoverRef.click()">
                                <div class="box-content">
                                    <span class="box-icon">📸</span>
                                    <p>{{ audioForm.cover_url ? '✨ 封面已就绪' : '设置唱片封面' }}</p>
                                </div>
                                <input type="file" ref="audioCoverRef" hidden accept="image/*"
                                    @change="onAudioCoverChange">
                            </div>
                        </div>
                        <div class="audio-preview-section centered-monitor">
                            <div class="label-tag">Studio Monitor / 录音室监制</div>
                            <div class="turntable-wrapper">
                                <div class="tonearm" :class="{ 'is-playing': isAudioPlaying }"></div>
                                <div class="vinyl-record" :class="{ 'is-spinning': isVinylActive }"
                                    :style="{ animationPlayState: isAudioPlaying ? 'running' : 'paused' }">

                                    <img :src="getProxyUrl(audioForm.cover_url)" class="vinyl-cover"
                                        v-if="audioForm.cover_url">
                                    <div class="vinyl-center-hole"></div>
                                    <div class="vinyl-shimmer"></div>
                                </div>
                            </div>
                            <div class="player-control-zone">
                                <audio v-if="audioForm.audio_url" :src="audioForm.audio_url" controls
                                    class="elegant-audio-node" @play="handleAudioPlay" @pause="handleAudioPause"
                                    @ended="handleAudioEnded"></audio>
                                <div v-else class="waiting-hint">等待音轨导入... / STANDBY</div>
                            </div>
                            <Transition name="fade">
                                <div v-if="isAudioUploading" class="upload-hud-mini">
                                    正在刻录灵感... {{ audioUploadProgress }}%
                                </div>
                            </Transition>
                        </div>
                    </div>
                    <div class="studio-footer">
                        <div class="footer-inner-layout">
                            <div class="config-group">
                                <div class="med-select-wrapper">
                                    <span class="med-label">Canale / 公共频道</span>
                                    <div class="select-box-styled">
                                        <select v-model="audioForm.category" class="med-select">
                                            <option v-for="cat in sysCategories" :key="cat.id" :value="cat.name">
                                                {{ cat.icon }} {{ cat.name }}
                                            </option>
                                        </select>
                                    </div>
                                </div>
                                <div class="med-select-wrapper">
                                    <span class="med-label">Collezione / 个人专栏</span>
                                    <div class="select-box-styled">
                                        <select v-model="audioForm.column_id" class="med-select"
                                            @change="handleColumnChange">
                                            <option :value="null">-- 不归入专栏 --</option>
                                            <option v-for="col in userColumns" :key="col.id" :value="col.id">📘 {{
                                                col.name }}</option>
                                            <option value="__new_column__" class="new-col-opt">+ 开启新专栏...</option>
                                        </select>
                                    </div>
                                </div>
                            </div>
                            <div class="action-group">
                                <button v-if="isEditing" class="med-cancel-btn"
                                    @click="resetForm(); activeTab = 'works'"> 取消修改
                                </button>
                                <button class="med-publish-btn" @click="submitContent"
                                    :disabled="isSubmitting || isAudioUploading">
                                    <span>{{ isSubmitting ? '刻录中...' : (isEditing ? 'SAVE / 保存修改' : 'RELEASE / 立即发行')
                                        }}</span>
                                </button>
                            </div>
                        </div>
                    </div>
                </section>

                <!-- 作品管理 -->
                <section v-else-if="activeTab === 'works'"
                    class="workspace-card mediterranean-theme animate__animated animate__fadeIn">
                    <div class="studio-header works-header">
                        <h2 class="works-title">My Portfolio / 作品管理</h2>
                        <div class="works-sub-nav">
                            <div v-for="tab in worksNavItems" :key="tab.id" class="sub-nav-item"
                                :class="{ active: worksSubTab === tab.id }" @click="handleWorksTabChange(tab.id)">
                                {{ tab.label }}
                            </div>
                        </div>
                        <div class="header-divider"></div>
                    </div>
                    <div class="works-container">
                        <div v-if="isLoadingWorks" class="loading-box">
                            <div class="spinner"></div>
                        </div>
                        <div v-else-if="userWorks.length > 0" class="works-list-wrapper">
                            <div class="works-list">
                                <div v-for="work in userWorks" :key="work.id" class="work-item-wrapper">
                                    <button class="delete-work-btn" @click.stop="handleDeleteWork(work)" title="删除此作品">
                                        <span>🗑️</span>
                                    </button>
                                    <button class="edit-work-btn" @click.stop="handleEditWork(work)" title="编辑此作品">
                                        <span>✎</span>
                                    </button>
                                    <ArticleItem :data="work"
                                        @click="router.push({ path: `/article/${work.id}`, query: { type: work.work_type } })" />
                                </div>
                            </div>
                            <div class="pagination-bar" v-if="worksPagination.totalPages > 1">
                                <button class="page-btn" :disabled="worksPagination.current === 1"
                                    @click="changePage(worksPagination.current - 1)"> ← 上一页 </button>
                                <span class="page-info"> {{ worksPagination.current }} / {{ worksPagination.totalPages
                                    }} </span>
                                <button class="page-btn"
                                    :disabled="worksPagination.current === worksPagination.totalPages"
                                    @click="changePage(worksPagination.current + 1)"> 下一页 → </button>
                            </div>
                        </div>
                        <div v-else class="empty-state-works">
                            <span class="empty-icon">🍃</span>
                            <p>该分类下暂无作品，快去创作吧！</p>
                            <button class="create-now-btn" @click="activeTab = worksSubTab">立即创作</button>
                        </div>
                    </div>
                </section>

                <!-- 粉丝 & 关注-->
                <section v-else-if="activeTab === 'fans' || activeTab === 'follows'"
                    class="workspace-card mediterranean-theme animate__animated animate__fadeIn">
                    <div class="studio-header works-header">
                        <h2 class="works-title">
                            {{ activeTab === 'fans' ? 'My Fans / 粉丝列表' : 'Following / 我的关注' }}
                        </h2>
                        <div class="header-divider"></div>
                    </div>
                    <div class="works-container">
                        <div v-if="isLoadingSocial" class="loading-box">
                            <div class="spinner"></div>
                        </div>
                        <div v-else-if="socialList.length > 0" class="social-list-wrapper">
                            <div class="social-grid">
                                <div v-for="user in socialList" :key="user.id" class="user-card"
                                    @click="router.push(`/profile/${user.username}`)">
                                    <div class="card-avatar">
                                        <img :src="getProxyUrl(user.avatar)" alt="avatar">
                                    </div>
                                    <div class="card-info">
                                        <h3 class="card-name">{{ user.nickname || user.username }}</h3>
                                        <p class="card-bio">{{ user.bio || '这个人很懒，什么都没写~' }}</p>
                                        <div class="card-stats">
                                            <span><b>{{ user.fans_count }}</b> 粉丝</span>
                                            <span class="divider">|</span>
                                            <span><b>{{ user.follow_count }}</b> 关注</span>
                                        </div>
                                    </div>
                                    <div class="card-action" v-if="activeTab === 'fans' && user.is_following">
                                        <span class="mutual-tag">互相关注</span>
                                    </div>
                                </div>
                            </div>
                            <div class="pagination-bar" v-if="socialPagination.totalPages > 1">
                                <button class="page-btn" :disabled="socialPagination.current === 1"
                                    @click="changeSocialPage(socialPagination.current - 1)">←</button>
                                <span class="page-info">{{ socialPagination.current }} / {{ socialPagination.totalPages
                                    }}</span>
                                <button class="page-btn"
                                    :disabled="socialPagination.current === socialPagination.totalPages"
                                    @click="changeSocialPage(socialPagination.current + 1)">→</button>
                            </div>
                        </div>
                        <div v-else class="empty-state-works">
                            <span class="empty-icon">🍃</span>
                            <p>{{ activeTab === 'fans' ? '还没有粉丝哦，快去发布作品吧！' : '你还没有关注任何人呢~' }}</p>
                        </div>
                    </div>
                </section>
            </main>
        </div>

        <!-- 新建专栏 -->
        <Transition name="fade-slide">
            <div v-if="showNewColumnModal" class="column-modal-overlay" @click="showNewColumnModal = false">
                <div class="column-modal art-modal" @click.stop>

                    <div class="art-modal-header">
                        <span class="decoration-line"></span>
                        <h3>新建藏书阁</h3>
                        <span class="decoration-line"></span>
                        <button class="art-close-btn" @click="showNewColumnModal = false">✕</button>
                    </div>

                    <div class="art-modal-body">
                        <div class="art-create-form animate__animated animate__fadeIn">
                            <div class="input-group">
                                <input v-model="newColumnName" type="text" class="art-input" placeholder=" " autofocus
                                    @keyup.enter="confirmAddColumn">
                                <label>给新文件夹起个名字</label>
                                <span class="input-underline"></span>
                            </div>

                            <div class="input-group">
                                <textarea v-model="newColumnDesc" class="art-input textarea" placeholder=" "
                                    rows="3"></textarea>
                                <label>写一段简介（选填）...</label>
                                <span class="input-underline"></span>
                            </div>

                            <div class="art-form-ops">
                                <button class="art-btn-text" @click="showNewColumnModal = false">取消</button>
                                <button class="art-btn-primary" @click="confirmAddColumn">
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
/* ==================== 🏛️ 全局布局与背景 ==================== */
.creation-page {
    /* 📱 移动端安全边距：顶部避开导航，底部避开菜单 */
    padding: 100px 20px 60px;
    min-height: 100vh;
    background: linear-gradient(to bottom, #fdfbf7, #f4f1ea);
    overflow-x: hidden;
    max-width: 100vw;
}

/* 🔥 全局媒体文件防炸屏 */
.creation-page img,
.creation-page video {
    max-width: 100%;
    height: auto;
    display: block;
}

/* ==================== 🎩 顶部通栏 ==================== */
.creation-header {
    max-width: 1400px;
    margin: 0 auto 40px;
    padding: 20px 40px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    background: rgba(255, 255, 255, 0.6);
    backdrop-filter: blur(12px);
    border: 1px solid rgba(255, 255, 255, 0.5);
    border-radius: 16px;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.03);
}

.header-left {
    display: flex;
    align-items: center;
    gap: 20px;
    cursor: pointer;
    transition: transform 0.3s ease;
}

.header-left:hover {
    transform: translateX(5px);
}

.back-btn {
    width: 44px;
    height: 44px;
    border-radius: 50%;
    background: #fff;
    border: 1px solid #e8dcc4;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 1.2rem;
    color: #8b5a2b;
    box-shadow: 0 2px 8px rgba(139, 90, 43, 0.1);
    transition: all 0.3s;
}

.header-left:hover .back-btn {
    background: #8b5a2b;
    color: #fff;
    border-color: #8b5a2b;
}

.hub-title {
    font-family: "Georgia", serif;
    font-size: 1.5rem;
    color: #4a3c28;
    display: flex;
    flex-direction: column;
    line-height: 1.2;
}

.hub-title small {
    font-family: "Inter", sans-serif;
    font-size: 0.7rem;
    color: #bca38a;
    letter-spacing: 2px;
    text-transform: uppercase;
    font-weight: 600;
}

.user-slogan {
    font-family: "STKaiti", "KaiTi", cursive;
    font-size: 1.1rem;
    color: #8b5a2b;
    font-style: italic;
    opacity: 0.8;
}

/* ==================== 📐 主工作区布局 ==================== */
.creation-main-layout {
    max-width: 1400px;
    margin: 0 auto;
    display: flex;
    gap: 40px;
    align-items: flex-start;
}

/* --- 左侧导航栏 --- */
.creation-sidebar {
    width: 260px;
    flex-shrink: 0;
    position: sticky;
    top: 110px;
    background: rgba(255, 255, 255, 0.5);
    backdrop-filter: blur(10px);
    border: 1px solid rgba(255, 255, 255, 0.6);
    border-radius: 16px;
    padding: 30px 20px;
}

.nav-group {
    margin-bottom: 35px;
}

.nav-group:last-child {
    margin-bottom: 0;
}

.group-label {
    font-size: 0.75rem;
    color: #bca38a;
    font-weight: 800;
    letter-spacing: 1px;
    margin-bottom: 15px;
    padding-left: 15px;
    text-transform: uppercase;
}

.nav-item {
    padding: 14px 20px;
    margin-bottom: 8px;
    border-radius: 12px;
    cursor: pointer;
    transition: all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);
    display: flex;
    align-items: center;
    gap: 15px;
    color: #5d4a3b;
    font-weight: 500;
    font-size: 0.95rem;
    border: 1px solid transparent;
}

.nav-item:hover {
    background: rgba(255, 255, 255, 0.8);
    transform: translateX(5px);
    color: #8b5a2b;
}

.nav-item.active {
    background: #fff;
    color: #8b5a2b;
    border-color: #e8dcc4;
    box-shadow: 0 4px 15px rgba(139, 90, 43, 0.1);
    font-weight: 700;
}

/* --- 右侧内容区 --- */
.creation-workspace {
    flex: 1;
    min-width: 0;
}

.workspace-card {
    /* 🔥 这里的 min-height 保证卡片本身够长 */
    min-height: 800px;
    background-color: #fcfaf7;
    background-image: url("data:image/svg+xml,%3Csvg width='100' height='100' viewBox='0 0 100 100' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M11 18c3.866 0 7-3.134 7-7s-3.134-7-7-7-7 3.134-7 7 3.134 7 7 7zm48 25c3.866 0 7-3.134 7-7s-3.134-7-7-7-7 3.134-7 7 3.134 7 7 7zm-43-7c1.657 0 3-1.343 3-3s-1.343-3-3-3-3 1.343-3 3 1.343 3 3 3zm63 31c1.657 0 3-1.343 3-3s-1.343-3-3-3-3 1.343-3 3 1.343 3 3 3zM34 90c1.657 0 3-1.343 3-3s-1.343-3-3-3-3 1.343-3 3 1.343 3 3 3zm56-76c1.657 0 3-1.343 3-3s-1.343-3-3-3-3 1.343-3 3 1.343 3 3 3zM12 86c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm28-65c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm23-11c2.76 0 5-2.24 5-5s-2.24-5-5-5-5 2.24-5 5 2.24 5 5 5zm-6 60c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm29 22c2.76 0 5-2.24 5-5s-2.24-5-5-5-5 2.24-5 5 2.24 5 5 5zM32 63c2.76 0 5-2.24 5-5s-2.24-5-5-5-5 2.24-5 5 2.24 5 5 5zm57-13c2.76 0 5-2.24 5-5s-2.24-5-5-5-5 2.24-5 5 2.24 5 5 5zm-9-21c1.105 0 2-.895 2-2s-.895-2-2-2-2 .895-2 2 .895 2 2 2zM60 91c1.105 0 2-.895 2-2s-.895-2-2-2-2 .895-2 2 .895 2 2 2zM35 41c1.105 0 2-.895 2-2s-.895-2-2-2-2 .895-2 2 .895 2 2 2zM12 60c1.105 0 2-.895 2-2s-.895-2-2-2-2 .895-2 2 .895 2 2 2z' fill='%23d2a679' fill-opacity='0.05' fill-rule='evenodd'/%3E%3C/svg%3E");
    border: 1px solid #e8dcc4;
    border-radius: 4px;
    padding: 60px;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05), 0 20px 40px rgba(0, 0, 0, 0.02), inset 0 0 80px rgba(210, 166, 121, 0.05);
    position: relative;
    display: flex;
    flex-direction: column;
}

/* ==================== ✍️ 优美输入框组件 ==================== */
.studio-header {
    margin-bottom: 40px;
    text-align: center;
}

.elegant-title-input {
    width: 100%;
    max-width: 800px;
    margin: 0 auto;
    background: transparent;
    border: none;
    border-bottom: 2px solid rgba(210, 166, 121, 0.2);
    padding: 10px 0;
    font-family: "Georgia", "Songti SC", serif;
    font-size: 2.5rem;
    font-weight: 700;
    color: #4a3c28;
    text-align: center;
    outline: none;
    transition: all 0.4s ease;
}

.elegant-title-input:focus {
    border-bottom-color: #8b5a2b;
    letter-spacing: 1px;
}

.elegant-title-input::placeholder {
    color: #d4c5b0;
    font-weight: 400;
}

.summary-input-container {
    margin-top: 20px;
    display: flex;
    justify-content: center;
}

.elegant-summary-input {
    width: 100%;
    max-width: 600px;
    background: transparent;
    border: none;
    border-bottom: 1px dashed rgba(210, 166, 121, 0.3);
    padding: 8px 0;
    font-family: "KaiTi", "STKaiti", serif;
    font-size: 1.1rem;
    color: #8b5a2b;
    text-align: center;
    font-style: italic;
    outline: none;
    transition: all 0.3s;
}

.elegant-summary-input:focus {
    border-bottom-style: solid;
    border-bottom-color: #d2a679;
    color: #5d4037;
}

.header-divider {
    width: 60px;
    height: 3px;
    background-color: #e8dcc4;
    margin: 30px auto 0;
    border-radius: 10px;
    opacity: 0.4;
}

/* 旅行Vlog的引言输入框样式 */
.travel-theme .summary-input-container {
    margin-top: 20px;
    display: flex;
    justify-content: center;
}

.travel-theme .elegant-summary-input {
    width: 100%;
    max-width: 600px;
    background: transparent;
    border: none;
    border-bottom: 1px dashed rgba(66, 184, 131, 0.3);
    /* 使用旅行主题色 */
    padding: 8px 0;
    font-family: "KaiTi", "STKaiti", serif;
    font-size: 1.1rem;
    color: #42b883;
    /* 旅行主题色 */
    text-align: center;
    font-style: italic;
    outline: none;
    transition: all 0.3s;
}

.travel-theme .elegant-summary-input:focus {
    border-bottom-style: solid;
    border-bottom-color: #42b883;
    color: #2c7c5a;
}

.travel-theme .elegant-summary-input::placeholder {
    color: #a8dadc;
    /* 浅色占位符 */
}

/* 确保移动端适配 */
@media (max-width: 900px) {
    .travel-theme .summary-input-container {
        margin-top: 15px;
    }

    .travel-theme .elegant-summary-input {
        font-size: 1rem;
        max-width: 90%;
        padding: 10px 0;
    }

    /* 极端小屏幕 */
    @media (max-width: 480px) {
        .travel-theme .elegant-summary-input {
            font-size: 0.95rem;
            max-width: 100%;
        }
    }
}

/* 调整旅行Vlog页面的间距 */
.travel-theme .studio-header {
    margin-bottom: 30px;
    /* 略微减少下边距，因为有引言了 */
}

.travel-theme .location-bar {
    margin-top: 25px;
    /* 增加位置选择器与引言的距离 */
}

/* 移动端优化间距 */
@media (max-width: 900px) {
    .travel-theme .studio-header {
        margin-bottom: 25px;
    }

    .travel-theme .location-bar {
        margin-top: 20px;
    }
}

/* ==================== 📝 Markdown 编辑器复古皮肤 (核心优化 - 文章) ==================== */

/* 1. 容器：保证有足够空间 */
.full-editor-layout {
    display: block !important;
    /* 🔥 重点修改：父容器不设死高度，设最小高度 */
    min-height: 800px;
}

/* 2. 文章主编辑器样式 (.med-editor) */
.med-editor {
    /* 🔥🔥🔥 核心修改：强制设置高度为 800px，这下一定变高！ 🔥🔥🔥 */
    height: 800px !important;

    border-radius: 8px;
    border: 1px solid rgba(210, 166, 121, 0.4) !important;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.03);
    /* ✅✅✅ 新增这行“防爆保险” ✅✅✅ */
    /* 这能确保任何溢出的内容都被切掉，并且保证圆角不被直角的滚动条覆盖 */
    overflow: hidden;

    /* 复古配色变量 */
    --md-bk-color: rgba(255, 255, 255, 0.6) !important;
    --md-color: #4a3c28 !important;
    --md-border-color: rgba(210, 166, 121, 0.3) !important;
    --md-bk-color-outstand: rgba(244, 241, 234, 0.8) !important;
    --md-hover-color: #e8dcc4 !important;
    --md-scrollbar-thumb-color: #d2a679 !important;
    --md-scrollbar-bg-color: transparent !important;
}

/* 编辑器内部字体 */
.med-editor :deep(.cm-scroller),
.med-editor :deep(.md-editor-preview) {
    font-family: "Inter", "Noto Serif SC", sans-serif !important;
    line-height: 1.8 !important;
    font-size: 16px !important;
}

/* 工具栏 */
.med-editor :deep(.md-editor-toolbar-wrapper) {
    border-bottom: 1px dashed rgba(210, 166, 121, 0.4) !important;
    padding: 8px 0 !important;
}

/* 预览区：羊皮纸效果 */
.med-editor :deep(.md-editor-preview-wrapper) {
    background: #fffefb !important;
    background-image: repeating-linear-gradient(transparent, transparent 31px, rgba(210, 166, 121, 0.05) 31px, rgba(210, 166, 121, 0.05) 32px) !important;
}

/* 选中文字颜色 */
.med-editor :deep(.cm-selectionBackground) {
    background: rgba(210, 166, 121, 0.3) !important;
}

/* ==================== 📸 图文 (Short) 编辑器样式 ==================== */
/* 3. 图文迷你编辑器样式 (.med-editor-mini) */
.med-editor-mini {
    /* 🔥🔥🔥 核心修正点：直接写死像素高度，不再依赖父级计算！ 🔥🔥🔥 */
    /* 600px(总高) - 30px(标签) = 570px。为了保险，设为 560px */
    height: 560px !important;

    border: 1px solid rgba(210, 166, 121, 0.3) !important;
    border-radius: 6px;
    /* 确保 overflow 是 hidden， forcing internal scroll */
    overflow: hidden !important;

    --md-bk-color: rgba(255, 255, 255, 0.5) !important;
    --md-border-color: transparent !important;
}

.med-editor-mini :deep(.md-editor-toolbar-wrapper) {
    padding: 4px 0 !important;
}

.med-editor-mini :deep(.cm-content) {
    padding: 15px !important;
}

/* ==================== 📸 图文专用布局 (最终暴力版) ==================== */
.short-layout {
    display: grid;
    grid-template-columns: 350px 1fr;
    gap: 50px;
    /* 🔥 1. 外框高度锁死 600px */
    height: 600px !important;
    overflow: hidden !important;
}

/* 左侧上传区 (保持原样) */
.photo-upload-zone {
    background: rgba(255, 255, 255, 0.5);
    border: 2px dashed #d2a679;
    border-radius: 8px;
    transition: all 0.3s;
    cursor: pointer;
    overflow-y: auto;
    height: 100%;
    padding: 15px;
}

.photo-upload-zone:hover {
    background: #fff;
    border-color: #8b5a2b;
    box-shadow: 0 8px 20px rgba(139, 90, 43, 0.1);
}

.photo-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));
    gap: 10px;
}

.photo-item {
    aspect-ratio: 1;
    border-radius: 6px;
    overflow: hidden;
    position: relative;
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.1);
    transition: transform 0.2s;
    cursor: grab;
    background: #eee;
}

.photo-item img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
}

.delete-btn {
    position: absolute;
    top: 4px;
    right: 4px;
    width: 20px;
    height: 20px;
    background: rgba(0, 0, 0, 0.6);
    color: #fff;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 14px;
    opacity: 0;
    transition: opacity 0.2s;
}

.photo-item:hover .delete-btn {
    opacity: 1;
}

.photo-add-btn {
    width: 100%;
    aspect-ratio: 1;
    border: 2px dashed #d2a679;
    border-radius: 6px;
    display: flex;
    justify-content: center;
    align-items: center;
    font-size: 2rem;
    color: #d2a679;
    transition: all 0.2s;
}

.photo-add-btn:hover {
    background: #fff;
    color: #8b5a2b;
}

.upload-placeholder {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
    color: #bca38a;
    text-align: center;
    padding: 40px 0;
}

.upload-icon {
    font-size: 3rem;
    margin-bottom: 10px;
}

/* 右侧文本区域容器 */
.text-editor-zone {
    height: 100%;
    overflow: hidden;
    /* 防止溢出 */
}

.editor-pane {
    display: flex;
    flex-direction: column;
    height: 100%;
    overflow: hidden;
}

.label-tag {
    flex-shrink: 0;
    height: 30px;
    /* 固定标签占位 */
    line-height: 30px;
    font-size: 0.7rem;
    color: #bca38a;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 2px;
    margin-bottom: 0;
}

/* ==================== 🎥 视频 & 📻 音频 工作室布局 ==================== */
.video-studio-layout,
.audio-layout {
    display: flex !important;
    flex-direction: column;
    gap: 35px;
    height: auto !important;
}

.studio-body {
    flex: 1;
    min-height: 500px;
    position: relative;
}

.upload-top-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 30px;
}

.studio-upload-box {
    height: 180px;
    background: rgba(255, 255, 255, 0.4);
    border: 1.5px dashed #d2a679;
    border-radius: 4px;
    display: flex;
    justify-content: center;
    align-items: center;
    cursor: pointer;
    transition: all 0.3s;
}

.studio-upload-box:hover {
    background: #fff;
    border-color: #8b5a2b;
    transform: translateY(-2px);
}

.box-content {
    text-align: center;
    color: #bca38a;
}

.box-icon {
    font-size: 2.5rem;
    display: block;
    margin-bottom: 10px;
}

.cinema-monitor-section {
    width: 100%;
}

.theater-display-frame {
    background: #111;
    padding: 20px 30px;
    border-radius: 4px;
    box-shadow: 0 30px 80px rgba(0, 0, 0, 0.3);
    display: flex;
    justify-content: center;
    position: relative;
}

/* ==================== 🔥 修复：监视器与视频精准居中 ==================== */

/* 1. 修复 REC 指示器占位导致视频偏右的问题 */
.rec-status-indicator {
    position: absolute;
    /* 🌟 关键：绝对定位，脱离文档流，不再挤占空间 */
    top: 15px;
    left: 15px;
    z-index: 10;
    /* 确保浮在视频上面 */

    /* 美化一下 REC 样式 */
    display: flex;
    align-items: center;
    gap: 6px;
    color: #ff3b30;
    font-family: 'Courier New', monospace;
    font-weight: 700;
    font-size: 12px;
    letter-spacing: 1px;
    pointer-events: none;
    /* 让点击穿透，不影响点视频 */
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.8);
    /* 加点阴影防背景太亮看不清 */
}

/* 修改红点样式：默认常亮（表示待机/暂停），播放时才闪烁 */
.rec-dot {
    width: 8px;
    height: 8px;
    background-color: #ff3b30;
    border-radius: 50%;
    box-shadow: 0 0 6px rgba(255, 59, 48, 0.8);
    /* 默认移除动画，暂停时是常亮的红点 */
    /* animation: rec-pulse 1s infinite alternate;  <-- 删掉这行 */
    transition: all 0.3s;
}

/* 🔥 新增：只有当添加了 .is-recording 类时（播放中），才开始呼吸闪烁 */
.rec-dot.is-recording {
    animation: rec-pulse 1s infinite alternate;
    box-shadow: 0 0 10px rgba(255, 59, 48, 1);
    /* 播放时光晕更强 */
}

.rec-time {
    color: #fff;
    opacity: 0.9;
    margin-left: 8px;
    font-family: 'Courier New', monospace;
    /* 等宽字体，数字跳动不抖动 */
    font-weight: 600;
    min-width: 140px;
    /* 给时间码预留空间，防止文字跳动 */
}

@keyframes rec-pulse {
    from {
        opacity: 1;
        transform: scale(1);
    }

    to {
        opacity: 0.3;
        transform: scale(0.8);
    }
}

.monitor-screen-glass {
    width: 100%;
    max-width: 800px;
    background: #050505;
    /* 深色背景更有电影感 */
    border: 1px solid #333;
    overflow: hidden;
    position: relative;
    /* 为 REC 的 absolute 提供锚点 */

    display: flex;
    justify-content: center;
    align-items: center;

    min-height: 200px;
}

.studio-video-player {
    /* 🔥 核心修改： */
    /* 不要用 width: 100%，那样会让竖屏视频的播放条特别宽，很丑 */
    /* 改用 auto，让视频元素紧贴内容尺寸 */
    width: auto !important;
    height: auto !important;

    /* 限制最大尺寸，防止溢出 */
    max-width: 100%;
    max-height: 65vh;
    /* 手机端创作页给个合适的高度限制 */

    /* 保持比例 */
    object-fit: contain;
    display: block;

    /* 加一点阴影让它跟背景区分开 */
    box-shadow: 0 0 30px rgba(0, 0, 0, 0.5);
}

.standby-screen {
    width: 100%;
    height: auto;
    aspect-ratio: 16 / 9;
    /* ✅ 只有空状态才强制 16:9 */
    display: flex;
    justify-content: center;
    align-items: center;
    flex-direction: column;
    /* 确保文字图标垂直排列 */
    color: #444;
    font-family: monospace;
}

.film-strip-edge {
    position: absolute;
    top: 0;
    bottom: 0;
    width: 30px;
    display: flex;
    flex-direction: column;
    justify-content: space-around;
    align-items: center;
}

.film-strip-edge.left {
    left: 5px;
}

.film-strip-edge.right {
    right: 5px;
}

.film-strip-edge span {
    width: 12px;
    height: 18px;
    background: #222;
    border-radius: 2px;
}

/* 进度条 */
.upload-hud {
    margin-top: 15px;
    padding: 15px;
    background: rgba(139, 90, 43, 0.05);
    border-radius: 4px;
    text-align: center;
}

.hud-progress-track {
    width: 100%;
    height: 4px;
    background: #eee;
    margin-top: 10px;
    border-radius: 2px;
}

.hud-bar {
    height: 100%;
    background: #42b883;
    transition: width 0.3s;
}

/* ==================== 📻 音频组件 (黑胶) ==================== */
.audio-preview-section.centered-monitor {
    width: 100%;
    max-width: 600px;
    margin: 10px auto 0;
    background: rgba(255, 255, 255, 0.5);
    border: 1px solid rgba(210, 166, 121, 0.3);
    border-radius: 12px;
    padding: 40px;
    display: flex;
    flex-direction: column;
    align-items: center;
}

.turntable-wrapper {
    position: relative;
    width: 220px;
    height: 220px;
    margin: 20px 0 35px;
}

.vinyl-record {
    width: 100%;
    height: 100%;
    background: #111;
    border-radius: 50%;
    border: 6px solid #222;
    display: flex;
    justify-content: center;
    align-items: center;
    position: relative;
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3);
}

.is-spinning {
    animation: vinyl-spin 6s linear infinite;
}

@keyframes vinyl-spin {
    to {
        transform: rotate(360deg);
    }
}

.vinyl-cover {
    width: 90px !important;
    height: 90px !important;
    border-radius: 50% !important;
    object-fit: cover !important;
    z-index: 2;
    border: 2px solid #222;
}

.tonearm {
    position: absolute;
    top: -30px;
    right: -50px;
    width: 90px;
    height: 160px;
    background: url('https://cdn-icons-png.flaticon.com/512/3043/3043663.png') no-repeat center/contain;
    transform-origin: top right;
    transform: rotate(-30deg);
    transition: transform 0.8s;
    z-index: 5;
}

.tonearm.is-playing {
    transform: rotate(10deg);
}

.player-control-zone {
    width: 100%;
    display: flex;
    justify-content: center;
}

.elegant-audio-node {
    width: 100%;
    filter: sepia(0.4);
}

/* ==================== 🦶 底部操作区 ==================== */
.studio-footer {
    margin-top: 50px;
    padding-top: 30px;
    border-top: 1px solid #e8dcc4;
}

.footer-inner-layout {
    display: flex;
    justify-content: space-between;
    align-items: flex-end;
    gap: 40px;
}

.config-group {
    flex: 1;
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 40px;
}

.med-select-wrapper {
    display: flex;
    flex-direction: column;
    gap: 8px;
}

.med-label {
    font-size: 0.7rem;
    font-weight: 800;
    color: #bca38a;
    text-transform: uppercase;
    letter-spacing: 1px;
}

.med-select {
    appearance: none;
    background: #fff;
    border: 1px solid #d2a679;
    padding: 10px 40px 10px 15px;
    border-radius: 4px;
    font-family: "Georgia", serif;
    color: #5d4037;
    font-size: 0.95rem;
    cursor: pointer;
    min-width: 180px;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%238b5a2b' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M6 9l6 6 6-6'%3E%3C/path%3E%3C/svg%3E");
    background-repeat: no-repeat;
    background-position: right 15px center;
    transition: all 0.3s;
}

.action-group {
    display: flex;
    gap: 20px;
    align-items: center;
}

/* ==================== 🎨 取消修改按钮 - 终极版 ==================== */
.med-cancel-btn {
    /* 基础样式 */
    position: relative;
    background: linear-gradient(135deg, #ffffff 0%, #fdfbf7 100%);
    color: #8b5a2b;
    font-size: 0.95rem;
    font-family: "Georgia", serif;
    font-weight: 600;

    /* 边框与间距 */
    border: 2px solid #e8dcc4;
    padding: 12px 32px;
    border-radius: 6px;

    /* 交互 */
    cursor: pointer;
    transition: all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
    letter-spacing: 1.5px;
    overflow: hidden;

    /* 阴影 */
    box-shadow:
        0 4px 12px rgba(139, 90, 43, 0.08),
        inset 0 1px 0 rgba(255, 255, 255, 0.6);

    /* 文字不被波纹遮挡 */
    z-index: 1;
}

/* 🌊 波纹效果层 */
.med-cancel-btn::before {
    content: '';
    position: absolute;
    top: 50%;
    left: 50%;
    width: 0;
    height: 0;
    border-radius: 50%;
    background: radial-gradient(circle, rgba(210, 166, 121, 0.3) 0%, rgba(139, 90, 43, 0.1) 50%, transparent 100%);
    transform: translate(-50%, -50%);
    transition: width 0.6s ease-out, height 0.6s ease-out;
    z-index: 0;
    pointer-events: none;
}

/* ✨ 装饰光晕 */
.med-cancel-btn::after {
    content: '';
    position: absolute;
    top: -50%;
    left: -50%;
    width: 200%;
    height: 200%;
    background: linear-gradient(45deg,
            transparent 30%,
            rgba(255, 255, 255, 0.3) 50%,
            transparent 70%);
    transform: translateX(-100%);
    transition: transform 0.6s;
    z-index: 0;
}

/* 悬浮状态 */
.med-cancel-btn:hover {
    background: linear-gradient(135deg, #fff 0%, #fcfaf7 100%);
    border-color: #d2a679;
    color: #6d4621;
    transform: translateY(-3px) scale(1.02);
    box-shadow:
        0 8px 24px rgba(139, 90, 43, 0.16),
        inset 0 1px 0 rgba(255, 255, 255, 0.9);
}

/* 悬浮时触发波纹 */
.med-cancel-btn:hover::before {
    width: 300px;
    height: 300px;
}

/* 悬浮时触发光晕 */
.med-cancel-btn:hover::after {
    transform: translateX(100%);
}

/* 点击状态 */
.med-cancel-btn:active {
    transform: translateY(-1px) scale(0.98);
    box-shadow:
        0 3px 12px rgba(139, 90, 43, 0.12),
        inset 0 2px 4px rgba(0, 0, 0, 0.06);
    transition: all 0.1s;
}

/* 点击时波纹加速 */
.med-cancel-btn:active::before {
    transition: width 0.3s, height 0.3s;
}

/* 确保文字在最上层 */
.med-cancel-btn span {
    position: relative;
    z-index: 2;
}

/* 🔥 移动端优化 */
@media (max-width: 900px) {
    .med-cancel-btn {
        width: 100%;
        padding: 15px;
        margin-bottom: 12px;
        font-size: 0.9rem;
    }

    /* 移动端波纹稍小 */
    .med-cancel-btn:hover::before {
        width: 200px;
        height: 200px;
    }


}

/* 极端小屏幕优化 */
@media (max-width: 480px) {
    .travel-theme .elegant-title-input {
        font-size: 1.3rem;
    }

    .location-bar {
        gap: 10px;
    }

    .loc-input-group {
        min-width: unset;
        width: 100%;
    }

    .travel-btn {
        padding: 12px;
        font-size: 0.9rem;
    }
}


/* 确保旅行页面所有交互元素都有良好的触摸反馈 */
.travel-theme .med-cancel-btn:active,
.travel-theme .travel-btn:active,
.travel-cover-upload:active,
.loc-select:active {
    transform: scale(0.98);
    transition: transform 0.1s;
}

/* 防止iOS Safari中的点击高亮 */
.travel-theme .med-cancel-btn,
.travel-theme .travel-btn,
.travel-cover-upload,
.loc-select {
    -webkit-tap-highlight-color: transparent;
}

/* 优化移动端输入体验 */
.travel-theme input,
.travel-theme select,
.travel-theme textarea {
    font-size: 16px;
    /* 防止iOS缩放 */
}

/* 旅行Vlog编辑状态下的样式 */
.travel-theme.is-editing {
    position: relative;
}

.travel-theme.is-editing::before {
    content: "✏️ 编辑模式";
    position: absolute;
    top: 10px;
    right: 10px;
    background: rgba(66, 184, 131, 0.1);
    color: #42b883;
    padding: 4px 8px;
    border-radius: 4px;
    font-size: 0.75rem;
    font-weight: 600;
    z-index: 10;
}

/* 移动端编辑状态提示优化 */
@media (max-width: 900px) {
    .travel-theme.is-editing::before {
        top: 5px;
        right: 5px;
        font-size: 0.7rem;
        padding: 3px 6px;
    }
}

/* 禁用状态（如果需要） */
.med-cancel-btn:disabled {
    background: #f5f5f5;
    color: #ccc;
    border-color: #e0e0e0;
    cursor: not-allowed;
    transform: none;
    box-shadow: none;
}

.med-cancel-btn:disabled::before,
.med-cancel-btn:disabled::after {
    display: none;
}

/* ==================== 🚀 发布按钮 - 增强版 ==================== */
.med-publish-btn {
    position: relative;
    background: linear-gradient(135deg, #8b5a2b 0%, #6d4621 100%);
    color: #fff;
    border: none;
    padding: 12px 40px;
    border-radius: 6px;
    font-family: "Georgia", serif;
    font-size: 1rem;
    letter-spacing: 2px;
    cursor: pointer;
    box-shadow:
        0 8px 20px rgba(139, 90, 43, 0.25),
        inset 0 1px 0 rgba(255, 255, 255, 0.2);
    transition: all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
    overflow: hidden;
    z-index: 1;
}

/* 发布按钮波纹 */
.med-publish-btn::before {
    content: '';
    position: absolute;
    top: 50%;
    left: 50%;
    width: 0;
    height: 0;
    border-radius: 50%;
    background: radial-gradient(circle, rgba(255, 255, 255, 0.3) 0%, rgba(255, 255, 255, 0.1) 50%, transparent 100%);
    transform: translate(-50%, -50%);
    transition: width 0.6s ease-out, height 0.6s ease-out;
    z-index: 0;
}

/* 发布按钮光晕 */
.med-publish-btn::after {
    content: '';
    position: absolute;
    top: -50%;
    left: -50%;
    width: 200%;
    height: 200%;
    background: linear-gradient(45deg,
            transparent 30%,
            rgba(255, 255, 255, 0.2) 50%,
            transparent 70%);
    transform: translateX(-100%);
    transition: transform 0.6s;
    z-index: 0;
}

.med-publish-btn:hover {
    transform: translateY(-4px) scale(1.03);
    background: linear-gradient(135deg, #6d4621 0%, #5a3919 100%);
    box-shadow:
        0 12px 32px rgba(139, 90, 43, 0.35),
        inset 0 1px 0 rgba(255, 255, 255, 0.3);
}

.med-publish-btn:hover::before {
    width: 300px;
    height: 300px;
}

.med-publish-btn:hover::after {
    transform: translateX(100%);
}

.med-publish-btn:active {
    transform: translateY(-2px) scale(1);
    box-shadow:
        0 6px 16px rgba(139, 90, 43, 0.25);
}

.med-publish-btn:disabled {
    background: linear-gradient(135deg, #d4c5b0 0%, #bca38a 100%);
    cursor: not-allowed;
    transform: none;
    box-shadow: none;
}

.med-publish-btn:disabled::before,
.med-publish-btn:disabled::after {
    display: none;
}

/* 文字层级 */
.med-publish-btn span {
    position: relative;
    z-index: 2;
}

/* 移动端 */
@media (max-width: 900px) {
    .med-publish-btn {
        width: 100%;
        padding: 15px;
    }

    .med-publish-btn:hover::before {
        width: 250px;
        height: 250px;
    }
}

/* 封缄印章动画 */
.wax-seal-stamp {
    position: absolute;
    top: 40%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: 100px;
    height: 100px;
    background: radial-gradient(circle at 30% 30%, #d4af37, #b8860b);
    border-radius: 50%;
    border: 4px solid #b8860b;
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.4);
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 100;
}

.seal-inner {
    font-size: 3rem;
    font-weight: 900;
    color: rgba(101, 67, 33, 0.6);
    font-family: serif;
}

.is-sealed {
    animation: card-fly-away 1s ease-in-out forwards 1s;
}

@keyframes card-fly-away {
    to {
        transform: translateY(-50px) scale(0.9);
        opacity: 0;
        filter: blur(10px);
    }
}

/* ==================== 🤝 作品/社交列表 ==================== */
.works-header {
    margin-bottom: 10px;
    text-align: center;
}

.works-title {
    font-family: "Georgia", serif;
    color: #4a3c28;
    font-size: 1.8rem;
    margin-bottom: 20px;
}

.works-sub-nav {
    display: flex;
    justify-content: center;
    gap: 15px;
    margin-bottom: 15px;
}

.sub-nav-item {
    padding: 8px 24px;
    border-radius: 20px;
    font-size: 0.95rem;
    font-weight: 600;
    color: #8b5a2b;
    background: rgba(255, 255, 255, 0.6);
    border: 1px solid rgba(210, 166, 121, 0.2);
    cursor: pointer;
    transition: all 0.3s;
}

.sub-nav-item:hover {
    background: #fff;
    transform: translateY(-2px);
    box-shadow: 0 4px 10px rgba(0, 0, 0, 0.05);
}

.sub-nav-item.active {
    background: #42b883;
    color: white;
    border-color: #42b883;
    box-shadow: 0 4px 15px rgba(66, 184, 131, 0.3);
}

.works-container {
    height: 100%;
    overflow-y: auto;
    padding: 0 5px;
    scrollbar-width: none;
}

.works-container::-webkit-scrollbar {
    display: none;
}

.works-list {
    display: flex;
    flex-direction: column;
    gap: 20px;
    padding-bottom: 40px;
}

.work-item-wrapper {
    position: relative;
    transition: transform 0.2s;
}

.work-item-wrapper:hover {
    transform: translateY(-2px);
    z-index: 2;
}

/* 社交网格 */
.social-list-wrapper {
    padding: 20px 0;
}

.social-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    gap: 25px;
}

/* 用户卡片 */
.user-card {
    background: #fff;
    border: 1px solid #e8dcc4;
    border-radius: 12px;
    padding: 30px 20px;
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    transition: all 0.3s;
    cursor: pointer;
    position: relative;
    overflow: hidden;
    box-shadow: 0 4px 10px rgba(0, 0, 0, 0.02);
    min-height: 250px;
}

.user-card:hover {
    transform: translateY(-5px);
    box-shadow: 0 15px 30px rgba(139, 90, 43, 0.1);
    border-color: #d2a679;
}

.card-avatar {
    width: 80px;
    height: 80px;
    border-radius: 50%;
    overflow: hidden;
    border: 3px solid #fdfcfb;
    margin-bottom: 15px;
    box-shadow: 0 4px 15px rgba(0, 0, 0, 0.1);
}

.card-avatar img {
    width: 100%;
    height: 100%;
    object-fit: cover;
}

.card-info {
    width: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    flex: 1;
}

.card-name {
    font-size: 1.2rem;
    font-weight: 700;
    color: #4a3c28;
    margin-bottom: 8px;
    font-family: "Georgia", serif;
}

.card-bio {
    font-size: 0.85rem;
    color: #888;
    margin-bottom: 20px;
    line-height: 1.5;
    height: 42px;
    overflow: hidden;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
}

.card-stats {
    font-size: 0.85rem;
    color: #5d4a3b;
    background: #fcfaf2;
    padding: 8px 25px;
    border-radius: 50px;
    display: flex;
    align-items: center;
    gap: 15px;
    margin-top: auto;
    justify-content: center;
}

.card-stats b {
    color: #d2a679;
    font-weight: 800;
    margin-right: 4px;
}

.divider {
    color: #e0e0e0;
}

.mutual-tag {
    position: absolute;
    top: 12px;
    right: 12px;
    font-size: 10px;
    color: #42b883;
    background: rgba(66, 184, 131, 0.1);
    padding: 4px 8px;
    border-radius: 4px;
    font-weight: 600;
}

/* 操作按钮 */
.delete-work-btn,
.edit-work-btn {
    position: absolute;
    top: 15px;
    width: 32px;
    height: 32px;
    border-radius: 50%;
    display: flex;
    justify-content: center;
    align-items: center;
    cursor: pointer;
    font-size: 14px;
    opacity: 0;
    transition: all 0.3s;
    z-index: 10;
}

.delete-work-btn {
    right: 15px;
    background: rgba(255, 255, 255, 0.95);
    border: 1px solid #ffcccc;
    color: #ff4d4f;
}

.edit-work-btn {
    right: 55px;
    background: rgba(255, 255, 255, 0.95);
    border: 1px solid #d2a679;
    color: #8b5a2b;
}

.work-item-wrapper:hover .delete-work-btn,
.work-item-wrapper:hover .edit-work-btn {
    opacity: 1;
}

.delete-work-btn:hover {
    background: #ff4d4f;
    color: white;
}

.edit-work-btn:hover {
    background: #8b5a2b;
    color: white;
}

.pagination-bar {
    display: flex;
    justify-content: center;
    align-items: center;
    gap: 20px;
    margin-top: auto;
    padding: 30px 0;
}

.page-btn {
    padding: 8px 16px;
    background: #fff;
    border: 1px solid #e0e0e0;
    border-radius: 6px;
    color: #555;
    cursor: pointer;
    transition: all 0.2s;
}

.page-btn:hover:not(:disabled) {
    border-color: #8b5a2b;
    color: #8b5a2b;
}

.page-btn:disabled {
    background: #f5f5f5;
    color: #ccc;
    cursor: not-allowed;
}

.page-info {
    font-family: "Georgia", serif;
    font-weight: bold;
    color: #8b5a2b;
}

/* 空状态 */
.empty-state-works {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 300px;
    color: #bca38a;
    text-align: center;
}

.empty-icon {
    font-size: 3rem;
    margin-bottom: 10px;
    opacity: 0.6;
}

.empty-state-works p {
    font-size: 0.95rem;
    margin-bottom: 20px;
    font-weight: 500;
}

.create-now-btn {
    padding: 10px 30px;
    border-radius: 50px;
    background: #42b883;
    color: white;
    border: none;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.3s;
    box-shadow: 0 4px 10px rgba(66, 184, 131, 0.3);
}

.create-now-btn:hover {
    transform: translateY(-2px);
    box-shadow: 0 8px 20px rgba(66, 184, 131, 0.4);
}

/* ==================== 🏛️ 文艺时尚风弹窗 (Art Modal) ==================== */
.column-modal-overlay {
    position: fixed;
    top: 0;
    left: 0;
    width: 100vw;
    height: 100vh;
    background: rgba(44, 30, 20, 0.6);
    backdrop-filter: blur(6px);
    z-index: 3000;
    display: flex;
    justify-content: center;
    align-items: center;
    padding: 20px;
}

.art-modal {
    width: 100%;
    max-width: 420px;
    background-color: #fdfbf7;
    border-radius: 12px;
    box-shadow: 0 20px 50px rgba(0, 0, 0, 0.2), 0 0 0 1px rgba(139, 90, 43, 0.1);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    position: relative;
    background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)' opacity='0.05'/%3E%3C/svg%3E");
}

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
    font-size: 1.3rem;
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
}

.input-group {
    position: relative;
    margin-bottom: 30px;
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

.input-group label {
    position: absolute;
    top: 18px;
    left: 0;
    color: #999;
    font-size: 0.95rem;
    transition: all 0.3s ease;
    pointer-events: none;
}

.art-input:focus~label,
.art-input:not(:placeholder-shown)~label {
    top: -5px;
    font-size: 0.75rem;
    color: #8b5a2b;
}

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

.art-form-ops {
    display: flex;
    justify-content: flex-end;
    gap: 20px;
    margin-top: 25px;
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
    color: #f7f1e3;
    border: none;
    padding: 10px 28px;
    border-radius: 4px;
    font-size: 0.95rem;
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

/* ==================== 📱 移动端适配 (Mobile Only) 终极修复 ==================== */
@media (max-width: 900px) {
    .creation-page {
        padding: 80px 15px 120px;
    }

    .creation-header {
        flex-direction: column;
        align-items: flex-start;
        gap: 10px;
        padding: 20px;
    }

    .header-right {
        display: none;
    }

    .creation-main-layout {
        flex-direction: column;
        gap: 25px;
    }

    /* 侧边栏 → 顶部横滑导航 */
    .creation-sidebar {
        position: static;
        width: 100%;
        display: flex;
        overflow-x: auto;
        padding: 10px 0;
        gap: 10px;
        background: transparent;
        border: none;
        backdrop-filter: none;
    }

    .creation-sidebar::-webkit-scrollbar {
        display: none;
    }

    .nav-group {
        margin: 0;
        display: flex;
        gap: 10px;
    }

    .group-label {
        display: none;
    }

    .nav-item {
        white-space: nowrap;
        flex-shrink: 0;
        background: #fff;
        padding: 10px 15px;
        font-size: 0.9rem;
    }

    /* 整体内容区居中 */
    .creation-workspace {
        width: 100%;
        max-width: 480px;
        margin: 0 auto;
        padding: 0;
    }

    .workspace-card {
        width: 100%;
        margin: 0 auto;
        padding: 20px 15px;
    }

    /* 响应式：所有布局改为垂直排列 */
    .studio-body,
    .short-layout,
    .video-studio-layout,
    .audio-layout,
    .upload-top-row,
    .footer-inner-layout {
        display: flex !important;
        flex-direction: column !important;
        height: auto !important;
        /* 允许垂直堆叠 */
        gap: 20px;
    }

    /* 🔥 专门修复 config-group 的布局 */
    .config-group {
        display: flex !important;
        flex-direction: column !important;
        grid-template-columns: none !important;
        gap: 20px;
        width: 100%;
    }

    /* 确保下拉框容器占满宽度 */
    .med-select-wrapper {
        width: 100%;
    }

    /* 下拉框占满容器宽度 */
    .med-select {
        width: 100%;
        min-width: unset;
    }

    /* 🔥🔥🔥 修正：手机端编辑器高度强制设定 🔥🔥🔥 */
    .text-editor-zone {
        width: 100%;
        height: 400px !important;
        /* 给编辑器区域一个固定高度 */
        margin-top: 10px;
    }

    .editor-pane {
        height: 100% !important;
    }

    .med-editor,
    .med-editor-mini {
        width: 100% !important;
        /* 删除了之前的 height: 0，改为明确的 360px */
        height: 360px !important;
        min-height: 360px !important;
        border: 1px solid #e8dcc4 !important;
        overflow: hidden !important;
    }

    /* 底部按钮自适应 */
    .action-group {
        width: 100%;
        flex-direction: column-reverse !important;
        gap: 12px;
    }

    .med-publish-btn {
        width: 100%;
        padding: 15px;
    }

    .med-cancel-btn {
        font-size: 0.9rem;
    }

    /* 其它元素微调 */
    .elegant-title-input {
        font-size: 1.5rem;
    }

    .photo-upload-zone {
        height: 300px !important;
    }

    .loc-input-group {
        display: flex;
        align-items: center;
        border-bottom: 2px solid #ddd;
        padding: 5px 5px;
        transition: border-color 0.3s;
        background: rgba(255, 255, 255, 0.5);
    }

    .loc-input-group:focus-within {
        border-color: #42b883;
    }

    .location-bar {
        /* 改为垂直排列，上下各占一行 */
        flex-direction: column;
        gap: 15px;
        /* 上下间距 */
        align-items: stretch;
        /* 拉伸占满宽度 */
        margin-bottom: 20px;
        width: 100%;
        /* 确保不溢出 */
    }

    /* 2. 输入框组调整 */
    .loc-input-group {
        width: 100%;
        /* 强制占满一行 */
        box-sizing: border-box;
        /* 防止 padding 撑大 */
        padding: 8px 0;
        /*稍微增加点击区域*/
    }

    :deep(.geo-selector-wrapper) {
        width: 100%;
    }

    :deep(.geo-input) {
        font-size: 14px;
        /* 手机端字体稍微小一点，防溢出 */
    }

    .loc-select {
        width: 100%;
        /* 让下拉框文字能完整显示 */
        font-size: 14px;
        border: none;
        background: transparent;
        outline: none;
        cursor: pointer;
        color: #555;
    }

    .loc-icon {
        margin-right: 8px;
        font-size: 1rem;
    }

    /* 🔥 横向滑动导航容器 - 完整版 */
    .works-sub-nav {
        display: flex;
        justify-content: flex-start;
        gap: 12px;
        margin-bottom: 15px;

        /* 核心：启用横向滚动 */
        overflow-x: auto;
        overflow-y: hidden;

        /* 优化滚动体验 */
        -webkit-overflow-scrolling: touch;
        scroll-behavior: smooth;

        /* 🔥 吸附效果（滚动后自动对齐） */
        scroll-snap-type: x proximity;
        /* x轴方向吸附，proximity模式（接近时吸附） */

        /* 首尾留白 - 让第一个和最后一个按钮不贴边 */
        padding: 0 20px;
        margin-left: -15px;
        margin-right: -15px;
        width: calc(100% + 30px);
    }

    /* 🔥 导航项样式优化 */
    .sub-nav-item {
        flex-shrink: 0;
        white-space: nowrap;

        /* 吸附点设置 */
        scroll-snap-align: start;
        /* 吸附到容器起点 */
        scroll-margin-left: 20px;
        /* 吸附时左侧留20px */

        font-size: 0.85rem;
        padding: 10px 18px;
        border-radius: 20px;
        min-width: fit-content;

        /* 增强触摸反馈 */
        transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    }

    /* 🔥 激活状态增强 */
    .sub-nav-item.active {
        transform: scale(1.05);
        /* 稍微放大 */
        box-shadow: 0 6px 20px rgba(66, 184, 131, 0.35);
    }

    /* 🔥 隐藏滚动条（保持美观） */
    .works-sub-nav::-webkit-scrollbar {
        display: none;
    }

    .works-sub-nav {
        scrollbar-width: none;
        -ms-overflow-style: none;
    }

    /* 🔥 右侧渐变提示 */
    .works-header {
        position: relative;
    }

    .works-sub-nav::after {
        content: '';
        position: absolute;
        right: 0;
        top: 0;
        bottom: 15px;
        /* 对齐导航栏底部 */
        width: 50px;
        background: linear-gradient(to right,
                transparent,
                rgba(252, 250, 247, 0.98) 70%);
        pointer-events: none;
        z-index: 2;
        transition: opacity 0.3s;
    }

    /* 🔥 左侧也加渐变（滚动后出现） */
    .works-sub-nav::before {
        content: '';
        position: absolute;
        left: 0;
        top: 0;
        bottom: 15px;
        width: 50px;
        background: linear-gradient(to left,
                transparent,
                rgba(252, 250, 247, 0.98) 70%);
        pointer-events: none;
        z-index: 2;
        opacity: var(--left-gradient-opacity, 0);
        /* 🔥 改为动态控制 */
        /* 默认隐藏 */
        transition: opacity 0.3s;
    }
}

/* 桌面端保持网格 */
@media (min-width: 901px) {
    .social-grid {
        display: grid !important;
        grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    }
}

/* 🔥 [第五步] 旅行专属样式 */
.travel-theme {
    /* 给背景加一点点地图纹理的感觉 */
    background-image: radial-gradient(#e0f7fa 1px, transparent 1px);
    background-size: 20px 20px;
}

.travel-badge {
    text-align: center;
    font-size: 0.8rem;
    letter-spacing: 4px;
    color: #42b883;
    font-weight: 800;
    margin-bottom: 10px;
}

.location-bar {
    display: flex;
    justify-content: center;
    gap: 20px;
    margin-top: 20px;
    margin-bottom: 30px;
    /* 🔥 新增：允许换行，这是响应式的基础 */
    flex-wrap: wrap;
}

.loc-input-group {
    display: flex;
    align-items: center;
    border-bottom: 2px solid #ddd;
    padding: 5px 10px;
    transition: border-color 0.3s;
    background: rgba(255, 255, 255, 0.5);
    /* 🔥 新增：默认宽度 */
    min-width: 180px;
}

.loc-input-group:focus-within {
    border-color: #42b883;
}

.loc-input {
    border: none;
    background: transparent;
    outline: none;
    font-size: 1rem;
    width: 150px;
    text-align: center;
}

.loc-select {
    border: none;
    background: transparent;
    outline: none;
    font-size: 1rem;
    cursor: pointer;
    color: #555;
}

.loc-icon {
    margin-right: 8px;
    font-size: 1.2rem;
}

/* 封面上传区样式 */
.travel-cover-upload {
    width: 100%;
    height: 200px;
    background: #f0f4f8;
    border: 2px dashed #ccd;
    border-radius: 8px;
    display: flex;
    justify-content: center;
    align-items: center;
    cursor: pointer;
    margin-bottom: 20px;
    overflow: hidden;
    transition: all 0.3s;
}

.travel-cover-upload:hover {
    border-color: #42b883;
    background: #f0fdfa;
}

.cover-preview {
    width: 100%;
    height: 100%;
    object-fit: cover;
}

.upload-hint {
    display: flex;
    flex-direction: column;
    align-items: center;
    color: #999;
}

.travel-btn {
    position: relative;
    background: linear-gradient(135deg, #42b883 0%, #35a372 100%) !important;
    overflow: hidden;
}

.travel-btn::before {
    content: '✈️';
    position: absolute;
    right: -30px;
    top: 50%;
    transform: translateY(-50%);
    font-size: 1.2rem;
    transition: right 0.6s cubic-bezier(0.34, 1.56, 0.64, 1);
    opacity: 0;
}

.travel-btn:hover::before {
    right: 15px;
    opacity: 1;
}

.travel-btn:hover {
    padding-right: 50px !important;
}

/* 🔥 歌词输入区样式 */
.lyrics-input-area {
    width: 100%;
    max-width: 600px;
    /* 与 Summary 对齐 */
    margin: 20px auto 0;
    text-align: left;
}

.lyrics-toolbar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 8px;
}

.lyrics-toolbar .label {
    font-size: 0.8rem;
    color: #bca38a;
    font-weight: bold;
    letter-spacing: 1px;
}

.upload-lrc-btn {
    background: transparent;
    border: 1px solid #d2a679;
    color: #8b5a2b;
    border-radius: 4px;
    padding: 2px 8px;
    font-size: 0.75rem;
    cursor: pointer;
    transition: all 0.3s;
}

.upload-lrc-btn:hover {
    background: #8b5a2b;
    color: #fff;
}

.elegant-lyrics-input {
    width: 100%;
    height: 120px;
    background: rgba(255, 255, 255, 0.4);
    border: 1px dashed rgba(210, 166, 121, 0.5);
    border-radius: 8px;
    padding: 10px;
    font-family: monospace;
    /* 等宽字体适合看时间轴 */
    font-size: 0.85rem;
    color: #5d4037;
    outline: none;
    resize: vertical;
}

.elegant-lyrics-input:focus {
    border-color: #8b5a2b;
    background: rgba(255, 255, 255, 0.8);
}

/* 点击波纹动画 */
.ripple-effect {
    position: absolute;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.6);
    transform: scale(0);
    animation: ripple-animation 0.6s ease-out;
    pointer-events: none;
    z-index: 1;
}

@keyframes ripple-animation {
    to {
        transform: scale(4);
        opacity: 0;
    }
}
</style>