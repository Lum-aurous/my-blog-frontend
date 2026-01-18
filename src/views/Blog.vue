<script setup>
import { ref, onMounted, onUnmounted, computed, nextTick, watch } from 'vue'
import axios from 'axios'
import { useUserStore } from '@/stores/user.js'
import { useRouter } from 'vue-router'
import { useWallpaperStore } from '@/stores/wallpaper' // 引入全局壁纸仓
import { api } from '@/utils/api' // 🔑 必须补上这一行
import { message } from '@/utils/message' // 🔑 必须补上这一行

const wallpaperStore = useWallpaperStore()
const userStore = useUserStore()
const router = useRouter()
const notices = ref([{ content: '' }]) // 防止未定义错误
const currentPage = ref(1)
const pageSize = 9 // 🔥 每次加载 9 篇
const hasMore = ref(true) // 是否还有更多文章
const isLoadingMore = ref(false) // 按钮loading状态
const articles = ref([])
const isLoadingArticles = ref(false)
const siteStats = ref({
    articleCount: 0,
    totalContent: 0, // 🔥 新增：全站内容总数
    categoryCount: 0,
    totalViews: 0
})
// 🔥 新增：存储当前登录用户的个人统计数据
const userPersonalStats = ref({
    articleCount: 0,
    categoryCount: 0,
    totalViews: 0
})
const videoRefs = ref(new Map()); // 存储视频引用
const audioRefs = ref(new Map()); // 🔥 新增：存储音频引用
const playingIds = ref(new Set()) // 存储正在播放的 Key (控制 animation-play-state: running)
const vinylActiveIds = ref(new Set()) // ✨ 新增：存储动画激活的 Key (控制 class="is-spinning")
const isSearching = ref(false) // 标记当前是否处于搜索状态
const isHeroReady = ref(false)
const searchQuery = ref('')
const selectedTagId = ref(null)
const isSidebarReady = ref(false)
// 添加防抖标记
const isToggling = ref(false);

// ==================== 1. 用户信息逻辑 ====================
const defaultAvatar = 'https://w.wallhaven.cc/full/9o/wallhaven-9oog5d.jpg'
const getFullAvatarUrl = (path) => {
    if (!path) return defaultAvatar;
    if (path.startsWith('http') || path.startsWith('data:image')) return path;
    return path;
};

// 1. 定义默认背景图 (原本写死在模板里的那张图)
const defaultProfileBanner = 'https://w.wallhaven.cc/full/5g/wallhaven-5gjgj8.jpg'

const profile = computed(() => {
    // 默认使用全站数据 (访客模式)
    let statsData = {
        articlesCount: siteStats.value.totalContent || siteStats.value.articleCount || 0,
        categoryCount: siteStats.value.categoryCount || 0,
        visits: siteStats.value.totalViews || 0
    }

    if (userStore.user && userStore.user.username) {
        // === 登录模式 (个人数据) ===
        statsData = {
            articlesCount: userPersonalStats.value.articleCount,
            categoryCount: userPersonalStats.value.categoryCount,
            visits: userPersonalStats.value.totalViews
        }

        // 🔥 获取用户 Banner，如果有则经过 getProxyUrl 处理，否则用默认图
        // userStore.user.banner 在 Profile.vue 上传成功后会被更新，这里会自动响应
        const userBanner = userStore.user.banner
            ? getProxyUrl(userStore.user.banner)
            : defaultProfileBanner

        return {
            isLogin: true,
            name: userStore.user.nickname || userStore.user.username,
            title: userStore.user.bio || '全栈开发者 / 追梦人',
            avatar: getFullAvatarUrl(userStore.user?.avatar),
            banner: userBanner, // ✅ 新增：动态 Banner
            github: userStore.user.social_link || '',
            ...statsData
        }
    } else {
        // === 访客模式 ===
        return {
            isLogin: false,
            name: '访客',
            title: '登录以解锁更多功能',
            avatar: defaultAvatar,
            banner: defaultProfileBanner, // ✅ 新增：访客使用默认 Banner
            github: '#',
            ...statsData
        }
    }
})

const handleAvatarClick = () => {
    if (profile.value.isLogin) {
        router.push(`/profile/${userStore.user.username}`)
    } else {
        router.push('/login')
    }
}

// ==================== 2. 动态轮播背景逻辑 ====================
const heroBgUrl = ref('')
const bgIndex = ref(0)
const wallpaperList = ref([])
const fallbackList = [
    'https://w.wallhaven.cc/full/og/wallhaven-ogd6j9.png',
    'https://w.wallhaven.cc/full/9o/wallhaven-9ooe6d.jpg',
    'https://w.wallhaven.cc/full/yx/wallhaven-yxd2vk.png'
]
let carouselTimer = null

const preloadImage = (url) => new Promise((resolve, reject) => {
    const img = new Image()
    img.src = url
    img.onload = () => resolve(url)
    img.onerror = () => reject(url)
})

const initWallpapers = async () => {
    if (wallpaperStore.currentWallpaper) {
        heroBgUrl.value = wallpaperStore.currentWallpaper
        isHeroReady.value = true
    }
    try {
        const res = await axios.get('/api/wallpaper/global')
        const list = res.data.data?.randomUrls || res.data.randomUrls
        if (list && list.length > 0) {
            wallpaperList.value = list
        } else {
            wallpaperList.value = fallbackList
        }
        await preloadImage(wallpaperList.value[0])
        heroBgUrl.value = wallpaperList.value[0]
        isHeroReady.value = true
    } catch (error) {
        wallpaperList.value = fallbackList
        isHeroReady.value = true
    }
    startCarousel()
}

const startCarousel = async () => {
    if (wallpaperList.value.length === 0) return
    carouselTimer = setInterval(async () => {
        const nextIndex = (bgIndex.value + 1) % wallpaperList.value.length
        const nextUrl = wallpaperList.value[nextIndex]
        try {
            await preloadImage(nextUrl)
            bgIndex.value = nextIndex
            heroBgUrl.value = nextUrl
        } catch (e) {
            bgIndex.value = nextIndex
        }
    }, 6000)
}

// ==================== 3. 3D 标签云逻辑 ====================
const tags = ref([])
let animationFrameId = null
const RADIUS = 130
const BASE_SPEED = 0.005
const ACCELERATION = 0.0001
let currentSpeed = 0
let angleX = 0
let angleY = 0

const fetchTags = async () => {
    try {
        const res = await axios.get('/api/tags/cloud');
        if (res.data.success) {
            const rawData = res.data.data;
            const len = rawData.length;
            tags.value = rawData.map((tag, i) => {
                const phi = Math.acos(-1 + (2 * i) / len);
                const theta = Math.sqrt(len * Math.PI) * phi;
                return {
                    id: tag.id || i,
                    name: tag.name,
                    color: tag.color,
                    x: RADIUS * Math.cos(theta) * Math.sin(phi),
                    y: RADIUS * Math.sin(theta) * Math.sin(phi),
                    z: RADIUS * Math.cos(phi),
                    style: {}
                };
            });
            nextTick(() => { animate(); });
        }
    } catch (error) {
        console.error('❌ 获取标签云失败:', error);
    }
};

const animate = () => {
    if (currentSpeed < BASE_SPEED) currentSpeed += ACCELERATION
    angleX += currentSpeed
    angleY += currentSpeed
    tags.value.forEach(tag => { rotateTag(tag, currentSpeed, currentSpeed) })
    animationFrameId = requestAnimationFrame(animate)
}

const rotateTag = (tag, speedX, speedY) => {
    const cosX = Math.cos(speedX), sinX = Math.sin(speedX)
    const cosY = Math.cos(speedY), sinY = Math.sin(speedY)
    const y1 = tag.y * cosY - tag.z * sinY
    const z1 = tag.y * sinY + tag.z * cosY
    const x2 = tag.x * cosX - z1 * sinX
    const z2 = tag.x * sinX + z1 * cosX
    tag.y = y1; tag.z = z2; tag.x = x2;
    const scale = (400 + tag.z) / 400
    const alpha = (tag.z + RADIUS) / (2 * RADIUS)
    tag.style = {
        transform: `translate3d(${tag.x + 120}px, ${tag.y + 140}px, 0) scale(${scale})`,
        opacity: 0.5 + 0.5 * alpha,
        zIndex: Math.floor(scale * 100),
        '--tag-color': tag.color
    }
}

const handleTagClick = (tag) => {
    searchQuery.value = tag.name
    performSearch(tag.name)
    scrollToContent()
}

// ==================== 4. 预览与格式化 ====================
const isPreviewVisible = ref(false);
const previewUrl = ref('');

const openPreview = (url) => {
    if (!url) return;
    previewUrl.value = url;
    isPreviewVisible.value = true;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', handleEsc);
};

const closePreview = () => {
    isPreviewVisible.value = false;
    document.body.style.overflow = '';
    window.removeEventListener('keydown', handleEsc);
};

const handleEsc = (e) => { if (e.key === 'Escape') closePreview(); };

const formatCount = (count) => {
    if (!count || count === 0) return '0';
    if (count >= 1000) return (count / 1000).toFixed(1) + 'K';
    return count;
};

// ==================== 5. 弹幕逻辑 ====================
const defaultBarrage = [
    { id: 'd1', avatar: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?q=80&w=100', content: '好漂亮！', image: null },
    { id: 'd2', avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?q=80&w=100', content: '图拍得不错哟！！', image: 'https://images.unsplash.com/photo-1493246507139-91e8fad9978e?q=80&w=50&h=50&fit=crop' },
    { id: 'd3', avatar: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?q=80&w=100', content: '还得是up主呀 ~', image: null },
]
const barrageList = ref([...defaultBarrage])

const fetchLatestComments = async () => {
    try {
        const res = await axios.get('/api/comments/latest', { params: { limit: 15 } });
        if (res.data.success && res.data.data.length > 0) {
            const realComments = res.data.data.map(item => {
                const avatar = getFullAvatarUrl(item.avatar);
                let thumbImage = null;
                let displayContent = item.content || '';
                if (Array.isArray(item.images) && item.images.length > 0) {
                    let imgPath = item.images[0];
                    if (imgPath && typeof imgPath === 'string') {
                        thumbImage = imgPath.startsWith('http') || imgPath.startsWith('/') ? imgPath : '/' + imgPath;
                    }
                }
                if (!displayContent.trim() && thumbImage) displayContent = '分享图片';
                else if (!displayContent.trim() && !thumbImage) displayContent = '收到一条新留言';
                const maxLen = thumbImage ? 8 : 12;
                if (displayContent.length > maxLen) displayContent = displayContent.substring(0, maxLen) + '...';
                return { id: item.id, avatar: avatar, content: displayContent, image: thumbImage };
            });
            barrageList.value = realComments.length < 5 ? [...realComments, ...defaultBarrage] : realComments;
        }
    } catch (error) { console.error('❌ 获取最新弹幕失败:', error); }
};

// ==================== 6. 文章与分类逻辑 ====================
const dbCategories = ref([])
const activeCategory = ref('all')

const categories = computed(() => {
    const list = [{ id: 'all', name: '全部', icon: '🌈' }, { id: 'latest', name: '最新', icon: '🔥' }]
    dbCategories.value.forEach(cat => {
        const name = cat.name || cat;
        if (!name || ['最新', '全部', '友链'].includes(name)) return;
        list.push({ id: name, name: name, icon: cat.icon || '📂' })
    })
    list.push({ id: 'friends', name: '友链', icon: '⭐' })
    return list
})

const groupedArticles = computed(() => {
    if (activeCategory.value !== 'all' || isSearching.value) return [];
    const sections = [{ id: 'latest', name: '最新发布', icon: '🔥', list: articles.value.slice(0, 6) }];
    dbCategories.value.forEach(cat => {
        const catName = cat.name || cat;
        const posts = articles.value.filter(a => a.category === catName);
        if (posts.length > 0) {
            sections.push({ id: catName, name: catName, icon: cat.icon || '📂', list: posts.slice(0, 4) });
        }
    });
    return sections;
});

const fetchCategories = async () => {
    try {
        const res = await axios.get('/api/categories')
        if (res.data.success) dbCategories.value = res.data.data
    } catch (error) { console.error('❌ 获取系统分类失败:', error) }
}

const fetchArticles = async (categoryName = '', isLoadMore = false, isSilent = false) => {
    // 💡 确定要请求的页码
    const pageToFetch = isLoadMore ? currentPage.value + 1 : 1

    // 💡 确定每页数量
    const currentLimit = (activeCategory.value === 'all' && !isSearching.value) ? 40 : pageSize;

    if (isLoadMore) {
        isLoadingMore.value = true
    } else if (!isSilent) {
        isLoadingArticles.value = true;
        currentPage.value = 1;
        hasMore.value = true;
    }

    try {
        // 🔑 使用 api 进行请求
        const res = await api.get('/articles', { // 注意：api 封装通常已包含 /api 前缀
            params: {
                category: categoryName,
                page: pageToFetch,
                limit: currentLimit,
                keyword: searchQuery.value
            }
        })

        if (res.data.success) {
            const { list, pagination } = res.data.data

            // 数据处理逻辑
            const processedList = list.map(item => {
                // 1. 确保 work_type 存在
                let type = item.work_type || 'article';

                // 🔥 修复：如果后端返回的是 article 但有 video_url，强制纠正为 video
                if (item.video_url && type === 'article') type = 'video';
                if (item.audio_url && type === 'article') type = 'audio';

                // 2. 视频/音频路径标准化 (去反斜杠)
                let vUrl = item.video_url;
                let aUrl = item.audio_url;

                if (type === 'video' && vUrl) {
                    vUrl = vUrl.replace(/\\/g, '/'); // 替换 Windows 反斜杠
                }
                if (type === 'audio' && aUrl) {
                    aUrl = aUrl.replace(/\\/g, '/'); // 替换 Windows 反斜杠
                }

                // 3. 封面图处理
                let cover = item.cover_image || item.cover;

                // 如果是图文 (short)，且没封面，尝试提取内容第一张图
                if ((type === 'short' || item.category === '图文') && !cover && item.content) {
                    const imgMatch = item.content.match(/!\[.*?\]\((.*?)\)/);
                    if (imgMatch && imgMatch[1]) cover = imgMatch[1];
                }

                return {
                    ...item,
                    work_type: type,
                    video_url: vUrl, // 🔥 使用清洗后的 URL
                    audio_url: aUrl, // 🔥 使用清洗后的 URL
                    cover_image: cover,
                    cover: cover,
                    displayCover: cover,
                    comments: item.comments || 0,
                    views: item.views || 0
                };
            });

            // 💡 更新文章列表：加载更多则追加，否则替换
            articles.value = isLoadMore ? [...articles.value, ...processedList] : processedList

            // 🔑 修正 2：请求成功后，如果是加载更多，必须递增页码
            if (isLoadMore) {
                currentPage.value = pageToFetch
            }

            // 💡 修正 3：更精准的“加载更多”显示逻辑
            // 判断条件：当前返回数量不足 limit，或者已达到最后一页
            hasMore.value = !(processedList.length < currentLimit || pageToFetch >= pagination.totalPages)

            console.log(`✅ 加载完成，当前页: ${currentPage.value}, 总页数: ${pagination.totalPages}`);
        }
    } catch (error) {
        console.error('❌ 分页请求出错:', error)
        if (typeof message !== 'undefined') {
            message.error('加载文章失败，请重试')
        }
    } finally {
        isLoadingArticles.value = false;
        isLoadingMore.value = false;
    }
}


const handleLoadMore = () => {
    if (isLoadingMore.value || !hasMore.value) return
    const queryCat = isSearching.value ? '' : (activeCategory.value === 'latest' ? 'latest' : activeCategory.value)
    fetchArticles(queryCat, true)
}

// ✅ 点击推荐文章跳转到详情页
const goToDetail = (item) => {
    // 1. 停止预览播放（如果有视频正在播放）
    const key = getUniqueKey(item);
    const video = videoRefs.value.get(key);
    if (video) {
        video.pause();
        playingIds.value.delete(key);
    }

    // 2. 直接跳转，携带类型参数
    router.push({
        path: `/article/${item.id}`,
        query: { type: item.work_type || 'article' } // 🔑 确保携带类型
    });
};


// Blog.vue 中的 getProxyUrl (终极抗造版)
const getProxyUrl = (url) => {
    // 1. 空值检查
    if (!url || url === 'null' || url === 'undefined' || typeof url !== 'string') {
        return 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=200&h=200';
    }

    // 2. 外部链接直接返回
    if (url.startsWith('http') || url.startsWith('data:')) {
        return url;
    }

    // 3. 清洗路径：去空格，替换反斜杠
    let cleanPath = url.trim().replace(/\\/g, '/');

    // 4. 🔥 关键修复：如果你数据库存的路径里没有 'uploads/'，我们手动补上！
    // 假设你的文件都在 server/src/uploads 下，那 URL 必须包含 /uploads
    if (!cleanPath.startsWith('/') && !cleanPath.includes('uploads/')) {
        cleanPath = '/uploads/' + cleanPath;
    } else if (!cleanPath.startsWith('/')) {
        cleanPath = '/' + cleanPath;
    }

    // 5. 环境判断
    const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

    // 如果是开发环境 (npm run dev)，通常 Vite 代理会处理，但直接拼全路径也无妨
    if (import.meta.env.DEV) {
        return `http://localhost:3000${cleanPath}`;
    }

    // Preview 或 生产环境
    if (isLocalhost) {
        // Preview 模式：强制指向后端 3000 端口
        return `http://localhost:3000${cleanPath}`;
    } else {
        // 线上环境：指向当前域名
        return `${window.location.origin}${cleanPath}`;
    }
}

// ==================== 7. 统计与公告 ====================
const fetchSiteStats = async () => {
    try {
        const res = await axios.get('/api/blog/stats')
        if (res.data.success) siteStats.value = res.data.data
    } catch (error) { console.error('❌ 获取站点统计失败:', error) }
}

const showNotice = ref(false)
const fetchLatestNotice = async () => {
    try {
        const res = await axios.get('/api/notices/latest')
        if (res.data.success && res.data.data.content) {
            notices.value[0].content = res.data.data.content
            showNotice.value = true
        } else showNotice.value = false
    } catch (error) { showNotice.value = false }
}

const friendLinks = ref([])
const fetchFriendLinks = async () => {
    try {
        const res = await axios.get('/api/friend_links')
        if (res.data.success) {
            // 🔥 修改前：直接赋值
            // friendLinks.value = res.data.data

            // 🔥 修改后：增加状态过滤
            friendLinks.value = res.data.data.filter(link => {
                // 如果 status 是 1，或者 status 字段不存在/为null (兼容旧数据)，都显示
                // 如果您已经在数据库刷过数据了，可以直接写 link.status === 1
                return link.status === 1 || link.status === undefined || link.status === null;
            });
        }
    } catch (error) { console.error('获取友链失败', error) }
}

const filteredArticles = computed(() => {
    if (selectedTagId.value) return articles.value.filter(article => article.tag_id === selectedTagId.value)
    return articles.value
})

const handleFriendClick = () => { activeCategory.value = 'friends'; scrollToContent(); }

const formatDateTime = (dateStr) => {
    if (!dateStr) return ''
    const date = new Date(dateStr)
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

// ==================== 8. 推荐文章 ====================
const recommendedArticles = ref([])
const isLoadingHotArticles = ref(false)

// ✅ 修正推荐文章抓取：字段映射与封面容错处理
const fetchHotArticles = async () => {
    isLoadingHotArticles.value = true;
    try {
        const res = await api.get('/articles/hot', { params: { limit: 3 } });
        if (res.data.success) {
            recommendedArticles.value = res.data.data.map(article => {
                // 🔑 确保兼容后端返回的各种字段格式
                const rawCover = article.cover_image || article.cover;
                return {
                    ...article,
                    // 将原始封面路径赋给 cover 变量
                    cover: (rawCover && rawCover !== 'null' && rawCover !== 'undefined') ? rawCover : null,
                    date: article.display_date || article.created_at_formatted,
                    work_type: article.work_type || 'article',
                    video_url: article.video_url || null
                };
            });
            console.log('📊 推荐文章数据已清洗完毕');
        }
    } catch (error) {
        console.error('❌ 获取推荐文章失败，使用兜底数据');
        recommendedArticles.value = getDefaultRecommendations();
    } finally {
        isLoadingHotArticles.value = false;
    }
};


const getDefaultRecommendations = () => {
    const formattedDate = formatDateTime(new Date());
    return [
        {
            id: 101,
            title: 'POETIZE - 文档导航',
            date: `📅 ${formattedDate}`,
            cover: null, // 默认无封面，触发艺术文字封面
            views: 150,
            comments: 12,
            category: 'Veritas',
            work_type: 'article',
            video_url: null
        },
        {
            id: 102,
            title: 'Vue 3 实战教程',
            date: `📝 ${formattedDate}`,
            cover: null,
            views: 280,
            comments: 25,
            category: '学习人生',
            work_type: 'article',
            video_url: null
        }
    ]
}

// ==================== 9. 搜索与打字机 ====================
const performSearch = async (keyword) => {
    if (!keyword || !keyword.trim()) return
    isLoadingArticles.value = true; isSearching.value = true
    try {
        const res = await axios.get('/api/articles/search', { params: { q: keyword } })
        if (res.data.success) {
            articles.value = res.data.data.map(item => ({ ...item, comments: item.comments || 0, views: item.views || 0 }))
            activeCategory.value = ''
        }
    } catch (error) { console.error('❌ 搜索请求失败:', error) }
    finally { isLoadingArticles.value = false }
    searchQuery.value = keyword
    fetchArticles('', false)
}

const handleSearch = () => { if (searchQuery.value.trim()) { performSearch(searchQuery.value); scrollToContent(); } }
const resetView = () => { searchQuery.value = ''; isSearching.value = false; activeCategory.value = 'latest'; scrollToContent(); }

const typedText = ref('')
const fullText = "成就源于真理！"
let typeIndex = 0
let typeTimer = null
let statsTimer = null

const startTyping = () => {
    typeIndex = 0; typedText.value = '';
    if (typeTimer) clearInterval(typeTimer)
    typeTimer = setInterval(() => {
        if (typeIndex < fullText.length) { typedText.value += fullText.charAt(typeIndex); typeIndex++; }
        else clearInterval(typeTimer)
    }, 200)
}

const scrollToContent = () => {
    const content = document.getElementById('blog-content-anchor')
    if (content) {
        const offsetPosition = (content.getBoundingClientRect().top - document.body.getBoundingClientRect().top) - 80
        window.scrollTo({ top: offsetPosition, behavior: 'smooth' })
    }
}

const refreshAllData = async () => {
    if (isLoadingArticles.value || isLoadingHotArticles.value) return;
    fetchSiteStats(); fetchLatestComments(); fetchLatestNotice();
};

// ==================== 10. 视频引用与播放 (修复重点) ====================
const getUniqueKey = (item, suffix = '') => {
    const type = item.work_type || (item.video_url ? 'video' : 'article');
    return `${type}_${item.id}${suffix ? '_' + suffix : ''}`;
};

const setVideoRef = (el, item, suffix = '') => {
    const key = getUniqueKey(item, suffix);
    if (el) {
        if (!el._listenersBound) {
            videoRefs.value.set(key, el);
            el.addEventListener('canplay', () => console.log(`✅ 视频可播放: ${key}`), { once: true });
            el._listenersBound = true;
        }
    } else videoRefs.value.delete(key);
};

const setAudioRef = (el, item, suffix = '') => {
    const key = getUniqueKey(item, suffix);
    if (el) audioRefs.value.set(key, el);
    else audioRefs.value.delete(key);
};

const onVideoReady = (item, suffix) => { console.log('✅ 视频元数据加载:', getUniqueKey(item, suffix)); };

const togglePlay = async (item, suffix, event) => {
    if (isToggling.value) return;
    isToggling.value = true;

    const key = getUniqueKey(item, suffix);
    // ... (中间获取 media 的代码保持不变) ...
    let media = null;
    if (item.work_type === 'video') {
        media = videoRefs.value.get(key);
    } else {
        media = audioRefs.value.get(key);
    }

    if (!media) {
        // ... (报错返回代码保持不变) ...
        console.warn('❌ 未找到媒体元素:', key);
        isToggling.value = false;
        return;
    }

    try {
        if (media.paused) {
            // 互斥播放：暂停其他所有
            for (const [k, v] of videoRefs.value) {
                if (v !== media && !v.paused) {
                    v.pause();
                    playingIds.value.delete(k);
                    vinylActiveIds.value.delete(k); // ✨ 别人暂停时，彻底移除动画
                }
            }
            for (const [k, v] of audioRefs.value) {
                if (v !== media && !v.paused) { // 注意：这里通常不仅要判断 !paused，最好是只要不是当前这个，就重置
                    v.pause();
                    playingIds.value.delete(k);
                    vinylActiveIds.value.delete(k); // ✨ 别人暂停时，彻底移除动画
                }
            }
            // ✨ 为了保险，把所有不是当前的 active 状态都清掉 (可选，但建议加上)
            vinylActiveIds.value.forEach(id => {
                if (id !== key) vinylActiveIds.value.delete(id);
            });

            await media.play();
            playingIds.value.add(key);
            vinylActiveIds.value.add(key); // ✨ 开始播放：激活动画
        } else {
            media.pause();
            playingIds.value.delete(key);
            // ✨ 暂停播放：不要从 vinylActiveIds 移除，保持定格！
        }
    } catch (err) {
        console.error('❌ 播放控制失败:', err);
    } finally {
        isToggling.value = false;
    }
};

const handleVideoEnd = (item, suffix) => {
    const key = getUniqueKey(item, suffix);
    playingIds.value.delete(key);
    vinylActiveIds.value.delete(key); // ✨ 播放结束：彻底移除动画，复位
};

// 🔥 新增：获取当前登录用户的个人统计
const fetchUserPersonalStats = async () => {
    // 只有登录了才查
    if (!userStore.user || !userStore.user.username) return;

    try {
        const res = await api.get('/user/profile', {
            params: { username: userStore.user.username }
        });

        if (res.data.success) {
            const data = res.data.data.stats;
            userPersonalStats.value = {
                articleCount: data.originalCount || 0,
                categoryCount: data.categoryCount || 0, // 后端刚加的字段
                totalViews: data.totalViews || 0
            };
        }
    } catch (error) {
        console.error('❌ 获取个人统计失败:', error);
    }
}

// 🔥 监听路由：只要路由回到 /blog（或者是你的首页路径），就重新拉取数据
watch(() => router.currentRoute.value.path, (newPath) => {
    if (newPath === '/blog' || newPath === '/') {
        console.log('🔄 检测到返回首页，正在同步互动数据...');
        const queryCat = isSearching.value ? '' : (activeCategory.value === 'latest' ? 'latest' : activeCategory.value);
        fetchArticles(queryCat, false, true); // 第三个参数 true 代表静默刷新，不显示 loading 动画
    }
});

watch(activeCategory, (newCategory) => {
    if (newCategory === 'friends') return
    let queryCat = newCategory === 'all' ? '' : (newCategory === 'latest' ? 'latest' : newCategory)
    currentPage.value = 1
    fetchArticles(queryCat, false)
    nextTick(() => { scrollToContent() })
})

watch(() => userStore.user, (newUser) => {
    if (newUser && newUser.username) {
        fetchUserPersonalStats(); // 登录时获取个人数据
    } else {
        // 登出时重置为0 (或者重置为全站数据，看你需求)
        // 如果想回退到 siteStats，可以在这里重新 fetchSiteStats() 或者直接用 computed 处理
        userPersonalStats.value = { articleCount: 0, categoryCount: 0, totalViews: 0 };
    }
})

onMounted(async () => {
    if (!userStore.user && localStorage.getItem('token')) await userStore.checkLoginStatus()
    initWallpapers(); fetchSiteStats(); fetchHotArticles(); fetchCategories();
    fetchArticles(); fetchLatestComments(); fetchLatestNotice(); fetchTags(); fetchFriendLinks(); startTyping();
    setTimeout(() => { isSidebarReady.value = true }, 400)
    statsTimer = setInterval(() => { refreshAllData() }, 30000)
    // 🔥 如果已登录，获取个人数据
    if (userStore.user) {
        fetchUserPersonalStats();
    }
})

onUnmounted(() => {
    if (carouselTimer) clearInterval(carouselTimer)
    if (typeTimer) clearInterval(typeTimer)
    if (animationFrameId) cancelAnimationFrame(animationFrameId)
    if (statsTimer) clearInterval(statsTimer)
})
</script>

<template>
    <div class="blog-page">
        <header class="hero-section" :class="{ 'is-ready': isHeroReady }"
            :style="{ backgroundImage: heroBgUrl ? `url(${heroBgUrl})` : 'none' }">
            <div class="hero-overlay"></div>
            <div class="hero-content animate__animated animate__fadeInDown">
                <h1 class="main-title">看见真理</h1>
                <div class="typewriter-container">
                    <span class="sub-title">{{ typedText }}</span>
                    <span class="cursor">|</span>
                </div>
            </div>
            <div class="scroll-down-btn" @click="scrollToContent">
                <svg class="scroll-arrow" viewBox="0 0 24 24">
                    <path d="M7 10l5 5 5-5z" fill="currentColor" />
                </svg>
            </div>
            <div class="hero-waves">
                <svg class="waves" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"
                    viewBox="0 24 150 28" preserveAspectRatio="none" shape-rendering="auto">
                    <defs>
                        <path id="gentle-wave"
                            d="M-160 44c30 0 58-18 88-18s 58 18 88 18 58-18 88-18 58 18 88 18 v44h-352z" />
                    </defs>
                    <g class="parallax">
                        <use xlink:href="#gentle-wave" x="48" y="0" fill="rgba(255, 255, 255, 0.7)" />
                        <use xlink:href="#gentle-wave" x="48" y="3" fill="rgba(255, 255, 255, 0.5)" />
                        <use xlink:href="#gentle-wave" x="48" y="5" fill="rgba(255, 255, 255, 0.3)" />
                        <use xlink:href="#gentle-wave" x="48" y="7" class="wave-bottom" />
                    </g>
                </svg>
            </div>
        </header>

        <div id="blog-content-anchor"></div>

        <main class="main-container">
            <aside class="sidebar-wrapper animate__animated animate__fadeInLeft">
                <div class="sidebar-card profile-card-crystal staggered-animation"
                    :class="{ 'is-visible': isSidebarReady }" style="--delay: 1">
                    <div class="profile-bg-illustration">
                        <img :src="profile.banner" class="illus-img" alt="bg">
                    </div>
                    <div class="profile-avatar-wrapper" @click="handleAvatarClick">
                        <img :src="profile.avatar" alt="Avatar" class="avatar-img">
                    </div>
                    <div class="profile-info-text">
                        <h2 class="profile-name">{{ profile.name }}</h2>
                    </div>
                    <div class="profile-stats-grid">
                        <div class="stat-col">
                            <div class="stat-label-row">
                                <span class="stat-icon">📚</span>
                                <span class="stat-label">内容</span>
                            </div>
                            <div class="stat-num">{{ profile.articlesCount }}</div>
                        </div>
                        <div class="stat-col">
                            <div class="stat-label-row"><span class="stat-icon">🗂️</span><span
                                    class="stat-label">分类</span></div>
                            <div class="stat-num">{{ profile.categoryCount }}</div>
                        </div>
                        <div class="stat-col">
                            <div class="stat-label-row"><span class="stat-icon">🔥</span><span
                                    class="stat-label">访问量</span></div>
                            <div class="stat-num">{{ profile.visits }}</div>
                        </div>
                    </div>
                    <div class="profile-action-btn">
                        <button class="friend-btn-crystal" @click="handleFriendClick"><span class="icon-star">☆</span>
                            友链</button>
                    </div>
                </div>

                <div class="sidebar-card search-card-crystal staggered-animation"
                    :class="{ 'is-visible': isSidebarReady }" style="--delay: 2">
                    <div class="card-header-row">
                        <div class="header-title">🔍<span>搜索</span></div>
                        <div class="mac-dots"><span class="dot red"></span><span class="dot yellow"></span><span
                                class="dot green"></span></div>
                    </div>
                    <div class="search-input-wrapper">
                        <input type="text" v-model="searchQuery" placeholder="搜索文章..." @keyup.enter="handleSearch">
                        <div class="search-icon-btn" @click="handleSearch">🔍</div>
                    </div>
                </div>

                <div class="sidebar-card recommend-card-crystal staggered-animation"
                    :class="{ 'is-visible': isSidebarReady }" style="--delay: 3">
                    <div class="card-header-row">
                        <div class="header-title">👍<span>推荐文章</span></div>
                        <div class="mac-dots"><span class="dot red"></span><span class="dot yellow"></span><span
                                class="dot green"></span></div>
                    </div>
                    <div v-if="isLoadingHotArticles" class="loading-state">
                        <div class="loading-spinner"></div>
                    </div>
                    <div v-else class="recommend-list">
                        <div v-for="item in recommendedArticles" :key="item.id" class="recommend-item"
                            @click="goToDetail(item)">
                            <div class="rec-top-section">
                                <div class="rec-thumb">
                                    <template v-if="getProxyUrl(item.cover)">
                                        <img :src="getProxyUrl(item.cover)" alt="cover" class="rec-thumb-img"
                                            @error="item.cover = null">
                                    </template>
                                    <template v-else>
                                        <div class="rec-text-only-cover">
                                            <div class="rec-quote-mark">“</div>
                                            <div class="rec-text-preview">{{ item.title }}</div>
                                        </div>
                                    </template>
                                </div>

                                <div class="rec-title-box">
                                    <h4 class="rec-title">{{ item.title }}</h4>
                                    <div v-if="item.isUpdated" class="rec-updated-badge">已更新</div>
                                </div>
                            </div>
                            <div class="rec-bottom-section">
                                <span class="rec-date">{{ item.date }}</span>
                                <span v-if="item.views" class="rec-views">👁️ {{ item.views }}</span>
                            </div>
                        </div>
                    </div>
                </div>

                <div class="sidebar-card tag-card-crystal staggered-animation" :class="{ 'is-visible': isSidebarReady }"
                    style="--delay: 4">
                    <div class="card-header-row">
                        <div class="header-title">🏷️<span>标签</span></div>
                    </div>
                    <div class="tag-cloud-3d-box" ref="tagContainer">
                        <div v-for="tag in tags" :key="tag.id" class="tag-pill-3d" :style="tag.style"
                            @click="handleTagClick(tag)">
                            <div class="tag-icon-part">📂</div>
                            <div class="tag-text-part">{{ tag.name }}</div>
                        </div>
                    </div>
                </div>

                <div class="sidebar-card barrage-card-crystal staggered-animation"
                    :class="{ 'is-visible': isSidebarReady }" style="--delay: 5">
                    <div class="barrage-header">
                        <div class="header-title">✾<span>最新弹幕</span></div>
                    </div>
                    <div class="barrage-container">
                        <div class="barrage-list-wrapper">
                            <div class="barrage-item" v-for="item in barrageList" :key="item.id">
                                <div class="barrage-avatar"><img :src="item.avatar"></div>
                                <div class="barrage-content-box">
                                    <span class="barrage-text">{{ item.content }}</span>
                                    <div v-if="item.image" class="barrage-thumb"><img :src="item.image"
                                            @click.stop="openPreview(item.image)"></div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </aside>

            <section class="content-wrapper animate__animated animate__fadeInUp">
                <div v-if="showNotice" class="notice-bar">
                    <div class="notice-icon-box">📢<span class="notice-label" style="margin-left:5px">公告</span></div>
                    <div class="notice-content-wrapper">
                        <div class="scroll-text">{{ notices[0]?.content || '暂无公告' }}</div>
                    </div>
                </div>

                <div class="category-bar">
                    <div class="bar-title">🧭 发现</div>
                    <div class="cat-list">
                        <div v-for="cat in categories" :key="cat.id" class="cat-item"
                            :class="{ active: activeCategory === cat.id }" @click="activeCategory = cat.id">
                            <span class="cat-icon">{{ cat.icon }}</span> {{ cat.name }}
                        </div>
                    </div>
                </div>

                <div class="main-articles-view">
                    <div v-if="activeCategory === 'friends'" class="friend-grid">
                        <div v-for="friend in friendLinks" :key="friend.id" class="friend-card"
                            @click="window.open(friend.link, '_blank')">
                            <img :src="friend.avatar" class="friend-avatar">
                            <div class="friend-info">
                                <h4>{{ friend.name }}</h4>
                                <p>{{ friend.desc }}</p>
                            </div>
                        </div>
                    </div>

                    <div v-else-if="activeCategory === 'all' && !isSearching" class="portal-wrapper">
                        <div v-for="group in groupedArticles" :key="group.id" class="portal-section">
                            <div class="section-divider">
                                <h3 class="section-title"><span class="title-icon">{{ group.icon }}</span><span
                                        class="title-text">{{ group.name }}</span></h3>
                                <button class="btn-more-link" @click="activeCategory = group.id">查看更多 →</button>
                            </div>
                            <div class="article-grid">
                                <div v-for="article in group.list" :key="article.id" class="article-card">
                                    <div class="card-cover-wrapper">
                                        <!-- 视频 -->
                                        <template v-if="article.work_type === 'video'">
                                            <div class="video-preview-wrapper" @dblclick="goToDetail(article)">
                                                <div v-show="!playingIds.has(getUniqueKey(article, 'portal' + group.id))"
                                                    class="video-poster-layer" :class="{ 'is-empty': !article.cover }"
                                                    :style="article.cover ? { backgroundImage: `url(${getProxyUrl(article.cover)})` } : {}">
                                                    <div v-if="!article.cover" class="video-empty-poster">
                                                        <span class="poster-logo">Veritas</span>
                                                    </div>
                                                </div>

                                                <video v-if="article.video_url"
                                                    :ref="el => setVideoRef(el, article, 'portal' + group.id)"
                                                    :src="getProxyUrl(article.video_url)" muted loop playsinline
                                                    crossorigin="anonymous" preload="metadata"
                                                    class="card-video-element"
                                                    @ended="handleVideoEnd(article, 'portal' + group.id)"
                                                    @loadedmetadata="onVideoReady(article, 'portal' + group.id)"
                                                    @click.prevent.stop="togglePlay(article, 'portal' + group.id, $event)">
                                                </video>

                                                <div v-show="!playingIds.has(getUniqueKey(article, 'portal' + group.id))"
                                                    class="video-play-overlay"
                                                    @click.stop="togglePlay(article, 'portal' + group.id, $event)">
                                                    <div class="play-trigger-btn">▶</div>
                                                    <p class="interaction-tip">单击播放 / 双击详情</p>
                                                </div>
                                                <div v-show="playingIds.has(getUniqueKey(article, 'portal' + group.id))"
                                                    class="video-playing-mask"
                                                    style="position:absolute; inset:0; z-index:9; cursor:pointer;"
                                                    @click.stop="togglePlay(article, 'portal' + group.id, $event)">
                                                </div>
                                                <div v-show="playingIds.has(getUniqueKey(article, 'portal' + group.id))"
                                                    class="video-playing-indicator">
                                                    <div class="card-rec-indicator"><span
                                                            class="rec-dot-small"></span>REC</div>
                                                </div>
                                            </div>
                                        </template>

                                        <!-- 音频 -->
                                        <template v-else-if="article.work_type === 'audio'">
                                            <div class="media-preview-wrapper audio-preview-mini"
                                                :style="article.cover ? { backgroundImage: `url(${getProxyUrl(article.cover)})` } : {}"
                                                @dblclick="goToDetail(article)">

                                                <div class="audio-bg-blur-mask"></div>

                                                <div class="mini-vinyl-record"
                                                    :class="{ 'is-spinning': vinylActiveIds.has(getUniqueKey(article, isSearching ? 'list' : (activeCategory === 'all' ? 'portal' + (group?.id || '') : 'list'))) }"
                                                    :style="{ animationPlayState: playingIds.has(getUniqueKey(article, isSearching ? 'list' : (activeCategory === 'all' ? 'portal' + (group?.id || '') : 'list'))) ? 'running' : 'paused' }">
                                                    <img :src="getProxyUrl(article.cover)" class="mini-vinyl-cover"
                                                        v-if="article.cover">
                                                    <div class="mini-vinyl-hole"></div>
                                                </div>

                                                <div class="audio-play-overlay"
                                                    @click.prevent.stop="togglePlay(article, isSearching ? 'list' : (activeCategory === 'all' ? 'portal' + (group?.id || '') : 'list'), $event)">
                                                    <div class="play-btn-sm">
                                                        {{ playingIds.has(getUniqueKey(article, isSearching ? 'list' :
                                                            (activeCategory === 'all' ? 'portal' + (group?.id || '') :
                                                                'list'))) ? '┃┃' : '▶' }}
                                                    </div>
                                                </div>

                                                <audio v-if="article.audio_url"
                                                    :ref="el => setAudioRef(el, article, isSearching ? 'list' : (activeCategory === 'all' ? 'portal' + (group?.id || '') : 'list'))"
                                                    :src="getProxyUrl(article.audio_url)" crossorigin="anonymous"
                                                    @ended="handleVideoEnd(article, isSearching ? 'list' : (activeCategory === 'all' ? 'portal' + (group?.id || '') : 'list'))">
                                                </audio>
                                            </div>
                                        </template>

                                        <template v-else-if="article.cover">
                                            <img :src="getProxyUrl(article.cover)" @click="goToDetail(article)"
                                                style="cursor:pointer" @error="article.cover = null">
                                            <div v-if="article.work_type === 'short'" class="type-badge-icon">
                                                📸 图文
                                            </div>
                                        </template>
                                        <template v-else>
                                            <div class="text-only-cover" @click="goToDetail(article)"
                                                style="cursor:pointer">
                                                <div class="quote-mark">“</div>
                                                <div class="text-preview">{{ article.title }}</div>
                                            </div>
                                        </template>
                                    </div>
                                    <div class="card-body-tight">
                                        <div class="row-1-header">
                                            <img :src="getFullAvatarUrl(article.author_avatar)"
                                                class="avatar-mini-circle"
                                                @click.stop="router.push(`/profile/${article.author_username}`)"
                                                style="cursor: pointer" title="查看作者主页">
                                            <h3 class="article-title-compact">{{ article.title }}</h3>
                                        </div>
                                        <div class="row-2-date">🕒 {{ formatDateTime(article.created_at) }}</div>
                                        <div class="row-3-stats-bar">
                                            <div class="stat-unit">{{ formatCount(article.views) }}🔥</div>
                                            <div class="stat-unit">{{ formatCount(article.likes) }}❤️</div>
                                            <div class="stat-unit">{{ formatCount(article.comments) }}📝</div>
                                            <div class="stat-unit"><span>{{ formatCount(article.favorites) }}</span>⭐
                                            </div>
                                        </div>
                                        <div class="row-4-footer-brand">
                                            <div class="brand-tag">Veritas / <span>{{ article.category }}</span></div>
                                            <button class="btn-goto-read" @click="goToDetail(article)">{{
                                                article.work_type === 'video' ? '观看' : '阅览'
                                            }}</button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div v-else class="article-grid">
                        <div v-if="isSearching" class="search-result-bar">
                            <span>🔍 正在显示 <b>"{{ searchQuery }}"</b> 的结果</span>
                            <button class="clear-search-btn" @click="resetView">✕ 清除</button>
                        </div>

                        <div v-for="article in filteredArticles" :key="article.work_type + article.id"
                            class="article-card">

                            <div class="card-cover-wrapper">
                                <template v-if="article.work_type === 'video'">
                                    <div class="video-preview-wrapper" @dblclick="goToDetail(article)">
                                        <div v-show="!playingIds.has(getUniqueKey(article, 'list'))"
                                            class="video-poster-layer" :class="{ 'is-empty': !article.cover }"
                                            :style="article.cover ? { backgroundImage: `url(${getProxyUrl(article.cover)})` } : {}">
                                            <div v-if="!article.cover" class="video-empty-poster">
                                                <span class="poster-logo">Veritas</span>
                                            </div>
                                        </div>
                                        <video v-if="article.video_url" :ref="el => setVideoRef(el, article, 'list')"
                                            :src="getProxyUrl(article.video_url)" muted loop playsinline
                                            crossorigin="anonymous" preload="metadata" class="card-video-element"
                                            @ended="handleVideoEnd(article, 'list')"
                                            @loadedmetadata="onVideoReady(article, 'list')"
                                            @click.prevent.stop="togglePlay(article, 'list', $event)">
                                        </video>
                                        <div v-show="!playingIds.has(getUniqueKey(article, 'list'))"
                                            class="video-play-overlay"
                                            @click.stop="togglePlay(article, 'list', $event)">
                                            <div class="play-trigger-btn">▶</div>
                                            <p class="interaction-tip">单击播放 / 双击详情</p>
                                        </div>
                                        <div v-show="playingIds.has(getUniqueKey(article, 'list'))"
                                            class="video-playing-mask"
                                            style="position:absolute; inset:0; z-index:9; cursor:pointer;"
                                            @click.stop="togglePlay(article, 'list', $event)">
                                        </div>
                                        <div v-show="playingIds.has(getUniqueKey(article, 'list'))"
                                            class="video-playing-indicator">
                                            <div class="card-rec-indicator"><span class="rec-dot-small"></span> REC
                                            </div>
                                        </div>
                                    </div>
                                </template>

                                <template v-else-if="article.work_type === 'audio'">
                                    <div class="media-preview-wrapper audio-preview-mini"
                                        :style="article.cover ? { backgroundImage: `url(${getProxyUrl(article.cover)})` } : {}"
                                        @dblclick="goToDetail(article)">

                                        <div class="audio-bg-blur-mask"></div>

                                        <div class="mini-vinyl-record"
                                            :class="{ 'is-spinning': vinylActiveIds.has(getUniqueKey(article, isSearching ? 'list' : (activeCategory === 'all' ? 'portal' + (group?.id || '') : 'list'))) }"
                                            :style="{ animationPlayState: playingIds.has(getUniqueKey(article, isSearching ? 'list' : (activeCategory === 'all' ? 'portal' + (group?.id || '') : 'list'))) ? 'running' : 'paused' }">
                                            <img :src="getProxyUrl(article.cover)" class="mini-vinyl-cover"
                                                v-if="article.cover">
                                            <div class="mini-vinyl-hole"></div>
                                        </div>

                                        <div class="audio-play-overlay"
                                            @click.prevent.stop="togglePlay(article, isSearching ? 'list' : (activeCategory === 'all' ? 'portal' + (group?.id || '') : 'list'), $event)">
                                            <div class="play-btn-sm">
                                                {{ playingIds.has(getUniqueKey(article, isSearching ? 'list' :
                                                    (activeCategory === 'all' ? 'portal' + (group?.id || '') : 'list'))) ?
                                                    '┃┃' : '▶' }}
                                            </div>
                                        </div>

                                        <audio v-if="article.audio_url"
                                            :ref="el => setAudioRef(el, article, isSearching ? 'list' : (activeCategory === 'all' ? 'portal' + (group?.id || '') : 'list'))"
                                            :src="getProxyUrl(article.audio_url)" crossorigin="anonymous"
                                            @ended="handleVideoEnd(article, isSearching ? 'list' : (activeCategory === 'all' ? 'portal' + (group?.id || '') : 'list'))">
                                        </audio>
                                    </div>
                                </template>

                                <template v-else-if="article.cover">
                                    <img :src="getProxyUrl(article.cover)" @click="goToDetail(article)"
                                        style="cursor:pointer" @error="article.cover = null">
                                    <div v-if="article.work_type === 'short'" class="type-badge-icon">
                                        📸 图文
                                    </div>
                                </template>

                                <template v-else>
                                    <div class="text-only-cover" @click="goToDetail(article)" style="cursor:pointer">
                                        <div class="quote-mark">“</div>
                                        <div class="text-preview">{{ article.title }}</div>
                                    </div>
                                </template>
                            </div>

                            <div class="card-body-tight">
                                <div class="row-1-header">
                                    <img :src="getFullAvatarUrl(article.author_avatar)" class="avatar-mini-circle"
                                        @click.stop="router.push(`/profile/${article.author_username}`)"
                                        style="cursor: pointer" title="查看作者主页">
                                    <h3 class="article-title-compact">{{ article.title }}</h3>
                                </div>

                                <div class="row-2-date">🕒 {{ formatDateTime(article.created_at) }}</div>

                                <div class="row-3-stats-bar">
                                    <div class="stat-unit"><span>{{ formatCount(article.views) }}</span>🔥</div>
                                    <div class="stat-unit"><span>{{ formatCount(article.likes) }}</span>❤️</div>
                                    <div class="stat-unit"><span>{{ formatCount(article.comments) }}</span>📝</div>
                                    <div class="stat-unit"><span>{{ formatCount(article.favorites) }}</span>⭐</div>
                                </div>

                                <div class="row-4-footer-brand">
                                    <div class="brand-tag">Veritas / <span>{{ article.category }}</span></div>
                                    <button class="btn-goto-read" @click="goToDetail(article)">
                                        {{ article.work_type === 'video' ? '观看' : (article.work_type === 'audio' ? '收听'
                                            : '阅览') }}
                                    </button>
                                </div>
                            </div>

                        </div>
                    </div>
                    <div class="pagination-container" v-if="!isSearching">
                        <div v-if="hasMore" class="load-more-wrapper">
                            <button class="load-more-btn-veritas" :disabled="isLoadingMore" @click="handleLoadMore">
                                <span v-if="!isLoadingMore">加载更多作品</span>
                                <span v-else class="loading-spinner-small"></span>
                            </button>
                        </div>
                        <div v-else class="no-more-data"><span class="line"></span><span
                                class="text">真理的尽头到了</span><span class="line"></span></div>
                    </div>
                </div>
            </section>
        </main>
    </div>
    <Transition name="zoom">
        <div v-if="isPreviewVisible" class="preview-overlay" @click="closePreview">
            <div class="preview-wrapper" @click.stop><img :src="previewUrl" class="preview-image-main">
                <div class="preview-close-btn" @click="closePreview">✕</div>
            </div>
        </div>
    </Transition>
</template>

<style scoped>
/* ==================== 1. 全局与 Hero 区域 ==================== */
.blog-page {
    font-family: 'Helvetica Neue', Helvetica, 'PingFang SC', sans-serif;
    background-color: #f6f8fa;
    min-height: 100vh;
    transition: background-color 0.5s ease;
}

.hero-section {
    position: relative;
    width: 100%;
    height: 65vh;
    min-height: 500px;
    display: flex;
    justify-content: center;
    align-items: center;
    color: white;
    text-align: center;
    background-size: cover;
    background-position: center;
    background-attachment: fixed;
    background-color: transparent;
    opacity: 0;
    transition: opacity 1.2s cubic-bezier(0.4, 0, 0.2, 1);
}

.hero-section.is-ready {
    opacity: 1;
}

.hero-overlay {
    position: absolute;
    inset: 0;
    z-index: 0;
    background: linear-gradient(to bottom, rgba(0, 0, 0, 0.2), rgba(0, 0, 0, 0.4));
}

.hero-content {
    position: relative;
    z-index: 1;
    margin-top: -40px;
}

.main-title {
    font-size: 4rem;
    font-weight: 700;
    letter-spacing: 12px;
    margin: 0 0 20px 0;
    text-shadow: 0 5px 15px rgba(0, 0, 0, 0.5);
    font-family: 'Georgia', serif;
}

.typewriter-container {
    display: inline-block;
    padding: 10px 28px;
    background: rgba(255, 255, 255, 0.1);
    border-radius: 50px;
    backdrop-filter: blur(8px);
    border: 1px solid rgba(255, 255, 255, 0.2);
    box-shadow: 0 5px 15px rgba(0, 0, 0, 0.2);
}

.sub-title {
    font-size: 1.2rem;
    font-weight: 400;
    letter-spacing: 3px;
    color: #fff;
    text-shadow: 0 2px 5px rgba(0, 0, 0, 0.3);
}

.cursor {
    display: inline-block;
    margin-left: 5px;
    animation: blink 1s step-end infinite;
}

@keyframes blink {

    0%,
    100% {
        opacity: 1;
    }

    50% {
        opacity: 0;
    }
}

.scroll-down-btn {
    position: absolute;
    bottom: 120px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 2;
    cursor: pointer;
    animation: bounce 2s infinite;
}

.scroll-arrow {
    width: 32px;
    height: 32px;
    color: rgba(255, 255, 255, 0.8);
    transition: color 0.3s;
    filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.3));
}

.scroll-down-btn:hover .scroll-arrow {
    color: #42b883;
}

@keyframes bounce {

    0%,
    20%,
    50%,
    80%,
    100% {
        transform: translate(-50%, 0);
    }

    40% {
        transform: translate(-50%, -10px);
    }

    60% {
        transform: translate(-50%, -5px);
    }
}

.hero-waves {
    position: absolute;
    bottom: 0;
    left: 0;
    width: 100%;
    height: 100px;
    z-index: 5;
    overflow: hidden;
}

.waves {
    position: relative;
    width: 100%;
    height: 100%;
    margin-bottom: -7px;
}

/* 🔥 波浪颜色控制 */
.wave-bottom {
    fill: #f6f8fa;
    /* 默认浅色背景色 */
    transition: fill 0.5s ease;
}

.parallax>use {
    animation: move-forever 25s cubic-bezier(.55, .5, .45, .5) infinite;
}

.parallax>use:nth-child(1) {
    animation-delay: -2s;
    animation-duration: 7s;
}

.parallax>use:nth-child(2) {
    animation-delay: -3s;
    animation-duration: 10s;
}

.parallax>use:nth-child(3) {
    animation-delay: -4s;
    animation-duration: 13s;
}

.parallax>use:nth-child(4) {
    animation-delay: -5s;
    animation-duration: 20s;
}

@keyframes move-forever {
    0% {
        transform: translate3d(-90px, 0, 0);
    }

    100% {
        transform: translate3d(85px, 0, 0);
    }
}

/* ==================== 2. 主体布局容器 ==================== */
.main-container {
    max-width: 1300px;
    margin: 0 auto;
    padding: 40px 20px;
    display: flex;
    gap: 30px;
    position: relative;
    z-index: 10;
}

.sidebar-wrapper {
    width: 300px;
    flex-shrink: 0;
    position: sticky;
    top: 20px;
    height: fit-content;
    z-index: 10;
}

.content-wrapper {
    flex: 1;
    min-width: 0;
}

/* ==================== 3. 侧边栏卡片 ==================== */
.sidebar-card,
.profile-card-crystal,
.search-card-crystal,
.recommend-card-crystal,
.tag-card-crystal {
    background: linear-gradient(0deg, #d9f4f0 0%, #f6fcfb 100%);
    border-radius: 16px;
    box-shadow: 0 8px 32px 0 rgba(31, 38, 135, 0.05);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    border: 1px solid rgba(255, 255, 255, 0.8);
    margin-bottom: 25px;
    overflow: hidden;
    transition: all 0.3s ease;
}

.sidebar-card:hover,
.profile-card-crystal:hover {
    transform: translateY(-5px);
    box-shadow: 0 15px 40px rgba(72, 203, 182, 0.15);
    border-color: #fff;
}

.staggered-animation {
    opacity: 0;
    transform: translateY(30px);
    animation: slideInUp 0.6s cubic-bezier(0.23, 1, 0.32, 1) forwards;
    animation-delay: calc(var(--delay) * 0.08s);
}

@keyframes slideInUp {
    from {
        opacity: 0;
        transform: translateY(40px) scale(0.98);
    }

    to {
        opacity: 1;
        transform: translateY(0) scale(1);
    }
}

/* 个人资料卡片 */
.profile-card-crystal {
    position: relative;
    padding-bottom: 25px;
    text-align: center;
}

.profile-bg-illustration {
    width: 100%;
    height: 140px;
    overflow: hidden;
    position: relative;
    clip-path: ellipse(130% 100% at 50% 0%);
}

.illus-img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    opacity: 0.9;
}

.profile-avatar-wrapper {
    width: 85px;
    height: 85px;
    margin: -45px auto 10px;
    border-radius: 50%;
    border: 2px rgba(145, 145, 145, 0.9);
    padding: 2px;
    background: #fff;
    cursor: pointer;
    box-shadow: 0 4px 15px rgba(0, 0, 0, 0.1);
    position: relative;
    z-index: 2;
    transition: transform 0.5s ease;
}

.profile-avatar-wrapper:hover {
    transform: rotate(360deg);
}

.avatar-img {
    width: 100%;
    height: 100%;
    border-radius: 50%;
    object-fit: cover;
}

.profile-name {
    font-size: 1.8rem;
    font-weight: 700;
    color: #2c3e50;
    margin: 0;
    margin-bottom: 20px;
}

.profile-stats-grid {
    display: flex;
    justify-content: space-around;
    padding: 0 20px;
    margin-bottom: 25px;
}

.stat-col {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    cursor: pointer;
    transition: transform 0.2s;
}

.stat-col:hover {
    transform: translateY(-3px);
}

.stat-label-row {
    font-size: 0.9rem;
    color: #666;
    font-weight: 500;
    display: flex;
    gap: 4px;
    align-items: center;
}

.stat-num {
    font-size: 1.2rem;
    font-weight: 700;
    color: #333;
    font-family: 'Helvetica Neue', sans-serif;
}

.friend-btn-crystal {
    width: 80%;
    margin: 0 auto;
    height: 45px;
    background: #48cbb6;
    border: none;
    border-radius: 50px;
    color: white;
    font-size: 1rem;
    font-weight: 600;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    box-shadow: 0 5px 15px rgba(72, 203, 182, 0.3);
    transition: all 0.3s;
}

.friend-btn-crystal:hover {
    background: #3bb39e;
    transform: scale(1.02);
}

/* 侧边栏头部 */
.search-card-crystal,
.recommend-card-crystal,
.tag-card-crystal {
    padding: 15px 20px;
}

.card-header-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 15px;
    border-bottom: 1px dashed rgba(0, 0, 0, 0.05);
    padding-bottom: 10px;
}

.header-title {
    font-size: 1.1rem;
    font-weight: 700;
    color: #333;
    display: flex;
    gap: 6px;
}

.mac-dots {
    display: flex;
    gap: 6px;
}

.dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
}

.red {
    background-color: #ff5f56;
}

.yellow {
    background-color: #ffbd2e;
}

.green {
    background-color: #27c93f;
}

/* 搜索框 */
.search-input-wrapper {
    position: relative;
    width: 100%;
    border: 2px solid #e0f2f1;
    border-radius: 50px;
    padding: 4px;
    background: rgba(255, 255, 255, 0.8);
    display: flex;
    align-items: center;
}

.search-input-wrapper:focus-within {
    border-color: #48cbb6;
}

.search-input-wrapper input {
    width: 100%;
    padding: 8px 15px;
    border: none;
    outline: none;
    font-size: 0.9rem;
    background: transparent;
    color: #555;
}

.search-icon-btn {
    position: absolute;
    right: 12px;
    cursor: pointer;
    opacity: 0.7;
    transition: all 0.2s;
}

.search-icon-btn:hover {
    opacity: 1;
    transform: scale(1.1);
}

/* 推荐文章 */
.recommend-list {
    display: flex;
    flex-direction: column;
    gap: 15px;
}

.recommend-item {
    display: flex;
    flex-direction: column;
    gap: 8px;
    cursor: pointer;
    padding: 10px;
    border-radius: 8px;
    transition: background 0.2s;
}

.recommend-item:hover {
    background: rgba(255, 255, 255, 0.5);
}

.rec-top-section {
    display: flex;
    gap: 12px;
    align-items: flex-start;
    position: relative;
}

.rec-thumb {
    width: 90px;
    height: 60px;
    min-height: 60px;
    max-height: 60px;
    border-radius: 6px;
    overflow: hidden;
    flex-shrink: 0;
    position: relative;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
    background: #fdfaf2;
    display: block;
    z-index: 1;
}

.rec-thumb-img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
    position: absolute;
    top: 0;
    left: 0;
}

.rec-text-only-cover {
    width: 100%;
    height: 100%;
    background: #fdfaf2;
    background-image: url('https://www.transparenttextures.com/patterns/natural-paper.png');
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    padding: 5px;
    text-align: center;
    position: absolute;
    top: 0;
    left: 0;
}

.rec-quote-mark {
    font-family: "Georgia", serif;
    font-size: 1.5rem;
    color: #d2a679;
    opacity: 0.3;
    line-height: 1;
}

.rec-text-preview {
    font-family: "STKaiti", "Georgia", serif;
    font-size: 10px;
    color: #5d4a3b;
    font-weight: 700;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
    margin-top: -5px;
}

.rec-title-box {
    flex: 1;
    min-width: 0;
    position: relative;
    z-index: 2;
}

.rec-title {
    margin: 0;
    font-size: 0.9rem;
    font-weight: 500;
    color: #333;
    line-height: 1.4;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
}

.recommend-item:hover .rec-title {
    color: #48cbb6;
}

.rec-bottom-section {
    display: flex;
    justify-content: space-between;
    font-size: 0.75rem;
    color: #999;
    margin-top: 5px;
}

.rec-updated-badge {
    position: absolute;
    top: -15px;
    right: 0;
    background: linear-gradient(90deg, #ff6b6b, #ff8e53);
    color: white;
    font-size: 0.6rem;
    padding: 1px 5px;
    border-radius: 3px;
}

/* 3D 标签云 */
.tag-cloud-3d-box {
    position: relative;
    width: 100%;
    height: 320px;
    border-radius: 12px;
    overflow: hidden;
}

.tag-pill-3d {
    position: absolute;
    display: flex;
    height: 30px;
    border-radius: 50px;
    cursor: pointer;
    user-select: none;
    background: rgba(255, 255, 255, 0.25);
    backdrop-filter: blur(4px);
    border: 1px solid rgba(255, 255, 255, 0.6);
    box-shadow: 0 4px 10px rgba(0, 0, 0, 0.05);
    will-change: transform, opacity, z-index;
}

.tag-icon-part {
    width: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(255, 255, 255, 0.5);
    border-right: 1px solid rgba(255, 255, 255, 0.3);
    border-radius: 50px 0 0 50px;
}

.tag-text-part {
    padding: 0 10px;
    display: flex;
    align-items: center;
    white-space: nowrap;
    color: var(--tag-color);
    font-size: 0.8rem;
    font-weight: 700;
    background: rgba(255, 255, 255, 0.8);
    border-radius: 0 50px 50px 0;
}

.tag-pill-3d:hover {
    z-index: 1000 !important;
    background: #fff;
}

/* 弹幕卡片 */
.barrage-card-crystal {
    background-image: url('https://4kwallpapers.com/images/wallpapers/rei-ayanami-anime-2048x2048-15720.jpg') !important;
    background-size: cover !important;
    height: 400px;
    padding: 0 !important;
    border: none;
    z-index: 1;
}

.barrage-card-crystal::before {
    content: '';
    position: absolute;
    inset: 0;
    pointer-events: none;
}

.barrage-card-crystal:hover::before {
    backdrop-filter: blur(1.5px);
}

.barrage-header {
    padding: 15px 20px;
    display: flex;
    justify-content: space-between;
    border-bottom: 1px solid rgba(105, 227, 176, 0.5);
    z-index: 2;
    position: relative;
}

.barrage-container {
    flex: 1;
    overflow: hidden;
    position: relative;
    background: transparent !important;
    z-index: 2;
}

.barrage-list-wrapper {
    animation: scroll-up 3s linear infinite;
    padding: 10px;
}

.barrage-container:hover .barrage-list-wrapper {
    animation-play-state: paused;
}

@keyframes scroll-up {
    0% {
        transform: translateY(0);
    }

    100% {
        transform: translateY(-50%);
    }
}

.barrage-item {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 12px;
    padding: 4px 10px;
    width: 100%;
}

.barrage-item:hover {
    transform: translateX(5px);
    background: rgba(255, 255, 255, 0.1) !important;
    border-radius: 8px;
}

.barrage-avatar img {
    width: 32px;
    height: 32px;
    border-radius: 50%;
    object-fit: cover;
}

.barrage-text {
    color: #ffffff;
    font-size: 0.95rem;
    font-weight: 500;
    text-shadow: 0 2px 4px rgba(0, 0, 0, 0.5);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 160px;
}

.barrage-thumb {
    width: 28px;
    height: 28px;
    border-radius: 4px;
    border: 1px solid rgba(255, 255, 255, 0.6);
    overflow: hidden;
}

.barrage-thumb img {
    width: 100%;
    height: 100%;
    object-fit: cover;
}

/* ==================== 9. 中间内容区 ==================== */
.notice-bar,
.category-bar,
.article-card,
.friend-card {
    background: #fff;
    border-radius: 12px;
    box-shadow: 0 4px 10px rgba(0, 0, 0, 0.03);
    border: 1px solid #f0f0f0;
    margin-bottom: 25px;
    transition: transform 0.3s, box-shadow 0.3s;
}

.notice-bar:hover,
.category-bar:hover,
.article-card:hover,
.friend-card:hover {
    transform: translateY(-5px);
    box-shadow: 0 10px 25px rgba(0, 0, 0, 0.08);
}

.notice-bar {
    padding: 12px 20px;
    display: flex;
    align-items: center;
    gap: 15px;
}

.notice-icon-box {
    font-weight: 700;
    color: #f6a028;
    display: flex;
    align-items: center;
}

.notice-content-wrapper {
    flex: 1;
    overflow: hidden;
    position: relative;
    height: 24px;
}

.scroll-text {
    white-space: nowrap;
    position: absolute;
    animation: scroll-left 20s linear infinite;
    color: #666;
    font-size: 0.95rem;
    line-height: 24px;
}

@keyframes scroll-left {
    0% {
        transform: translateX(100%);
    }

    100% {
        transform: translateX(-100%);
    }
}

.category-bar {
    padding: 25px 25px 20px;
    overflow-x: auto;
}

.bar-title {
    font-weight: 700;
    color: #333;
    font-size: 1.1rem;
    display: flex;
    align-items: center;
    gap: 6px;
}

.cat-list {
    display: flex;
    gap: 12px;
    padding: 5px 0;
}

.cat-item {
    position: relative;
    flex-shrink: 0;
    font-size: 1rem;
    color: #64748b;
    padding: 8px 5px;
    margin: 0 12px;
    cursor: pointer;
    user-select: none;
    display: flex;
    align-items: center;
    gap: 6px;
    font-weight: 500;
}

.cat-item::after {
    content: '';
    position: absolute;
    bottom: -2px;
    left: 0;
    width: 0;
    height: 2px;
    background: linear-gradient(90deg, #48cbb6, #34d399);
    transition: width 0.4s;
}

.cat-item.active {
    color: #48cbb6 !important;
    font-weight: 700;
}

.cat-item.active::after {
    width: 100% !important;
}

.cat-item:hover {
    color: #48cbb6;
}

.cat-item:hover::after {
    width: 100%;
}

/* 文章卡片 */
.article-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
    gap: 20px;
}

.article-card {
    overflow: hidden;
    display: flex;
    flex-direction: column;
}

.card-cover-wrapper {
    width: 100%;
    height: 140px;
    overflow: hidden;
    position: relative;
}

.card-cover-wrapper img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    transition: transform 0.6s;
}

.article-card:hover .card-cover-wrapper img {
    transform: scale(1.1);
}

.card-body-tight {
    padding: 14px;
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 6px;
}

.row-1-header {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 4px;
}

.avatar-mini-circle {
    width: 30px;
    height: 30px;
    border-radius: 50%;
    border: 1.5px solid #fff;
    box-shadow: 0 2px 5px rgba(0, 0, 0, 0.1);
    object-fit: cover;
}

.article-title-compact {
    font-size: 0.95rem;
    font-weight: 700;
    line-height: 1.3;
    color: #333;
    display: -webkit-box;
    -webkit-line-clamp: 1;
    -webkit-box-orient: vertical;
    overflow: hidden;
}

.row-2-date {
    font-size: 0.65rem;
    color: #94a3b8;
    margin-left: 40px;
    margin-top: -4px;
}

.row-3-stats-bar {
    display: flex;
    justify-content: space-around;
    align-items: center;
    background: rgba(248, 250, 252, 0.8);
    padding: 8px 5px;
    border-radius: 10px;
    margin: 10px 0;
    border: 1px solid rgba(0, 0, 0, 0.02);
}

.stat-unit {
    display: flex;
    align-items: center;
    gap: 3px;
    font-size: 0.75rem;
    font-weight: 800;
    color: #64748b;
    transition: transform 0.2s;
}

.stat-unit:hover {
    transform: scale(1.1);
}

.row-4-footer-brand {
    margin-top: auto;
    display: flex;
    justify-content: space-between;
    align-items: center;
}

.brand-tag {
    font-size: 0.75rem;
    font-weight: 900;
    color: #334155;
    font-family: 'Georgia', serif;
}

.brand-tag span {
    color: #48cbb6;
}

.btn-goto-read {
    padding: 4px 14px;
    background: #48cbb6;
    color: white;
    border: none;
    border-radius: 6px;
    font-size: 0.75rem;
    font-weight: 700;
    cursor: pointer;
    transition: all 0.3s;
    box-shadow: 0 2px 6px rgba(72, 203, 182, 0.2);
}

.btn-goto-read:hover {
    background: #36b3a2;
    transform: translateY(-2px);
    box-shadow: 0 5px 15px rgba(72, 203, 182, 0.5);
}

/* 纯文本封面 */
.text-only-cover {
    width: 100%;
    height: 100%;
    background: #fdfaf2;
    background-image: url('https://www.transparenttextures.com/patterns/natural-paper.png');
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    padding: 20px;
    text-align: center;
    border-bottom: 1px solid rgba(210, 166, 121, 0.2);
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
    font-size: 1.1rem;
    color: #5d4a3b;
    font-weight: 700;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
    margin-top: -10px;
}

/* 友链 */
.friend-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
    gap: 20px;
}

.friend-card {
    padding: 20px;
    display: flex;
    align-items: center;
    gap: 15px;
    cursor: pointer;
}

.friend-avatar {
    width: 50px;
    height: 50px;
    border-radius: 50%;
    object-fit: cover;
}

.friend-info h4 {
    margin: 0 0 5px;
    font-size: 1rem;
    color: #333;
}

.friend-info p {
    margin: 0;
    font-size: 0.8rem;
    color: #888;
}

/* 门户聚合 */
.portal-wrapper {
    display: flex;
    flex-direction: column;
    gap: 50px;
}

.section-divider {
    display: flex;
    justify-content: space-between;
    align-items: flex-end;
    margin-bottom: 25px;
    padding: 0 10px;
    border-bottom: 2px solid rgba(72, 203, 182, 0.1);
    padding-bottom: 12px;
}

.section-title {
    display: flex;
    align-items: center;
    gap: 12px;
    margin: 0;
    font-size: 1.4rem;
    font-weight: 800;
    color: #2c3e50;
}

.btn-more-link {
    background: transparent;
    border: none;
    color: #48cbb6;
    font-weight: 700;
    cursor: pointer;
}

/* 视频/音频相关 */
.video-preview-wrapper {
    position: relative;
    width: 100%;
    height: 140px;
    background: #000;
    cursor: pointer;
    overflow: hidden;
    z-index: 1;
}

.card-video-element {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
    background: #000;
    z-index: 1;
}

.video-play-overlay {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.3);
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    z-index: 10;
    pointer-events: auto;
}

.video-playing-mask {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.1);
    z-index: 3;
    cursor: pointer;
}

.video-playing-mask:hover {
    opacity: 1;
}

.play-trigger-btn {
    width: 50px;
    height: 50px;
    background: #48cbb6;
    border-radius: 50%;
    display: flex;
    justify-content: center;
    align-items: center;
    box-shadow: 0 0 20px rgba(72, 203, 182, 0.4);
    transform: scale(0.9);
    transition: all 0.3s;
}

.video-preview-wrapper:hover .play-trigger-btn {
    transform: scale(1.1);
}

.interaction-tip {
    color: rgba(255, 255, 255, 0.8);
    font-size: 0.7rem;
    margin-top: 10px;
    font-weight: bold;
}

.video-playing-indicator {
    position: absolute;
    top: 10px;
    left: 10px;
    z-index: 3;
    pointer-events: none;
}

.card-rec-indicator {
    background: rgba(0, 0, 0, 0.6);
    padding: 2px 8px;
    border-radius: 4px;
    color: #ff3b30;
    font-size: 0.65rem;
    font-weight: 700;
    display: flex;
    align-items: center;
    gap: 5px;
    backdrop-filter: blur(4px);
}

.rec-dot-small {
    width: 8px;
    height: 8px;
    background: #ff3b30;
    border-radius: 50%;
    animation: rec-blink-card 1s infinite alternate;
}

@keyframes rec-blink-card {
    from {
        opacity: 1;
    }

    to {
        opacity: 0.3;
    }
}

.video-poster-layer {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background-size: cover;
    background-position: center;
    z-index: 2;
    pointer-events: none;
}

.is-empty {
    background: transparent !important;
}

.video-empty-poster {
    width: 100%;
    height: 100%;
    display: flex;
    justify-content: center;
    align-items: center;
    background: rgba(0, 0, 0, 0.2);
}

.poster-logo {
    opacity: 0.4;
    font-family: 'Georgia', serif;
    font-size: 1.5rem;
    font-weight: 900;
    color: #48cbb6;
    letter-spacing: 4px;
}

.audio-preview-mini {
    width: 100%;
    height: 100%;
    background-color: #1a1c2c;
    /* 默认深色底 */
    background-size: cover;
    /* 背景图填充全屏 */
    background-position: center;
    display: flex;
    justify-content: center;
    align-items: center;
    position: relative;
    overflow: hidden;
    transition: all 0.5s ease;
}

/* 🔥 关键：高斯模糊遮罩层，让背景变柔和，突出中间的唱片 */
.audio-bg-blur-mask {
    position: absolute;
    inset: 0;
    background: rgba(0, 0, 0, 0.2);
    /* 半透明压暗 */
    backdrop-filter: blur(6px);
    /* 模糊像素 */
    -webkit-backdrop-filter: blur(6px);
    z-index: 1;
    /* 位于背景图之上，唱片之下 */
}

.mini-vinyl-record {
    width: 110px;
    height: 110px;
    background: radial-gradient(circle, #333 0%, #111 100%);
    border-radius: 50%;
    border: 4px solid #222;
    box-shadow: 0 0 20px rgba(0, 0, 0, 0.6);
    position: relative;
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 2;
    /* 🔥 确保唱片悬浮在模糊层上方 */
}

.mini-vinyl-record::after {
    content: '';
    position: absolute;
    inset: 0;
    border-radius: 50%;
    background: repeating-radial-gradient(circle, transparent 0, rgba(255, 255, 255, 0.03) 1px, transparent 2px);
}

.mini-vinyl-cover {
    width: 45px;
    height: 45px;
    border-radius: 50%;
    object-fit: cover;
    z-index: 2;
}

.mini-vinyl-hole {
    position: absolute;
    width: 6px;
    height: 6px;
    background: #f6f8fa;
    border-radius: 50%;
    z-index: 3;
}

.mini-vinyl-record.is-spinning {
    animation: vinyl-rotate 4s linear infinite;
}

@keyframes vinyl-rotate {
    from {
        transform: rotate(0deg);
    }

    to {
        transform: rotate(360deg);
    }
}

.audio-play-overlay {
    position: absolute;
    inset: 0;
    background: rgba(0, 0, 0, 0.2);
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 5;
    /* 最高层级 */
    cursor: pointer;
    opacity: 0;
    transition: opacity 0.3s;
}

.audio-preview-mini:hover .audio-play-overlay {
    opacity: 1;
}

.play-btn-sm {
    width: 40px;
    height: 40px;
    background: #48cbb6;
    color: white;
    border-radius: 50%;
    display: flex;
    justify-content: center;
    align-items: center;
    font-size: 1rem;
    box-shadow: 0 0 15px rgba(72, 203, 182, 0.5);
    transform: scale(0.9);
    transition: transform 0.2s;
}

.play-btn-sm:hover {
    transform: scale(1.1);
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
    display: flex;
    align-items: center;
    gap: 4px;
    z-index: 5;
    box-shadow: 0 2px 5px rgba(0, 0, 0, 0.1);
}

/* 图片预览 */
.preview-overlay {
    position: fixed;
    inset: 0;
    z-index: 9999;
    background: rgba(255, 255, 255, 0.2);
    backdrop-filter: blur(20px);
    -webkit-backdrop-filter: blur(20px);
    display: flex;
    justify-content: center;
    align-items: center;
    cursor: zoom-out;
}

.preview-wrapper {
    position: relative;
    max-width: 90%;
    max-height: 90vh;
    border-radius: 20px;
    padding: 10px;
    background: rgba(255, 255, 255, 0.3);
    border: 1px solid rgba(255, 255, 255, 0.5);
    box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
    cursor: default;
}

.preview-image-main {
    max-width: 100%;
    max-height: 80vh;
    display: block;
    border-radius: 12px;
    object-fit: contain;
}

.preview-close-btn {
    position: absolute;
    top: -40px;
    right: 0;
    width: 32px;
    height: 32px;
    background: rgba(255, 255, 255, 0.5);
    backdrop-filter: blur(5px);
    border-radius: 50%;
    display: flex;
    justify-content: center;
    align-items: center;
    color: #333;
    font-size: 18px;
    cursor: pointer;
    transition: all 0.3s;
}

.preview-close-btn:hover {
    background: #ff5f56;
    color: white;
    transform: rotate(90deg);
}

.zoom-enter-active,
.zoom-leave-active {
    transition: all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.zoom-enter-from,
.zoom-leave-to {
    opacity: 0;
    transform: scale(0.8);
}

/* 加载更多 */
.pagination-container {
    margin-top: 50px;
    margin-bottom: 30px;
    display: flex;
    justify-content: center;
    width: 100%;
}

.load-more-btn-veritas {
    padding: 12px 40px;
    background: #fff;
    color: #48cbb6;
    border: 2px solid #48cbb6;
    border-radius: 50px;
    font-size: 1rem;
    font-weight: 700;
    cursor: pointer;
    transition: all 0.3s;
    display: flex;
    align-items: center;
    box-shadow: 0 4px 15px rgba(72, 203, 182, 0.1);
}

.load-more-btn-veritas:hover:not(:disabled) {
    background: #48cbb6;
    color: #fff;
    transform: translateY(-3px);
    box-shadow: 0 8px 25px rgba(72, 203, 182, 0.3);
}

.load-more-btn-veritas:disabled {
    cursor: not-allowed;
    opacity: 0.8;
    background: #f5f5f5;
    border-color: #ddd;
    color: #999;
}

.loading-spinner-small {
    width: 18px;
    height: 18px;
    border: 2px solid rgba(72, 203, 182, 0.3);
    border-top-color: #48cbb6;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
}

.no-more-data {
    display: flex;
    align-items: center;
    gap: 15px;
    color: #b2bec3;
    font-size: 0.9rem;
    font-weight: 500;
    animation: fadeIn 0.8s ease-out;
}

.no-more-data .line {
    width: 50px;
    height: 1px;
    background: linear-gradient(90deg, transparent, #dfe6e9, transparent);
}

.loading-state {
    text-align: center;
    padding: 20px;
}

.loading-spinner {
    width: 30px;
    height: 30px;
    border: 3px solid #f3f3f3;
    border-top: 3px solid #48cbb6;
    border-radius: 50%;
    animation: spin 1s linear infinite;
    margin: 0 auto 10px;
}

@keyframes spin {
    0% {
        transform: rotate(0deg);
    }

    100% {
        transform: rotate(360deg);
    }
}

/* 搜索条 */
.search-result-bar {
    grid-column: 1 / -1;
    background: #e0f7fa;
    border: 1px solid #b2ebf2;
    border-radius: 12px;
    padding: 12px 20px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 20px;
    color: #006064;
}

.clear-search-btn {
    background: transparent;
    border: 1px solid #0097a7;
    color: #00838f;
    padding: 6px 14px;
    border-radius: 20px;
    cursor: pointer;
    font-size: 0.85rem;
    transition: all 0.3s;
}

.clear-search-btn:hover {
    background: #0097a7;
    color: white;
}

/* 移动端适配 */
@media (max-width: 900px) {
    .main-container {
        flex-direction: column;
        padding: 20px 15px 120px;
        gap: 0;
    }

    .hero-section {
        height: 40vh;
        min-height: 300px;
    }

    .main-title {
        font-size: 2.5rem;
        letter-spacing: 5px;
    }

    .sub-title {
        font-size: 1rem;
    }

    .sidebar-wrapper {
        width: 100%;
        order: 1;
        margin-bottom: 20px;
        padding: 0 10px;
        position: static;
    }

    .search-card-crystal,
    .recommend-card-crystal,
    .tag-card-crystal,
    .barrage-card-crystal {
        display: none;
    }

    .content-wrapper {
        order: 2;
        width: 100%;
    }

    .category-bar {
        padding: 15px;
        margin-bottom: 20px;
        overflow-x: auto;
        white-space: nowrap;
        -webkit-overflow-scrolling: touch;
        display: block;
    }

    .cat-list {
        flex-wrap: nowrap;
        gap: 10px;
    }

    .cat-item {
        margin: 0;
        padding: 6px 12px;
        background: #f9f9f9;
        border-radius: 20px;
        font-size: 0.9rem;
    }

    .cat-item.active {
        background: rgba(72, 203, 182, 0.1);
    }

    .article-grid {
        grid-template-columns: 1fr;
        gap: 20px;
    }

    .article-card {
        border-radius: 16px;
        box-shadow: 0 4px 15px rgba(0, 0, 0, 0.03);
    }

    .card-cover-wrapper {
        height: 200px;
    }

    .article-title-compact {
        font-size: 1.1rem;
        -webkit-line-clamp: 2;
    }
}

/* ================================================================= */
/* 🔥🔥🔥🔥🔥🔥🔥 核心：深色模式 (Dark Mode) 适配 🔥🔥🔥🔥🔥🔥🔥 */
/* ================================================================= */

:global(html.dark) .blog-page {
    background-color: #111827;
    /* 深蓝黑背景 */
    color: #e2e8f0;
}

/* 🌊 1. Hero 波浪颜色变黑 */
:global(html.dark) .wave-bottom {
    fill: #111827 !important;
    /* 必须与背景色一致 */
}

/* 📦 2. 侧边栏卡片：深色玻璃态 */
:global(html.dark) .sidebar-card,
:global(html.dark) .profile-card-crystal,
:global(html.dark) .search-card-crystal,
:global(html.dark) .recommend-card-crystal,
:global(html.dark) .tag-card-crystal {
    background: linear-gradient(180deg, rgba(30, 41, 59, 0.8) 0%, rgba(15, 23, 42, 0.9) 100%);
    border-color: rgba(255, 255, 255, 0.1);
    box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.3);
}

:global(html.dark) .profile-name {
    color: #f8fafc;
}

:global(html.dark) .stat-num {
    color: #f1f5f9;
}

:global(html.dark) .stat-label-row {
    color: #94a3b8;
}

:global(html.dark) .header-title {
    color: #f1f5f9;
}

/* 个人头像边框 */
:global(html.dark) .profile-avatar-wrapper {
    background: #1e293b;
    border-color: #475569;
}

/* 搜索框 */
:global(html.dark) .search-input-wrapper {
    background: rgba(0, 0, 0, 0.2);
    border-color: #334155;
}

:global(html.dark) .search-input-wrapper input {
    color: #e2e8f0;
}

/* 推荐文章列表 */
:global(html.dark) .recommend-item:hover {
    background: rgba(255, 255, 255, 0.05);
}

:global(html.dark) .rec-title {
    color: #e2e8f0;
}

:global(html.dark) .rec-thumb {
    background: #2d2d2d;
    box-shadow: none;
    border: 1px solid #333;
}

/* 纯文本封面反色处理 */
:global(html.dark) .rec-text-only-cover {
    background-color: #2b2b2b;
    background-image: none;
    /* 去掉纸质纹理，改用纯深色 */
    border-bottom: none;
}

:global(html.dark) .rec-text-preview {
    color: #d4af37;
}

/* 金色文字 */
:global(html.dark) .rec-quote-mark {
    color: #555;
}

/* 3D 标签云药丸 */
:global(html.dark) .tag-pill-3d {
    background: rgba(30, 41, 59, 0.6);
    border-color: rgba(255, 255, 255, 0.1);
}

:global(html.dark) .tag-icon-part {
    background: rgba(0, 0, 0, 0.3);
    border-right-color: rgba(255, 255, 255, 0.1);
}

:global(html.dark) .tag-text-part {
    background: rgba(30, 41, 59, 0.8);
    color: #cbd5e1;
}

:global(html.dark) .tag-pill-3d:hover {
    background: #1e293b;
    color: #fff;
}

/* 📢 3. 公告栏 */
:global(html.dark) .notice-bar {
    background: #1f2937;
    border-color: #374151;
    color: #e2e8f0;
}

:global(html.dark) .scroll-text {
    color: #cbd5e1;
}

/* 🧭 4. 分类栏 */
:global(html.dark) .category-bar {
    background: #1f2937;
    border-color: #374151;
}

:global(html.dark) .bar-title {
    color: #f1f5f9;
}

:global(html.dark) .cat-item {
    color: #94a3b8;
}

/* 移动端深色分类 */
:global(html.dark) .cat-item {
    background: #374151;
}

:global(html.dark) .cat-item.active {
    background: rgba(72, 203, 182, 0.2);
    color: #48cbb6;
}

/* 📝 5. 文章卡片 */
:global(html.dark) .article-card {
    background: #1f2937;
    border-color: #374151;
    box-shadow: 0 4px 10px rgba(0, 0, 0, 0.2);
}

:global(html.dark) .article-title-compact {
    color: #f1f5f9;
}

:global(html.dark) .row-3-stats-bar {
    background: rgba(0, 0, 0, 0.2);
    border-color: rgba(255, 255, 255, 0.05);
}

:global(html.dark) .stat-unit span {
    color: #cbd5e1;
}

:global(html.dark) .brand-tag {
    color: #94a3b8;
}

:global(html.dark) .avatar-mini-circle {
    border-color: #374151;
}

/* 文章卡片纯文本封面 (大图) */
:global(html.dark) .text-only-cover {
    background-color: #2b2b2b;
    background-image: none;
    border-bottom: 1px solid #333;
}

:global(html.dark) .text-preview {
    color: #e2e8f0;
}

:global(html.dark) .quote-mark {
    color: #555;
}

/* 🔄 6. 加载更多 & 底部 */
:global(html.dark) .load-more-btn-veritas {
    background: transparent;
    border-color: #48cbb6;
    color: #48cbb6;
}

:global(html.dark) .load-more-btn-veritas:hover:not(:disabled) {
    background: #48cbb6;
    color: #fff;
}

:global(html.dark) .load-more-btn-veritas:disabled {
    background: #374151;
    border-color: #4b5563;
    color: #6b7280;
}

:global(html.dark) .no-more-data {
    color: #64748b;
}

:global(html.dark) .no-more-data .line {
    background: linear-gradient(90deg, transparent, #475569, transparent);
}

/* 🔍 7. 搜索结果条 */
:global(html.dark) .search-result-bar {
    background: #134e4a;
    /* 深青色背景 */
    border-color: #115e59;
    color: #ccfbf1;
}

:global(html.dark) .clear-search-btn {
    border-color: #2dd4bf;
    color: #2dd4bf;
}

:global(html.dark) .clear-search-btn:hover {
    background: #2dd4bf;
    color: #000;
}

/* 🤝 8. 友链卡片 */
:global(html.dark) .friend-card {
    background: #1f2937;
    border-color: #374151;
}

:global(html.dark) .friend-info h4 {
    color: #f1f5f9;
}

:global(html.dark) .friend-info p {
    color: #94a3b8;
}

/* 🖼️ 9. 图片预览层 */
:global(html.dark) .preview-overlay {
    background: rgba(0, 0, 0, 0.6);
    /* 更深的遮罩 */
}

:global(html.dark) .preview-wrapper {
    background: rgba(30, 41, 59, 0.6);
    border-color: rgba(255, 255, 255, 0.2);
}

:global(html.dark) .preview-close-btn {
    background: rgba(255, 255, 255, 0.2);
    color: #fff;
}
</style>