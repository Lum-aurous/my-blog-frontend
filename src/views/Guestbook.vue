<script setup>
import { ref, onMounted, onUnmounted, provide, nextTick, computed } from 'vue'
import { api } from '@/utils/api'
import { useUserStore } from '@/stores/user'
import { message } from '@/utils/message'
import { Send, Feather, PenTool, Smile, Image as ImageIcon, Heart } from 'lucide-vue-next'
import CommentItem from '@/components/CommentItem.vue'

defineOptions({ name: 'Guestbook' })

const userStore = useUserStore()
const isLoading = ref(true)

// 🔥 分页相关
const allCommentsTree = ref([])
const displayComments = ref([])
const page = ref(1)
const pageSize = 10
const hasMore = computed(() => displayComments.value.length < allCommentsTree.value.length)
const isLoadingMore = ref(false)

// 弹幕相关
const barrageList = ref([])
const barrageInput = ref('')
const bottomContent = ref('')
const isSending = ref(false)
const replyTarget = ref(null)

// Emoji & 图片
const showEmojiPicker = ref(false)
const selectedImages = ref([])
const imageInputRef = ref(null)
const MAX_IMAGES = 9
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

const SITE_ADMIN_ID = 1

// 6 条轨道
const tracks = ref([[], [], [], [], [], []])
// 🔥 核心：记录每条轨道“上一条弹幕”的发射时间戳
const trackLastLaunchTime = ref([0, 0, 0, 0, 0, 0])
// 🔥 核心：记录每条轨道“上一条弹幕”的飞行总时长（用于计算它飞了多远）
const trackLastDuration = ref([0, 0, 0, 0, 0, 0])

const heroImage = ref('https://w.wallhaven.cc/full/48/wallhaven-4813e7.jpg')
let schedulerTimer = null // 全局调度定时器
let nextDataIndex = 0 // 循环播放的数据指针

// ==================== 🖼️ 灯箱逻辑 (极简稳健版) ====================
const isLightboxOpen = ref(false)
const lightboxUrl = ref('')
const scrollY = ref(0)
const isImageLoaded = ref(false)

// 修改 openLightbox 函数
const openLightbox = (url) => {
    scrollY.value = window.pageYOffset

    // 先锁定页面，防止跳动
    document.body.style.position = 'fixed'
    document.body.style.top = `-${scrollY.value}px`
    document.body.style.width = '100%'
    document.body.style.overflow = 'hidden'
    document.body.style.touchAction = 'none'

    // 重置加载状态
    isImageLoaded.value = false

    // 预加载图片
    const img = new Image()
    img.src = url
    img.onload = () => {
        lightboxUrl.value = url
        isLightboxOpen.value = true
        nextTick(() => {
            isImageLoaded.value = true
        })
    }

    // 如果图片已缓存，直接触发
    if (img.complete) {
        img.onload()
    }
}

// 修改 closeLightbox 函数
const closeLightbox = () => {
    isImageLoaded.value = false
    const overlay = document.querySelector('.lightbox-overlay')
    if (overlay) {
        overlay.style.transition = 'opacity 0.3s ease'
        overlay.style.opacity = '0'
    }

    setTimeout(() => {
        isLightboxOpen.value = false

        // 恢复背景滚动
        document.body.style.position = ''
        document.body.style.top = ''
        document.body.style.width = ''
        document.body.style.overflow = ''
        document.body.style.touchAction = ''

        // 恢复滚动位置
        window.scrollTo(0, scrollY.value)
    }, 300)
}

// 向下提供方法
provide('triggerLightbox', openLightbox)

// ==================== 🌲 评论数据处理 ====================
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

// 加载数据
const fetchComments = async (isRefresh = false) => {
    try {
        const res = await api.get('/comments', {
            params: { article_id: 100000, page: 1, limit: 1000, type: 'article' }
        })
        if (res.data.success) {
            const rawList = Array.isArray(res.data.data) ? res.data.data : (res.data.data?.list || []);

            allCommentsTree.value = buildTwoLevelTree(rawList);

            if (!isRefresh) {
                page.value = 1
                displayComments.value = allCommentsTree.value.slice(0, pageSize)
            } else {
                const currentLen = displayComments.value.length;
                displayComments.value = allCommentsTree.value.slice(0, currentLen + 1);
            }

            isLoadingMore.value = false

            if (rawList.length > 0) {
                const newBarrageData = rawList.slice(0, 150).map(c => ({
                    id: c.id,
                    text: c.content,
                    image: (c.images && c.images.length > 0) ? c.images[0] : null,
                    avatar: c.avatar || c.user_avatar || 'https://w.wallhaven.cc/full/9o/wallhaven-9oog5d.jpg',
                    color: '#ffffff',
                    is_liked: !!c.is_liked,
                    likes_count: c.likes_count || 0
                }));

                barrageList.value = newBarrageData;

                // 启动调度器（如果还没启动）
                if (!schedulerTimer) {
                    startBarrageScheduler();
                }
            }
        }
    } catch (err) {
        console.error('留言加载失败:', err)
    } finally {
        isLoading.value = false
    }
}

const loadMoreComments = () => {
    isLoadingMore.value = true
    setTimeout(() => {
        const currentLen = displayComments.value.length
        const nextBatch = allCommentsTree.value.slice(currentLen, currentLen + pageSize)
        if (nextBatch.length > 0) {
            displayComments.value.push(...nextBatch)
            page.value++
        }
        isLoadingMore.value = false
    }, 300)
}

// 图片处理
const compressImage = (file, { quality = 0.6, maxWidth = 1000 } = {}) => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (e) => {
            const img = new Image();
            img.src = e.target.result;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let width = img.width;
                let height = img.height;
                if (width > maxWidth) {
                    height = (maxWidth / width) * height;
                    width = maxWidth;
                }
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);
                canvas.toBlob((blob) => {
                    if (blob) {
                        const compressedFile = new File([blob], file.name, {
                            type: 'image/jpeg',
                            lastModified: Date.now(),
                        });
                        resolve(compressedFile);
                    } else reject(new Error('压缩失败'));
                }, 'image/jpeg', quality);
            };
        };
        reader.onerror = (err) => reject(err);
    });
};

const insertEmoji = (emoji) => {
    const textarea = document.querySelector('.main-textarea')
    if (!textarea) return
    const start = textarea.selectionStart
    const end = textarea.selectionEnd
    bottomContent.value = bottomContent.value.slice(0, start) + emoji + bottomContent.value.slice(end)
    nextTick(() => {
        textarea.focus()
        textarea.selectionStart = textarea.selectionEnd = start + emoji.length
    })
    showEmojiPicker.value = false
}

const handleImageUpload = () => {
    if (!userStore.isLoggedIn) return message.warning('请先登录')
    imageInputRef.value?.click()
}

const handleSelectImage = (e) => {
    const files = Array.from(e.target.files)
    for (const file of files) {
        if (selectedImages.value.length >= MAX_IMAGES) {
            message.warning(`最多只能上传 ${MAX_IMAGES} 张图片`)
            break
        }
        const url = URL.createObjectURL(file)
        selectedImages.value.push({ file, url })
    }
    e.target.value = ''
}

const removeImage = (index) => {
    URL.revokeObjectURL(selectedImages.value[index].url)
    selectedImages.value.splice(index, 1)
}

const closeEmojiPicker = (e) => {
    if (!e.target.closest('.emoji-trigger') && !e.target.closest('.emoji-panel')) {
        showEmojiPicker.value = false
    }
}

// 发送逻辑
const handleSend = async (content, from = 'barrage') => {
    if (!userStore.isLoggedIn) return message.warning('请先登录')
    if (from === 'barrage') {
        if (!content || !content.trim()) return message.warning('请写下您的心声...')
    } else {
        if (!content.trim() && selectedImages.value.length === 0) return message.warning('不能发送空内容')
    }

    isSending.value = true
    try {
        let imageUrls = []
        if (from === 'bottom' && selectedImages.value.length > 0) {
            message.info(`正在处理 ${selectedImages.value.length} 张图片...`);
            const compressedFiles = await Promise.all(
                selectedImages.value.map(img => compressImage(img.file, { quality: 0.6, maxWidth: 1200 }))
            );
            const formData = new FormData()
            compressedFiles.forEach(file => formData.append('images', file))
            const uploadRes = await api.post('/upload/comment-images', formData, {
                headers: { 'Content-Type': 'multipart/form-data' },
                timeout: 60000
            })
            if (uploadRes.data.success) {
                imageUrls = uploadRes.data.data.urls
            }
        }

        const payload = {
            article_id: 100000,
            content: content,
            images: imageUrls,
            work_type: 'article',
            parent_id: (from === 'bottom' && replyTarget.value) ? Number(replyTarget.value.id) : null
        }

        const res = await api.post('/comments', payload)
        if (res.data.success) {
            message.success('心声已寄出')
            fetchComments(true) // 静默更新

            const currentUser = userStore.user || {};
            const newItem = {
                id: res.data.data.id,
                text: from === 'barrage' ? content : bottomContent.value,
                image: imageUrls.length > 0 ? imageUrls[0] : null,
                avatar: currentUser.avatar || 'https://w.wallhaven.cc/full/9o/wallhaven-9oog5d.jpg',
                color: '#fff',
                isSelf: true,
                is_liked: false,
                likes_count: 0
            };

            barrageList.value.unshift(newItem); // 加到队首
            // 🔥 插队：重置指针，让调度器下一次立马取到它
            nextDataIndex = 0;

            // 🔥🔥🔥 关键修复：手动触发一次单发弹幕，忽略冷却！🔥🔥🔥
            shootSingleBarrage(newItem);

            if (from === 'barrage') {
                barrageInput.value = ''
            } else {
                bottomContent.value = ''
                selectedImages.value = []
                cancelReply()
            }
        }
    } catch (e) {
        console.error(e)
        message.error('发送失败')
    } finally {
        isSending.value = false
    }
}

const handleReply = (comment) => {
    if (!userStore.isLoggedIn) return message.warning('请先登录')
    replyTarget.value = comment
    const textarea = document.querySelector('.main-textarea')
    if (textarea) {
        textarea.focus()
        textarea.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
}

const cancelReply = () => {
    replyTarget.value = null
}

const handleAction = async (comment, action) => {
    if (!userStore.isLoggedIn) return message.warning('请先登录')
    const updateState = (target) => {
        if (action === 'like') {
            if (target.is_liked) {
                target.is_liked = false
                target.likes_count--
            } else {
                target.is_liked = true
                target.likes_count++
                if (target.is_disliked) target.is_disliked = false
            }
        } else if (action === 'dislike') {
            if (target.is_disliked) {
                target.is_disliked = false
            } else {
                target.is_disliked = true
                if (target.is_liked) {
                    target.is_liked = false;
                    target.likes_count--;
                }
            }
        }
    }
    updateState(comment);
    try { await api.post(`/comments/${comment.id}/action`, { action }) } catch (e) { }
}

const handleBarrageLike = async (item) => {
    await handleAction(item, 'like');
}

const handleDelete = async (commentId) => {
    if (!confirm('确定要删除这条留言吗？')) return
    try {
        await api.delete(`/comments/${commentId}`)
        const remove = (list) => {
            return list.filter(root => {
                if (root.id === commentId) return false;
                if (root.replies?.length) {
                    root.replies = root.replies.filter(reply => reply.id !== commentId);
                }
                return true;
            });
        }
        allCommentsTree.value = remove(allCommentsTree.value)
        displayComments.value = remove(displayComments.value)
        message.success('已删除')
    } catch (e) {
        message.error('删除失败')
    }
}

// 🔥🔥🔥🔥🔥 智能调度系统 (Traffic Control) 🔥🔥🔥🔥🔥

const startBarrageScheduler = () => {
    // 防止重复启动
    if (schedulerTimer) return;

    // 初始化状态
    tracks.value = [[], [], [], [], [], []];
    trackLastLaunchTime.value = [0, 0, 0, 0, 0, 0];
    trackLastDuration.value = [0, 0, 0, 0, 0, 0];
    nextDataIndex = 0;

    // 🔥 核心逻辑：每 600ms 尝试发射一次弹幕
    schedulerTimer = setInterval(() => {
        tryLaunchBarrage();
    }, 600);
}

const tryLaunchBarrage = () => {
    const list = barrageList.value;
    if (list.length === 0) return;

    const item = list[nextDataIndex % list.length];

    // 自动调度逻辑：必须检查冷却时间
    const bestTrackId = findAvailableTrack(true);

    // 如果没找到空闲轨道，本轮放弃
    if (bestTrackId === -1) {
        return;
    }

    // 指针后移
    nextDataIndex++;

    // 发射
    launchItemToTrack(item, bestTrackId);
}

// 🔥🔥🔥 新增：插队发射单条弹幕（不检查冷却）🔥🔥🔥
const shootSingleBarrage = (item) => {
    // 找一条最空的轨道，忽略冷却时间 (force=true)
    // 如果找不到绝对空闲的，就随便找一条相对空的
    let bestTrackId = findAvailableTrack(false);

    // 兜底：如果连相对空的都找不到（虽然不太可能），就强制塞给第0条
    if (bestTrackId === -1) bestTrackId = 0;

    launchItemToTrack(item, bestTrackId, true);
}

// 辅助：寻找可用轨道
// checkCoolDown: 是否严格检查冷却时间
const findAvailableTrack = (checkCoolDown = true) => {
    const now = Date.now();
    let bestTrackId = -1;

    // 随机打乱轨道检查顺序
    const trackIndices = [0, 1, 2, 3, 4, 5].sort(() => Math.random() - 0.5);

    for (const trackId of trackIndices) {
        // 如果不检查冷却（插队模式），只要轨道上少于8条就行
        if (!checkCoolDown) {
            if (tracks.value[trackId].length < 8) {
                return trackId;
            }
            continue;
        }

        const lastTime = trackLastLaunchTime.value[trackId];
        const lastDuration = trackLastDuration.value[trackId] * 1000; // 毫秒
        const safeGap = Math.max(lastDuration * 0.35, 2500);

        if (lastTime === 0 || (now - lastTime > safeGap)) {
            if (tracks.value[trackId].length < 10) {
                bestTrackId = trackId;
                break;
            }
        }
    }
    return bestTrackId;
}

// 辅助：发射核心逻辑
const launchItemToTrack = (item, trackId, isPriority = false) => {
    // 生成景深参数
    const layerRandom = Math.random();
    let layerParams = {};
    if (layerRandom < 0.25) {
        layerParams = { scale: 0.85, opacity: 0.7, blur: '0.8px', zIndex: 1, speedMulti: 1.3 };
    } else if (layerRandom < 0.65) {
        layerParams = { scale: 0.95, opacity: 0.95, blur: '0px', zIndex: 10, speedMulti: 1.0 };
    } else {
        layerParams = { scale: 1.15, opacity: 1.0, blur: '0px', zIndex: 20, speedMulti: 0.8 };
    }

    // 插队弹幕给个高光，且飞得稍微快一点点
    if (isPriority) {
        layerParams.zIndex = 30; // 最高级
        layerParams.speedMulti = 0.7; // 更快
        layerParams.opacity = 1;
        layerParams.scale = 1.2;
        layerParams.blur = '0px';
    }

    const baseDuration = 18 + Math.random() * 4;
    const duration = baseDuration * layerParams.speedMulti;
    const uniqueKey = Date.now() + Math.random();

    const barrageItem = {
        ...item,
        key: uniqueKey,
        left: '100%',
        duration: duration,
        trackId: trackId,
        ...layerParams
    };

    tracks.value[trackId].push(barrageItem);

    // 更新轨道状态记录
    trackLastLaunchTime.value[trackId] = Date.now();
    trackLastDuration.value[trackId] = duration;

    // 清理
    setTimeout(() => {
        if (tracks.value && tracks.value[trackId]) {
            const idx = tracks.value[trackId].findIndex(i => i.key === uniqueKey);
            if (idx !== -1) {
                tracks.value[trackId].splice(idx, 1);
            }
        }
    }, duration * 1000 + 2000);
}

// 🔥 标签页切换处理
const handleVisibilityChange = () => {
    if (document.hidden) {
        if (schedulerTimer) {
            clearInterval(schedulerTimer);
            schedulerTimer = null;
        }
        tracks.value = [[], [], [], [], [], []];
        trackLastLaunchTime.value = [0, 0, 0, 0, 0, 0];
    } else {
        if (!schedulerTimer) {
            startBarrageScheduler();
        }
    }
}

const fetchGlobalWallpaper = async () => {
    try {
        const res = await api.get('/wallpaper/global')
        if (res.data.success) {
            const { randomUrls, dailyUrl, websiteUrl, mode } = res.data.data
            if (randomUrls && Array.isArray(randomUrls) && randomUrls.length > 0) {
                heroImage.value = randomUrls[Math.floor(Math.random() * randomUrls.length)]
            } else if (mode === 'daily') heroImage.value = dailyUrl
            else heroImage.value = websiteUrl
        }
    } catch (e) { }
}

onMounted(() => {
    fetchGlobalWallpaper()
    fetchComments()

    document.addEventListener('visibilitychange', handleVisibilityChange)
    document.addEventListener('click', closeEmojiPicker)
    window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && isLightboxOpen.value) closeLightbox()
    })
})

onUnmounted(() => {
    document.removeEventListener('visibilitychange', handleVisibilityChange)
    document.removeEventListener('click', closeEmojiPicker)
    if (schedulerTimer) clearInterval(schedulerTimer)
})
</script>

<template>
    <div class="guestbook-page">
        <header class="barrage-hero" :style="{ backgroundImage: `url(${heroImage})` }">
            <div class="hero-mask"></div>
            <div class="barrage-container">
                <div v-for="(track, tIdx) in tracks" :key="tIdx" class="barrage-track">
                    <div v-for="item in track" :key="item.key" class="barrage-item" :style="{
                        left: item.left,
                        animationDuration: item.duration + 's',
                        transform: `scale(${item.scale})`,
                        opacity: item.opacity,
                        filter: `blur(${item.blur})`,
                        zIndex: item.zIndex
                    }">
                        <img :src="item.avatar" class="b-avatar" alt="avatar">
                        <template v-if="item.image">
                            <span class="b-icon">📷</span>
                            <span class="b-text">分享图片</span>
                            <img :src="item.image" class="b-img-content" />
                        </template>
                        <template v-else>
                            <span class="b-text">{{ item.text }}</span>
                        </template>
                        <div class="b-like-wrapper" @click.stop="handleBarrageLike(item)">
                            <Heart v-if="item.is_liked" :size="18" fill="#ff4d4f" stroke="none" class="b-heart liked" />
                            <Heart v-else :size="18" stroke="#fff" stroke-width="2" class="b-heart" />
                            <span class="b-like-count" v-if="item.likes_count > 0">{{ item.likes_count }}</span>
                        </div>
                    </div>
                </div>
            </div>
            <div class="hero-center-box animate__animated animate__fadeIn">
                <div class="barrage-input-container">
                    <div class="input-icon-wrapper">
                        <Feather class="input-icon" :size="20" />
                    </div>
                    <input v-model="barrageInput" type="text" class="literary-input" placeholder="写下一句弹幕..."
                        @keyup.enter="handleSend(barrageInput)" :disabled="isSending">
                    <button class="literary-send-btn" @click="handleSend(barrageInput)" :disabled="isSending">
                        <span v-if="!isSending">寄 出</span><span v-else>...</span>
                    </button>
                </div>
            </div>
        </header>

        <main class="comments-section">
            <div class="section-header text-center">
                <h2 class="literary-title">心笺落此间</h2>
                <div class="title-divider"></div>
                <span class="literary-subtitle">一笺寄心意，落笔皆温柔</span>
            </div>

            <div class="comment-box-card glass-effect">
                <div v-if="replyTarget" class="reply-status-bar animate__animated animate__fadeInDown">
                    <span>💬 正在回复 <strong>@{{ replyTarget.nickname }}</strong></span>
                    <button class="cancel-reply-btn" @click="cancelReply" title="取消回复">✕</button>
                </div>
                <div class="textarea-wrapper">
                    <textarea class="main-textarea" v-model="bottomContent"
                        :placeholder="replyTarget ? `回复 @${replyTarget.nickname}...` : '留下你到此一游的故事...'"
                        @keydown.ctrl.enter="handleSend(bottomContent, 'bottom')">
            </textarea>
                    <div v-if="selectedImages.length" class="image-preview-area">
                        <div v-for="(img, index) in selectedImages" :key="index" class="preview-item">
                            <img :src="img.url" />
                            <span class="remove-btn" @click="removeImage(index)">×</span>
                        </div>
                    </div>
                    <PenTool class="textarea-icon" :size="24" />
                </div>
                <div class="action-bar">
                    <div class="tool-left">
                        <div class="tool-btn emoji-trigger" @click.stop="showEmojiPicker = !showEmojiPicker" title="表情">
                            <Smile :size="20" />
                        </div>
                        <Transition name="pop-up">
                            <div v-if="showEmojiPicker" class="emoji-panel" @click.stop>
                                <span v-for="emoji in emojis" :key="emoji" class="emoji-item"
                                    @click="insertEmoji(emoji)">{{
                                        emoji }}</span>
                                <div class="panel-arrow"></div>
                            </div>
                        </Transition>
                        <div class="tool-btn" @click="handleImageUpload" title="上传图片">
                            <ImageIcon :size="20" />
                        </div>
                        <input ref="imageInputRef" type="file" accept="image/*" multiple hidden
                            @change="handleSelectImage" />
                    </div>
                    <div class="right-actions">
                        <span class="tip">Ctrl + Enter 快捷寄出</span>
                        <button class="submit-btn-ink" @click="handleSend(bottomContent, 'bottom')"
                            :disabled="isSending">
                            {{ replyTarget ? '回复TA' : '投递心声' }}
                            <Send :size="14" style="margin-left:4px" />
                        </button>
                    </div>
                </div>
            </div>

            <div class="comment-list">
                <div v-if="isLoading" class="loading-text">
                    <Feather class="spin" /> 正在拆信...
                </div>
                <div v-else-if="displayComments.length === 0" class="empty-text">暂无来信，期待你的第一封...</div>

                <div v-else class="comment-items">
                    <CommentItem v-for="comment in displayComments" :key="comment.id" :comment="comment"
                        :article-author-id="SITE_ADMIN_ID" @reply="handleReply" @like="(c) => handleAction(c, 'like')"
                        @dislike="(c) => handleAction(c, 'dislike')" @delete="handleDelete" />
                </div>

                <div v-if="displayComments.length > 0" class="load-more-container">
                    <button v-if="hasMore" class="load-more-btn" :class="{ loading: isLoadingMore }"
                        @click="loadMoreComments">
                        <span v-if="isLoadingMore" class="loader"></span>
                        {{ isLoadingMore ? '拆开更多信件...' : '查看更多留言' }}
                    </button>
                    <div v-else class="no-more-text">
                        🍃 纸短情长，已读完所有来信
                    </div>
                </div>
            </div>
        </main>

        <Teleport to="body">
            <Transition name="lightbox-fade">
                <div v-if="isLightboxOpen" class="lightbox-overlay" @click="closeLightbox">
                    <Transition name="image-fade">
                        <img v-if="isImageLoaded" :src="lightboxUrl" class="lightbox-image" @click.stop alt="预览大图" />
                    </Transition>
                    <button class="lightbox-close-btn" @click="closeLightbox">✕</button>
                </div>
            </Transition>
        </Teleport>
    </div>
</template>

<style scoped>
@import url('https://fonts.googleapis.com/css2?family=Noto+Serif+SC:wght@400;500;700&family=Cormorant+Garamond:wght@400;600&display=swap');

/* 全局布局 */
.guestbook-page {
    background-color: var(--bg-body);
    min-height: 100vh;
    font-family: 'Noto Serif SC', serif;
    color: var(--text-primary);
    transition: background-color 0.3s ease, color 0.3s ease;
}

.barrage-hero {
    position: relative;
    height: 60vh;
    min-height: 520px;
    background-size: cover;
    background-position: center;
    display: flex;
    justify-content: center;
    align-items: center;
    overflow: hidden;
    transition: background-image 0.5s ease;
}

.hero-mask {
    position: absolute;
    inset: 0;
    background: rgba(0, 0, 0, 0.2);
    backdrop-filter: blur(1px);
}

:global(html.dark) .hero-mask {
    background: rgba(0, 0, 0, 0.5);
}

.barrage-container {
    position: absolute;
    top: 70px;
    left: 0;
    width: 100%;
    height: calc(100% - 140px);
    z-index: 1;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    justify-content: space-around;
}

.barrage-track {
    height: auto;
    min-height: 50px;
    flex: 1;
    display: flex;
    align-items: center;
    position: relative;
    white-space: nowrap;
}

.barrage-item {
    position: absolute;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    background: rgba(0, 0, 0, 0.35);
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
    border: 1px solid rgba(255, 255, 255, 0.15);
    padding: 4px 16px 4px 4px;
    border-radius: 50px;
    color: #fff;
    font-size: 0.95rem;
    font-weight: 500;
    pointer-events: auto;
    cursor: pointer;
    user-select: none;
    animation-name: scrollLeft;
    animation-timing-function: linear;
    animation-fill-mode: forwards;
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
    transition: all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);
    will-change: transform;
}

.barrage-item:hover {
    animation-play-state: paused;
    z-index: 1000 !important;
    background: rgba(0, 0, 0, 0.75);
    border-color: rgba(255, 255, 255, 0.8);
    filter: blur(0) !important;
    box-shadow: 0 8px 30px rgba(0, 0, 0, 0.4);
    cursor: default;
}

.b-avatar {
    width: 32px;
    height: 32px;
    border-radius: 50%;
    border: 1px solid rgba(255, 255, 255, 0.6);
    flex-shrink: 0;
    object-fit: cover;
}

.b-img-content {
    width: 32px;
    height: 32px;
    border-radius: 6px;
    object-fit: cover;
    border: 2px solid rgba(255, 255, 255, 0.8);
    margin-left: 4px;
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.15);
}

.b-icon {
    font-size: 18px;
    line-height: 1;
}

.b-text {
    font-family: 'Noto Serif SC', serif;
    letter-spacing: 0.5px;
}

.b-like-wrapper {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    margin-left: 6px;
    transition: transform 0.2s;
}

.b-like-wrapper:hover {
    transform: scale(1.2);
}

.b-heart {
    filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.5));
    transition: all 0.3s;
}

.b-heart.liked {
    filter: drop-shadow(0 1px 3px rgba(255, 77, 79, 0.6));
}

.b-like-count {
    font-size: 12px;
    font-weight: bold;
    color: #fff;
    opacity: 0;
    transform: translateX(-10px);
    transition: all 0.3s ease;
}

.barrage-item:hover .b-like-count {
    opacity: 1;
    transform: translateX(0);
}

@keyframes scrollLeft {
    from {
        transform: translateX(0);
    }

    to {
        transform: translateX(calc(-100vw - 500px));
    }
}

.hero-center-box {
    position: relative;
    z-index: 10;
    width: 100%;
    display: flex;
    justify-content: center;
    padding-top: 40px;
    pointer-events: none;
}

.barrage-input-container {
    pointer-events: auto;
    display: flex;
    align-items: center;
    width: 600px;
    max-width: 90%;
    height: 54px;
    background: var(--glass-bg);
    border: 1px solid var(--glass-border);
    backdrop-filter: blur(12px);
    border-radius: 27px;
    padding: 4px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.15);
    transition: all 0.4s ease;
}

.barrage-input-container:focus-within {
    background: var(--bg-elevated);
    width: 620px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
}

.input-icon-wrapper {
    width: 46px;
    height: 46px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--text-secondary);
}

.literary-input {
    flex: 1;
    border: none;
    background: transparent;
    font-size: 1rem;
    color: var(--text-primary);
    padding: 0 10px;
    font-family: 'Noto Serif SC', serif;
    outline: none;
}

.literary-input::placeholder {
    color: var(--text-tertiary);
}

.literary-send-btn {
    height: 46px;
    padding: 0 28px;
    border-radius: 23px;
    border: none;
    background: linear-gradient(135deg, #8b806b 0%, #5c5346 100%);
    color: #f5f1e8;
    font-size: 0.95rem;
    font-weight: 500;
    cursor: pointer;
    font-family: 'Noto Serif SC', serif;
    letter-spacing: 2px;
}

.comments-section {
    max-width: 800px;
    margin: -60px auto 60px;
    position: relative;
    z-index: 2;
    padding: 0 20px;
}

.section-header {
    text-align: center;
    margin-bottom: 40px;
}

.literary-title {
    font-family: 'Cinzel', serif;
    font-size: 2rem;
    color: var(--text-primary);
    margin: 0;
    letter-spacing: 4px;
}

.title-divider {
    width: 40px;
    height: 2px;
    background: #8b806b;
    margin: 15px auto;
    opacity: 0.5;
}

.literary-subtitle {
    font-family: 'Cormorant Garamond', serif;
    color: var(--text-secondary);
    font-size: 1.1rem;
    font-style: italic;
}

.comment-box-card {
    background: var(--bg-surface);
    color: var(--text-primary);
    border: 1px solid var(--glass-border);
    backdrop-filter: blur(12px);
    border-radius: 16px;
    padding: 30px;
    box-shadow: var(--shadow-neumorphism-light);
    margin-bottom: 40px;
}

:global(html.dark) .comment-box-card {
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.4);
    border-color: rgba(255, 255, 255, 0.08);
}

.main-textarea {
    background: var(--bg-body);
    color: var(--text-primary);
    border: 1px solid var(--input-border);
    width: 100%;
    height: 120px;
    border-radius: 8px;
    padding: 15px 15px 15px 45px;
    font-size: 1rem;
    line-height: 1.8;
    resize: none;
    outline: none;
    font-family: 'Noto Serif SC', serif;
    background-image: linear-gradient(transparent 95%, rgba(0, 0, 0, 0.03) 95%);
    background-size: 100% 2em;
}

:global(html.dark) .main-textarea {
    background-image: linear-gradient(transparent 95%, rgba(255, 255, 255, 0.05) 95%);
}

.textarea-icon {
    position: absolute;
    top: 15px;
    left: 15px;
    color: #a8997a;
    opacity: 0.6;
}

.textarea-wrapper {
    position: relative;
}

.image-preview-area {
    display: flex;
    gap: 8px;
    margin-top: 10px;
    flex-wrap: wrap;
    padding-left: 45px;
}

.preview-item {
    position: relative;
    width: 60px;
    height: 60px;
    border-radius: 6px;
    overflow: hidden;
    border: 1px solid var(--input-border);
}

.preview-item img {
    width: 100%;
    height: 100%;
    object-fit: cover;
}

.remove-btn {
    position: absolute;
    top: 0;
    right: 0;
    background: rgba(0, 0, 0, 0.5);
    color: white;
    width: 16px;
    height: 16px;
    display: flex;
    justify-content: center;
    align-items: center;
    font-size: 12px;
    cursor: pointer;
}

.action-bar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-top: 15px;
    padding-top: 15px;
    border-top: 1px dashed var(--input-border);
}

.tool-left {
    display: flex;
    gap: 15px;
    align-items: center;
    position: relative;
}

.tool-btn {
    color: var(--text-secondary);
    cursor: pointer;
    transition: color 0.3s;
    display: flex;
    align-items: center;
}

.tool-btn:hover {
    color: var(--accent-color);
}

.emoji-panel {
    position: absolute;
    bottom: 120%;
    left: 0;
    background: var(--bg-elevated);
    border: 1px solid var(--input-border);
    border-radius: 12px;
    padding: 10px;
    max-height: 200px;
    overflow-y: auto;
    display: grid;
    grid-template-columns: repeat(8, 1fr);
    gap: 5px;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2);
    z-index: 100;
    min-width: 280px;
    scrollbar-width: thin;
    scrollbar-color: #d4c5b0 transparent;
}

.emoji-panel::-webkit-scrollbar-thumb {
    background-color: var(--text-tertiary);
    border-radius: 3px;
}

@media (max-width: 600px) {
    .emoji-panel {
        position: fixed;
        bottom: 0;
        left: 0;
        width: 100%;
        margin-bottom: 0;
        border-radius: 20px 20px 0 0;
        box-shadow: 0 -5px 20px rgba(0, 0, 0, 0.3);
        padding: 15px;
        z-index: 2000;
        max-height: 40vh;
    }
}

.panel-arrow {
    position: absolute;
    bottom: -6px;
    left: 10px;
    width: 12px;
    height: 12px;
    background: var(--bg-elevated);
    border-bottom: 1px solid var(--input-border);
    border-right: 1px solid var(--input-border);
    transform: rotate(45deg);
}

.emoji-item {
    cursor: pointer;
    text-align: center;
    padding: 6px;
    font-size: 20px;
    border-radius: 4px;
    transition: transform 0.1s;
}

.emoji-item:hover {
    background: var(--hover-bg);
    transform: scale(1.1);
}

.pop-up-enter-active,
.pop-up-leave-active {
    transition: all 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.pop-up-enter-from,
.pop-up-leave-to {
    opacity: 0;
    transform: translateY(10px) scale(0.9);
}

.right-actions {
    display: flex;
    align-items: center;
    gap: 15px;
}

.tip {
    font-size: 0.8rem;
    color: var(--text-tertiary);
    font-family: sans-serif;
}

.submit-btn-ink {
    padding: 8px 24px;
    background: var(--text-primary);
    color: var(--bg-surface);
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-family: 'Noto Serif SC', serif;
    letter-spacing: 1px;
    display: flex;
    align-items: center;
    transition: background 0.3s;
}

.submit-btn-ink:hover {
    opacity: 0.9;
}

.submit-btn-ink:disabled {
    background: var(--text-tertiary);
    cursor: not-allowed;
}

.loading-text,
.empty-text {
    text-align: center;
    padding: 40px;
    color: var(--text-tertiary);
    font-family: 'Noto Serif SC', serif;
}

.spin {
    animation: spin 2s linear infinite;
}

@keyframes spin {
    100% {
        transform: rotate(360deg);
    }
}

.reply-status-bar {
    background: rgba(66, 184, 131, 0.1);
    color: var(--accent-color);
    padding: 10px 15px;
    border-radius: 8px 8px 0 0;
    margin-bottom: 10px;
    position: relative;
    z-index: 1;
    font-size: 0.9rem;
    display: flex;
    justify-content: space-between;
    align-items: center;
    border: 1px solid rgba(66, 184, 131, 0.2);
}

.cancel-reply-btn {
    background: none;
    border: none;
    color: var(--accent-color);
    cursor: pointer;
    font-weight: bold;
    padding: 4px 8px;
}

.load-more-container {
    padding: 30px 0;
    display: flex;
    justify-content: center;
    align-items: center;
}

.load-more-btn {
    padding: 10px 30px;
    background: var(--bg-surface);
    color: var(--text-secondary);
    border: 1px solid var(--input-border);
    border-radius: 50px;
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.3s ease;
    display: flex;
    align-items: center;
    gap: 8px;
    box-shadow: var(--shadow-neumorphism-light);
    font-family: 'Noto Serif SC', serif;
}

.load-more-btn:hover {
    background: var(--bg-elevated);
    color: var(--accent-color);
    border-color: var(--accent-color);
    transform: translateY(-2px);
    box-shadow: var(--shadow-neumorphism-dark);
}

.load-more-btn.loading {
    opacity: 0.7;
    cursor: not-allowed;
    background: var(--bg-body);
}

.loader {
    width: 16px;
    height: 16px;
    border: 2px solid var(--input-border);
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
    color: var(--text-tertiary);
    padding: 10px;
    letter-spacing: 2px;
    font-family: 'Noto Serif SC', serif;
}

/* 1. 遮罩层：极致沉浸 */
.lightbox-overlay {
    position: fixed !important;
    top: 0 !important;
    left: 0 !important;
    width: 100vw !important;
    height: 100vh !important;
    height: 100dvh !important;
    /* 背景色：在深色模式下稍微带一点点深棕/深金的底色，增加质感 */
    background: rgba(0, 0, 0, 0.94) !important; 
    z-index: 99999 !important; /* 提到全站最高 */
    display: flex !important;
    justify-content: center !important;
    align-items: center !important;
    backdrop-filter: blur(25px) saturate(180%) !important; /* 加强饱和度和模糊 */
    -webkit-backdrop-filter: blur(25px) saturate(180%) !important;
    cursor: zoom-out;
}

/* 4. 底部署名/提示（可选，增加仪式感） */
.lightbox-overlay::after {
    content: "Esc 或 点击空白处退出预览";
    position: absolute;
    bottom: 30px;
    color: rgba(255, 255, 255, 0.4);
    font-size: 0.85rem;
    letter-spacing: 2px;
    font-family: 'Cormorant Garamond', serif;
}

:global(html.dark) .lightbox-overlay {
    background: rgba(8, 8, 8, 0.96) !important;
}

/* 2. 图片展示：增加微光边界 */
.lightbox-image {
    max-width: 90vw !important;
    max-height: 85vh !important;
    object-fit: contain !important;
    border-radius: 8px !important;
    /* 核心优化：多重阴影，让图片“浮”起来 */
    box-shadow: 0 30px 100px rgba(0, 0, 0, 0.8) !important;
    border: 1px solid rgba(255, 255, 255, 0.1); /* 浅色模式下的虚边 */
    transition: transform 0.3s ease;
}

/* 🔥 深色模式下的画龙点睛：给图片加一层微弱的金色氛围 */
:global(html.dark) .lightbox-image {
    box-shadow: 0 0 50px rgba(201, 168, 106, 0.15) !important;
    border: 1px solid rgba(201, 168, 106, 0.3) !important;
}

@keyframes lightboxZoom {
    from {
        transform: scale(0.9);
        opacity: 0;
    }

    to {
        transform: scale(1);
        opacity: 1;
    }
}


/* 3. 关闭按钮：精致浮动 */
.lightbox-close-btn {
    position: fixed !important;
    top: 30px !important;
    right: 30px !important;
    width: 50px !important;
    height: 50px !important;
    border-radius: 50% !important;
    background: rgba(255, 255, 255, 0.1) !important;
    border: 1px solid rgba(255, 255, 255, 0.2) !important;
    color: #fff !important;
    font-size: 24px !important;
    backdrop-filter: blur(10px) !important;
    transition: all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275) !important;
    opacity: 0.8;
}

.lightbox-close-btn:hover {
    opacity: 1;
    background: var(--accent-color, #c9a86a) !important;
    border-color: transparent !important;
    transform: rotate(90deg) scale(1.15) !important;
}


/* 响应式调整 */
@media (max-width: 768px) {
    .lightbox-image {
        max-width: 95vw !important;
        max-height: 80vh !important;
    }

    .lightbox-close-btn {
        top: 10px !important;
        right: 10px !important;
        width: 36px !important;
        height: 36px !important;
    }
}

/* 4. 极简淡入淡出动画 */
.lightbox-fade-enter-active,
.lightbox-fade-leave-active {
    transition: opacity 0.3s ease;
}

.lightbox-fade-enter-from,
.lightbox-fade-leave-to {
    opacity: 0;
}

/* 图片淡入动画 */
.image-fade-enter-active {
    transition: opacity 0.3s ease-in-out;
}

.image-fade-enter-from {
    opacity: 0;
}
</style>