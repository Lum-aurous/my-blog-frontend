<script setup>
import { ref, onMounted, onUnmounted, computed, nextTick, watch, provide } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useUserStore } from '@/stores/user.js'
import { message } from '@/utils/message.js'
import { api } from '@/utils/api'
import "../style.css";
import html2canvas from 'html2canvas'
import CommentItem from '@/components/CommentItem.vue'
import MarkdownIt from 'markdown-it'
import 'github-markdown-css/github-markdown-light.css'

const route = useRoute()
const router = useRouter()
const md = new MarkdownIt({ html: true, linkify: true, breaks: true })
const userStore = useUserStore()
const article = ref(null)
const isFollowing = ref(false)

// 🔥 1. 评论分页相关状态 (必须先定义)
const allCommentsTree = ref([]) // 完整的评论树
const displayComments = ref([]) // 当前显示的评论树
const commentPage = ref(1)
const commentPageSize = 10
const hasMoreComments = computed(() => displayComments.value.length < allCommentsTree.value.length)
const isLoadingCommentsMore = ref(false)

// 🔥 2. 交互状态 (必须先定义)
const replyTarget = ref(null) // ✅ 确保在 submitComment 之前定义
const commentContent = ref('')
const loading = ref(true)
const isSubmitting = ref(false)

const isLoggedIn = computed(() => !!userStore.token)
const currentUser = computed(() => userStore.user || {})

// ===== Emoji & 图片 =====
const showEmojiPicker = ref(false)
const selectedImages = ref([])
const imageInputRef = ref(null)
const expandedReplies = ref(new Set())
const MAX_IMAGES = 9 // 补上最大图片数量限制

// 🔥🔥🔥 Emoji 数据列表 🔥🔥🔥
const emojis = [
    '😀', '😁', '😂', '🤣', '😃', '😄', '😅', '😆', '😉', '😊',
    '😋', '😎', '😍', '😘', '🥰', '😗', '😙', '😚', '🙂', '🤗',
    '🤩', '🤔', '🤨', '😐', '😑', '😶', '🙄', '😏', '😣', '😥',
    '😮', '🤐', '😯', '😪', '😫', '😴', '😌', '😛', '😜', '😝',
    '🤤', '😒', '😓', '😔', '😕', '🙃', '🤑', '😲', '☹️', '🙁',
    '😖', '😞', '😟', '😤', '😢', '😭', '😦', '😧', 'kz', '😬',
    '🤯', '😩', '😨', '😱', '🥵', '🥶', '😳', '🤪', '😵', '😡',
    '😠', '🤬', '😷', '🤒', '🤕', '🤢', '🤮', '🤧', '😇', '🤠',
    '👍', '👎', '👊', '👌', '🤝', '🙏', '💪', '👏', '❤️', '💔',
    '✨', '🔥', '🎉', '🎁', '🌹', '🎵', '👀', '👻', '🚀', '💯'
]

const getFullAvatarUrl = (path) => {
    if (!path) return 'https://w.wallhaven.cc/full/76/wallhaven-76r86v.jpg'; // 默认头像
    if (path.startsWith('http') || path.startsWith('data:')) return path;

    // 处理本地上传路径
    const isDev = import.meta.env.VITE_APP_ENV === 'development';
    const apiBase = isDev ? 'http://localhost:3000' : window.location.origin;

    let cleanPath = path.startsWith('/') ? path : '/' + path;
    // 如果路径里已经包含了 /api/uploads 或者 /uploads，需要根据实际情况拼接
    // 假设后端静态资源挂载在 /uploads 或 /api/uploads
    return `${apiBase}${cleanPath}`;
}

// 🔥🔥🔥 【修复 3】补全图片压缩函数 (这是评论图片上传报错的根源) 🔥🔥🔥
const compressImage = (file, options = { quality: 0.6, maxWidth: 1200 }) => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.readAsDataURL(file)
        reader.onload = (event) => {
            const img = new Image()
            img.src = event.target.result
            img.onload = () => {
                let width = img.width
                let height = img.height

                if (width > options.maxWidth) {
                    height = Math.round((height * options.maxWidth) / width)
                    width = options.maxWidth
                }

                const canvas = document.createElement('canvas')
                canvas.width = width
                canvas.height = height
                const ctx = canvas.getContext('2d')
                ctx.drawImage(img, 0, 0, width, height)

                canvas.toBlob((blob) => {
                    if (!blob) {
                        reject(new Error('Canvas is empty'))
                        return
                    }
                    // 重新包装成 File 对象
                    const newFile = new File([blob], file.name, {
                        type: 'image/jpeg',
                        lastModified: Date.now(),
                    })
                    resolve(newFile)
                }, 'image/jpeg', options.quality)
            }
            img.onerror = (err) => reject(err)
        }
        reader.onerror = (err) => reject(err)
    })
}

// 🔥 互动功能状态
const isLiked = ref(false)
const isFavorited = ref(false)
const likeCount = ref(0)
const favoriteCount = ref(0)
const showColumnModal = ref(false)
const userColumns = ref([])
const isCreatingInModal = ref(false)
const newColumnData = ref({ name: '', description: '' })

const renderedContent = computed(() => {
    const rawContent = article.value?.content || ''
    return md.render(rawContent)
})
const currentUrl = computed(() => typeof window !== 'undefined' ? window.location.href : '');
const qrCodeUrl = computed(() => `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(currentUrl.value)}`);
const defaultAuthorAvatar = 'https://w.wallhaven.cc/full/76/wallhaven-76r86v.jpg';

// 🔥🔥🔥 新增：统一灯箱逻辑 (与后台保持一致) 🔥🔥🔥
const isLightboxOpen = ref(false)
const lightboxUrl = ref('')

// 打开灯箱
const openLightbox = (url) => {
    if (!url) return
    // 自动处理代理路径，不管是正文图片还是评论图片都适用
    lightboxUrl.value = getProxyUrl(url)
    isLightboxOpen.value = true
    document.body.style.overflow = 'hidden'
}

// 关闭灯箱
const closeLightbox = () => {
    isLightboxOpen.value = false
    document.body.style.overflow = 'auto' // 恢复滚动
    // 延迟清空 URL，避免动画消失时闪烁
    setTimeout(() => { lightboxUrl.value = '' }, 300)
}

// 键盘 ESC 关闭
// 修改現有的 handleEsc 函數，增加劇場模式的 ESC 退出
const handleEsc = (e) => {
    if (e.key === 'Escape') {
        if (isLightboxOpen.value) {
            closeLightbox()
        } else if (isCinemaMode.value) {
            // ESC 退出劇場模式
            console.log('⎋ ESC 鍵退出劇場模式')
            exitCinemaMode()
        }
    }
}

// 🔥 新增：統一的退出劇場模式函數
const exitCinemaMode = () => {
    console.log('👋 触发退出逻辑')
    isCinemaMode.value = false
    isVideoPlaying.value = false // 同步更新播放状态

    // 暂停视频
    if (videoPlayerRef.value) {
        videoPlayerRef.value.pause()
    }

    // 恢复页面滚动
    document.documentElement.style.overflow = ''
    document.body.style.overflow = ''
}

// 🔥 关键：提供给子组件 (CommentItem) 使用
provide('triggerLightbox', openLightbox)

const showSidebar = ref(true)
const scrollPercent = ref(0)
let rafId = null
const handleSmartSidebar = () => {
    if (rafId) cancelAnimationFrame(rafId)
    rafId = requestAnimationFrame(() => {
        const commentSection = document.getElementById('comments')
        if (!commentSection) return
        const commentRect = commentSection.getBoundingClientRect()
        const viewportHeight = window.innerHeight
        const scrollTop = window.scrollY
        const visibleHeightOfComments = viewportHeight - commentRect.top
        showSidebar.value = visibleHeightOfComments < 400
        const commentsAbsoluteTop = scrollTop + commentRect.top
        const readingEndLine = commentsAbsoluteTop - viewportHeight + 400
        if (readingEndLine > 0) {
            const percent = Math.floor((scrollTop / readingEndLine) * 100)
            scrollPercent.value = Math.min(100, Math.max(0, percent))
        } else {
            scrollPercent.value = 100
        }
    })
}
const progressColor = computed(() => scrollPercent.value >= 98 ? '#ff9800' : '#42b883')
const sidebarStyle = computed(() => ({
    opacity: showSidebar.value ? 1 : 0,
    transform: `translateX(${showSidebar.value ? '0' : '-15px'}) scale(${showSidebar.value ? 1 : 0.9})`,
    pointerEvents: showSidebar.value ? 'all' : 'none',
    transition: 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)'
}))

// ... 路径处理工具 ...
// 🔥🔥🔥 核心修复：路径处理工具 🔥🔥🔥
const getProxyUrl = (url) => {
    // 1. 空值检查
    if (!url || url === 'null' || url === 'undefined' || typeof url !== 'string') {
        return 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=200&h=200';
    }

    // 2. 外部链接直接返回
    if (url.startsWith('http') || url.startsWith('data:')) {
        return url;
    }

    // 3. 🔥 关键修复：清洗路径 (去空格，替换 Windows 反斜杠)
    let cleanPath = url.trim().replace(/\\/g, '/');

    // 4. 补全 /uploads/ 前缀 (防止数据库里只存了 "videos/xxx.mp4")
    // 如果路径不包含 uploads 且不是以 / 开头，且看起来像是本地文件
    if (!cleanPath.startsWith('/') && !cleanPath.includes('uploads/')) {
        cleanPath = '/uploads/' + cleanPath;
    } else if (!cleanPath.startsWith('/')) {
        cleanPath = '/' + cleanPath;
    }

    // 5. 环境判断与拼接
    // 你的 .env.production 里配置了 VITE_API_TARGET=http://39.105.210.117:3000
    // 这里会读取它，从而正确指向服务器
    const apiBase = import.meta.env.VITE_API_TARGET || 'http://localhost:3000';

    // 移除 apiBase 末尾可能的斜杠，防止双斜杠
    const finalBase = apiBase.endsWith('/') ? apiBase.slice(0, -1) : apiBase;

    return `${finalBase}${cleanPath}`;
}
const formatCount = (count) => {
    if (!count || count === 0) return '0'
    if (count >= 1000) return `${(count / 1000).toFixed(1)}K`
    return count
}
const formatDate = (dateStr) => {
    if (!dateStr) return ''
    const date = new Date(dateStr)
    return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`
}
const formatFullTime = (dateStr) => {
    if (!dateStr) return ''
    return new Date(dateStr).toLocaleString()
}
const hexToRgb = (hex) => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? `${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}` : '214, 163, 84';
};

// ... 类型判断 ...
const currentWorkType = computed(() => {
    if (!article.value) return 'article';
    if (article.value.work_type) return article.value.work_type;
    if (route.query.type) return route.query.type;
    if (article.value.audio_url) return 'audio';
    if (article.value.video_url) return 'video';
    if (/!\[.*?\]\(.*?\)/.test(article.value.content)) return 'short';
    return 'article';
});

const contentMediaType = computed(() => {
    if (!article.value) return 'text-only';
    if (article.value.video_url) return 'video';
    if (article.value.audio_url) return 'audio';
    if (article.value.cover_image || article.value.work_type === 'short') return 'standard';
    return 'text-only';
});

// ==================== 🖼️ 背景样式同步修复 ====================
// 确保英雄区背景图也引用清洗后的字段
const heroBgStyle = computed(() => {
    const type = contentMediaType.value;
    if (type === 'text-only') return { background: 'linear-gradient(135deg, #eaddca 0%, #fdfaf2 50%, #eaddca 100%)' };

    // 🔥 这里直接使用清洗后的字段，逻辑更清晰
    const rawUrl = article.value?.cover_image || article.value?.cover || defaultAuthorAvatar;
    const finalUrl = getProxyUrl(rawUrl);

    const isMedia = ['video', 'audio', 'standard'].includes(type);
    return {
        backgroundImage: `url(${finalUrl})`,
        filter: isMedia ? 'brightness(0.85)' : 'none',
        transform: isMedia ? 'scale(1.05)' : 'none',
        transition: 'all 1s ease',
        backgroundSize: 'cover',
        backgroundPosition: 'center 30%'
    };
});

// ... 音频相关 ...
const isAudioPlaying = ref(false);
const isVinylActive = ref(false); // ✨ 新增：控制唱片是否处于“激活/旋转”模式（含暂停态）

const handleAudioPlay = () => {
    isAudioPlaying.value = true;
    isVinylActive.value = true; // ✨ 开始播放：激活动画
}

const handleAudioPause = () => {
    isAudioPlaying.value = false;
    // ✨ 暂停时：不修改 isVinylActive，保持定格
}

// ✨ 新增：播放结束，彻底重置
const handleAudioEnded = () => {
    isAudioPlaying.value = false;
    isVinylActive.value = false; // ✨ 只有结束后，才移除动画，让其归零
}

// 🔥 歌词相关状态
const lyricsData = ref([]) // 解析后的歌词数组 [{time: 12.5, text: '歌词'}]
const currentLyricIndex = ref(-1) // 当前高亮的歌词行索引
const audioPlayerRef = ref(null) // 确保拿到 audio 元素的引用

// 🔥 解析 LRC 函数
const parseLyrics = (lrcString) => {
    if (!lrcString) return []
    const lines = lrcString.split('\n')
    const result = []
    // 匹配时间轴 [mm:ss.xx]
    const timeRegex = /\[(\d{2}):(\d{2})\.(\d{2,3})\]/

    for (const line of lines) {
        const match = timeRegex.exec(line)
        if (match) {
            const min = parseInt(match[1])
            const sec = parseInt(match[2])
            const ms = parseInt(match[3])
            // 转换为秒 (毫秒如果是2位需*10，3位直接用)
            const time = min * 60 + sec + (ms / (match[3].length === 3 ? 1000 : 100))
            const text = line.replace(timeRegex, '').trim()
            if (text) { // 只要有内容的行
                result.push({ time, text })
            }
        }
    }
    return result
}

// 🔥 监听音频播放时间更新 (核心同步逻辑)
const handleTimeUpdate = (e) => {
    const currentTime = e.target.currentTime
    // 找到当前时间对应的最后一行歌词
    if (lyricsData.value.length === 0) return

    // 倒序查找，找到第一个时间小于等于 currentTime 的行
    for (let i = lyricsData.value.length - 1; i >= 0; i--) {
        if (currentTime >= lyricsData.value[i].time) {
            currentLyricIndex.value = i
            break
        }
    }
}

// 🔥 监听 article 数据变化，解析歌词
watch(() => article.value, (newVal) => {
    if (newVal && newVal.lyrics) {
        lyricsData.value = parseLyrics(newVal.lyrics)
    } else {
        lyricsData.value = []
    }
}, { immediate: true })

// 🔥🔥🔥 新增：自定义播放器核心逻辑 🔥🔥🔥
const audioDuration = ref(0) // 总时长 (秒)
const audioCurrentTime = ref(0) // 当前时间 (秒)
const isDragging = ref(false) // 是否正在拖拽进度条

// 格式化时间 (mm:ss)
const formatTime = (seconds) => {
    if (!seconds || isNaN(seconds)) return '00:00'
    const m = Math.floor(seconds / 60)
    const s = Math.floor(seconds % 60)
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
}

// 加载元数据 (获取总时长)
const onAudioLoaded = (e) => {
    audioDuration.value = e.target.duration
}

// 统一的时间更新入口 (同时驱动歌词和进度条)
const onCustomTimeUpdate = (e) => {
    const time = e.target.currentTime
    // 1. 更新播放器进度 (如果没在拖拽)
    if (!isDragging.value) {
        audioCurrentTime.value = time
    }
    // 2. 驱动歌词 (复用之前的逻辑)
    handleTimeUpdate(e)
}

// 切换播放/暂停
const togglePlayPause = () => {
    const audio = audioPlayerRef.value
    if (!audio) return
    if (audio.paused) audio.play()
    else audio.pause()
}

// 进度条点击跳转
const seekAudio = (e) => {
    const audio = audioPlayerRef.value
    if (!audio) return
    const progressBar = e.currentTarget
    const rect = progressBar.getBoundingClientRect()
    const clickX = e.clientX - rect.left
    const percent = clickX / rect.width
    const targetTime = percent * audioDuration.value

    audio.currentTime = targetTime
    audioCurrentTime.value = targetTime
}

// 计算进度百分比
const progressPercent = computed(() => {
    if (!audioDuration.value) return 0
    return (audioCurrentTime.value / audioDuration.value) * 100
})

// ==================== 🎬 剧场模式相关状态与函数 ====================

const isVideoPlaying = ref(false)
const isCinemaMode = ref(false)   // 🔥 新增：专门控制剧场模式开关
const videoPlayerRef = ref(null)
const videoLoaded = ref(false)
const maskBlocksStyle = ref({
    '--video-left': '5vw',
    '--video-top': '5vh',
    '--video-width': '90vw',
    '--video-height': '50vh'
})

// 🔥 新增：防抖标志，防止频繁计算
let resizeTimeout = null
let isCalculating = ref(false)

// 🔥 核心函数：计算视频尺寸和遮罩位置（通用版）
const calculateVideoMask = () => {
    if (isCalculating.value) return // 防止重复计算
    isCalculating.value = true

    // 使用 requestAnimationFrame 确保在下一帧计算，避免卡顿
    requestAnimationFrame(() => {
        try {
            const video = videoPlayerRef.value
            if (!video) {
                console.warn('⚠️ 视频元素未找到')
                isCalculating.value = false
                return
            }

            // 🔥 关键：等待视频元数据加载完成
            if (!video.videoWidth || !video.videoHeight) {
                console.warn('⚠️ 视频尺寸未加载，延迟计算')
                setTimeout(() => {
                    isCalculating.value = false
                    calculateVideoMask()
                }, 100)
                return
            }

            const videoWidth = video.videoWidth
            const videoHeight = video.videoHeight
            const viewportWidth = window.innerWidth
            const viewportHeight = window.innerHeight

            // 判断设备类型
            const isMobile = viewportWidth <= 768
            const maxWidthPercent = isMobile ? 0.96 : 0.85
            const maxHeightPercent = isMobile ? 0.80 : 0.85

            const maxWidth = viewportWidth * maxWidthPercent
            const maxHeight = viewportHeight * maxHeightPercent
            const videoRatio = videoWidth / videoHeight

            let displayWidth, displayHeight

            if (videoRatio > (maxWidth / maxHeight)) {
                displayWidth = maxWidth
                displayHeight = displayWidth / videoRatio
            } else {
                displayHeight = maxHeight
                displayWidth = displayHeight * videoRatio
            }

            const widthPercent = (displayWidth / viewportWidth) * 100
            const heightPercent = (displayHeight / viewportHeight) * 100
            const leftPercent = (100 - widthPercent) / 2
            const topPercent = (100 - heightPercent) / 2

            // 🔥 调试：打印计算结果
            console.log('🎯 居中计算:', {
                widthPercent: widthPercent.toFixed(2),
                heightPercent: heightPercent.toFixed(2),
                leftPercent: leftPercent.toFixed(2),
                topPercent: topPercent.toFixed(2)
            })

            maskBlocksStyle.value = {
                '--video-left': `${leftPercent}vw`,
                '--video-top': `${topPercent}vh`,
                '--video-width': `${widthPercent}vw`,
                '--video-height': `${heightPercent}vh`
            }

            console.log('🎬 视频遮罩已重新计算:', {
                设备: isMobile ? '📱 移动端' : '💻 PC端',
                原始: `${videoWidth}x${videoHeight}`,
                显示: `${displayWidth.toFixed(0)}x${displayHeight.toFixed(0)}`,
                位置: `${leftPercent.toFixed(1)}vw, ${topPercent.toFixed(1)}vh`
            })

        } catch (error) {
            console.error('❌ 计算视频遮罩失败:', error)
        } finally {
            isCalculating.value = false
        }
    })
}

// 🔥 视频元数据加载完成（首次加载）
const handleVideoLoaded = (e) => {
    console.log('📹 视频元数据已加载')
    videoLoaded.value = true
    calculateVideoMask()
}

// 🔥 窗口 resize 监听（核心修复）
const handleWindowResize = () => {
    if (!isVideoPlaying.value) return // 只在播放时才重新计算

    // 防抖：200ms 内只执行一次
    if (resizeTimeout) clearTimeout(resizeTimeout)

    resizeTimeout = setTimeout(() => {
        console.log('📐 窗口尺寸变化，重新计算遮罩')
        calculateVideoMask()
    }, 200)
}

// 找到 handleVideoPlay 函數，修改為：
const handleVideoPlay = () => {
    console.log('📹 視頻開始播放')
    isVideoPlaying.value = true
    isCinemaMode.value = true // 🔥 進入劇場模式

    // 暫停音頻
    if (audioPlayerRef.value) {
        audioPlayerRef.value.pause()
        isAudioPlaying.value = false
    }

    nextTick(() => {
        // 鎖定滾動
        document.documentElement.style.overflow = 'hidden'
        document.body.style.overflow = 'hidden'

        setTimeout(() => {
            calculateVideoMask()
        }, 50)
    })
}

// 修改 handleVideoPause 函數：
const handleVideoPause = () => {
    console.log('⏸️ 視頻暫停')
    isVideoPlaying.value = false
    // 🔥 重要：暫停時不要自動退出劇場模式，讓用戶決定

    // 但我們仍然要解鎖滾動，防止頁面被鎖定
    document.documentElement.style.overflow = ''
    document.body.style.overflow = ''
}

// 🔥 新增：專門處理視頻結束
const handleVideoEnded = () => {
    console.log('🎬 視頻播放結束')
    isVideoPlaying.value = false
    isCinemaMode.value = false // 結束時退出劇場模式
    document.documentElement.style.overflow = ''
    document.body.style.overflow = ''
}

// 🔥 修复：遮罩点击处理（防止误触）
const handleMaskClick = (e) => {
    // 確保只點擊遮罩塊時才退出劇場模式
    if (e.target.classList.contains('mask-block') || e.target.classList.contains('cinema-masks')) {
        console.log('🖱️ 點擊遮罩，退出劇場模式')

        // 1. 退出劇場模式
        isCinemaMode.value = false

        // 2. 暫停視頻
        if (videoPlayerRef.value) {
            videoPlayerRef.value.pause()
        }

        // 3. 恢復滾動
        document.documentElement.style.overflow = ''
        document.body.style.overflow = ''

        // 阻止事件冒泡
        e.stopPropagation()
        e.preventDefault()
    }
}

// 🔥 修改 Watcher：监听 isCinemaMode 来控制 Body 背景变黑
watch(isCinemaMode, (isActive) => {
    if (isActive) {
        document.body.classList.add('cinema-mode-active')
    } else {
        document.body.classList.remove('cinema-mode-active')
    }
})

// ... 主题相关 ...
const highlightColor = ref('#d6a354')
const textThemes = [{ id: 'classic', name: '经典', color: '#f7d794', fontColor: '#d6a354' }, { id: 'chocolate', name: '巧克力', color: '#d2a679', fontColor: '#8b5a2b' }, { id: 'purple', name: '暮山紫', color: '#dcd6f7', fontColor: '#9370db' }]
const isThemeChanging = ref(false)
const changeHighlightColor = (theme) => {
    isThemeChanging.value = true
    highlightColor.value = theme.fontColor
    setTimeout(() => { isThemeChanging.value = false }, 400)
    // message.success(`主题已切换为：${theme.name}`)
}
const contentStyle = computed(() => ({
    '--highlight-color': highlightColor.value,
    '--highlight-color-rgb': hexToRgb(highlightColor.value)
}));

// ==================== 🔥 核心逻辑区域 ====================

const fetchArticle = async () => {
    loading.value = true
    try {
        let requestType = route.query.type || 'article'
        const res = await api.get(`/articles/${route.params.id}`, { params: { type: requestType } })

        if (res.data.success) {
            const serverData = res.data.data

            // 1. 🔥 封面字段归一化：确保所有位置都能拿到图片
            let finalCover = serverData.cover_image || serverData.cover;

            // 2. 🔥 兜底逻辑：如果是图文类型但没封面，尝试从内容提取第一张图
            if (!finalCover && serverData.content) {
                const imgMatch = serverData.content.match(/!\[.*?\]\((.*?)\)/);
                if (imgMatch && imgMatch[1]) finalCover = imgMatch[1];
            }

            // 3. 🔥 构建响应式对象，并强制纠正 work_type
            let inferredType = serverData.work_type || requestType;
            if (serverData.video_url) inferredType = 'video';
            else if (serverData.audio_url) inferredType = 'audio';
            else if (finalCover && inferredType === 'article') inferredType = 'short';

            article.value = {
                ...serverData,
                cover_image: finalCover, // 统一详情页主要引用的字段
                cover: finalCover,       // 兼容其他组件引用的字段
                work_type: inferredType
            }

            // 4. 更新同步计数与互动状态
            likeCount.value = Number(serverData.likes || 0)
            favoriteCount.value = Number(serverData.favorites || 0)

            // 增加浏览量
            api.post(`/articles/${route.params.id}/view`, { type: inferredType })
                .then(() => { article.value.views = (article.value.views || 0) + 1 })
                .catch(err => console.warn('统计失败:', err))

            // 获取评论与互动状态
            fetchComments()
            nextTick(() => { fetchInteractionStatus() })
        }
    } catch (error) {
        console.error("详情加载错误:", error)
        message.error('加载内容失败')
    } finally {
        loading.value = false
    }
}

// 评论树构建
const buildTwoLevelTree = (list) => {
    const map = new Map();
    const roots = [];
    list.forEach(item => {
        item.replies = [];
        item.id = Number(item.id);
        item.parent_id = item.parent_id ? Number(item.parent_id) : null;
        item.user_id = Number(item.user_id || item.commenter_id);
        item.likes_count = item.likes_count || item.like_count || 0;
        item.is_liked = !!item.is_liked;
        item.is_disliked = !!item.is_disliked;
        item.author_liked = !!item.author_liked;
        map.set(item.id, item);
    });
    const findRoot = (comment) => {
        let curr = comment;
        let depth = 0;
        while (curr.parent_id && map.has(curr.parent_id) && depth < 20) {
            curr = map.get(curr.parent_id);
            depth++;
        }
        return curr;
    }
    list.forEach(item => {
        if (!item.parent_id) {
            roots.push(item);
            return;
        }
        const directParent = map.get(item.parent_id);
        const root = findRoot(item);
        if (root && directParent) {
            if (directParent.id !== root.id) {
                item.reply_to_user_nickname = directParent.nickname;
            } else {
                item.reply_to_user_nickname = null;
            }
            root.replies.push(item);
        } else {
            roots.push(item);
        }
    });
    roots.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    roots.forEach(root => {
        if (root.replies?.length) {
            root.replies.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
        }
    });
    return roots;
}

// 获取评论
const fetchComments = async () => {
    try {
        const res = await api.get('/comments', {
            params: {
                article_id: route.params.id,
                type: currentWorkType.value,
                page: 1,
                limit: 1000 // 一次性拉取所有
            }
        })
        if (res.data.success) {
            const rawList = res.data.data || []

            // 1. 获取最新全量数据构建树
            allCommentsTree.value = buildTwoLevelTree(rawList)

            // 2. 重置页码
            commentPage.value = 1

            // 🔥🔥🔥 核心修复：不要先清空！不要调 loadMoreComments！
            // 直接截取第一页的数据覆盖 displayComments
            // Vue 会自动比对差异，实现"无感插入"
            displayComments.value = allCommentsTree.value.slice(0, commentPageSize)

            // 3. 既然重置了，加载状态肯定要关掉
            isLoadingCommentsMore.value = false
        }
    } catch (error) {
        message.error('加载评论失败')
    }
}

// 🔥 前端分页加载逻辑 (只服务于"加载更多"按钮)
const loadMoreComments = () => {
    isLoadingCommentsMore.value = true
    // 这里保留 setTimeout 是为了让用户感觉到底部按钮"努力加载了一下"
    setTimeout(() => {
        const currentLen = displayComments.value.length
        const nextBatch = allCommentsTree.value.slice(currentLen, currentLen + commentPageSize)
        if (nextBatch.length > 0) {
            displayComments.value.push(...nextBatch) // 追加模式
            commentPage.value++
        }
        isLoadingCommentsMore.value = false
    }, 500) // 稍微加长一点点，手感更好
}

// 互动状态获取 (增强版：包含关注状态)
const fetchInteractionStatus = async () => {
    if (!isLoggedIn.value) return;

    try {
        // 1. 获取点赞/收藏状态
        const res = await api.get(`/articles/${route.params.id}/interaction-status`, { params: { type: currentWorkType.value } })
        if (res.data.success) {
            isLiked.value = res.data.data.isLiked
            isFavorited.value = res.data.data.isFavorited
            if (res.data.data.likeCount !== undefined) likeCount.value = res.data.data.likeCount;
        }
    } catch (err) { }

    // 2. 🔥 新增：获取关注状态 (修复关注按钮状态不对的问题)
    if (article.value && article.value.author_id) {
        try {
            // 注意：这里需要确保后端有 /user/follow-status 接口
            const res = await api.get('/user/follow-status', { params: { targetUserId: article.value.author_id } })
            if (res.data.success) {
                isFollowing.value = res.data.data.isFollowing
            }
        } catch (err) { console.error(err) }
    }
}

const handleLike = async () => {
    if (!isLoggedIn.value) return message.warning('请登录后再为灵感喝彩')
    const originalState = isLiked.value;
    const originalCount = likeCount.value;
    isLiked.value = !originalState;
    likeCount.value += isLiked.value ? 1 : -1;
    try {
        const res = await api.post(`/articles/${route.params.id}/like`, { type: currentWorkType.value });
        if (!res.data.success) throw new Error();
    } catch (err) {
        isLiked.value = originalState;
        likeCount.value = originalCount;
        message.error('点赞同步失败');
    }
}

const handleFavorite = async () => {
    if (!isLoggedIn.value) return message.warning('请登录后再收藏这段灵感')
    const originalState = isFavorited.value;
    const originalCount = favoriteCount.value;
    isFavorited.value = !originalState;
    favoriteCount.value += isFavorited.value ? 1 : -1;
    try {
        const res = await api.post(`/articles/${route.params.id}/favorite`, { type: currentWorkType.value });
        if (!res.data.success) throw new Error();
    } catch (err) {
        isFavorited.value = originalState;
        favoriteCount.value = originalCount;
        message.error('收藏失败');
    }
}

const handleAddToColumn = async () => {
    if (!isLoggedIn.value) return message.warning('请先登录后操作')
    isCreatingInModal.value = false
    try {
        const res = await api.get('/user/columns/simple')
        userColumns.value = res.data.data
        showColumnModal.value = true
    } catch (err) { message.error('获取专栏列表失败') }
}

const handleCreateColumnInModal = async () => {
    if (!newColumnData.value.name.trim()) return message.warning('请输入专栏名称')
    isSubmitting.value = true
    try {
        const res = await api.post('/columns', { name: newColumnData.value.name, description: newColumnData.value.description })
        if (res.data.success) {
            message.success('专栏创建成功！')
            newColumnData.value = { name: '', description: '' }
            isCreatingInModal.value = false
            const listRes = await api.get('/user/columns/simple')
            userColumns.value = listRes.data.data
        }
    } catch (err) { message.error('创建失败') } finally { isSubmitting.value = false }
}

const selectColumnAndAdd = async (columnId) => {
    try {
        await api.post(`/columns/${columnId}/articles`, { articleId: article.value.id, type: currentWorkType.value })
        message.success('✨ 灵感已成功收录入专栏！')
        showColumnModal.value = false
    } catch (err) { message.error('该作品已在专栏中了哦') }
}

const toggleFollow = async () => {
    if (!isLoggedIn.value) {
        message.warning('请先登录后操作')
        router.push('/login')
        return
    }
    if (userStore.user.id === article.value.author_id) return message.info('这是您自己的文章哦')
    try {
        const res = await api.post('/user/follow', { targetUserId: article.value.author_id })
        isFollowing.value = res.data.data.status === 'followed'
        message.success(res.data.message)
    } catch (err) { message.error('关注操作失败') }
}

const goToAuthorProfile = () => {
    const username = article.value?.author_username || article.value?.author_name
    if (username) router.push(`/profile/${username}`)
    else message.warning('未能获取到作者信息')
}

// ... 评论发送相关 ...
const insertEmoji = (emoji) => {
    const textarea = document.getElementById('comment-input')
    if (!textarea) return
    const start = textarea.selectionStart
    const end = textarea.selectionEnd
    commentContent.value = commentContent.value.slice(0, start) + emoji + commentContent.value.slice(end)
    nextTick(() => { textarea.focus(); textarea.selectionStart = textarea.selectionEnd = start + emoji.length })
    showEmojiPicker.value = false
}

const closeEmojiPicker = (e) => {
    if (!e.target.closest('.emoji-panel') && !e.target.closest('.windmill')) showEmojiPicker.value = false
}

const showLoginTip = () => { if (!isLoggedIn.value) message.warning('请先登录后再留言') }
const showWelcomeMessage = () => { message.success(`欢迎回来，${currentUser.value.nickname || currentUser.value.username}！`) }
const restoreCommentContent = () => {
    const savedContent = localStorage.getItem('temp_comment')
    if (savedContent && isLoggedIn.value) {
        commentContent.value = savedContent
        localStorage.removeItem('temp_comment')
        message.info('已恢复您之前输入的内容')
    }
}
const handleImageUpload = () => imageInputRef.value?.click()
const handleSelectImage = (e) => {
    const files = Array.from(e.target.files)
    for (const file of files) {
        if (selectedImages.value.length >= MAX_IMAGES) { message.warning(`最多只能上传 ${MAX_IMAGES} 张图片`); break; }
        const url = URL.createObjectURL(file)
        selectedImages.value.push({ file, url })
    }
    e.target.value = ''
}
const removeImage = (index) => { URL.revokeObjectURL(selectedImages.value[index].url); selectedImages.value.splice(index, 1) }

// 🔥 提交评论 (核心逻辑)
const submitComment = async () => {
    if (!isLoggedIn.value) return message.error('您还没有登录,不可进行评论！!')
    if (!commentContent.value.trim() && selectedImages.value.length === 0) return message.warning('不能发送空评论')
    isSubmitting.value = true
    try {
        let imageUrls = []
        if (selectedImages.value.length) {
            message.info(`正在优化 ${selectedImages.value.length} 张图片...`);
            const compressedFiles = await Promise.all(selectedImages.value.map(img => compressImage(img.file, { quality: 0.5, maxWidth: 1200 })));
            const formData = new FormData()
            compressedFiles.forEach(file => formData.append('images', file))
            const uploadRes = await api.post('/upload/comment-images', formData, { headers: { 'Content-Type': 'multipart/form-data' }, timeout: 120000 })
            if (uploadRes.data.success) imageUrls = uploadRes.data.data.urls
        }

        // ✅ 确保 replyTarget 已定义且值正确
        const payload = {
            article_id: parseInt(route.params.id),
            content: commentContent.value,
            images: imageUrls,
            parent_id: replyTarget.value ? replyTarget.value.rootId : null,
            type: currentWorkType.value
        }
        const res = await api.post('/comments', payload)
        if (res.data.success) {
            message.success('🎉 评论成功！')
            commentContent.value = ''
            selectedImages.value = []
            if (replyTarget.value) expandedReplies.value.add(replyTarget.value.rootId)
            cancelReply()
            fetchComments() // 刷新列表
        }
    } catch (e) {
        console.error('评论流程出错:', e);
        message.error('评论失败')
    } finally { isSubmitting.value = false }
}

const setReplyTarget = (comment) => {
    if (!isLoggedIn.value) { message.warning('请登录后回复'); return; }
    const isSecondLevel = !!comment.parent_id
    replyTarget.value = {
        id: comment.id,
        nickname: comment.nickname,
        rootId: isSecondLevel ? comment.parent_id : comment.id
    }
    const inputEl = document.getElementById('comment-input')
    if (inputEl) { inputEl.focus(); inputEl.scrollIntoView({ behavior: 'smooth', block: 'center' }) }
}
const cancelReply = () => { replyTarget.value = null; commentContent.value = '' }
const handleReply = (comment) => setReplyTarget(comment)

const handleAction = async (comment, action) => {
    if (!isLoggedIn.value) return message.warning('请登录后参与互动')
    const originalState = { liked: comment.is_liked, disliked: comment.is_disliked, count: comment.like_count, authorLiked: comment.author_liked }
    if (action === 'like') {
        if (comment.is_liked) { comment.is_liked = false; comment.like_count--; if (Number(currentUser.value.id) === Number(article.value.author_id)) comment.author_liked = false }
        else { comment.is_liked = true; comment.like_count++; if (comment.is_disliked) comment.is_disliked = false; if (Number(currentUser.value.id) === Number(article.value.author_id)) comment.author_liked = true }
    } else if (action === 'dislike') {
        if (comment.is_disliked) comment.is_disliked = false;
        else { comment.is_disliked = true; if (comment.is_liked) { comment.is_liked = false; comment.like_count-- }; if (Number(currentUser.value.id) === Number(article.value.author_id)) comment.author_liked = false }
    }
    try { await api.post(`/comments/${comment.id}/action`, { action }) } catch (e) { Object.assign(comment, originalState); comment.author_liked = originalState.authorLiked; message.error('操作失败') }
}

const deleteComment = async (id) => {
    if (!confirm('确定删除?')) return
    try { await api.delete(`/comments/${id}`); message.success('已删除'); fetchComments() } catch (e) { message.error('删除失败') }
}

// 火箭相关状态
const showRocket = ref(true) // 是否显示火箭
const isLaunching = ref(false) // 是否正在发射

// 显示/隐藏火箭的逻辑（根据滚动位置）
const checkRocketVisibility = () => {
    const scrollPosition = window.scrollY || document.documentElement.scrollTop
    // 逻辑修正：只要滚动超过 300px 或者 超过半屏高度，就显示
    const threshold = 300
    showRocket.value = scrollPosition > threshold
}

const launchRocket = () => {
    if (isLaunching.value) return

    // 1. 激活发射状态，触发 CSS 的蓄力和点火动画
    isLaunching.value = true

    // 2. 页面开始滚动
    window.scrollTo({ top: 0, behavior: 'smooth' })

    // 3. 设置定时器重置状态
    // 我们的CSS动画总时长大约是 1秒 (0.2s蓄力 + 0.8s飞行)
    // 设置 1200ms 确保动画完全播完火箭消失后再重置
    setTimeout(() => {
        isLaunching.value = false
        // 状态重置后，Vue Transition 会让火箭重新渐现回到原位
    }, 1200)
}

// ... 统计评论总数 ...
const countAllComments = (commentList) => {
    let total = 0
    for (const comment of commentList) {
        total += 1
        if (comment.replies && comment.replies.length > 0) total += countAllComments(comment.replies)
    }
    return total
}
const totalCommentCount = computed(() => countAllComments(allCommentsTree.value))

// ... 订阅与分享 ...
const isSubscribed = ref(false)
watch(isFollowing, (val) => {
    isSubscribed.value = val
}, { immediate: true })

// 🔥🔥🔥 【修复 4】重写订阅逻辑，直接复用关注状态 🔥🔥🔥
// 逻辑：订阅 = 关注。点击订阅按钮，实际上就是执行关注操作。
const handleSubscribe = async () => {
    if (!isLoggedIn.value) {
        message.warning('请先登录后订阅');
        router.push('/login');
        return;
    }

    try {
        // 直接调用关注接口
        await toggleFollow();

        // 这里的 isFollowing 已经是响应式的了，toggleFollow 会更新它
        // 我们只需要根据新的状态提示用户即可
        if (isFollowing.value) {
            message.success('🎉 订阅成功！感谢您的关注');
        } else {
            message.success('已取消订阅');
        }
    } catch (e) {
        // toggleFollow 内部已经处理了错误提示，这里不需要重复
    }
}

watch(isFollowing, (val) => {
    isSubscribed.value = val;
});

const showShareModal = ref(false)
const shareCardRef = ref(null)
const isGeneratingCard = ref(false)
const cardBgColor = ref('#f7f1e3')
// 在颜色列表中加上羊皮纸色
const cardColors = ['#f7f1e3', '#fff9c4', '#e1bee7', '#b2dfdb', '#ffccbc', '#f0f4c3', '#cfd8dc', '#ffffff']
const handleShareClick = () => { if (!isLoggedIn.value) { message.warning('请先登录'); router.push('/login'); return } showShareModal.value = true }
const closeShareModal = (e) => { if (e.target.classList.contains('share-modal-overlay')) showShareModal.value = false }
const downloadCard = async () => {
    if (!shareCardRef.value) return;
    isGeneratingCard.value = true;
    try {
        await nextTick();
        await new Promise(resolve => setTimeout(resolve, 500)); // 稍微增加等待时间，确保图片加载

        const canvas = await html2canvas(shareCardRef.value, {
            useCORS: true,
            allowTaint: true, // 改为 true 尝试
            scale: 3, // 高清
            backgroundColor: null, // 保持透明，让 CSS 背景色生效
            // 关键：避免 html2canvas 截图时发生位移
            scrollY: 0,
            scrollX: 0,
            onclone: (clonedDoc) => {
                const element = clonedDoc.querySelector('.share-card');
                if (element) {
                    // 强制在截图时移除阴影，防止截图边缘有白边
                    element.style.boxShadow = 'none';
                    element.style.margin = '0';
                }
            }
        });

        const imgUrl = canvas.toDataURL('image/png');
        const link = document.createElement('a');
        link.download = `Veritas_Art_Card_${article.value.id}.png`;
        link.href = imgUrl;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        message.success('📜 艺术卡片已封存！');
        showShareModal.value = false;
    } catch (err) {
        console.error(err);
        message.error('生成失败，请重试');
    } finally {
        isGeneratingCard.value = false;
    }
}
const scrollToComments = () => { const el = document.getElementById('comments'); if (el) { const offset = 80; const bodyRect = document.body.getBoundingClientRect().top; const elementRect = el.getBoundingClientRect().top; const elementPosition = elementRect - bodyRect; window.scrollTo({ top: elementPosition - offset, behavior: 'smooth' }) } }

// 🔥🔥🔥 核心新增：文章内容图片点击代理 🔥🔥🔥
const handleContentClick = (e) => {
    // 1. 检查点击的是不是图片
    if (e.target.tagName === 'IMG') {
        // 2. 排除掉一些不应该放大的图片（比如表情包，如果它们在 content 里的 class 不一样的话）
        // 你的代码里表情包是在 emoji-panel 里的，不会出现在 markdown-body 里，所以这里比较安全
        // 但为了保险，可以排除特定类名，例如 loading 图标等
        if (e.target.classList.contains('no-zoom')) return;

        e.preventDefault(); // 阻止默认行为（比如图片包裹在链接里时）
        e.stopPropagation(); // 停止冒泡

        // 3. 打开灯箱
        openLightbox(e.target.src);
    }
}

// ==================== 🖼️ 留言框背景图片动态获取 ====================
const commentBgUrl = ref('') // 留言框背景图片URL
const lastBgUpdateTime = ref(0) // 上次更新背景的时间戳
const BG_REFRESH_INTERVAL = 1000 // 1秒内不重复获取（防止连续刷新）

// 动态获取留言框背景图片（带时间戳避免缓存）
const fetchCommentBackground = async (force = false) => {
    try {
        // 如果不是强制刷新，检查时间间隔
        const now = Date.now()
        if (!force && now - lastBgUpdateTime.value < BG_REFRESH_INTERVAL) {
            console.log('⏱️ 短时间内不重复获取背景图片')
            return
        }

        // 添加随机参数避免浏览器缓存
        const timestamp = Date.now()
        const res = await api.get(`/wallpaper/global?t=${timestamp}`)

        if (res.data.success) {
            const { websiteUrl, randomUrls, daily_url } = res.data.data

            // 选择图片URL
            let selectedUrl = ''
            if (websiteUrl) {
                selectedUrl = websiteUrl
            } else if (randomUrls && randomUrls.length > 0) {
                const randomIndex = Math.floor(Math.random() * randomUrls.length)
                selectedUrl = randomUrls[randomIndex]
            } else if (daily_url) {
                selectedUrl = daily_url
            } else {
                selectedUrl = 'https://w.wallhaven.cc/full/76/wallhaven-76r86v.jpg'
            }

            // 🔥 关键：确保URL变化，触发重新渲染
            commentBgUrl.value = selectedUrl + (selectedUrl.includes('?') ? '&' : '?') + `refresh=${timestamp}`
            lastBgUpdateTime.value = now

            console.log('🔄 背景图片已刷新:', selectedUrl)
        }
    } catch (err) {
        console.error('获取留言框背景失败:', err)
        // 使用带有时间戳的默认图片
        commentBgUrl.value = `https://w.wallhaven.cc/full/76/wallhaven-76r86v.jpg?refresh=${Date.now()}`
    }
}

// 计算留言框的样式
const commentBoxStyle = computed(() => ({
    backgroundImage: `url(${commentBgUrl.value})`,
    backgroundPosition: 'center',
    backgroundSize: 'cover',
    backgroundRepeat: 'no-repeat',
    position: 'relative'
}))

// 页面可见性监听
const handleVisibilityChange = () => {
    if (!document.hidden) {
        console.log('👁️ 页面重新可见，刷新背景图片')
        fetchCommentBackground(true) // 强制刷新
    }
}

// 添加路由变化监听
const setupPageRefreshListeners = () => {
    // 监听页面可见性变化
    document.addEventListener('visibilitychange', handleVisibilityChange)

    // 监听页面beforeunload（刷新前）
    window.addEventListener('beforeunload', () => {
        // 可以在这里保存当前状态，但不需要特殊处理
    })

    // 监听hashchange（单页应用内跳转）
    window.addEventListener('hashchange', () => {
        setTimeout(() => {
            fetchCommentBackground(true)
        }, 100)
    })

    // 监听popstate（浏览器前进后退）
    window.addEventListener('popstate', () => {
        setTimeout(() => {
            fetchCommentBackground(true)
        }, 100)
    })
}


watch(isLoggedIn, (newVal) => { if (newVal) { restoreCommentContent(); showWelcomeMessage() } })
watch(commentContent, (newVal) => { if (!isLoggedIn.value && newVal.trim()) localStorage.setItem('temp_comment', newVal) })

// 🔥🔥🔥 新增：精准控制剧场模式的全局状态 🔥🔥🔥
// 监听视频播放状态，动态给 body 添加/移除类名
watch(isVideoPlaying, (isPlaying) => {
    if (isPlaying) {
        document.body.classList.add('cinema-mode-active')
    } else {
        document.body.classList.remove('cinema-mode-active')
    }
})

onMounted(() => {
    fetchArticle()
    // 🔥 新增：获取留言框背景图片
    fetchCommentBackground()
    // 🔥 新增：设置页面刷新监听器
    setupPageRefreshListeners()

    // 确保火箭在页面加载完成后能显示（测试用）
    setTimeout(() => {
        console.log('⏰ 页面加载完成，检查火箭')
        checkRocketVisibility()
    }, 1000)

    // 添加滚动监听来控制火箭显示
    window.addEventListener('scroll', checkRocketVisibility)
    window.scrollTo(0, 0)
    document.addEventListener('click', closeEmojiPicker)
    window.addEventListener('keydown', handleEsc)
    window.addEventListener('scroll', handleSmartSidebar, { passive: true })
    window.addEventListener('resize', handleSmartSidebar)
    nextTick(() => { setTimeout(handleSmartSidebar, 800) })


    // 🔥🔥🔥 核心新增：监听 Markdown 内容中的视频播放 🔥🔥🔥
    const setupVideoListeners = () => {
        // 查找所有视频元素 (包括 markdown 内容里的和顶部的预览视频)
        const videos = document.querySelectorAll('video');
        if (videos.length > 0) {
            videos.forEach(video => {
                // 移除旧的监听器防止重复 (虽然 mounted 只跑一次，但是个好习惯)
                video.removeEventListener('play', handleVideoPlay);
                video.removeEventListener('pause', handleVideoPause);
                video.removeEventListener('ended', handleVideoPause);

                // 添加新的监听器
                video.addEventListener('play', handleVideoPlay);
                video.addEventListener('pause', handleVideoPause);
                video.addEventListener('ended', handleVideoPause);
            });
        }
    };

    const contentEl = document.querySelector('.markdown-body');
    if (contentEl) {
        contentEl.addEventListener('play', (e) => {
            if (e.target.tagName === 'VIDEO') handleVideoPlay();
        }, true); // 使用捕获模式监听内部视频

        contentEl.addEventListener('pause', (e) => {
            if (e.target.tagName === 'VIDEO') handleVideoPause();
        }, true);
    }

    // 🔥 新增：监听窗口 resize
    window.addEventListener('resize', handleWindowResize)

    // 使用 MutationObserver 监听 DOM 变化，确保 v-html 渲染完后能抓到视频
    // 或者简单点，配合 nextTick 和 setTimeout
    nextTick(() => {
        setTimeout(setupVideoListeners, 1000); // 延迟 1 秒确保内容渲染完毕
    });

    // 🔥 新增：ESC 键退出剧场模式
    const handleEscKey = (e) => {
        if (e.key === 'Escape' && isVideoPlaying.value) {
            const video = videoPlayerRef.value
            if (video) {
                video.pause()
            }
        }
    }
    window.addEventListener('keydown', handleEscKey)
})

onUnmounted(() => {
    document.removeEventListener('click', closeEmojiPicker)
    window.removeEventListener('resize', handleWindowResize)
    window.removeEventListener('keydown', handleEsc)

    // 🔥 新增：清理页面刷新相关监听器
    document.body.classList.remove('cinema-mode-active')
    document.body.classList.remove('cinema-mode-active')
    document.removeEventListener('visibilitychange', handleVisibilityChange)
    window.removeEventListener('beforeunload', handleBeforeUnload)
    window.removeEventListener('hashchange', handleHashChange)
    window.removeEventListener('popstate', handlePopState)

    // 清理定时器
    if (resizeTimeout) clearTimeout(resizeTimeout)
    if (rafId) cancelAnimationFrame(rafId)
})
</script>

<template>
    <div class="article-page" v-if="article">
        <div class="cinema-overlay" :class="{ 'is-active': isVideoPlaying }" :style="maskCutoutStyle">
        </div>

        <aside class="side-toolbar-wrapper" :style="sidebarStyle">
            <div class="side-toolbar">
                <div class="tool-item progress-item" :class="{ 'completed': scrollPercent >= 98 }" title="阅读进度">
                    <svg class="progress-circle" viewBox="0 0 44 44">
                        <circle class="progress-circle-bg" cx="22" cy="22" r="20"></circle>
                        <circle class="progress-circle-bar" cx="22" cy="22" r="20" :style="{
                            strokeDashoffset: (isNaN(scrollPercent) || !scrollPercent) ? 125.6 : (125.6 - (125.6 * scrollPercent) / 100),
                            stroke: progressColor
                        }">
                        </circle>
                    </svg>
                    <span class="percent-text" :style="{ color: progressColor }">
                        {{ scrollPercent }}<small>%</small>
                    </span>
                </div>
                <div class="tool-divider"></div>
                <div class="tool-item" :class="{ active: isLiked }" @click="handleLike" title="点赞">
                    <span class="icon">{{ isLiked ? '❤️' : '🤍' }}</span>
                    <span class="count">{{ formatCount(likeCount) }}</span>
                </div>
                <div class="tool-item" @click="scrollToComments" title="评论">
                    <span class="icon">💬</span>
                    <span class="count">{{ totalCommentCount }}</span>
                </div>
                <div class="tool-item" :class="{ active: isFavorited }" @click="handleFavorite" title="收藏">
                    <span class="icon">{{ isFavorited ? '⭐' : '☆' }}</span>
                    <span class="count">{{ formatCount(favoriteCount) }}</span>
                </div>
                <div class="tool-item" @click="handleAddToColumn" title="加入专栏">
                    <span class="icon">📁</span>
                </div>
            </div>
        </aside>

        <header class="hero-header" :class="`type-${contentMediaType}`">
            <div class="hero-bg" :style="heroBgStyle"></div>
            <div class="hero-overlay"></div>

            <div class="hero-container animate__animated animate__fadeInUp">

                <div v-if="contentMediaType === 'text-only'" class="text-art-cover"
                    :class="{ 'theme-switching': isThemeChanging }">
                    <div class="manuscript-stamp">Manuscript</div>
                    <div class="text-inner">
                        <span class="initial-letter">{{ article.title.charAt(0) }}</span>
                        <h1 class="article-title">{{ article.title }}</h1>
                    </div>
                    <p class="hero-summary-fade">{{ article.summary }}</p>

                    <div class="article-meta text-mode-meta">
                        <img :src="article.author_avatar || defaultAvatar" class="author-avatar-tiny"
                            @click="goToAuthorProfile" style="cursor: pointer">
                        <span class="author-name">{{ article.author_name }}</span>
                        <span class="meta-divider">·</span>
                        <span>📅 {{ formatDate(article.created_at) }}</span>
                    </div>
                </div>

                <template v-else>
                    <div v-if="contentMediaType === 'audio'" class="media-preview-aside">
                        <div class="media-box audio">
                            <img :src="getProxyUrl(article.cover_image || article.cover || defaultAuthorAvatar)"
                                class="media-poster">
                            <div class="media-icon-center">♫</div>
                        </div>
                    </div>

                    <div class="hero-info-bottom" :class="{ 'has-media': contentMediaType !== 'standard' }">
                        <h1 class="article-title">{{ article.title }}</h1>
                        <div class="article-meta">
                            <div class="meta-item author" @click="goToAuthorProfile" title="查看作者主页">
                                <div class="author-avatar-wrapper">
                                    <img :src="article.author_avatar || defaultAvatar" class="author-avatar" alt="作者头像"
                                        @click="goToAuthorProfile" style="cursor: pointer" title="点击查看作者主页">

                                    <button v-if="currentUser?.id !== article.author_id" class="mini-follow-btn"
                                        :class="{ 'followed': isFollowing }" @click.stop="toggleFollow">
                                        <svg v-if="!isFollowing" viewBox="0 0 24 24" width="14" height="14" fill="none"
                                            stroke="currentColor" stroke-width="3">
                                            <line x1="12" y1="5" x2="12" y2="19"></line>
                                            <line x1="5" y1="12" x2="19" y2="12"></line>
                                        </svg>
                                        <svg v-else viewBox="0 0 24 24" width="14" height="14" fill="none"
                                            stroke="currentColor" stroke-width="3">
                                            <polyline points="20 6 9 17 4 12"></polyline>
                                        </svg>
                                    </button>

                                </div>
                                <span class="author-name">{{ article.author_name || 'Veritas' }}</span>
                            </div>
                            <span class="meta-divider">·</span>
                            <div class="meta-item">📅 {{ formatDate(article.created_at) }}</div>
                            <span class="meta-divider">·</span>
                            <div class="meta-item">🔥 {{ article.views || 0 }}</div>
                            <span class="meta-divider">·</span>
                            <div class="meta-item">💬 {{ totalCommentCount }}</div>
                        </div>
                    </div>
                </template>

                <div class="hero-controls">
                    <div v-for="theme in textThemes" :key="theme.id" class="q-btn"
                        :style="{ backgroundColor: theme.color }" @click="changeHighlightColor(theme)">
                        {{ theme.name }}
                    </div>
                </div>
            </div>
        </header>

        <!-- 🔥 遮罩层：阻止事件冒泡 -->
        <Transition name="fade">
            <div v-if="isVideoPlaying" class="cinema-masks" :style="maskBlocksStyle" @click.stop="handleMaskClick">
                <!-- 🔥 加上 .stop 修饰符 -->
                <div class="mask-block mask-top" @click.stop></div>
                <div class="mask-block mask-bottom" @click.stop></div>
                <div class="mask-block mask-left" @click.stop></div>
                <div class="mask-block mask-right" @click.stop></div>
            </div>
        </Transition>

        <main class="main-wrapper">
            <div class="content-card animate__animated animate__fadeInUp"
                :style="[contentStyle, isVideoPlaying ? maskBlocksStyle : {}]" :class="{
                    'theme-switching': isThemeChanging,
                    'cinema-mode-active': isVideoPlaying
                }">

                <div v-if="article.audio_url" class="disney-piano-concert">

                    <div class="vinyl-record-stage">
                        <div class="vinyl-square-frame">
                            <div class="concert-vinyl" :class="{ 'is-spinning': isAudioPlaying }">
                                <img :src="getProxyUrl(article.cover_image || article.cover || defaultAuthorAvatar)"
                                    class="vinyl-cover-main" crossorigin="anonymous">
                                <div class="vinyl-shine"></div>
                            </div>
                        </div>

                        <div class="piano-tonearm" :class="{ 'is-active': isAudioPlaying }">
                            <img src="https://cdn-icons-png.flaticon.com/512/2402/2402461.png" alt="Tonearm">
                        </div>
                    </div>

                    <div class="lyrics-floating-stage" :class="{ 'is-active': isAudioPlaying }">
                        <Transition name="lyric-fade" mode="out-in">
                            <div :key="currentLyricIndex" class="current-lyric-line">
                                <span v-if="currentLyricIndex !== -1 && lyricsData[currentLyricIndex]">
                                    {{ lyricsData[currentLyricIndex].text }}
                                </span>
                                <span v-else-if="isAudioPlaying && lyricsData.length > 0">
                                    ... 🎵 ...
                                </span>
                                <span v-else class="default-note">
                                    🎵 Music is the literature of the heart 🎵
                                </span>
                            </div>
                        </Transition>
                    </div>

                    <p class="audio-caption">正在为您演奏：{{ article.title }}</p>

                    <div class="romantic-player-bar">
                        <audio ref="audioPlayerRef" :src="article.audio_url" crossorigin="anonymous"
                            class="hidden-audio" @play="handleAudioPlay" @pause="handleAudioPause"
                            @ended="handleAudioEnded" @timeupdate="onCustomTimeUpdate"
                            @loadedmetadata="onAudioLoaded"></audio>

                        <div class="art-player-ui">
                            <button class="art-play-btn" :class="{ 'playing': isAudioPlaying }"
                                @click="togglePlayPause">
                                <span v-if="!isAudioPlaying" class="icon-play">▶</span>
                                <span v-else class="icon-pause">||</span>
                            </button>

                            <div class="art-progress-container">
                                <span class="time-text current">{{ formatTime(audioCurrentTime) }}</span>
                                <div class="art-progress-track" @click="seekAudio">
                                    <div class="progress-bg"></div>
                                    <div class="progress-fill" :style="{ width: progressPercent + '%' }"></div>

                                    <div class="progress-quill" :style="{ left: progressPercent + '%' }">
                                        🪶
                                    </div>
                                </div>
                                <span class="time-text duration">{{ formatTime(audioDuration) }}</span>
                            </div>
                        </div>
                    </div>
                </div>

                <Teleport to="body" :disabled="!isCinemaMode">
                    <div v-if="article.video_url" class="inner-theater-section"
                        :class="{ 'cinema-mode-active': isCinemaMode }" @click="exitCinemaMode">

                        <div v-if="isCinemaMode" class="cinema-masks" @click.stop="handleMaskClick">
                            <div class="mask-block mask-top"></div>
                            <div class="mask-block mask-bottom"></div>
                            <div class="mask-block mask-left"></div>
                            <div class="mask-block mask-right"></div>
                        </div>

                        <div class="theater-frame" @click.stop>
                            <div class="theater-rec-status" v-show="isCinemaMode">
                                <span class="dot-pulse"></span> REC
                            </div>

                            <video ref="videoPlayerRef" :src="getProxyUrl(article.video_url)" crossorigin="anonymous"
                                controls class="inner-video-player" :poster="getProxyUrl(article.cover_image)"
                                preload="metadata" @play="handleVideoPlay" @pause="handleVideoPause"
                                @ended="handleVideoEnded" @loadedmetadata="handleVideoLoaded" playsinline
                                webkit-playsinline>
                            </video>
                        </div>

                        <div class="video-info-strip" v-show="!isCinemaMode">
                            <span>影视作品 / Film Archive</span>
                            <small>Veritas Cinema Project</small>
                        </div>

                        <div v-if="isCinemaMode" class="cinema-close-hint" @click="isCinemaMode = false">
                            点击遮罩或按 ESC 退出
                        </div>
                    </div>
                </Teleport>

                <!-- 在视频元素下方 -->
                <div v-if="isVideoPlaying && !videoLoaded" class="video-loading">
                    <div class="loading-spinner"></div>
                    <p>加载中...</p>
                </div>

                <div class="article-preface" v-if="article.summary">
                    <div class="preface-content">
                        <span class="quote-left" :class="{ 'quote-shimmer': isThemeChanging }">“</span>

                        <p class="summary-text">{{ article.summary }}</p>

                        <span class="quote-right" :class="{ 'quote-shimmer': isThemeChanging }">”</span>
                    </div>
                    <div class="preface-divider"></div>
                </div>

                <hr class="dashed-line" :class="{ 'preface-gap': article.summary }">

                <div class="markdown-body article-content" :class="{ 'cinema-mode-content': isVideoPlaying }"
                    v-html="renderedContent" @click="handleContentClick">
                </div>

                <div class="last-updated">
                    文章最后更新于 {{ formatFullTime(article.updated_at || article.created_at) }}
                </div>

                <div class="action-buttons-row">
                    <button class="btn-large btn-like" :class="{ active: isLiked }" @click="handleLike">
                        <span class="icon">{{ isLiked ? '❤️' : '🤍' }}</span>
                        {{ isLiked ? '已点赞' : '点赞' }}
                    </button>
                    <button class="btn-large btn-favorite" :class="{ active: isFavorited }" @click="handleFavorite">
                        <span class="icon">{{ isFavorited ? '⭐' : '☆' }}</span>
                        {{ isFavorited ? '已收藏' : '收藏' }}
                    </button>
                    <button class="btn-large btn-purple" @click="handleSubscribe">
                        <span class="icon">{{ isSubscribed ? '✅' : '☁️' }}</span>
                        {{ isSubscribed ? '已订阅' : '订阅' }}
                    </button>
                    <button class="btn-large btn-pink" @click="handleShareClick">
                        <span class="icon">🖼️</span> 卡片分享
                    </button>
                </div>

                <div class="comment-section" id="comments">
                    <div class="comment-header-row">
                        <span class="icon-edit">📝</span>
                        <span class="comment-title">留言 ({{ totalCommentCount }})</span>
                    </div>
                    <div class="comment-box-wrapper">
                        <div v-if="replyTarget" class="reply-status-bar">
                            <span>💬 回复 @{{ replyTarget.nickname }}</span>
                            <button class="cancel-reply-btn" @click="cancelReply">✕</button>
                        </div>

                        <div class="comment-box-beige" :style="commentBoxStyle">
                            <!-- 添加一个半透明覆盖层确保文字可读性 -->
                            <div class="comment-bg-overlay"></div>

                            <textarea id="comment-input" v-model="commentContent" placeholder="写下点什么..."
                                :disabled="!isLoggedIn" @click="showLoginTip">
                    </textarea>
                            <div v-if="!isLoggedIn" class="disabled-overlay" @click="showLoginTip"></div>
                            <div v-if="selectedImages.length" class="image-preview">
                                <div v-for="(img, index) in selectedImages" :key="index" class="preview-item">
                                    <img :src="img.url" alt="预览图" />
                                    <span class="remove" @click="removeImage(index)">×</span>
                                </div>
                            </div>
                        </div>

                        <div class="comment-toolbar">
                            <div class="tool-left">
                                <div class="tool-icon-btn windmill" title="Emoji"
                                    @click.stop="showEmojiPicker = !showEmojiPicker">
                                    <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
                                        <path
                                            d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z" />
                                    </svg>
                                </div>
                                <div v-if="showEmojiPicker" class="emoji-panel" @click.stop>
                                    <span v-for="emoji in emojis" :key="emoji" class="emoji-item"
                                        @click="insertEmoji(emoji)">{{
                                            emoji }}</span>
                                </div>
                                <div class="tool-icon-btn image-upload" title="上传图片" @click="handleImageUpload">
                                    <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
                                        <path
                                            d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z" />
                                    </svg>
                                </div>
                                <input ref="imageInputRef" type="file" accept="image/*" multiple hidden
                                    @change="handleSelectImage" />
                            </div>
                            <button class="submit-btn-purple" @click="submitComment"
                                :disabled="!commentContent.trim() && !selectedImages.length">
                                {{ isLoggedIn ? (replyTarget ? '回复' : '评论') : '登录' }}
                            </button>
                        </div>
                    </div>

                    <div class="comments-list">
                        <CommentItem v-for="comment in displayComments" :key="comment.id" :comment="comment"
                            :article-author-id="article.author_id || article.user_id" @reply="handleReply"
                            @like="(c) => handleAction(c, 'like')" @dislike="(c) => handleAction(c, 'dislike')"
                            @delete="deleteComment" />

                        <div v-if="displayComments.length === 0" class="empty-state">
                            暂无评论，快来抢沙发~
                        </div>

                        <div v-if="displayComments.length > 0" class="load-more-container">
                            <button v-if="hasMoreComments" class="load-more-btn"
                                :class="{ loading: isLoadingCommentsMore }" @click="loadMoreComments">
                                <span v-if="isLoadingCommentsMore" class="loader"></span>
                                {{ isLoadingCommentsMore ? '拆开更多信件...' : '查看更多留言' }}
                            </button>
                            <div v-else class="no-more-text">
                                🍃 纸短情长，已读完所有留言
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </main>
    </div>

    <div v-else class="loading-screen">
        <div class="loading-spinner"></div>
    </div>

    <Teleport to="body">
        <Transition name="zoom">
            <div v-if="showShareModal" class="share-modal-overlay" @click="closeShareModal">
                <div class="share-modal-content" @click.stop>
                    <div class="modal-header">
                        <h3>🏛️ 珍藏·灵感</h3> <button class="close-btn" @click="showShareModal = false">×</button>
                    </div>

                    <div class="modal-body">
                        <div class="share-card roman-art-style" ref="shareCardRef"
                            :style="{ backgroundColor: cardBgColor }">
                            <div class="paper-texture-overlay"></div>
                            <div class="roman-border-frame">

                                <div class="card-header-postcard">
                                    <div class="postcard-stamp">
                                        <div class="stamp-inner">VERITAS</div>
                                    </div>
                                    <div class="postmark-circle">
                                        <span>{{ new Date().getDate() }}</span>
                                        <small>{{ new Date().toLocaleString('en', { month: 'short' }).toUpperCase()
                                            }}</small>
                                    </div>
                                    <div class="postcard-wax-seal"><span class="seal-v">V</span></div>
                                </div>

                                <div class="card-cover-art-wrapper">
                                    <img v-if="getProxyUrl(article?.cover_image)"
                                        :src="getProxyUrl(article?.cover_image)" class="card-cover-art"
                                        crossorigin="anonymous">
                                    <div v-else class="card-text-fallback">{{ article?.title }}</div>
                                </div>

                                <div class="card-content-postcard">
                                    <h2 class="card-title-art">{{ article?.title }}</h2>
                                    <div class="card-summary-handwriting">“{{ article?.summary || '山河皆过客，岁月亦如歌。' }}”
                                    </div>
                                </div>

                                <div class="card-footer-postcard">
                                    <div class="footer-left-content">
                                        <div class="author-info">
                                            <img :src="getFullAvatarUrl(article?.author_avatar)" class="card-avatar"
                                                crossorigin="anonymous">
                                            <div class="author-detail">
                                                <span class="site-logo">Veritas Collection</span>
                                                <span class="card-user">By {{ article?.author_name }}</span>
                                            </div>
                                        </div>
                                        <div class="card-date-roman">MCMXXV · {{ formatDate(article?.created_at) }}
                                        </div>
                                    </div>
                                    <div class="postcard-qr">
                                        <img :src="qrCodeUrl" class="qr-code" crossorigin="anonymous">
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div class="modal-footer">
                        <div class="color-picker">
                            <div v-for="color in cardColors" :key="color" class="color-dot"
                                :style="{ backgroundColor: color }" :class="{ active: cardBgColor === color }"
                                @click="cardBgColor = color">
                            </div>
                            <div class="color-input-wrapper" title="自定义背景色">
                                <span class="plus-icon">+</span>
                                <input type="color" v-model="cardBgColor" class="custom-color-input">
                            </div>
                        </div>
                        <button class="download-btn" @click="downloadCard" :disabled="isGeneratingCard">
                            {{ isGeneratingCard ? '正在拓印...' : '💾 保存珍藏卡片' }}
                        </button>
                    </div>
                </div>
            </div>
        </Transition>
    </Teleport>

    <Transition name="zoom">
        <div v-if="isPreviewVisible" class="preview-overlay" @click="closePreview">
            <div class="preview-wrapper" @click.stop>
                <img :src="previewUrl" class="preview-image-main">
                <div class="preview-close-btn" @click="closePreview">✕</div>
            </div>
        </div>
    </Transition>

    <Teleport to="body">
        <Transition name="fade-slide">
            <div v-if="showColumnModal" class="column-modal-overlay" @click="showColumnModal = false">
                <div class="column-modal art-modal" @click.stop>

                    <div class="art-modal-header">
                        <span class="decoration-line"></span>
                        <h3>{{ isCreatingInModal ? '新建藏书阁' : '收录至专栏' }}</h3>
                        <span class="decoration-line"></span>
                        <button class="art-close-btn" @click="showColumnModal = false">✕</button>
                    </div>

                    <div class="art-modal-body">
                        <div v-if="isCreatingInModal" class="art-create-form animate__animated animate__fadeIn">
                            <div class="input-group">
                                <input v-model="newColumnData.name" type="text" class="art-input" placeholder=" "
                                    autofocus>
                                <label>专栏名称</label>
                                <span class="input-underline"></span>
                            </div>

                            <div class="input-group">
                                <textarea v-model="newColumnData.description" class="art-input textarea" placeholder=" "
                                    rows="2"></textarea>
                                <label>写一段简介（选填）...</label>
                                <span class="input-underline"></span>
                            </div>

                            <div class="art-form-ops">
                                <button class="art-btn-text" @click="isCreatingInModal = false">返回</button>
                                <button class="art-btn-primary" @click="handleCreateColumnInModal"
                                    :disabled="isSubmitting">
                                    {{ isSubmitting ? '建造中...' : '确认新建' }}
                                </button>
                            </div>
                        </div>

                        <div v-else class="art-column-list animate__animated animate__fadeIn">
                            <div v-if="userColumns.length === 0" class="art-empty-state">
                                <div class="empty-icon">🍂</div>
                                <p>暂无专栏，去创建一个吧</p>
                                <button class="art-btn-primary small" @click="isCreatingInModal = true">立即创建</button>
                            </div>

                            <div v-else class="art-scroll-area">
                                <div v-for="col in userColumns" :key="col.id" class="art-list-item"
                                    @click="selectColumnAndAdd(col.id)">
                                    <div class="folder-symbol"></div>
                                    <div class="item-info">
                                        <span class="item-name">{{ col.name }}</span>
                                        <span class="item-count">{{ col.article_count || 0 }} 篇灵感</span>
                                    </div>
                                    <span class="select-arrow">→</span>
                                </div>
                            </div>

                            <div class="art-footer-action" v-if="userColumns.length > 0">
                                <button class="art-create-trigger" @click="isCreatingInModal = true">
                                    <span class="plus">+</span> 新建文件夹
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </Transition>
    </Teleport>

    <Teleport to="body">
        <Transition name="fade">
            <div v-if="isLightboxOpen" class="global-lightbox-overlay" @click="closeLightbox">
                <div class="lightbox-content animate__animated animate__zoomIn">
                    <img :src="lightboxUrl" class="lightbox-img" @click.stop />
                    <button class="lightbox-close" @click="closeLightbox">×</button>
                    <div class="lightbox-hint">点击任意处或按 Esc 关闭</div>
                </div>
            </div>
        </Transition>
    </Teleport>

    <Teleport to="body">
        <Transition name="rocket-fade">
            <div v-if="showRocket" class="rocket-container-physics" :class="{ 'is-launching': isLaunching }"
                @click="launchRocket">

                <div class="rocket-physics-wrapper">

                    <div class="rocket-hover-wrapper">
                        <svg class="rocket-icon-直立" viewBox="0 0 1024 1024" version="1.1"
                            xmlns="http://www.w3.org/2000/svg">
                            <path
                                d="M510.260891 266.552845c-37.476543 0-67.861574 30.385031-67.861574 67.861574 0 37.47552 30.385031 67.861574 67.861574 67.861574 37.47552 0 67.860551-30.386054 67.860551-67.861574C578.121442 296.937876 547.736411 266.552845 510.260891 266.552845zM510.260891 368.345206c-18.738783 0-33.930787-15.2094-33.930787-33.930787 0-18.755156 15.193027-33.930787 33.930787-33.930787 18.73776 0 33.930787 15.175631 33.930787 33.930787C544.191678 353.135806 528.997628 368.345206 510.260891 368.345206z"
                                fill="#5d4037"></path>
                            <path
                                d="M524.358981 860.344686c4.854565 4.041036 7.952112 10.138918 7.952112 16.96437 0 2.286066-0.347924 4.50664-0.99363 6.595208l0.347924-0.033769-21.157879 44.436048-19.102057-39.565111c-2.022053-3.313465-3.197832-7.257288-3.197832-11.432377 0-6.825452 3.097548-12.923334 7.952112-16.96437l-33.898041 0c-1.87265 5.300726-2.899026 11.000542-2.899026 16.96437 0 12.625552 4.605901 24.189935 12.243859 33.103956l21.901823 37.508265c1.325182 8.052396 8.317433 14.216793 16.750499 14.216793 8.134261 0 14.926968-5.732561 16.5837-13.386892l0.398066 0 24.620747-42.11519c5.848195-8.284687 9.293667-18.423605 9.293667-29.325909 0-5.963829-1.026376-11.663644-2.899026-16.96437L524.358981 860.34571z"
                                fill="#5d4037"></path>
                            <path
                                d="M713.68086 647.149073 648.440997 633.562637c18.210757-55.199183 31.473829-117.064182 31.473829-180.191942 0-201.36517-103.614869-340.568583-118.277824-357.3682-14.645558-16.766872-51.294247-33.003672-51.376111-33.102932 0 0-37.411051 15.772218-51.377134 33.102932C444.916651 113.364931 340.605933 252.005524 340.605933 453.370695c0 63.684438 13.505595 126.095883 31.961946 181.666526l-58.156538 12.111852c-18.356067 3.811816-28.695552 21.439288-23.2444 39.399335l54.606689 179.860391c3.114944 10.304693 10.918677 19.084661 20.528546 24.452925l8.036024-99.837846c1.50733-18.654872 17.479093-36.84721 35.836183-40.690748l9.751085-2.022053c29.359678 58.338686 55.625902 95.066169 55.625902 95.066169l34.262338 0 35.156708 0c0 0 26.693965-37.326117 56.338123-96.484472l16.609283 3.439332c18.35709 3.843538 34.328853 22.034852 35.837206 40.690748l8.036024 99.837846c9.609869-5.368264 17.396205-14.148231 20.527522-24.452925l54.607712-179.860391C742.376413 668.589384 732.036927 650.960889 713.68086 647.149073zM469.850529 158.827355c11.680017-21.438265 40.409338-42.479487 40.409338-42.479487l0.032746 5.16872 0.016373-5.135974c0 0 30.667463 22.797215 42.34748 44.236504 2.469238 4.54041 7.322779 11.332093 13.419637 21.107737L455.221344 181.724855C461.915813 170.95558 467.249285 163.632801 469.850529 158.827355zM688.331519 729.923288c-3.744277 18.753109-5.699816 37.872562-8.102538 37.872562-4.555759 0-12.243859-40.624233-45.428655-52.188616-5.548366-1.916653-10.910491-3.803629-16.036231-5.599532 0.055259-0.121773 0.109494-0.242524 0.163729-0.364297-21.886473-7.65433-38.835494-13.619182-42.729174-15.009855-27.949562 61.500703-56.562227 96.888677-56.562227 96.888677l-9.426697 0-9.360182 0c0 0-27.503401-34.062793-54.92289-93.408413-8.498558 2.958378-21.401426 7.490601-36.309974 12.707416-4.432962 1.547239-9.033747 3.139503-13.758352 4.787026-33.18582 11.564383-42.530652 51.924603-47.101761 51.924603-2.15406 0-4.391007-20.37812-8.068769-37.046754-4.142343-18.687618-6.28003-33.630958-1.724271-38.60218 4.089132-4.427846 26.120914-11.641131 48.250934-18.013259 17.302061-4.943592 34.647101-9.413394 43.518143-11.645225-21.289885-55.268768-39.183418-125.880989-39.183418-207.362768 0-119.620401 23.526833-194.043415 45.065382-239.207034l148.049894 0c21.125133 44.534286 44.352137 118.559233 44.352137 239.207034 0 80.18832-17.346063 149.905148-38.222533 204.777897 6.862291 1.699712 23.964808 6.005784 42.285059 11.087523-0.040932 0.103354-0.079818 0.207731-0.119727 0.311085 26.077935 7.257288 54.259788 15.972786 58.733683 20.843724C695.820074 696.355775 691.744245 712.791096 688.331519 729.923288z"
                                fill="#5d4037"></path>
                        </svg>
                    </div>

                    <div class="rocket-engine-exhaust"></div>
                </div>
            </div>
        </Transition>
    </Teleport>

</template>

<style scoped>
/* ==================== 1. 基础布局与文章样式 ==================== */
.markdown-body {
    box-sizing: border-box;
    min-width: 200px;
    max-width: 100%;
    margin: 0 auto;
    padding: 10px 0;
    font-family: -apple-system, BlinkMacSystemFont, Segoe UI, Helvetica, Arial, sans-serif;
    background: transparent !important;
    font-size: 1rem;
    line-height: 1.75;
}

/* 优化 Markdown 内部图片样式 */
.markdown-body :deep(img) {
    display: block;
    max-width: 100%;
    margin: 20px auto;
    border-radius: 8px;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.08);

    /* 🔥 核心交互样式 */
    cursor: zoom-in;
    /* 鼠标变放大镜 */
    transition: transform 0.3s cubic-bezier(0.25, 0.8, 0.25, 1), box-shadow 0.3s ease;
}

/* 🔥 悬停效果：轻微浮起 */
.markdown-body :deep(img):hover {
    transform: scale(1.02);
    /* 稍微放大一点点 */
    box-shadow: 0 12px 30px rgba(0, 0, 0, 0.15);
    /* 阴影加深 */
}

.markdown-body :deep(p) {
    line-height: 1.8;
    margin-bottom: 1.5em;
    font-size: 1.05rem;
    color: #4a4a4a;
}

.markdown-body :deep(blockquote) {
    border-left: 4px solid var(--highlight-color);
    background: rgba(var(--highlight-color-rgb), 0.05);
    padding: 15px 20px;
    color: #666;
    border-radius: 0 8px 8px 0;
    font-style: italic;
    margin: 15px 0;
}

.markdown-body :deep(pre) {
    overflow-x: auto;
    border-radius: 8px;
    margin: 15px 0;
    padding: 15px;
    font-size: 0.85rem;
}

.article-page {
    background-color: #ffffff;
    min-height: 100vh;
    font-family: 'Helvetica Neue', Helvetica, 'PingFang SC', sans-serif;
}

/* ==================== 2. Hero Header 区域 (PC端默认样式) ==================== */
.hero-header {
    position: relative;
    width: 100%;
    height: 380px;
    min-height: 350px;
    overflow: hidden;
    display: flex;
    align-items: center;
    justify-content: center;
}

.type-text-only .hero-header {
    background-color: #f4f1ea;
}

.hero-bg {
    position: absolute;
    inset: 0;
    background-size: cover;
    background-position: center;
    z-index: 0;
    transition: all 0.8s cubic-bezier(0.4, 0, 0.2, 1);
}

.hero-overlay {
    position: absolute;
    inset: 0;
    background: linear-gradient(to top, rgba(0, 0, 0, 0.6) 0%, rgba(0, 0, 0, 0.2) 60%, rgba(0, 0, 0, 0.1) 100%);
    z-index: 1;
}

.hero-container {
    position: relative;
    z-index: 5;
    width: 100%;
    height: 100%;
    max-width: 1200px;
    margin: 0 auto;
    padding: 0 40px;
    display: flex;
    align-items: center;
    justify-content: center;
}

/* 非纯文本模式内容沉底 */
.hero-header:not(.type-text-only) .hero-container {
    align-items: flex-end;
    justify-content: space-between;
    padding-bottom: 35px;
}

.hero-info-bottom {
    flex: 1;
    text-align: left;
    display: flex;
    flex-direction: column;
    gap: 12px;
}

.hero-info-bottom .article-title {
    font-size: 2.4rem;
    color: #fff;
    text-shadow: 0 2px 15px rgba(0, 0, 0, 0.5);
    margin: 0 0 12px 0;
    font-weight: 700;
    line-height: 1.4;
}

/* 媒体预览框 (Video/Audio) */
.media-preview-aside {
    flex-shrink: 0;
}

.media-box {
    position: relative;
    border-radius: 12px;
    overflow: hidden;
    border: 4px solid rgba(255, 255, 255, 0.8);
    box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
    transition: transform 0.4s ease;
}

.media-box.video {
    width: 420px;
    aspect-ratio: 16 / 9;
}

.media-box.audio {
    width: 260px;
    height: 260px;
    border-radius: 50%;
}

.media-poster {
    width: 100%;
    height: 100%;
    object-fit: cover;
}

.media-icon-center {
    position: absolute;
    inset: 0;
    background: rgba(0, 0, 0, 0.2);
    display: flex;
    justify-content: center;
    align-items: center;
    color: #fff;
    font-size: 3rem;
    text-shadow: 0 0 20px rgba(0, 0, 0, 0.5);
    backdrop-filter: blur(2px);
}

.hero-info.has-media .article-title {
    font-size: 2.2rem;
}

/* 纯文本封面样式 */
.text-art-cover {
    flex: none;
    width: 680px;
    min-height: 220px;
    margin: 0 auto;
    padding: 35px 40px;
    background: rgba(255, 255, 255, 0.7);
    backdrop-filter: blur(5px);
    border-radius: 2px;
    border: 1px solid rgba(139, 90, 43, 0.2);
    box-shadow: 0 30px 90px rgba(0, 0, 0, 0.1);
    display: flex;
    flex-direction: column;
    justify-content: center;
    position: relative;
    z-index: 2;
    transition: all 0.6s cubic-bezier(0.4, 0, 0.2, 1), filter 0.4s ease;
}

.manuscript-stamp {
    position: absolute;
    top: 20px;
    right: 30px;
    color: #d2a679;
    font-size: 0.6rem;
    text-transform: uppercase;
    letter-spacing: 3px;
    border: 1px solid #d2a679;
    padding: 2px 8px;
    opacity: 0.6;
    transform: rotate(5deg);
}

.initial-letter {
    font-size: 12rem;
    font-family: "serif";
    color: var(--highlight-color);
    opacity: 0.05;
    line-height: 1;
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    pointer-events: none;
    transition: color 0.6s ease;
}

.text-art-cover .article-title {
    font-size: 2.2rem;
    margin-bottom: 12px;
    position: relative;
    z-index: 1;
    color: #4a3c28;
    font-weight: 700;
}

.hero-summary-fade {
    font-style: italic;
    color: #8b5a2b;
    font-size: 1.1rem;
    opacity: 0.8;
    line-height: 1.8;
}

.text-mode-meta {
    margin-top: 30px;
    justify-content: center;
    color: #bca38a !important;
}

/* 头像与Meta信息 */
.article-meta {
    display: flex;
    align-items: center;
    gap: 15px;
    font-size: 0.9rem;
    color: rgba(255, 255, 255, 0.95);
    font-weight: 500;
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.5);
}

.meta-item.author {
    display: flex;
    align-items: center;
    gap: 15px;
    cursor: pointer;
    transition: opacity 0.2s;
    user-select: none;
}

.meta-item.author:hover .author-name {
    text-decoration: underline;
}

.author-avatar {
    width: 50px;
    height: 50px;
    border-radius: 50%;
    border: 2px solid #fff;
    box-shadow: 0 4px 10px rgba(0, 0, 0, 0.2);
    object-fit: cover;
    transition: all 0.3s ease;
}

.author-avatar:hover {
    transform: scale(1.1);
    border-color: var(--highlight-color);
    box-shadow: 0 4px 15px rgba(0, 0, 0, 0.3);
}

.author-avatar-tiny {
    width: 28px;
    height: 28px;
    border-radius: 50%;
    vertical-align: middle;
    margin-right: 8px;
    cursor: pointer;
    object-fit: cover;
    transition: all 0.3s ease;
}

.author-avatar-wrapper {
    position: relative;
    display: inline-flex;
}

.author-name {
    font-size: 1.1rem;
    font-weight: 700;
    letter-spacing: 0.5px;
}

.meta-divider {
    margin: 0 5px;
    opacity: 0.6;
    font-weight: normal;
}

/* 迷你关注按钮 */
.mini-follow-btn {
    position: absolute;
    top: -2px;
    right: -5px;
    width: 22px;
    height: 22px;
    background: #42b883;
    color: #fff;
    border: 2px solid #fff;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    box-shadow: 0 2px 5px rgba(0, 0, 0, 0.2);
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.mini-follow-btn:hover {
    transform: scale(1.2);
}

.mini-follow-btn.followed {
    background: #fff;
    color: #42b883;
    border-color: #42b883;
}

.hero-controls {
    position: absolute;
    bottom: 30px;
    right: 40px;
    display: flex;
    gap: 12px;
}

.q-btn {
    padding: 6px 14px;
    border-radius: 12px;
    font-size: 0.8rem;
    font-weight: 700;
    color: #5d4037;
    cursor: pointer;
    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.2);
    transition: all 0.4s;
    user-select: none;
}

.q-btn:hover {
    transform: scale(1.15) translateY(-5px);
}

/* ==================== 3. 主内容区 ==================== */
.main-wrapper {
    width: 100%;
    position: relative;
    z-index: 4;
}

.content-card {
    max-width: 900px;
    margin: 40px auto 0;
    background: #ffffff;
    padding: 40px;
    min-height: 500px;
    --highlight-color-rgb: 214, 163, 84;
    --highlight-color: #d6a354;
    transition: all 0.6s cubic-bezier(0.4, 0, 0.2, 1), filter 0.4s ease, border-color 0.4s ease;
    will-change: filter, opacity, transform;
}

.theme-switching {
    filter: brightness(1.05) blur(2px) saturate(1.2);
    opacity: 0.85;
    transform: scale(0.995);
}

.article-content {
    margin-top: 0;
}

.last-updated {
    font-size: 0.85rem;
    color: #999;
    margin-top: 40px;
    text-align: left;
}

/* 导读区 & 引用 */
.article-preface {
    margin-bottom: 0;
    padding: 0 20px;
    position: relative;
    transition: all 0.5s ease;
}

.preface-content {
    position: relative;
    padding: 25px 40px;
    background: linear-gradient(to right, rgba(var(--highlight-color-rgb), 0.08), transparent);
    border-radius: 12px;
    transition: background 0.5s ease;
}

.summary-text {
    font-size: 1.08rem;
    line-height: 2;
    color: var(--highlight-color);
    font-style: italic;
    font-family: "Kaiti", "STKaiti", serif;
    margin: 0;
    text-align: justify;
    transition: color 0.5s ease;
}

.quote-left,
.quote-right {
    position: absolute;
    font-size: 4.5rem;
    font-family: serif;
    color: var(--highlight-color);
    opacity: 0.2;
    line-height: 1;
    transition: color 0.5s ease;
}

.quote-left {
    top: -5px;
    left: 10px;
}

.quote-right {
    bottom: -35px;
    right: 10px;
}

/* 引号流光特效 */
@keyframes shimmer-flow {
    0% {
        background-position: -100% center;
    }

    100% {
        background-position: 200% center;
    }
}

.quote-shimmer {
    transition: none !important;
    background: linear-gradient(120deg, var(--highlight-color) 30%, rgba(255, 255, 255, 0.9) 50%, var(--highlight-color) 70%);
    background-size: 200% auto;
    background-clip: text;
    -webkit-background-clip: text;
    text-fill-color: transparent;
    -webkit-text-fill-color: transparent;
    animation: shimmer-flow 0.7s cubic-bezier(0.4, 0, 0.2, 1) forwards;
    filter: brightness(1.2) drop-shadow(0 0 5px rgba(var(--highlight-color-rgb), 0.5));
}

.preface-divider {
    width: 80px;
    height: 4px;
    background: var(--highlight-color);
    margin: 25px auto 0;
    border-radius: 10px;
    opacity: 0.8;
    box-shadow: 0 2px 10px rgba(var(--highlight-color-rgb), 0.2);
    transition: all 0.5s ease;
}

.dashed-line {
    border: 0;
    border-top: 1px dashed #ccc2c2;
    margin: 30px 0;
}

.dashed-line.preface-gap {
    margin-top: 20px;
    margin-bottom: 30px;
    border-top: 1px dashed rgba(var(--highlight-color-rgb), 0.3);
    transition: border-color 0.5s ease;
}

/* ==================== 4. 侧边栏 (Sidebar) ==================== */
.side-toolbar-wrapper {
    position: fixed;
    top: 350px;
    left: calc(50% - 530px);
    z-index: 100;
    will-change: opacity, transform;
}

.side-toolbar {
    display: flex;
    flex-direction: column;
    gap: 18px;
    background: rgba(255, 255, 255, 0.6);
    backdrop-filter: blur(10px);
    padding: 12px 8px;
    border-radius: 40px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.08);
    border: 1px solid rgba(255, 255, 255, 0.4);
}

.tool-item {
    width: 44px;
    height: 44px;
    background: #fff;
    border-radius: 50%;
    display: flex;
    justify-content: center;
    align-items: center;
    cursor: pointer;
    transition: all 0.3s;
    position: relative;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
}

.tool-item:hover {
    background: #f8f9fa;
    transform: scale(1.1);
}

.tool-item .count {
    position: absolute;
    top: -4px;
    left: 30px;
    background: #94a3b8;
    color: #fff;
    font-size: 10px;
    padding: 1px 6px;
    border-radius: 10px;
    font-weight: 700;
    border: 2px solid #fff;
}

/* 激活状态 */
.tool-item.active {
    background: #fff1f2 !important;
    box-shadow: 0 0 15px rgba(255, 95, 126, 0.2);
}

.tool-item.active .icon {
    filter: drop-shadow(0 0 5px rgba(255, 95, 126, 0.3));
    transform: scale(1.1);
    display: inline-block;
    animation: heartbeat 0.45s cubic-bezier(0.25, 0.46, 0.45, 0.94);
}

.tool-item.active .count {
    background: #ff5f7e;
}

@keyframes heartbeat {
    0% {
        transform: scale(1);
    }

    15% {
        transform: scale(1.3);
    }

    30% {
        transform: scale(1);
    }

    45% {
        transform: scale(1.15);
    }

    100% {
        transform: scale(1);
    }
}

.tool-divider {
    width: 20px;
    height: 1px;
    background: rgba(0, 0, 0, 0.05);
    margin: -5px auto 5px;
}

/* 进度环 */
.progress-item {
    background: #fdfdfd !important;
    cursor: default !important;
}

.progress-circle {
    width: 40px;
    height: 40px;
    transform: rotate(-90deg);
}

.progress-circle-bg {
    fill: none;
    stroke: #f1f1f1;
    stroke-width: 3.5;
}

.progress-circle-bar {
    fill: none;
    stroke-width: 3.5;
    stroke-linecap: round;
    stroke-dasharray: 125.6;
    transition: stroke-dashoffset 0.1s linear, stroke 0.4s ease;
}

.percent-text {
    position: absolute;
    font-size: 10px;
    font-weight: 800;
    font-family: 'Inter', sans-serif;
    letter-spacing: -0.5px;
    transition: color 0.4s ease;
}

.percent-text small {
    font-size: 7px;
}

.progress-item.completed {
    filter: drop-shadow(0 0 3px rgba(255, 152, 0, 0.4));
    animation: pulse-orange 2s infinite;
}

@keyframes pulse-orange {

    0%,
    100% {
        transform: scale(1);
    }

    50% {
        transform: scale(1.05);
    }
}

/* ==================== 5. 底部操作栏 ==================== */
.action-buttons-row {
    display: flex;
    justify-content: center;
    gap: 20px;
    margin: 50px 0;
}

.btn-large {
    padding: 10px 30px;
    border-radius: 50px;
    border: none;
    color: rgb(59, 59, 59);
    font-weight: 600;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 8px;
    transition: transform 0.2s;
    box-shadow: 0 4px 10px rgba(0, 0, 0, 0.2);
}

.btn-large:hover {
    transform: translateY(-3px);
}

.btn-large.active .icon {
    display: inline-block;
    animation: heartbeat 0.45s cubic-bezier(0.25, 0.46, 0.45, 0.94);
}

.btn-purple {
    background: #8e44ad;
    color: #fff;
}

.btn-pink {
    background: #ff5f7e;
    color: #fff;
}

.btn-like.active {
    background: #ff5f7e;
    color: #fff;
}

.btn-favorite {
    background: #ffeaa7;
    color: #d63031;
}

.btn-favorite.active {
    background: #fdcb6e;
    color: #fff;
}

/* ==================== 🎹 1. 容器设计 (PC端基础布局修复) ==================== */
/* 🔥 修复点：PC端也采用 Flex Column 布局，防止内容重叠 */
.disney-piano-concert {
    width: 100%;
    /* 羊皮纸暖色背景 */
    background: linear-gradient(to bottom, #fdfbf7, #f3e7d3);
    border-radius: 12px;

    /* 🔥 关键：设置为纵向 Flex，让元素从上到下自然排列 */
    display: flex;
    flex-direction: column;
    align-items: center;
    /* 水平居中 */
    justify-content: flex-start;

    /* 上下给足空间 */
    padding: 50px 40px 40px;
    margin-bottom: 40px;
    position: relative;
    overflow: hidden;
    box-shadow: 0 20px 40px rgba(139, 90, 43, 0.1), inset 0 0 0 1px rgba(255, 255, 255, 0.5);
    border: 4px double #d2a679;
    min-height: 520px;
    /* PC端给高一点，显得大气 */
}

/* ==================== 📀 2. 旋转唱片舞台 (最上方) ==================== */
.vinyl-record-stage {
    position: relative;
    width: 280px;
    height: 280px;

    /* 🔥 布局控制：和下方的歌词拉开距离 */
    margin-bottom: 40px;
    margin-top: 10px;

    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 5;
    flex-shrink: 0;
}

/* 方形复古背景框 (悬浮感) */
.vinyl-square-frame {
    width: 240px;
    height: 240px;
    background: #eaddca;
    border-radius: 4px;
    box-shadow:
        0 15px 35px rgba(0, 0, 0, 0.2),
        inset 0 0 20px rgba(139, 90, 43, 0.1);
    border: 1px solid rgba(255, 255, 255, 0.6);
    display: flex;
    justify-content: center;
    align-items: center;
    position: relative;
}

/* 唱片本体 */
.concert-vinyl {
    width: 220px;
    height: 220px;
    border-radius: 50%;
    /* 黑胶质感 */
    background: repeating-radial-gradient(#111 0, #111 2px, #222 3px, #222 4px);
    box-shadow: 0 5px 15px rgba(0, 0, 0, 0.3);
    display: flex;
    justify-content: center;
    align-items: center;
    position: relative;
    border: 1px solid #000;

    /* 动画配置 */
    animation: rotateVinyl 8s linear infinite;
    animation-play-state: paused;
}

.concert-vinyl.is-spinning {
    animation-play-state: running;
}

@keyframes rotateVinyl {
    from {
        transform: rotate(0deg);
    }

    to {
        transform: rotate(360deg);
    }
}

/* 封面图 */
.vinyl-cover-main {
    width: 90px;
    height: 90px;
    border-radius: 50%;
    object-fit: cover;
    border: 3px solid #d4af37;
    z-index: 2;
}

/* 中心孔 */
.concert-vinyl::before {
    content: '';
    position: absolute;
    width: 12px;
    height: 12px;
    background: #000;
    border-radius: 50%;
    z-index: 3;
}

/* 高光 */
.vinyl-shine {
    position: absolute;
    inset: 0;
    border-radius: 50%;
    background: linear-gradient(135deg, transparent 40%, rgba(255, 255, 255, 0.15) 50%, transparent 60%);
    pointer-events: none;
    z-index: 4;
}

/* 唱臂 */
.piano-tonearm {
    position: absolute;
    top: -20px;
    right: -25px;
    /* PC端位置微调 */
    width: 90px;
    height: auto;
    transform-origin: 70% 15%;
    transform: rotate(-35deg);
    transition: transform 0.8s cubic-bezier(0.34, 1.56, 0.64, 1);
    z-index: 10;
    filter: drop-shadow(5px 10px 5px rgba(0, 0, 0, 0.2));
}

.piano-tonearm img {
    width: 100%;
    display: block;
}

.piano-tonearm.is-active {
    transform: rotate(0deg);
}

/* ==================== 🎤 3. 歌词区域 (中间) ==================== */
.lyrics-floating-stage {
    /* 🔥 修复点：PC端使用 Relative 占位，防止重叠 */
    position: relative;
    width: 100%;
    text-align: center;
    z-index: 2;

    /* 布局控制 */
    margin-bottom: 20px;
    /* 推开下方的歌名 */
    min-height: 60px;
    display: flex;
    justify-content: center;
    align-items: center;
}

.current-lyric-line {
    font-family: "KaiTi", "STKaiti", serif;
    font-size: 1.4rem;
    /* PC端字大一点 */
    color: #8b5a2b;
    font-weight: 700;
    line-height: 1.5;
    text-shadow: 0 2px 10px rgba(255, 255, 255, 0.8);
}

.default-note {
    font-family: "Georgia", serif;
    font-style: italic;
    opacity: 0.6;
    font-size: 1.1rem;
    color: #bca38a;
}

/* ==================== 🎵 4. 歌曲名称 (中下) ==================== */
.audio-caption {
    /* 🔥 修复点：PC端使用 Relative 占位，移除 bottom:10px */
    position: relative;
    bottom: auto;
    left: auto;
    width: 100%;

    font-family: "KaiTi", "STKaiti", serif;
    font-size: 1rem;
    color: #5d4037;
    font-weight: 600;
    letter-spacing: 2px;
    text-align: center;

    margin-bottom: 30px;
    /* 推开下方的播放条 */
    margin-top: 0;
    opacity: 0.9;
}

/* ==================== 🎼 5. 播放条 (最底) ==================== */
.romantic-player-bar {
    /* 🔥 修复点：限制PC端宽度，使用 margin-top: auto 沉底 */
    position: relative;
    width: 80%;
    /* PC端不要太宽，80%比较优雅 */
    max-width: 600px;
    height: auto;
    margin-top: auto;
    z-index: 10;
    text-align: center;
}

/* PC端播放器内部布局 */
.art-player-ui {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 20px;
    width: 100%;
}

/* PC端进度条样式 */
.art-progress-container {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 12px;
    position: relative;
}

.time-text {
    font-family: 'Courier New', monospace;
    font-size: 12px;
    color: #8b5a2b;
    font-weight: 600;
    min-width: 40px;
}

.art-play-btn {
    width: 54px;
    height: 54px;
    border-radius: 50%;
    background: linear-gradient(145deg, #d4af37, #b8860b);
    border: 4px solid #fdfbf7;
    box-shadow: 0 6px 15px rgba(139, 90, 43, 0.3);
    display: flex;
    justify-content: center;
    align-items: center;
    cursor: pointer;
    flex-shrink: 0;
}

.icon-play,
.icon-pause {
    font-size: 20px;
    color: #fff;
}

/* PC端进度条轨道 */
.art-progress-track {
    flex: 1;
    height: 4px;
    background: rgba(139, 90, 43, 0.15);
    border-radius: 2px;
    position: relative;
    cursor: pointer;
    transition: height 0.2s;
}

.progress-fill {
    position: absolute;
    top: 0;
    left: 0;
    height: 100%;
    background: #d4af37;
    border-radius: 2px;
    pointer-events: none;
}

.progress-quill {
    position: absolute;
    top: 50%;

    /* 这里的宽高要固定，确保计算基准一致 */
    width: 24px;
    height: 24px;
    display: flex;
    justify-content: center;
    align-items: center;

    /* 🔥 终极对齐魔法 */
    /* 我们不再在 left 里用 calc 减去像素，而是通过 translate 控制 */
    /* 这样羽毛的“逻辑中心”就变成了它的笔尖 */
    transform: translateX(-20%) translateY(-100%) rotate(-15deg);

    font-size: 24px;
    pointer-events: none;
    z-index: 10;
    filter: drop-shadow(2px 4px 6px rgba(0, 0, 0, 0.2));

    /* 进度更新频率很高，transition 建议设短一点（0.1s）或设为 linear 确保不掉帧 */
    transition: left 0.1s linear;
}

/* 视频剧场模式 */
.inner-theater-section {
    width: 100%;
    margin-bottom: 30px;
    display: flex;
    flex-direction: column;
    align-items: center;
}

.theater-frame {
    position: relative;
    width: 100%;
    background: #000;
    border-radius: 12px;
    overflow: hidden;
    box-shadow: 0 40px 100px rgba(0, 0, 0, 0.4);
    border: 1px solid rgba(255, 255, 255, 0.05);
    display: flex;
    justify-content: center;
    align-items: center;
    min-height: 200px;
}

.inner-video-player {
    width: 100%;
    height: auto;
    max-height: 80vh;
    display: block;
    object-fit: contain;
    outline: none;
    background: #000;
}

.theater-rec-status {
    position: absolute;
    top: 15px;
    left: 20px;
    z-index: 10;
    color: #ff3b30;
    font-family: 'Courier New', monospace;
    font-weight: 900;
    font-size: 13px;
    text-shadow: 0 0 8px rgba(255, 59, 48, 0.8);
    pointer-events: none;
    display: flex;
    align-items: center;
    gap: 6px;
    background: rgba(0, 0, 0, 0.3);
    padding: 4px 10px;
    border-radius: 4px;
}

.dot-pulse {
    display: inline-block;
    width: 8px;
    height: 8px;
    background-color: #ff3b30;
    border-radius: 50%;
    box-shadow: 0 0 10px #ff3b30;
    animation: rec-pulse 1s infinite alternate;
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

.video-info-strip {
    width: 100%;
    margin-top: 15px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    color: #94a3b8;
    font-size: 0.8rem;
    padding: 0 5px;
}

/* ==================== 🎬 剧场模式核心样式 (四方块版 - 最终版) ==================== */

/* 1. 遮罩容器 */
.cinema-masks {
    position: fixed;
    inset: 0;
    z-index: 9998;
    /* 🔥 低于视频 */
    pointer-events: auto;
    /* 改为 auto */

    /* 默认值 */
    --video-left: 5vw;
    --video-top: 5vh;
    --video-width: 90vw;
    --video-height: 50vh;
}

/* 2. 遮罩块通用样式 */
.mask-block {
    position: absolute;
    background: rgba(5, 5, 5, 0.98);
    backdrop-filter: blur(10px);
}

/* 3. 上方遮罩 */
.mask-top {
    top: 0;
    left: 0;
    right: 0;
    height: var(--video-top);
}

/* 4. 下方遮罩 */
.mask-bottom {
    bottom: 0;
    left: 0;
    right: 0;
    height: calc(100vh - var(--video-top) - var(--video-height));
}

/* 5. 左侧遮罩 */
.mask-left {
    top: var(--video-top);
    left: 0;
    width: var(--video-left);
    height: var(--video-height);
}

/* 6. 右侧遮罩 */
.mask-right {
    top: var(--video-top);
    right: 0;
    width: calc(100vw - var(--video-left) - var(--video-width));
    height: var(--video-height);
}

/* 7. 中心填充（如果需要的话） */
.mask-center {
    display: none;
    /* 默认不需要 */
}

/* 8. 内容卡片固定定位 */
.content-card.cinema-mode-active {
    position: fixed !important;
    /* 🔥 核心修复：直接使用 JS 计算出的精确位置和尺寸 */
    left: var(--video-left) !important;
    top: var(--video-top) !important;
    width: var(--video-width) !important;
    height: var(--video-height) !important;

    /* 🔥 移除旧的居中逻辑，防止冲突 */
    transform: none !important;
    margin: 0 !important;
    padding: 0 !important;

    z-index: 10000 !important;
    max-width: none !important;
    /* 移除最大宽度限制 */
    max-height: none !important;

    background: transparent !important;
    box-shadow: none !important;
    border: none !important;
    isolation: isolate;
    display: flex !important;
    flex-direction: column !important;
    justify-content: center !important;
    align-items: center !important;
}

/* 9. 隐藏其他内容 */
.content-card.cinema-mode-active>*:not(.inner-theater-section) {
    display: none !important;
}

/* 10. 视频容器 */
.cinema-mode-active .inner-theater-section {
    position: relative !important;
    z-index: 1 !important;
    width: 100% !important;
    height: 100% !important;
    /* 填满卡片 */
    max-height: none !important;
    margin: 0 !important;
    padding: 0 !important;
    pointer-events: auto;
}

/* 11. 视频框架 */
.cinema-mode-active .theater-frame {
    position: relative !important;
    width: 100% !important;
    height: 100% !important;
    /* 填满容器 */
    background: #000 !important;
    border-radius: 8px !important;
    overflow: hidden !important;
    box-shadow: 0 0 80px rgba(214, 163, 84, 0.5) !important;
}

/* 12. 视频播放器 */
.cinema-mode-active .inner-video-player {
    width: 100% !important;
    height: 100% !important;
    /* 强制填满，不再是 auto */
    max-height: none !important;
    display: block !important;
    object-fit: contain !important;
    /* 保持比例 */
    background: #000 !important;
}

/* 🔥 修复 REC 图标：无背景、纯净悬浮模式 */
.cinema-mode-active .theater-rec-status {
    position: absolute !important;
    top: 25px !important;  /* 稍微调整位置，更自然 */
    left: 25px !important;
    z-index: 2147483648 !important;
    
    display: flex !important;
    align-items: center;
    gap: 8px;
    
    /* 🔥 关键修改：背景设为透明，去掉内边距 */
    background: transparent !important; 
    padding: 0 !important; 
    
    /* 加上文字阴影，防止视频背景太白看不清字 */
    text-shadow: 0 1px 3px rgba(0, 0, 0, 0.8);
    
    font-family: 'Courier New', monospace; /* 保持复古字体 */
    font-weight: bold;
    color: #fff;
    pointer-events: none;
}

/* 红点动画保持不变 */
.dot-pulse {
    display: inline-block;
    width: 10px;
    height: 10px;
    background-color: #ff3b30;
    border-radius: 50%;
    /* 红点也加一点阴影，更立体 */
    box-shadow: 0 0 5px rgba(0, 0, 0, 0.5); 
    animation: rec-pulse 1s infinite alternate;
}

@keyframes rec-pulse {
    from { opacity: 1; transform: scale(1); }
    to { opacity: 0.3; transform: scale(0.8); }
}

/* 14. 隐藏其他页面元素 */
body:has(.cinema-masks) .hero-header,
body:has(.cinema-masks) .side-toolbar-wrapper {
    opacity: 0 !important;
    pointer-events: none !important;
    transition: opacity 0.5s ease;
}

/* 15. 过渡动画 */
.fade-enter-active,
.fade-leave-active {
    transition: opacity 0.5s ease;
}

.fade-enter-from,
.fade-leave-to {
    opacity: 0;
}

/* 让遮罩出现更丝滑 */
.mask-block {
    position: absolute;
    background: rgba(5, 5, 5, 0.98);
    backdrop-filter: blur(10px);
    transition: all 0.6s cubic-bezier(0.4, 0, 0.2, 1);
    /* 🔥 新增 */
}

/* 视频框架添加呼吸光晕 */
.cinema-mode-active .theater-frame {
    animation: cinema-glow 3s ease-in-out infinite alternate;
    /* 🔥 新增 */
}

@keyframes cinema-glow {
    from {
        box-shadow: 0 0 40px rgba(214, 163, 84, 0.3);
    }

    to {
        box-shadow: 0 0 80px rgba(214, 163, 84, 0.6);
    }
}

/* ==================== 📱 移动端专属优化 ==================== */
@media (max-width: 768px) {

    /* 1. 🔥 确保内容卡片完美居中 */
    .content-card.cinema-mode-active {
        position: fixed !important;

        /* 🔥【核心修改】不再依赖 var(--video-left)，而是强制使用 50% + transform */
        /* 这样浏览器会以屏幕中心点为基准，自动向左回退一半宽度，实现绝对物理居中 */
        left: 50% !important;
        top: 50% !important;
        transform: translate(-50%, -50%) !important;

        /* 保持 JS 计算出的宽高，确保比例正确 */
        width: var(--video-width) !important;
        height: var(--video-height) !important;

        /* 移除可能导致偏移的边距 */
        margin: 0 !important;
        padding: 0 !important;

        /* 布局重置 */
        display: flex !important;
        flex-direction: column !important;
        justify-content: center !important;
        align-items: center !important;

        /* 视觉样式 */
        background: #000 !important;
        box-shadow: none !important;
        max-width: none !important;
        max-height: none !important;
        z-index: 10000 !important;
    }

    /* 2. 🔥 视频容器强制居中 */
    .cinema-mode-active .inner-theater-section {
        pointer-events: auto !important;
        touch-action: none;
        /* 🔥 禁止手势操作 */
        width: 100% !important;
        height: 100% !important;
        display: flex !important;
        justify-content: center !important;
        align-items: center !important;
        margin: 0 !important;
        padding: 0 !important;
    }

    /* 3. 🔥 视频框架 */
    .cinema-mode-active .theater-frame {
        width: 100% !important;
        height: 100% !important;
        max-height: none !important;
        border-radius: 0 !important;
        /* 移动端全屏感更强，去掉圆角 */
        border: none !important;
        box-shadow: none !important;
        /* 移除发光效果，防止在小屏幕上显得杂乱 */
        background: #000 !important;
    }

    /* 4. 🔥 视频播放器 */
    .cinema-mode-active .inner-video-player {
        pointer-events: auto !important;
        touch-action: manipulation;
        /* 🔥 只允许基本操作 */
        width: 100% !important;
        height: 100% !important;
        max-height: none !important;
        max-width: none !important;
        object-fit: contain !important;
        display: block !important;
        margin: 0 !important;
    }

    /* 5. 🔥 遮罩层文艺效果 */
    .cinema-masks {
        /* 🔥 增大点击热区，防止误触视频 */
        padding: 20px;
        /* 增加内边距 */
        /* 确保 CSS 变量生效 */
        --video-left: 2vw;
        --video-top: 10vh;
        --video-width: 96vw;
        --video-height: 80vh;
        cursor: pointer
    }

    .mask-block {
        /* 确保点击事件能正确触发 */
        pointer-events: auto !important;
        touch-action: manipulation;
        /* 🔥 防止双击缩放 */
        /* 🔥 文艺毛玻璃 + 暖色调 */
        background: linear-gradient(135deg,
                rgba(245, 230, 200, 0.85) 0%,
                rgba(210, 180, 140, 0.88) 30%,
                rgba(139, 90, 43, 0.92) 70%,
                rgba(92, 64, 51, 0.95) 100%);

        backdrop-filter: blur(15px) saturate(1.4) brightness(0.7);
        -webkit-backdrop-filter: blur(15px) saturate(1.4) brightness(0.7);

        /* 细腻纹理 */
        background-image: url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><filter id="noise"><feTurbulence baseFrequency="0.9" numOctaves="3" /></filter><rect width="100" height="100" filter="url(%23noise)" opacity="0.05"/></svg>');
    }

    /* 6. 🔥 视频光晕效果 */
    .cinema-mode-active .theater-frame {
        box-shadow:
            0 0 60px rgba(214, 163, 84, 0.7),
            0 10px 40px rgba(139, 90, 43, 0.5) !important;
        border: 2px solid rgba(255, 255, 255, 0.3);
        border-radius: 12px !important;
    }

    /* 7. 🔥 REC 标签调整 */
    .cinema-mode-active .theater-rec-status {
        top: 10px !important;
        left: 10px !important;
        font-size: 11px !important;
        padding: 3px 8px !important;
        color: #fff3e0 !important;
        border-radius: 4px !important;
    }

    /* 8. 🔥 遮罩块精确定位 */
    .mask-top {
        top: 0;
        left: 0;
        right: 0;
        height: var(--video-top);
    }

    .mask-bottom {
        bottom: 0;
        left: 0;
        right: 0;
        height: calc(100vh - var(--video-top) - var(--video-height));
    }

    .mask-left {
        top: var(--video-top);
        left: 0;
        width: var(--video-left);
        height: var(--video-height);
    }

    .mask-right {
        top: var(--video-top);
        right: 0;
        width: calc(100vw - var(--video-left) - var(--video-width));
        height: var(--video-height);
    }
}

/* ==================== 7. 评论区样式 ==================== */
.comment-section {
    margin-top: 40px;
}

.comment-header-row {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 20px;
    color: #ff9800;
    font-weight: bold;
    font-size: 1.1rem;
}

.comment-box-wrapper {
    margin-bottom: 40px;
    border-radius: 12px;
    box-shadow: 0 4px 15px rgba(0, 0, 0, 0.05);
}

.comment-box-beige {
    position: relative;
    overflow: hidden;
    min-height: 120px;
    transition: all 0.3s ease;
    /* 添加临时边框方便调试 */
    border: 2px dashed #ccc;
}

.comment-box-beige:before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: linear-gradient(45deg, transparent 50%, rgba(255, 255, 255, 0.2) 50%);
    background-size: 10px 10px;
    z-index: 0;
    opacity: 0.3;
    pointer-events: none;
}

.comment-bg-overlay {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(255, 255, 255, 0.7);
    /* 减少透明度到0.7 */
    backdrop-filter: blur(1px);
    /* 减少模糊度 */
    -webkit-backdrop-filter: blur(1px);
    z-index: 1;
    border-radius: inherit;
    transition: background 0.3s ease;
}

.comment-box-beige:hover .comment-bg-overlay {
    background: rgba(255, 255, 255, 0.85);
    /* 鼠标悬停时稍微透一点 */
}


textarea {
    width: 100%;
    border: none;
    background: transparent;
    outline: none;
    resize: vertical;
    min-height: 120px;
    font-size: 1rem;
    color: #333;
    z-index: 2;
    position: relative;
    font-family: inherit;
    text-shadow: 0 1px 2px rgba(255, 255, 255, 0.5);
}

textarea:disabled {
    cursor: not-allowed;
    color: #999;
}

.comment-box-beige textarea {
    position: relative;
    z-index: 2;
    background: transparent;
    /* 让背景图片透出来 */
    border: none;
    resize: none;
    width: 100%;
    padding: 16px;
    font-family: 'Inter', sans-serif;
    font-size: 15px;
    line-height: 1.6;
    color: #333;
    outline: none;
}

.comment-box-beige textarea::placeholder {
    color: #666;
    opacity: 0.8;
}

.comment-box-beige .image-preview {
    position: relative;
    z-index: 2;
    padding: 0 16px 16px;
}

.comment-box-beige .disabled-overlay {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(255, 255, 255, 0.7);
    z-index: 3;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #888;
    font-weight: 500;
    cursor: pointer;
    border-radius: inherit;
}

/* 移动端适配 */
@media (max-width: 768px) {
    .comment-box-beige {
        border-radius: 12px;
    }

    .comment-bg-overlay {
        background: rgba(255, 255, 255, 0.95);
        /* 移动端更白，确保可读性 */
    }
}

.comment-toolbar {
    background: #fff;
    border: 1px solid #f2e9d0;
    border-top: 1px dashed #e0e0e0;
    padding: 10px 20px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-radius: 0 0 12px 12px;
}

.tool-left {
    display: flex;
    gap: 20px;
    align-items: center;
    position: relative;
}

.tool-icon-btn {
    cursor: pointer;
    color: #666;
    transition: 0.3s;
    display: flex;
    align-items: center;
}

.tool-icon-btn:hover {
    color: #42b883;
}

.tool-icon-btn.windmill:hover svg {
    animation: spin 0.8s linear infinite;
}

.submit-btn-purple {
    padding: 6px 24px;
    background: #9688f7;
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-weight: 600;
    transition: 0.2s;
    box-shadow: 0 3px 6px rgba(150, 136, 247, 0.3);
}

.submit-btn-purple:hover {
    background: #7c6bf5;
    transform: translateY(-1px);
}

.submit-btn-purple:disabled {
    background: #ccc;
    cursor: not-allowed;
    box-shadow: none;
}

.reply-status-bar {
    background: linear-gradient(135deg, #e8f5e9 0%, #c8e6c9 100%);
    color: #2e7d32;
    padding: 12px 16px;
    border-radius: 8px 8px 0 0;
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 0.95rem;
    font-weight: 500;
    border: 2px solid #a5d6a7;
    border-bottom: none;
}

.cancel-reply-btn {
    background: none;
    border: none;
    cursor: pointer;
    font-size: 1.3rem;
    color: #2e7d32;
    padding: 0 8px;
    opacity: 0.7;
}

.cancel-reply-btn:hover {
    opacity: 1;
}

.disabled-overlay {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(255, 255, 255, 0.7);
    z-index: 5;
    cursor: pointer;
    border-radius: 12px;
    transition: all 0.3s ease;
}

/* 评论列表 */
.comments-list {
    display: flex;
    flex-direction: column;
    gap: 16px;
    margin-top: 20px;
}

.avatar {
    width: 40px;
    height: 40px;
    border-radius: 50%;
    object-fit: cover;
    background: #eee;
    flex-shrink: 0;
}

.emoji-panel {
    position: absolute;
    bottom: 100%;
    left: -10px;
    margin-bottom: 12px;
    background: #fff;
    border: 1px solid #ebebeb;
    border-radius: 12px;
    /* 圆角稍微大一点 */
    padding: 10px;

    /* 🔥🔥🔥 核心修改：限制高度并允许滚动 🔥🔥🔥 */
    max-height: 200px;
    /* 固定最大高度 */
    overflow-y: auto;
    /* 垂直方向允许滚动 */

    /* 保持原有的 grid 布局 */
    display: grid;
    grid-template-columns: repeat(8, 1fr);
    gap: 5px;

    box-shadow: 0 5px 20px rgba(0, 0, 0, 0.15);
    min-width: 300px;
    z-index: 1000;

    /* 🔥 美化滚动条 (Chrome/Safari) */
    scrollbar-width: thin;
    scrollbar-color: #d4c5b0 transparent;
}

/* 滚动条轨道 */
.emoji-panel::-webkit-scrollbar {
    width: 6px;
}

.emoji-panel::-webkit-scrollbar-thumb {
    background-color: #e0e0e0;
    border-radius: 3px;
}

.emoji-panel::-webkit-scrollbar-track {
    background: transparent;
}

.emoji-panel::after {
    content: '';
    position: absolute;
    bottom: -6px;
    left: 20px;
    width: 10px;
    height: 10px;
    background: #fff;
    border-bottom: 1px solid #ebebeb;
    border-right: 1px solid #ebebeb;
    transform: rotate(45deg);
}

.emoji-item {
    cursor: pointer;
    font-size: 20px;
    text-align: center;
    padding: 4px;
    border-radius: 4px;
    transition: all 0.2s;
}

.emoji-item:hover {
    transform: scale(1.2);
    background: #f0f0f0;
}

.image-preview {
    display: flex;
    gap: 8px;
    margin-top: 8px;
    flex-wrap: wrap;
}

.preview-item {
    position: relative;
}

.preview-item img {
    width: 60px;
    height: 60px;
    object-fit: cover;
    border-radius: 4px;
    border: 1px solid #eee;
}

.preview-item .remove {
    position: absolute;
    top: -5px;
    right: -5px;
    background: #000;
    color: #fff;
    border-radius: 50%;
    width: 16px;
    height: 16px;
    font-size: 10px;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
}

/* Load More 按钮 */
.load-more-container {
    padding: 30px 0;
    display: flex;
    justify-content: center;
    align-items: center;
}

.load-more-btn {
    padding: 10px 30px;
    background: #fff;
    border: 1px solid #e0e0e0;
    color: #666;
    border-radius: 50px;
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.3s ease;
    display: flex;
    align-items: center;
    gap: 8px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
    font-family: 'Noto Serif SC', serif;
}

.load-more-btn:hover {
    border-color: #8b806b;
    color: #8b806b;
    background: #fdfaf2;
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(139, 128, 107, 0.15);
}

.load-more-btn.loading {
    opacity: 0.7;
    cursor: not-allowed;
    background: #f9f9f9;
}

.loader {
    width: 16px;
    height: 16px;
    border: 2px solid #ccc;
    border-bottom-color: transparent;
    border-radius: 50%;
    display: inline-block;
    animation: rotation 1s linear infinite;
}

@keyframes rotation {
    0% {
        transform: rotate(0deg);
    }

    100% {
        transform: rotate(360deg);
    }
}

.no-more-text {
    font-size: 13px;
    color: #b0b0b0;
    padding: 10px;
    letter-spacing: 1px;
    font-family: 'Noto Serif SC', serif;
}

/* ==================== 8. 弹窗与悬浮层 ==================== */

/* 灯箱 */
.lightbox-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.9);
    z-index: 99999;
    display: flex;
    justify-content: center;
    align-items: center;
    cursor: zoom-out;
    backdrop-filter: blur(10px);
}

.lightbox-content {
    position: relative;
    display: flex;
    justify-content: center;
    align-items: center;
    max-width: 95vw;
    max-height: 95vh;
}

.lightbox-image {
    max-width: 100%;
    max-height: 95vh;
    width: auto;
    height: auto;
    object-fit: contain;
    border-radius: 4px;
    box-shadow: 0 0 40px rgba(0, 0, 0, 0.6);
    animation: lightbox-zoom 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
}

@keyframes lightbox-zoom {
    from {
        transform: scale(0.9);
        opacity: 0;
    }

    to {
        transform: scale(1);
        opacity: 1;
    }
}

/* 专栏 Modal */
.column-modal-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 10000;
    backdrop-filter: blur(4px);
}

.column-modal {
    background: #fff;
    width: 350px;
    border-radius: 16px;
    overflow: hidden;
    animation: slideUp 0.3s ease;
}

@keyframes slideUp {
    from {
        transform: translateY(20px);
        opacity: 0;
    }

    to {
        transform: translateY(0);
        opacity: 1;
    }
}

.column-select-item {
    padding: 15px 20px;
    display: flex;
    align-items: center;
    gap: 12px;
    cursor: pointer;
    transition: background 0.2s;
    border-bottom: 1px solid #f5f5f5;
}

.column-select-item:hover {
    background: #f0fdf4;
}

.column-select-item .col-name {
    flex: 1;
    font-weight: 500;
}

.add-mark {
    color: #42b983;
    font-weight: bold;
}

.empty-columns-guide {
    padding: 30px 10px;
    text-align: center;
    color: #999;
}

.btn-create-now {
    margin-top: 12px;
    background: #42b883;
    color: white;
    border: none;
    padding: 8px 20px;
    border-radius: 20px;
    cursor: pointer;
    font-weight: 600;
    transition: 0.3s;
}

.modal-action-footer {
    padding: 10px;
    text-align: center;
    border-top: 1px solid #f5f5f5;
}

.text-btn {
    background: none;
    border: none;
    color: #42b883;
    font-size: 14px;
    cursor: pointer;
    font-weight: 500;
}

.quick-create-form {
    display: flex;
    flex-direction: column;
    gap: 12px;
    width: 100%;
}

.modal-input {
    width: 100%;
    padding: 12px;
    border: 1px solid #eee;
    border-radius: 8px;
    background: #fcfcfc;
    font-size: 14px;
    outline: none;
}

.modal-input:focus {
    border-color: #42b883;
    background: #fff;
}

.form-ops {
    display: flex;
    gap: 10px;
    margin-top: 10px;
}

.btn-secondary {
    flex: 1;
    padding: 10px;
    background: #f5f5f5;
    border: none;
    border-radius: 8px;
    cursor: pointer;
    color: #666;
}

.btn-primary {
    flex: 2;
    padding: 10px;
    background: #42b883;
    border: none;
    border-radius: 8px;
    color: white;
    font-weight: 600;
    cursor: pointer;
}

.btn-primary:disabled {
    background: #a5d6a7;
    cursor: not-allowed;
}

/* ==================== 9. 罗马艺术明信片 (修复版) ==================== */

/* 弹窗容器 */
.share-modal-overlay {
    position: fixed;
    top: 0;
    left: 0;
    width: 100vw;
    height: 100vh;
    background: rgba(44, 24, 16, 0.85);
    /* 深褐色背景突出卡片 */
    backdrop-filter: blur(8px);
    z-index: 2000;
    display: flex;
    justify-content: center;
    align-items: center;
    padding: 20px;
}

.share-modal-content {
    background: #fff;
    width: 100%;
    max-width: 420px;
    /* 稍微加宽一点显得大气 */
    max-height: 90vh;
    border-radius: 4px;
    /* 减少圆角，更像纸张 */
    display: flex;
    flex-direction: column;
    overflow: hidden;
    box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
}

.modal-body {
    flex: 1;
    overflow-y: auto;
    padding: 30px;
    background: #2c2c2c;
    /* 深色背景衬托卡片 */
    display: flex;
    justify-content: center;
    align-items: center;
}

/* 🔥 核心卡片容器：修复断层 BUG 的关键 */
.share-card.roman-art-style {
    width: 100%;
    height: auto !important;
    min-height: auto;

    /* 默认羊皮纸色，会被 Vue 的行内样式覆盖，但保持这个色调 */
    background-color: #f7f1e3;
    color: #5c4033;
    /* 梵高棕 */

    /* 布局修复：让内容自然流式排列，不要 padding 挤压 */
    display: flex;
    flex-direction: column;
    position: relative;
    box-sizing: border-box;

    /* 罗马风格：外边框留白 */
    padding: 15px;
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3);
}

/* 📜 纸张纹理 */
.paper-texture-overlay {
    position: absolute;
    inset: 0;
    pointer-events: none;
    opacity: 0.5;
    background-image: url('https://www.transparenttextures.com/patterns/natural-paper.png');
    mix-blend-mode: multiply;
    z-index: 0;
}

/* 🏛️ 罗马风格：双线内框 (Frame) */
.roman-border-frame {
    border: 3px double #8b5a2b;
    /* 经典双线 */
    padding: 20px;
    height: 100%;
    display: flex;
    flex-direction: column;
    position: relative;
    z-index: 1;
    background: transparent;
    /* 装饰性边角 */
    outline: 1px solid rgba(139, 90, 43, 0.2);
    outline-offset: 4px;
}

/* 1. 头部区域 */
.card-header-postcard {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 20px;
}

.postcard-stamp {
    width: 50px;
    height: 60px;
    border: 2px dotted #8b5a2b;
    padding: 4px;
    background: rgba(255, 255, 255, 0.4);
    box-shadow: 1px 1px 3px rgba(0, 0, 0, 0.1);
}

.stamp-inner {
    width: 100%;
    height: 100%;
    border: 1px solid #8b5a2b;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 8px;
    font-weight: 900;
    color: #8b5a2b;
    writing-mode: vertical-rl;
    letter-spacing: 3px;
}

/* 新增：复古邮戳 */
.postmark-circle {
    width: 60px;
    height: 60px;
    border: 2px solid rgba(139, 90, 43, 0.6);
    border-radius: 50%;
    position: absolute;
    top: 15px;
    left: 60px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    color: rgba(139, 90, 43, 0.8);
    transform: rotate(-15deg);
    mask-image: radial-gradient(circle, transparent 30%, black 100%);
    /* 做旧效果 */
}

.postmark-circle span {
    font-size: 1.2rem;
    font-weight: bold;
    line-height: 1;
}

.postmark-circle small {
    font-size: 0.6rem;
    letter-spacing: 1px;
}

.postcard-wax-seal {
    width: 50px;
    height: 50px;
    background: radial-gradient(circle at 30% 30%, #b83b3b, #7a1f1f);
    border-radius: 50%;
    display: flex;
    justify-content: center;
    align-items: center;
    box-shadow: 0 3px 6px rgba(0, 0, 0, 0.3);
    border: 2px solid rgba(255, 255, 255, 0.1);
}

.seal-v {
    font-family: serif;
    color: rgba(255, 215, 0, 0.7);
    font-size: 1.5rem;
    font-weight: bold;
}

/* 2. 封面图 (拍立得风格) */
.card-cover-art-wrapper {
    width: 100%;
    height: 200px;
    background: #f0f0f0;
    border: 4px solid #fff;
    box-shadow: 0 4px 10px rgba(0, 0, 0, 0.15);
    margin-bottom: 25px;
    overflow: hidden;
    position: relative;
    /* 罗马风格转角 */
    clip-path: polygon(2% 0, 98% 0, 100% 2%, 100% 98%, 98% 100%, 2% 100%, 0 98%, 0 2%);
}

.card-cover-art {
    width: 100%;
    height: 100%;
    object-fit: cover;
    filter: sepia(0.2) contrast(1.1);
    /* 轻微复古滤镜 */
}

.card-text-fallback {
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #8b5a2b;
    font-family: "Times New Roman", serif;
    font-size: 1.5rem;
    background: rgba(139, 90, 43, 0.1);
}

/* 3. 中间文字 */
.card-content-postcard {
    flex: 1;
    /* 撑开中间 */
    text-align: center;
    margin-bottom: 25px;
    padding: 0 10px;
}

.card-title-art {
    font-family: "Playfair Display", "Times New Roman", "Songti SC", serif;
    font-size: 1.6rem;
    color: #2c1810;
    margin-bottom: 15px;
    font-weight: 700;
    letter-spacing: -0.5px;
}

.card-summary-handwriting {
    font-family: "KaiTi", "STKaiti", cursive, serif;
    color: #5d4037;
    font-size: 1.1rem;
    line-height: 1.8;
    opacity: 0.9;
}

/* 4. 底部 (彻底修复断层) */
.card-footer-postcard {
    margin-top: auto;
    /* 自动推到底部 */
    padding-top: 15px;
    border-top: 1px solid rgba(139, 90, 43, 0.3);
    /* 细线分割 */
    display: flex;
    justify-content: space-between;
    align-items: center;
    position: relative;
}

/* 双线装饰分割 */
.card-footer-postcard::before {
    content: '';
    position: absolute;
    top: 2px;
    left: 0;
    right: 0;
    border-top: 1px solid rgba(139, 90, 43, 0.1);
}

.footer-left-content {
    display: flex;
    flex-direction: column;
    gap: 8px;
}

.author-info {
    display: flex;
    align-items: center;
    gap: 10px;
}

.card-avatar {
    width: 36px;
    height: 36px;
    border-radius: 50%;
    border: 2px solid #8b5a2b;
    padding: 1px;
    /* 头像与边框间隙 */
    object-fit: cover;

}

.author-detail {
    display: flex;
    flex-direction: column;
}

.site-logo {
    font-size: 0.6rem;
    text-transform: uppercase;
    letter-spacing: 2px;
    color: #8b5a2b;
    opacity: 0.7;
}

.card-user {
    font-family: "Times New Roman", serif;
    font-weight: bold;
    font-size: 0.95rem;
    color: #3e2723;
}

.card-date-roman {
    font-family: "Courier New", monospace;
    font-size: 0.7rem;
    color: #8d6e63;
    letter-spacing: 0.5px;
}

.postcard-qr {
    width: 64px;
    height: 64px;
    padding: 3px;
    border: 1px solid rgba(139, 90, 43, 0.3);
    background: #fff;
}

.qr-code {
    width: 100%;
    height: 100%;
    opacity: 0.9;
    mix-blend-mode: multiply;
}

/* 底部操作栏 */
.modal-footer {
    padding: 15px 20px;
    background: #fcfcfc;
    border-top: 1px solid #eee;
    display: flex;
    flex-direction: column;
    gap: 15px;
}

.download-btn {
    background: #8b5a2b;
    /* 更改按钮颜色为复古棕 */
    color: #f7f1e3;
}

.download-btn:hover {
    background: #6d4621;
}

/* ==================== 10. 加载与过渡动画 ==================== */
.loading-screen {
    height: 100vh;
    display: flex;
    justify-content: center;
    align-items: center;
}

.loading-spinner {
    width: 40px;
    height: 40px;
    border: 3px solid #f3f3f3;
    border-top: 3px solid #42b883;
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

.fade-enter-active,
.fade-leave-active {
    transition: opacity 0.3s ease;
}

.fade-enter-from,
.fade-leave-to {
    opacity: 0;
}

.fade-slide-enter-active,
.fade-slide-leave-active {
    transition: all 0.3s ease;
}

.fade-slide-enter-from,
.fade-slide-leave-to {
    opacity: 0;
    transform: translate(-50%, 10px);
}

/* ==================== 11. 响应式与移动端适配 ==================== */
@media (max-width: 1200px) {
    .side-toolbar-wrapper {
        left: 20px;
    }
}

@media (max-width: 1050px) {
    .side-toolbar-wrapper {
        display: none !important;
    }
}

@media (max-width: 900px) {
    .article-page {
        padding-bottom: 120px;
        overflow-x: hidden;
    }

    .hero-header {
        height: 45vh;
        min-height: 300px;
    }

    .hero-container {
        padding: 0 20px;
    }

    .text-art-cover {
        width: 100%;
        min-height: auto;
        padding: 25px 20px;
        margin-bottom: 20px;
    }

    .text-art-cover .article-title {
        font-size: 1.6rem;
        line-height: 1.3;
    }

    .initial-letter {
        font-size: 8rem;
        opacity: 0.08;
    }

    .hero-info-bottom .article-title {
        font-size: 1.8rem;
        text-shadow: 0 2px 10px rgba(0, 0, 0, 0.7);
    }

    .article-meta {
        flex-wrap: wrap;
        gap: 10px;
        font-size: 0.8rem;
    }

    .meta-divider {
        display: none;
    }

    .content-card {
        margin: -30px 10px 0;
        padding: 25px 20px;
        border-radius: 16px;
        min-height: auto;
    }

    .disney-piano-concert {
        padding: 30px 10px;
        border: none;
        box-shadow: inset 0 0 20px rgba(0, 0, 0, 0.5);
    }

    .piano-workbench {
        transform: scale(0.65);
        transform-origin: center top;
        margin-bottom: -60px;
        width: 100%;
    }

    .romantic-player-bar {
        margin-top: 10px;
    }

    .disney-audio-node {
        width: 100%;
        height: 35px;
    }

    .media-box.video {
        width: 100%;
        aspect-ratio: 16/9;
    }

    .media-box.audio {
        width: 200px;
        height: 200px;
    }

    .theater-frame {
        border-radius: 8px;
    }

    .markdown-body {
        font-size: 16px;
        line-height: 1.75;
    }

    .markdown-body :deep(h1) {
        font-size: 1.6rem;
        margin-top: 1.5em;
    }

    .markdown-body :deep(h2) {
        font-size: 1.4rem;
        margin-top: 1.4em;
    }

    .markdown-body :deep(img) {
        margin: 15px 0;
    }

    .markdown-body :deep(blockquote) {
        padding: 10px 15px;
        font-size: 0.95rem;
        margin: 15px 0;
    }

    .action-buttons-row {
        flex-wrap: wrap;
        gap: 12px;
        margin: 30px 0;
    }

    .btn-large {
        flex: 1;
        min-width: 40%;
        padding: 10px;
        font-size: 0.9rem;
        justify-content: center;
    }

    .comment-section {
        margin-top: 30px;
    }

    .comment-box-beige {
        padding: 15px;
        min-height: 140px;
    }

    .comment-toolbar {
        flex-direction: row;
        padding: 10px;
    }

    .tool-left {
        gap: 15px;
    }

    .submit-btn-purple {
        padding: 6px 15px;
        font-size: 0.9rem;
    }

    .emoji-panel {
        position: fixed;
        bottom: 0;
        left: 0;
        width: 100%;

        /* 🔥 移动端也加上高度限制，防止挡住输入框 */
        max-height: 40vh;
        /* 最多占屏幕高度的 40% */
        overflow-y: auto;

        display: grid;
        /* 确保是 grid */
        grid-template-columns: repeat(8, 1fr);
        margin-bottom: 0;
        border-radius: 20px 20px 0 0;
        box-shadow: 0 -5px 20px rgba(0, 0, 0, 0.1);
        padding: 15px;
        z-index: 2000;
        background: #fff;
        /* 确保有背景色 */
    }

    .share-modal-content {
        width: 95%;
        max-height: 90vh;
    }

    .share-card {
        width: 100%;
        min-height: auto;
        padding: 20px;
    }

    /* ========== 📱 Emoji 面板：精致悬浮小卡片版 ========== */
    .emoji-panel {
        /* 1. 定位：悬浮在底部，不再贴边 */
        position: fixed !important;
        bottom: 20px !important;
        /* 距离底部留出空隙 */
        left: 5vw !important;
        /* 左边留 5% 空隙 */
        width: 90vw !important;
        /* 宽度只占 90% */
        top: auto !important;
        margin: 0 !important;

        /* 2. 尺寸：更克制的高度 */
        height: auto !important;
        max-height: 30vh !important;
        /* 🔥 高度减小：只占屏幕 30% */
        min-height: 180px;
        /* 最小高度也减小 */
        overflow-y: auto !important;
        overscroll-behavior: contain;

        /* 3. 布局：更加紧凑 */
        display: grid !important;
        /* 🔥 图标变小一点 (38px)，排列更紧密 */
        grid-template-columns: repeat(auto-fill, minmax(38px, 1fr)) !important;
        gap: 5px !important;
        /* 间距减小 */

        /* 4. 样式：全圆角卡片 */
        padding: 15px !important;
        background: rgba(255, 255, 255, 0.98) !important;
        backdrop-filter: blur(20px);
        -webkit-backdrop-filter: blur(20px);

        /* 🔥 四个角都是圆的，像个弹出的气泡 */
        border-radius: 20px !important;
        border: 1px solid rgba(0, 0, 0, 0.08) !important;

        /* 更柔和的阴影 */
        box-shadow: 0 10px 40px rgba(0, 0, 0, 0.2) !important;

        z-index: 2147483647 !important;
    }

    /* 隐藏原有的小箭头 */
    .emoji-panel::after {
        display: none !important;
    }

    /* 单个表情样式微调 */
    .emoji-item {
        font-size: 24px !important;
        /* 字体稍微改小一点点 */
        padding: 6px !important;
        /* 内边距减小 */
        display: flex;
        justify-content: center;
        align-items: center;
        border-radius: 8px !important;
        aspect-ratio: 1 / 1;
    }

    .emoji-item:active {
        background-color: #f0f0f0;
        transform: scale(0.9);
    }
}

/* ==================== 🚀 移动端交互质感升级 (全剧终章) ==================== */

/* 1. 全局：移除移动端默认的点击高亮色块 (那个丑陋的半透明背景) */
* {
    -webkit-tap-highlight-color: transparent;
}

/* 2. 按钮与可点击元素的通用按压反馈 */
/* 定义一个通用的按压缩小效果，让点击更有"实感" */
.art-play-btn:active,
.mini-follow-btn:active,
.tool-item:active,
.q-btn:active,
.btn-large:active,
.submit-btn-purple:active,
.tool-icon-btn:active,
.load-more-btn:active,
.meta-item.author:active,
.column-select-item:active,
.art-list-item:active,
.download-btn:active,
.cancel-reply-btn:active,
.lightbox-close-btn:active,
.art-close-btn:active,
.preview-close-btn:active {
    transform: scale(0.92) !important;
    /* 按下时稍微缩小 */
    transition: transform 0.1s ease-out;
    /* 极速响应，不要拖泥带水 */
    opacity: 0.85;
    /* 稍微变暗一点点 */
}

/* 3. 特殊优化：播放按钮的按压质感 */
.art-play-btn {
    transition: all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
    /* 加入弹性动画 */
}

.art-play-btn:active {
    transform: scale(0.85) !important;
    /* 播放按钮可以缩得更明显一点，因为它是核心操作 */
    box-shadow: 0 2px 8px rgba(139, 90, 43, 0.2) !important;
    /* 按下去时阴影收缩 */
}

/* 4. 特殊优化：丝线进度条的按压 */
.art-progress-track:active .progress-quill {
    transform: translate(-50%, -80%) scale(1.1) rotate(-15deg) !important;
    /* 拖动时羽毛变大 */
    filter: drop-shadow(0 4px 8px rgba(212, 175, 55, 0.6)) !important;
}

/* 5. 底部大按钮组的特殊反馈 */
.btn-large {
    transition: all 0.2s ease;
}

.btn-large:active {
    transform: translateY(2px) scale(0.98) !important;
    /* 模拟真实的按钮下陷感 */
    box-shadow: 0 1px 4px rgba(0, 0, 0, 0.1) !important;
}

/* 6. 文章列表卡片/专栏列表项的波纹感 */
.column-select-item,
.art-list-item {
    position: relative;
    overflow: hidden;
    /* 必须溢出隐藏 */
}

/* 利用伪元素做一个瞬间闪过的背景高亮 */
.column-select-item:active,
.art-list-item:active {
    background-color: rgba(139, 90, 43, 0.08) !important;
}

/* 7. 图片点击反馈 (针对灯箱预览图) */
.markdown-body :deep(img):active {
    transform: scale(0.98);
    opacity: 0.9;
    transition: transform 0.2s;
}

/* ==================== 🌟 灯箱关闭按钮美化 ==================== */

.lightbox-close-btn {
    /* 1. 绝对定位到右上角 */
    position: absolute;
    top: 30px;
    right: 30px;
    z-index: 100000;
    /* 确保层级最高 */

    /* 2. 尺寸与形状 */
    width: 48px;
    height: 48px;
    border-radius: 50%;

    /* 3. 玻璃拟态背景 (精致感来源) */
    background: rgba(255, 255, 255, 0.15);
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
    border: 1px solid rgba(255, 255, 255, 0.2);

    /* 4. 文字/图标样式 */
    color: #fff;
    font-size: 28px;
    line-height: 1;
    cursor: pointer;

    /* 5. 居中 */
    display: flex;
    justify-content: center;
    align-items: center;

    /* 6. 过渡动画 */
    transition: all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);
    box-shadow: 0 4px 15px rgba(0, 0, 0, 0.3);
}

/* 悬停效果 */
.lightbox-close-btn:hover {
    background: rgba(255, 255, 255, 0.3);
    transform: rotate(90deg) scale(1.1);
    /* 旋转加放大 */
    box-shadow: 0 8px 25px rgba(255, 255, 255, 0.2);
}

/* 点击反馈 */
.lightbox-close-btn:active {
    transform: scale(0.95);
    background: rgba(255, 255, 255, 0.1);
}

/* 8. 专栏/菜单弹窗的关闭按钮 */
.art-close-btn,
.lightbox-close-btn {
    /* 增大点击热区，虽然看不见，但更容易点到 */
    padding: 10px;
    margin: -10px;
}

/* 9. 修复iOS可能的滚动卡顿 */
.art-scroll-area,
.emoji-panel,
.markdown-body {
    -webkit-overflow-scrolling: touch;
}

/* ================= 🖼️ 全局灯箱样式 ================= */
.global-lightbox-overlay {
    /* 1. 强制占满全屏，无视任何父级偏移 */
    position: fixed !important;
    top: 0 !important;
    left: 0 !important;
    right: 0 !important;
    bottom: 0 !important;
    width: 100vw !important;
    height: 100vh !important;
    height: 100dvh !important;
    /* 适配移动端动态高度 */

    /* 2. 全站最高层级，绝对穿透导航栏 */
    z-index: 2147483647 !important;

    /* 3. 极致居中：利用 Flexbox 强制垂直水平居中 */
    display: flex !important;
    align-items: center !important;
    justify-content: center !important;

    /* 4. 视觉增强 */
    background: rgba(0, 0, 0, 0.94) !important;
    backdrop-filter: blur(20px) saturate(150%) !important;
    -webkit-backdrop-filter: blur(20px) saturate(150%) !important;

    cursor: zoom-out;
}

.lightbox-content {
    /* 移除所有 top/left 偏移，交给父级 Flex 居中 */
    position: relative !important;
    display: flex !important;
    flex-direction: column !important;
    align-items: center !important;
    justify-content: center !important;
    width: 100% !important;
    height: 100% !important;
    padding: 20px !important;
    box-sizing: border-box !important;
}

.lightbox-img {
    /* 限制最大尺寸，确保绝不溢出屏幕，绝不钻进导航栏下方 */
    max-width: 90vw !important;
    max-height: 85vh !important;
    object-fit: contain !important;

    border-radius: 8px;
    /* 针对深色模式的金色氛围阴影 */
    box-shadow: 0 0 80px rgba(0, 0, 0, 0.8), 0 0 30px rgba(214, 163, 84, 0.15) !important;

    /* 顺滑入场 */
    animation: lightboxPop 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
}

:global(html.dark) .lightbox-img {
    box-shadow: 0 0 50px rgba(214, 163, 84, 0.2) !important;
    border: 1px solid rgba(214, 163, 84, 0.3) !important;
}

.lightbox-close {
    position: fixed !important;
    top: 30px !important;
    right: 30px !important;
    width: 50px !important;
    height: 50px !important;
    background: rgba(255, 255, 255, 0.1) !important;
    border: 1px solid rgba(255, 255, 255, 0.2) !important;
    color: #fff !important;
    border-radius: 50% !important;
    font-size: 28px !important;
    cursor: pointer !important;
    display: flex !important;
    align-items: center !important;
    justify-content: center !important;
    transition: all 0.3s !important;
    z-index: 2147483647 !important;
}

.lightbox-close:hover {
    background: #d6a354 !important;
    transform: rotate(90deg) scale(1.1) !important;
}

@keyframes lightboxPop {
    from {
        transform: scale(0.9);
        opacity: 0;
    }

    to {
        transform: scale(1);
        opacity: 1;
    }
}

.lightbox-hint {
    margin-top: 15px;
    color: rgba(255, 255, 255, 0.5);
    font-size: 0.85rem;
    letter-spacing: 1px;
}

/* 动画过度 */
.fade-enter-active,
.fade-leave-active {
    transition: opacity 0.3s ease;
}

.fade-enter-from,
.fade-leave-to {
    opacity: 0;
}

/* ==================== 📱 移动端终极适配 (整合版) ==================== */
@media (max-width: 600px) {
    /* ==================== 1. 通用组件优化 ==================== */

    /* 灯箱关闭按钮 */
    .lightbox-close {
        top: 15px !important;
        right: 15px !important;
        width: 36px !important;
        height: 36px !important;
        background: rgba(0, 0, 0, 0.5) !important;
    }

    .lightbox-close-btn {
        top: 20px;
        right: 20px;
        width: 40px;
        height: 40px;
        font-size: 24px;
        background: rgba(0, 0, 0, 0.3);
    }

    /* 分享弹窗优化 */
    .share-modal-overlay {
        padding: 0;
    }

    .share-modal-content {
        max-height: 100vh;
        height: 100vh;
        width: 100vw;
        border-radius: 0;
    }

    .modal-body {
        padding: 15px;
    }

    .share-card.roman-art-style {
        padding: 10px;
        box-shadow: none;
    }

    .roman-border-frame {
        padding: 15px;
    }

    .card-cover-art-wrapper {
        height: 160px;
    }

    .postmark-circle {
        left: auto;
        right: 10px;
        top: 50px;
    }

    /* 剧场模式视频 */
    .content-card.cinema-mode-active {
        width: 98vw !important;
        max-height: 75vh !important;
    }

    .cinema-mode-active .inner-video-player {
        max-height: 75vh !important;
    }

    /* ==================== 2. 英雄区域优化 ==================== */

    /* 主题按钮组：移动到顶部右侧，竖排 */
    .hero-controls {
        position: absolute !important;
        top: 80px !important;
        right: 15px !important;
        bottom: auto !important;
        display: flex !important;
        flex-direction: column !important;
        gap: 10px !important;
        z-index: 20;
    }

    .q-btn {
        background-color: initial;
        backdrop-filter: none !important;
        box-shadow: 0 4px 6px rgba(0, 0, 0, 0.2);
        width: 64px;
        padding: 6px 0 !important;
        text-align: center;
        font-size: 0.75rem !important;
        border-radius: 10px !important;
        margin: 0 !important;
    }

    /* 作者信息区域：移动到左下角 */
    .hero-info-bottom {
        position: absolute !important;
        bottom: 45px !important;
        left: 20px !important;
        right: 20px !important;
        text-align: left !important;
        z-index: 10;
        width: auto !important;
        max-width: 80%;
        margin-bottom: 0 !important;
    }

    .hero-info-bottom .article-title {
        font-size: 1.4rem !important;
        line-height: 1.3;
        margin-bottom: 8px !important;
        text-shadow: 0 1px 3px rgba(0, 0, 0, 0.5);
    }

    .article-meta {
        font-size: 0.75rem !important;
        gap: 8px !important;
        flex-wrap: wrap;
    }

    .author-avatar {
        width: 36px !important;
        height: 36px !important;
        border-width: 1px !important;
    }

    .mini-follow-btn {
        width: 16px !important;
        height: 16px !important;
        right: -3px !important;
        top: -3px !important;
    }

    /* ==================== 3. 音乐播放器全面优化 ==================== */

    .disney-piano-concert {
        display: flex !important;
        flex-direction: column !important;
        justify-content: flex-start !important;
        align-items: center !important;
        padding: 25px 15px 20px !important;
        min-height: 460px !important;
        box-sizing: border-box !important;
    }

    .vinyl-record-stage {
        transform: scale(0.85) !important;
        margin-top: 0 !important;
        margin-bottom: 10px !important;
        flex-shrink: 0 !important;
        z-index: 5 !important;
    }

    .piano-tonearm {
        top: -25px !important;
        right: -15px !important;
    }

    .lyrics-floating-stage {
        position: relative !important;
        top: auto !important;
        left: auto !important;
        width: 100% !important;
        height: auto !important;
        min-height: 50px !important;
        margin-bottom: 15px !important;
        flex-shrink: 0 !important;
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
        z-index: 4 !important;
    }

    .current-lyric-line {
        font-size: 13px !important;
        line-height: 1.6 !important;
        padding: 0 5px !important;
    }

    .default-note {
        font-size: 12px !important;
        opacity: 0.8 !important;
    }

    .audio-caption {
        position: relative !important;
        bottom: auto !important;
        left: auto !important;
        width: 100% !important;
        display: block !important;
        text-align: center !important;
        margin-top: auto !important;
        margin-bottom: 20px !important;
        font-size: 14px !important;
        color: #8b5a2b !important;
        font-weight: bold !important;
        font-family: "KaiTi", "STKaiti", serif !important;
        text-shadow: 0 1px 1px rgba(255, 255, 255, 0.8) !important;
        white-space: nowrap !important;
        overflow: hidden !important;
        text-overflow: ellipsis !important;
        pointer-events: none !important;
    }

    /* ==================== 4. 播放器进度条和时间显示优化 ==================== */

    .romantic-player-bar {
        width: 100% !important;
        height: 56px !important;
        min-height: 56px !important;
        display: flex !important;
        align-items: center !important;
        padding: 0 10px !important;
        background-color: rgba(255, 255, 255, 0.7) !important;
        border-radius: 12px !important;
        margin-top: 0 !important;
        flex-shrink: 0 !important;
    }

    .art-player-ui {
        width: 100% !important;
        height: 100% !important;
        display: flex !important;
        align-items: center !important;
        gap: 12px !important;
        margin: 0 !important;
        padding: 0 5px !important;
    }

    .art-play-btn {
        width: 42px !important;
        height: 42px !important;
        min-width: 42px !important;
        min-height: 42px !important;
        margin: 0 !important;
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
    }

    .icon-play,
    .icon-pause {
        font-size: 18px !important;
    }

    .art-progress-container {
        flex: 1 !important;
        width: 0 !important;
        display: flex !important;
        flex-direction: column !important;
        justify-content: center !important;
        position: relative !important;
        gap: 4px !important;
        padding: 0 5px !important;
    }

    /* 🔥 核心修复：细进度条 + 时间显示 */
    .art-progress-track {
        width: 100% !important;
        background: rgba(212, 175, 55, 0.2) !important;
        border-radius: 1px !important;
        position: relative !important;
        cursor: pointer !important;
        min-height: 2px !important;
        background-clip: content-box !important;
        margin: 0 !important;
        order: 2;
    }

    .progress-fill {
        height: 2px !important;
        border-radius: 1px !important;
    }

    /* 🔥 重新显示时间文本 */
    .time-text {
        display: block !important;
        font-family: 'Courier New', monospace;
        font-size: 10px !important;
        color: #8b5a2b;
        font-weight: 600;
        min-width: 35px;
        opacity: 0.8;
        position: absolute;
        top: -16px;
    }

    .time-text.current {
        left: 0;
        text-align: left;
    }

    .time-text.duration {
        right: 0;
        text-align: right;
    }

    /* ==================== 5. 羽毛播放条优化 ==================== */

    .progress-quill {
        position: absolute !important;
        top: 50% !important;
        width: 18px !important;
        height: 18px !important;
        display: flex !important;
        justify-content: center !important;
        align-items: center !important;
        transform: translateX(3%) translateY(-100%) rotateY(180deg) !important;
        font-size: 18px !important;
        pointer-events: none !important;
        z-index: 10 !important;
        filter: drop-shadow(1px 2px 3px rgba(0, 0, 0, 0.2)) !important;
        transition: left 0.1s linear !important;
    }
}

/* ==================== 🚀 硬核物理小火箭 ==================== */

/* 1. 最外层容器：负责定位和整体飞出屏幕的动作 */
.rocket-container-physics {
    position: fixed;
    bottom: 80px;
    right: 30px;
    width: 60px;
    /* 稍微加大一点空间给火焰 */
    height: 80px;
    cursor: pointer;
    z-index: 2147483647 !important;
    pointer-events: auto;
    /* 初始状态不在屏幕外 */
    transform: translateY(0);
}

/* 2. 物理层：负责蓄力变形动画 */
.rocket-physics-wrapper {
    width: 100%;
    height: 100%;
    position: relative;
    /* 设置变形的基点在底部中心，这样压扁和拉伸看起来才真实 */
    transform-origin: bottom center;
    transition: transform 0.2s cubic-bezier(0.25, 0.46, 0.45, 0.94);
}

/* 3. 悬浮层：负责平时的优雅浮动 */
.rocket-hover-wrapper {
    width: 100%;
    height: 60px;
    /* 图标实际高度 */
    /* 平时缓慢浮动 */
    animation: antiGravityHover 3s ease-in-out infinite;
}

/* 火箭图标：直立，带点阴影 */
.rocket-icon-直立 {
    width: 85%;
    height: 85%;
    filter: drop-shadow(0 4px 4px rgba(0, 0, 0, 0.2));
}

/* 🔥 强力引擎尾焰 (平时隐藏) */
.rocket-engine-exhaust {
    position: absolute;
    bottom: 15px;
    /* 紧贴火箭底部 */
    left: 42%;
    /* 平时收缩起来 */
    transform-origin: top center;
    width: 10px;
    height: 30px;
    opacity: 0;

    /* 使用径向渐变模拟更加真实的喷射核心 */
    background: radial-gradient(circle at top, #fff 10%, #ffeb3b 40%, #ff6b00 80%, transparent 100%);
    filter: blur(3px);
    transition: all 0.1s;
}

/* ==================== ⚡ 发射流程 (点击激活) ==================== */

/* 阶段一：点火蓄力 (点击瞬间) */
/* .is-launching 类加上时，瞬间触发 */
.rocket-container-physics.is-launching .rocket-physics-wrapper {
    /* 火箭主体被巨大的推力瞬间“压扁”一点点 */
    transform: scaleY(0.9) translateY(5px);
}

.rocket-container-physics.is-launching .rocket-engine-exhaust {
    opacity: 1;
    /* 火焰瞬间爆发喷出 */
    transform: translateX(-50%) scaleY(1.5);
    /* 高频猛烈抖动 */
    animation: engineViolentPulse 0.05s infinite alternate;
}

/* 阶段二：极速升空 (0.2秒后开始飞) */
/* 我们利用 CSS animation 的 delay 来实现两段式动画 */
.rocket-container-physics.is-launching {
    /* 0.2秒蓄力后，执行飞出动画 */
    /* 使用 cubic-bezier 模拟极其强烈的加速感（慢启动，极快结束） */
    animation: launchFlyOut 0.8s cubic-bezier(0.6, 0.04, 0.98, 0.335) 0.2s forwards;
}

/* 在飞出过程中，让火箭拉伸，增加速度感 */
.rocket-container-physics.is-launching .rocket-physics-wrapper {
    /* 覆盖掉上面的压扁样式，变为拉伸样式 */
    /* 需要配合飞出动画的时间 */
    animation: stretchWhileFlying 0.8s ease-in 0.2s forwards;
}


/* ========== 动画关键帧定义 ========== */

/* 平时的反重力悬浮 */
@keyframes antiGravityHover {

    0%,
    100% {
        transform: translateY(0);
    }

    50% {
        transform: translateY(-6px);
    }
}

/* 极速飞出屏幕 */
@keyframes launchFlyOut {
    0% {
        transform: translateY(0);
    }

    100% {
        /* 飞到屏幕外非常远的地方 */
        transform: translateY(-150vh);
        opacity: 0;
    }
}

/* 飞行中的拉伸形变 */
@keyframes stretchWhileFlying {
    0% {
        transform: scaleY(0.9);
    }

    /* 从压扁状态开始 */
    100% {
        transform: scaleY(1.3);
    }

    /* 变为极度拉伸状态 */
}

/* 引擎猛烈喷射抖动 */
@keyframes engineViolentPulse {
    from {
        filter: blur(3px) brightness(1);
        transform: translateX(-50%) scaleY(1.5);
    }

    to {
        filter: blur(4px) brightness(1.2);
        transform: translateX(-50%) scaleY(1.8) scaleX(1.1);
    }
}

/* Vue 进出场过渡 */
.rocket-fade-enter-active,
.rocket-fade-leave-active {
    transition: all 0.5s ease;
}

.rocket-fade-enter-from,
.rocket-fade-leave-to {
    opacity: 0;
    transform: translateY(20px);
}

/* ========== 📱 移动端完美适配 ========== */
@media (max-width: 768px) {
    .rocket-container-physics {
        /* 1. 缩小尺寸：更精致，不挡内容 */
        width: 40px;
        height: 55px;
        /* 留点空间给火焰 */

        /* 2. 调整位置：更贴近右下角，符合拇指操作习惯 */
        bottom: 60px;
        /* 稍微降低一点，避开可能的底部导航栏或浏览器操作栏 */
        right: 15px;
        /* 靠右边近一点 */
    }

    /* 3. 同步缩小内部图标和悬浮高度 */
    .rocket-hover-wrapper {
        height: 40px;
        /* 图标本身变为 40x40 */
    }

    /* 4. 微调悬浮动画幅度，小火箭不需要浮动太大 */
    @keyframes antiGravityHover {

        0%,
        100% {
            transform: translateY(0);
        }

        50% {
            transform: translateY(-4px);
        }

        /* 桌面是 -6px，手机改为 -4px */
    }

    /* 5. 同步缩小火焰尺寸 */
    .rocket-engine-exhaust {
        width: 14px;
        height: 30px;
        border-left-width: 6px;
        /* 调整火焰尖端的粗细 */
        border-right-width: 6px;
        border-top-width: 18px;
    }

    .rocket-engine-exhaust::after {
        top: -18px;
        border-left-width: 3px;
        border-right-width: 3px;
        border-top-width: 10px;
    }
}

/* ==================== 🎬 劇場模式：Smart Teleport 樣式 (最終修復版) ==================== */

/* 1. 傳送後的容器：變成全屏固定定位 */
.inner-theater-section.cinema-mode-active {
    position: fixed !important;
    top: 0 !important;
    left: 0 !important;
    width: 100vw !important;
    height: 100vh !important;
    background-color: #000 !important;
    /* 強制黑底 */
    z-index: 2147483647 !important;
    /* 最高層級 */

    /* 彈性佈局居中 */
    display: flex !important;
    flex-direction: column !important;
    justify-content: center !important;
    align-items: center !important;

    margin: 0 !important;
    padding: 0 !important;
    transform: none !important;
    /* 確保沒有偏移 */
}

/* 2. 視頻框架：全屏居中 */
.cinema-mode-active .theater-frame {
    width: 100% !important;
    height: 100% !important;
    background: transparent !important;
    border: none !important;
    box-shadow: none !important;
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 10;
}

/* 3. 播放器：保持比例，不拉伸 */
.cinema-mode-active .inner-video-player {
    width: auto !important;
    height: auto !important;
    max-width: 100vw !important;
    max-height: 100vh !important;
    object-fit: contain !important;
    background: #000 !important;
}

/* 5. 遮罩層：作爲背景點擊區域 */
.cinema-mode-active .cinema-masks {
    position: absolute;
    inset: 0;
    z-index: 5;
    pointer-events: auto;
}

/* 6. 退出提示文字 */
.cinema-close-hint {
    position: fixed;
    bottom: 30px;
    color: rgba(255, 255, 255, 0.5);
    font-size: 14px;
    z-index: 20;
    pointer-events: none;
}

/* 1. 全屏黑底容器 */
.inner-theater-section.cinema-mode-active {
    position: fixed !important;
    top: 0 !important;
    left: 0 !important;
    width: 100vw !important;
    height: 100vh !important;
    background-color: rgba(0, 0, 0, 0.95) !important; /* 95% 黑色背景 */
    z-index: 2147483647 !important; /* 宇宙最高层级 */
    
    /* Flex 布局保证视频永远居中 */
    display: flex !important;
    justify-content: center !important;
    align-items: center !important;
    
    /* 清除任何边距 */
    margin: 0 !important;
    padding: 0 !important;
    transform: none !important;
}

/* 2. 视频外框 */
.cinema-mode-active .theater-frame {
    width: 100% !important; /* 手机端宽度撑满 */
    max-width: 100vw !important; /* 防止溢出 */
    height: auto !important;
    max-height: 80vh !important; /* 上下留点空隙，不要顶满 */
    
    background: transparent !important;
    border: none !important;
    box-shadow: none !important;
    border-radius: 0 !important;
    
    /* 确保 Flex 生效 */
    display: flex !important;
    justify-content: center !important;
    align-items: center !important;
}

/* 3. 视频播放器本体 */
.cinema-mode-active .inner-video-player {
    width: 100% !important;
    height: auto !important;
    max-height: 80vh !important;
    object-fit: contain !important; /* 保持比例 */
    background: #000 !important;
}
</style>