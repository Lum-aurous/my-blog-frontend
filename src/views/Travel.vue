<script setup>
import { ref, onMounted, onUnmounted, watch, computed } from 'vue'
import { useRouter } from 'vue-router'
import { api } from '@/utils/api'
import * as echarts from 'echarts/core';
import { MapChart, ScatterChart, EffectScatterChart } from 'echarts/charts';
import { TooltipComponent, GeoComponent, TitleComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import { useThemeStore } from '@/stores/theme' // 🔥 引入主题 Store
import worldMapJson from '@/assets/maps/world.json'

const themeStore = useThemeStore() // 🔥 初始化 themeStore
const isDark = computed(() => themeStore.isDark) // 🔥 响应式获取深色模式状态

// 注册 ECharts 组件
echarts.use([MapChart, ScatterChart, EffectScatterChart, TooltipComponent, GeoComponent, CanvasRenderer, TitleComponent]);

const router = useRouter()
const isLoading = ref(true)
const travelList = ref([])
const page = ref(1)
const hasMore = ref(true)
const mapContainer = ref(null)
let myChart = null

const activeContinent = ref('全部足迹')
const searchLocation = ref('')

const continents = [
    { name: '全部足迹', key: '' },
    { name: '亚洲', key: '亚洲' },
    { name: '欧洲', key: '欧洲' },
    { name: '北美洲', key: '北美洲' },
    { name: '南美洲', key: '南美洲' },
    { name: '非洲', key: '非洲' },
    { name: '大洋洲', key: '大洋洲' },
    { name: '南极洲', key: '南极洲' }
]

// 默认图配置
const DEFAULT_AVATAR = 'https://api.dicebear.com/7.x/avataaars/svg?seed=Felix';
const DEFAULT_COVER = 'https://images.unsplash.com/photo-1476514525535-07fb3b4ae5f1?w=500';

const getAvatarUrl = (url) => {
    if (!url || url === 'null' || url === 'undefined' || url.trim() === '') return DEFAULT_AVATAR;
    if (url.startsWith('http') || url.startsWith('data:')) return url;
    return `/api/proxy-image?url=${encodeURIComponent(url)}`; // 建议统一走代理或直接拼接
}

// ✅ 修复版 getCoverUrl (Travel.vue)
const getCoverUrl = (url) => {
    // 1. 空值检查
    if (!url || url === 'null' || url === 'undefined' || typeof url !== 'string' || url.trim() === '') {
        return DEFAULT_COVER;
    }

    // 2. 如果是完整链接 (http/https) 或 base64，直接返回
    if (url.startsWith('http') || url.startsWith('data:')) {
        return url;
    }

    // 3. 🔥🔥🔥 核心修复：清洗路径 (去空格，替换 Windows 反斜杠) 🔥🔥🔥
    let cleanPath = url.trim().replace(/\\/g, '/');

    // 4. 补全 /uploads/ 前缀
    if (!cleanPath.startsWith('/') && !cleanPath.includes('uploads/')) {
        cleanPath = '/uploads/' + cleanPath;
    } else if (!cleanPath.startsWith('/')) {
        cleanPath = '/' + cleanPath;
    }

    // 5. 拼接后端地址
    // 你的 .env.production 已经配置了 https://iveritas.cn，这里会自动读取！
    const apiBase = import.meta.env.VITE_API_TARGET || 'http://localhost:3000';

    // 移除 apiBase 末尾可能的斜杠
    const finalBase = apiBase.endsWith('/') ? apiBase.slice(0, -1) : apiBase;

    return `${finalBase}${cleanPath}`;
}

const handleAvatarError = (e) => {
    if (e.target.src !== DEFAULT_AVATAR) e.target.src = DEFAULT_AVATAR;
}

const formatCount = (count) => {
    if (!count) return '0';
    const num = Number(count);
    return num >= 1000 ? (num / 1000).toFixed(1) + 'k' : num;
}

const fetchFootprints = async () => {
    const res = await api.get('/articles/footprints')
    if (!res.data.success || !myChart) return

    const points = res.data.data.filter(
        p =>
            Array.isArray(p.value) &&
            p.value.length === 2 &&
            !isNaN(p.value[0]) &&
            !isNaN(p.value[1])
    )

    myChart.setOption({
        series: [{ data: points }]
    })
}

const getMapOptions = () => {
    const colors = isDark.value
        ? {
            area: '#1e293b',
            border: '#334155',
            hover: '#334155',
            text: '#f1f5f9',
            subText: '#94a3b8',
            tooltipBg: 'rgba(30,41,59,.9)'
        }
        : {
            area: '#e9ecef',
            border: '#ffffff',
            hover: '#dee2e6',
            text: '#2c3e50',
            subText: '#555',
            tooltipBg: 'rgba(255,255,255,.9)'
        }

    return {
        backgroundColor: 'transparent',
        tooltip: {
            trigger: 'item',
            padding: 0,
            borderWidth: 0,
            backgroundColor: 'transparent',
            formatter: (params) => {
                if (params.seriesType !== 'effectScatter') return ''
                const { name, info } = params.data
                return `
          <div style="
            background:${colors.tooltipBg};
            backdrop-filter:blur(12px);
            padding:12px 16px;
            border-radius:12px;
            min-width:160px;
            box-shadow:0 10px 30px rgba(0,0,0,.25);
          ">
            <div style="font-size:15px;font-weight:700;color:${colors.text}">
              📍 ${name}
            </div>
            <div style="margin-top:4px;font-size:13px;color:${colors.subText}">
              "${info.title}"
            </div>
            <div style="margin-top:6px;font-size:10px;color:#42b883;font-weight:700;">
              点击查看游记 →
            </div>
          </div>
        `
            }
        },
        geo: {
            map: 'world',
            roam: true,
            zoom: 1.25,
            center: [15, 30],
            itemStyle: {
                areaColor: colors.area,
                borderColor: colors.border,
                borderWidth: 1.5
            },
            emphasis: {
                itemStyle: {
                    areaColor: colors.hover
                }
            }
        },
        series: [
            {
                type: 'effectScatter',
                coordinateSystem: 'geo',
                data: [],
                symbolSize: 12,
                rippleEffect: {
                    scale: 5,
                    brushType: 'stroke'
                },
                itemStyle: {
                    color: '#42b883',
                    shadowBlur: 20,
                    shadowColor: 'rgba(66,184,131,.5)'
                }
            }
        ]
    }
}

const initMap = async () => {
    if (!mapContainer.value) return

    myChart = echarts.init(mapContainer.value)
    echarts.registerMap('world', worldMapJson)

    myChart.setOption(getMapOptions())

    myChart.on('click', (params) => {
        if (params.seriesType !== 'effectScatter') return
        searchLocation.value = params.name
        activeContinent.value = ''
        fetchTravelogs()
        document
            .querySelector('.travel-content-container')
            ?.scrollIntoView({ behavior: 'smooth' })
    })

    await fetchFootprints()
    window.addEventListener('resize', resizeMap)
}

const resizeMap = () => chart && chart.resize()

const fetchTravelogs = async (loadMore = false) => {
    if (!loadMore) {
        page.value = 1
        travelList.value = []
        isLoading.value = true
    }

    const params = {
        category: '游记',
        page: page.value,
        limit: 12
    }

    if (searchLocation.value) params.location = searchLocation.value
    else if (activeContinent.value && activeContinent.value !== '全部足迹')
        params.continent = activeContinent.value

    const res = await api.get('/articles', { params })
    if (!res.data.success) return

    const list = res.data.data.list
    travelList.value = loadMore
        ? [...travelList.value, ...list]
        : list

    hasMore.value = list.length >= 12
    isLoading.value = false
}

const handleFilterChange = (continentName) => {
    if (activeContinent.value === continentName && !searchLocation.value) return;
    activeContinent.value = continentName;
    searchLocation.value = ''; // 切换大洲时清除具体地点筛选
    fetchTravelogs();
}

const clearLocationFilter = () => {
    searchLocation.value = '';
    activeContinent.value = '全部足迹'; // 重置为全部
    fetchTravelogs();
}

const loadMore = () => {
    if (!hasMore.value) return;
    page.value++;
    fetchTravelogs(true);
}

const goToDetail = (id) => {
    router.push(`/article/${id}`);
}

const goToProfile = (username) => {
    if (username) router.push(`/profile/${username}`);
}

// 🔥 监听主题变化，动态刷新地图颜色
watch(isDark, () => {
    if (myChart) {
        // 获取最新的深色/浅色配置
        const newOptions = getMapOptions();

        // 🔥 关键：设置第二个参数为 true (notMerge)，或者只更新样式部分
        // 这里我们只更新 series 和 geo 样式，避免整个重绘闪烁
        myChart.setOption({
            geo: newOptions.geo,
            series: newOptions.series,
            tooltip: newOptions.tooltip
        });

        // 同时更新加载动画的颜色
        if (isDark.value) {
            myChart.showLoading({ color: '#42b883', textColor: '#ccc', maskColor: 'rgba(15, 23, 42, 0.8)' });
        } else {
            myChart.showLoading({ color: '#42b883', textColor: '#42b883', maskColor: 'rgba(255, 255, 255, 0.8)' });
        }
        myChart.hideLoading(); // 刷新样式后记得隐藏
    }
});

onMounted(() => {
    fetchTravelogs();
    // 延迟加载地图，确保容器已渲染
    setTimeout(() => initMap(), 100);
});

onUnmounted(() => {
    if (myChart) { myChart.dispose(); myChart = null; }
});
</script>

<template>
    <div class="travel-page-elegant">
        <header class="map-hero-section">
            <div class="echarts-map" ref="mapContainer"></div>

            <div class="hero-mask top"></div>
            <div class="hero-mask bottom"></div>

            <div class="hero-content">
                <h1 class="hero-title animate__animated animate__fadeInDown">Global Footprints</h1>
                <div class="hero-divider animate__animated animate__zoomIn"></div>
                <p class="hero-subtitle animate__animated animate__fadeInUp">
                    脚步丈量世界，灵魂记录永恒。<br>
                    <span class="small-text">探索未知的每一个角落。</span>
                </p>
            </div>
        </header>

        <main class="travel-content-container">

            <div class="sticky-nav-wrapper animate__animated animate__fadeIn">
                <div v-if="searchLocation" class="active-location-filter">
                    <span class="filter-text">正在查看：</span>
                    <span class="filter-tag">
                        📍 {{ searchLocation }}
                        <button class="close-tag-btn" @click="clearLocationFilter">×</button>
                    </span>
                </div>

                <div v-else class="continent-nav-scroll">
                    <div v-for="item in continents" :key="item.name" class="nav-pill"
                        :class="{ active: activeContinent === item.name }" @click="handleFilterChange(item.name)">
                        {{ item.name }}
                    </div>
                </div>
            </div>

            <div v-if="isLoading && page === 1" class="masonry-grid">
                <div v-for="n in 4" :key="n" class="masonry-item">
                    <div class="skeleton-card">
                        <div class="sk-img"></div>
                        <div class="sk-content">
                            <div class="sk-line title"></div>
                            <div class="sk-line meta"></div>
                        </div>
                    </div>
                </div>
            </div>

            <div v-else-if="travelList.length > 0" class="masonry-grid animate__animated animate__fadeInUp">
                <div v-for="item in travelList" :key="item.id" class="masonry-item" @click="goToDetail(item.id)">
                    <div class="travel-card-elegant">
                        <div class="card-image-box">
                            <img :src="getCoverUrl(item.cover_image)" loading="lazy" alt="cover"
                                @error="handleAvatarError">
                            <div class="geo-tag">
                                📍 {{ item.location || item.continent || 'Somewhere' }}
                            </div>
                            <div class="overlay-gradient"></div>
                        </div>

                        <div class="card-body">
                            <h3 class="travel-title">{{ item.title }}</h3>

                            <div class="travel-meta">
                                <div class="author-info" @click.stop="goToProfile(item.author_username)">
                                    <img :src="getAvatarUrl(item.author_avatar)" class="avatar-mini">
                                    <span>{{ item.author_name || item.author_username }}</span>
                                </div>
                                <span class="post-date">{{ new Date(item.created_at).toLocaleDateString() }}</span>
                            </div>

                            <div class="travel-stats">
                                <span>👁️ {{ formatCount(item.views) }}</span>
                                <span>❤️ {{ formatCount(item.likes) }}</span>
                                <span>💬 {{ formatCount(item.comments) }}</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div v-else class="empty-state-elegant">
                <div class="compass-icon">🧭</div>
                <p>这片区域还未留下足迹...</p>
                <button class="reset-btn" @click="clearLocationFilter">查看全部世界</button>
            </div>

            <div v-if="travelList.length > 0 && hasMore" class="load-more-container">
                <button class="elegant-load-btn" @click="loadMore" :disabled="isLoading">
                    {{ isLoading ? 'Loading...' : 'Discover More' }}
                </button>
            </div>
            <div v-if="travelList.length > 0 && !hasMore" class="end-mark">
                ~ The End of the Journey ~
            </div>
        </main>
    </div>
</template>

<style scoped>
/* 引入谷歌字体 */
@import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,700;1,400&family=Noto+Serif+SC:wght@400;700&display=swap');

.travel-page-elegant {
    /* 🔥 替换硬编码颜色 */
    background-color: var(--bg-body);
    min-height: 100vh;
    font-family: 'Helvetica Neue', Helvetica, 'PingFang SC', sans-serif;
    color: var(--text-primary);
    /* 🔥 使用变量 */
    overflow-x: hidden;
    transition: background-color 0.3s ease, color 0.3s ease;
}

/* ==================== 🌍 地图 Hero 区域 ==================== */
.map-hero-section {
    position: relative;
    width: 100%;
    height: 85vh;
    min-height: 600px;
    /* 🔥 浅色渐变 */
    background: linear-gradient(to bottom, #eef2f3, #eef6fc);
    overflow: hidden;
}

/* 🔥 深色模式下的 Hero 背景 */
:global(html.dark) .map-hero-section {
    background: linear-gradient(to bottom, #0f172a, #1e293b) !important;
}

.echarts-map {
    width: 100%;
    height: 100%;
}

.hero-mask {
    position: absolute;
    left: 0;
    width: 100%;
    height: 150px;
    pointer-events: none;
    z-index: 5;
    transition: background 0.3s ease;
}

/* 🔥 遮罩层适配：使用 CSS 变量可能无法完美处理 linear-gradient，
   这里分别定义深浅模式的遮罩 */
.hero-mask.top {
    top: 0;
    background: linear-gradient(to bottom, var(--bg-body), transparent);
    opacity: 0.8;
}

.hero-mask.bottom {
    bottom: 0;
    background: linear-gradient(to top, var(--bg-body), transparent);
}

.hero-content {
    position: absolute;
    top: 42%;
    left: 50%;
    transform: translate(-50%, -50%);
    text-align: center;
    z-index: 10;
    pointer-events: none;
    text-shadow: 0 10px 30px rgba(255, 255, 255, 0.8);
    width: 90%;
}

/* 深色模式去除文字白光晕，改用深色阴影 */
:global(html.dark) .hero-content {
    text-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
}

.hero-title {
    font-family: 'Playfair Display', serif;
    font-size: 4.5rem;
    font-weight: 700;
    color: var(--text-primary);
    margin: 0;
    letter-spacing: 2px;
    line-height: 1.1;
    /* 默认浅色模式阴影：轻柔 */
    text-shadow: 0 4px 10px rgba(0, 0, 0, 0.1);
    transition: color 0.3s, text-shadow 0.3s;
}

/* 🔥 专门针对深色模式的增强 */
:global(html.dark) .hero-title {
    color: #ffffff !important;
    /* 核心修复：加重黑色阴影！就算背景是白的，白字带黑边也能看清 */
    text-shadow: 0 2px 15px rgba(0, 0, 0, 0.8), 0 0 5px rgba(0, 0, 0, 0.5);
}

.hero-divider {
    width: 60px;
    height: 4px;
    background: var(--accent-color);
    /* 🔥 变量 */
    margin: 20px auto;
    border-radius: 2px;
}

.hero-subtitle {
    font-family: 'Noto Serif SC', serif;
    font-size: 1.2rem;
    color: var(--text-secondary);
    /* 🔥 变量 */
    line-height: 1.6;
    font-weight: 400;
    transition: color 0.3s;
}

:global(html.dark) .hero-subtitle {
    color: #e2e8f0 !important;
    /* 副标题也加一点阴影 */
    text-shadow: 0 1px 4px rgba(0, 0, 0, 0.6);
}

.small-text {
    font-size: 0.9rem;
    color: var(--text-tertiary);
    /* 🔥 变量 */
    letter-spacing: 2px;
    text-transform: uppercase;
    display: block;
    margin-top: 5px;
}

/* ==================== 📜 内容区域 ==================== */
.travel-content-container {
    max-width: 1400px;
    margin: 0 auto;
    padding: 0 20px 80px;
    position: relative;
    z-index: 20;
    margin-top: -60px;
}

/* ==================== 🧭 粘性导航 (Sticky Nav) ==================== */
.sticky-nav-wrapper {
    position: sticky;
    top: 20px;
    z-index: 100;
    margin-bottom: 40px;
    display: flex;
    justify-content: center;
    transition: all 0.3s ease;
}

.continent-nav-scroll {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    padding: 10px 15px;
    /* 🔥 玻璃拟态适配深色模式 */
    background: var(--glass-bg);
    backdrop-filter: blur(16px);
    border: 1px solid var(--glass-border);
    border-radius: 50px;
    box-shadow: var(--glass-shadow);
    transition: all 0.3s;
}

.nav-pill {
    padding: 8px 24px;
    border-radius: 30px;
    font-size: 0.95rem;
    color: var(--text-secondary);
    /* 🔥 变量 */
    cursor: pointer;
    transition: all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);
    font-weight: 600;
    border: 1px solid transparent;
    white-space: nowrap;
}

.nav-pill:hover {
    color: var(--accent-color);
    background: rgba(66, 184, 131, 0.08);
}

/* 深色模式 Hover 微调 */
:global(html.dark) .nav-pill:hover {
    background: rgba(66, 184, 131, 0.2);
}

.nav-pill.active {
    background: var(--accent-color);
    color: #fff;
    box-shadow: 0 4px 12px rgba(66, 184, 131, 0.3);
}

/* 选中地点的样式 */
.active-location-filter {
    background: var(--bg-surface);
    /* 🔥 变量 */
    padding: 10px 25px;
    border-radius: 50px;
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.08);
    display: flex;
    align-items: center;
    gap: 10px;
    border: 1px solid var(--glass-border);
    /* 🔥 变量 */
}

.filter-text {
    font-size: 0.9rem;
    color: var(--text-tertiary);
    /* 🔥 变量 */
}

.filter-tag {
    background: rgba(66, 184, 131, 0.1);
    color: var(--accent-color);
    padding: 6px 16px;
    border-radius: 20px;
    font-weight: 700;
    display: flex;
    align-items: center;
    gap: 8px;
}

.close-tag-btn {
    background: none;
    border: none;
    color: var(--accent-color);
    font-size: 1.1rem;
    cursor: pointer;
    padding: 0;
    line-height: 1;
}

/* ==================== 📦 骨架屏 ==================== */
.skeleton-card {
    background: var(--bg-surface);
    /* 🔥 变量 */
    border-radius: 12px;
    overflow: hidden;
    height: 320px;
    box-shadow: 0 4px 10px rgba(0, 0, 0, 0.03);
}

.sk-img {
    width: 100%;
    height: 200px;
    background: var(--bg-elevated);
    /* 🔥 变量 */
    animation: pulse 1.5s infinite;
}

.sk-content {
    padding: 20px;
}

.sk-line {
    height: 16px;
    background: var(--bg-elevated);
    /* 🔥 变量 */
    margin-bottom: 10px;
    border-radius: 4px;
    animation: pulse 1.5s infinite;
}

.sk-line.title {
    width: 70%;
    height: 24px;
    margin-bottom: 15px;
}

.sk-line.meta {
    width: 40%;
}

@keyframes pulse {
    0% {
        opacity: 0.6;
    }

    50% {
        opacity: 1;
    }

    100% {
        opacity: 0.6;
    }
}

/* ==================== 🖼️ 瀑布流 & 杂志风卡片 ==================== */
.masonry-grid {
    column-count: 4;
    column-gap: 30px;
}

.masonry-item {
    break-inside: avoid;
    margin-bottom: 30px;
}

.travel-card-elegant {
    background: var(--bg-surface);
    /* 🔥 变量 */
    border-radius: 0;
    overflow: hidden;
    cursor: pointer;
    transition: all 0.4s ease;
    box-shadow: var(--shadow-neumorphism-light);
    /* 🔥 变量 */
    position: relative;
    border: 1px solid var(--glass-border);
    /* 🔥 变量 */
}

/* 深色模式下移除亮色阴影，使用更沉稳的背景 */
:global(html.dark) .travel-card-elegant {
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3);
    border: 1px solid rgba(255, 255, 255, 0.05);
}

.travel-card-elegant:hover {
    transform: translateY(-8px);
    box-shadow: 0 20px 50px rgba(0, 0, 0, 0.15);
    /* 加深阴影适配所有模式 */
}

:global(html.dark) .travel-card-elegant:hover {
    box-shadow: 0 20px 50px rgba(0, 0, 0, 0.5);
}

.card-image-box {
    position: relative;
    overflow: hidden;
}

.card-image-box img {
    width: 100%;
    height: auto;
    display: block;
    transition: transform 0.8s ease;
}

.travel-card-elegant:hover .card-image-box img {
    transform: scale(1.05);
}

.geo-tag {
    position: absolute;
    top: 15px;
    left: 15px;
    background: rgba(0, 0, 0, 0.6);
    backdrop-filter: blur(8px);
    color: #fff;
    padding: 6px 14px;
    border-radius: 4px;
    font-size: 0.75rem;
    font-weight: 600;
    letter-spacing: 1px;
    text-transform: uppercase;
    z-index: 2;
    border: 1px solid rgba(255, 255, 255, 0.2);
}

.overlay-gradient {
    position: absolute;
    bottom: 0;
    left: 0;
    width: 100%;
    height: 30%;
    background: linear-gradient(to top, rgba(0, 0, 0, 0.3), transparent);
    /* 稍微加深一点适应深色 */
    pointer-events: none;
}

.card-body {
    padding: 24px 20px;
}

.travel-title {
    font-family: 'Noto Serif SC', serif;
    font-size: 1.25rem;
    font-weight: 700;
    color: var(--text-primary);
    /* 🔥 变量 */
    margin: 0 0 15px;
    line-height: 1.4;
    transition: color 0.3s;
}

.travel-card-elegant:hover .travel-title {
    color: var(--accent-color);
}

.travel-meta {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 20px;
    border-bottom: 1px solid var(--input-border);
    /* 🔥 变量 */
    padding-bottom: 15px;
}

.author-info {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 0.85rem;
    color: var(--text-secondary);
    /* 🔥 变量 */
    font-weight: 500;
}

.avatar-mini {
    width: 24px;
    height: 24px;
    border-radius: 50%;
    object-fit: cover;
}

.post-date {
    font-family: 'Playfair Display', serif;
    font-size: 0.85rem;
    color: var(--text-tertiary);
    /* 🔥 变量 */
    font-style: italic;
}

.travel-stats {
    display: flex;
    gap: 15px;
    font-size: 0.8rem;
    color: var(--text-tertiary);
    /* 🔥 变量 */
}

/* ==================== 🍂 其他状态 ==================== */
.empty-state-elegant {
    text-align: center;
    padding: 120px 0;
    color: var(--text-tertiary);
    /* 🔥 变量 */
}

.compass-icon {
    font-size: 4rem;
    margin-bottom: 20px;
    opacity: 0.5;
}

.reset-btn {
    margin-top: 20px;
    padding: 10px 30px;
    background: var(--bg-surface);
    /* 🔥 变量 */
    border: 1px solid var(--input-border);
    /* 🔥 变量 */
    border-radius: 30px;
    color: var(--text-secondary);
    /* 🔥 变量 */
    cursor: pointer;
    transition: 0.3s;
}

.reset-btn:hover {
    border-color: var(--accent-color);
    color: var(--accent-color);
}

.load-more-container {
    text-align: center;
    margin-top: 60px;
}

.elegant-load-btn {
    padding: 14px 50px;
    background: var(--bg-elevated);
    /* 🔥 变量：深色模式下稍微亮一点，浅色模式下暗一点 */
    color: var(--text-primary);
    border: 1px solid var(--input-border);
    font-family: 'Playfair Display', serif;
    font-size: 1rem;
    letter-spacing: 2px;
    cursor: pointer;
    transition: all 0.3s;
    box-shadow: var(--shadow-neumorphism-light);
}

.elegant-load-btn:hover {
    background: var(--bg-surface);
    transform: translateY(-3px);
    box-shadow: var(--shadow-neumorphism-dark);
}

.end-mark {
    text-align: center;
    margin-top: 60px;
    font-family: 'Playfair Display', serif;
    font-style: italic;
    color: var(--text-tertiary);
    /* 🔥 变量 */
    font-size: 1rem;
}

/* ==================== 📱 移动端极致适配 (Mobile Only) ==================== */
@media (max-width: 1200px) {
    .masonry-grid {
        column-count: 3;
    }
}

@media (max-width: 900px) {
    .masonry-grid {
        column-count: 2;
    }

    .hero-title {
        font-size: 3rem;
    }
}

/* 🔥 手机端专属优化 🔥 */
@media (max-width: 600px) {

    /* 1. 地图 Hero 高度减小 */
    .map-hero-section {
        height: 55vh;
        min-height: 400px;
    }

    .hero-title {
        font-size: 2.5rem;
        letter-spacing: 1px;
    }

    .hero-subtitle {
        font-size: 1rem;
        padding: 0 10px;
    }

    .hero-mask.bottom {
        height: 80px;
    }

    /* 2. 粘性导航栏变身为：横向滑动条 */
    .sticky-nav-wrapper {
        width: 100vw;
        left: 0;
        top: 10px;
        margin-left: -20px;
        justify-content: flex-start;
        padding: 0 10px;
        margin-bottom: 20px;
    }

    .continent-nav-scroll {
        width: 100%;
        display: flex;
        flex-wrap: nowrap;
        overflow-x: auto;
        -webkit-overflow-scrolling: touch;
        gap: 10px;
        padding: 8px 10px;
        background: var(--glass-bg);
        /* 🔥 变量 */
        border-radius: 0;
        border: none;
        border-bottom: 1px solid var(--input-border);
        /* 🔥 变量 */
        box-shadow: none;
    }

    /* 隐藏滚动条 */
    .continent-nav-scroll::-webkit-scrollbar {
        display: none;
    }

    .nav-pill {
        flex-shrink: 0;
        padding: 6px 16px;
        font-size: 0.85rem;
    }

    /* 3. 内容区边距调整 */
    .travel-content-container {
        padding: 0 15px 60px;
        margin-top: -40px;
    }

    /* 4. 瀑布流单列展示 */
    .masonry-grid {
        column-count: 1;
        column-gap: 0;
    }

    .masonry-item {
        margin-bottom: 25px;
    }

    .travel-card-elegant {
        box-shadow: 0 5px 20px rgba(0, 0, 0, 0.05);
    }

    /* 深色模式下阴影 */
    :global(html.dark) .travel-card-elegant {
        box-shadow: 0 5px 20px rgba(0, 0, 0, 0.3);
    }

    .card-image-box img {
        min-height: 220px;
        object-fit: cover;
    }

    .card-body {
        padding: 18px 15px;
    }

    .travel-title {
        font-size: 1.15rem;
    }
}
</style>