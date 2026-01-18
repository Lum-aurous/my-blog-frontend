<script setup>
import { ref, onMounted } from 'vue'
import { api } from '@/utils/api'
import { useRouter } from 'vue-router'
import { message } from '@/utils/message'

// 引入 ECharts 核心模块
import { use } from "echarts/core";
import { CanvasRenderer } from "echarts/renderers";
import { LineChart, PieChart } from "echarts/charts"; // 🔥 引入 PieChart
import {
    GridComponent,
    TooltipComponent,
    LegendComponent,
    DataZoomComponent
} from "echarts/components";
import VChart from "vue-echarts";

// 注册组件
use([
    CanvasRenderer,
    LineChart,
    PieChart, // 🔥 注册饼图
    GridComponent,
    TooltipComponent,
    LegendComponent,
    DataZoomComponent
]);

const router = useRouter()
const isLoading = ref(true)

// 核心统计数据
const stats = ref({
    views: 0,
    totalContent: 0, // 内容总数
    comments: 0,
    // 细分数据
    articles: 0,
    videos: 0,
    audios: 0
})

// 图表配置项
const lineChartOption = ref(null) // 流量趋势
const pieChartOption = ref(null)  // 内容占比
const activeTab = ref('week')

// 1. 获取统计卡片数据 (API: /blog/stats)
const fetchStats = async () => {
    try {
        const res = await api.get('/blog/stats')
        if (res.data.success) {
            const d = res.data.data
            stats.value = {
                views: d.totalViews || 0,
                totalContent: d.totalContent || 0, // 后端算好的总数
                comments: d.totalComments || 0,
                articles: d.articleCount || 0,
                videos: d.videoCount || 0,
                audios: d.audioCount || 0
            }
        }
    } catch (e) {
        console.error("获取统计失败:", e)
    }
}

// 2. 初始化图表
const initCharts = async () => {
    let apiData = { dates: [], views: [], comments: [] }

    try {
        const res = await api.get('/admin/dashboard/trend')
        if (res.data.success) {
            apiData = {
                dates: res.data.data.dates,
                views: res.data.data.viewData,
                comments: res.data.data.commentData
            }
        }
    } catch (e) {
        console.error('图表数据加载失败', e)
        // 兜底数据...
    }

    // --- 📈 折线图：流量趋势 ---
    lineChartOption.value = {
        backgroundColor: 'transparent',
        tooltip: {
            trigger: 'axis',
            backgroundColor: 'rgba(15, 23, 42, 0.9)',
            borderColor: 'rgba(255,255,255,0.1)',
            textStyle: { color: '#e2e8f0' },
            borderWidth: 1,
            padding: [10, 15],
            axisPointer: { type: 'line', lineStyle: { color: 'rgba(255,255,255,0.2)', type: 'dashed' } }
        },
        legend: {
            data: ['访问量', '评论互动'],
            textStyle: { color: '#94a3b8' },
            bottom: 0, itemGap: 20
        },
        grid: {
            left: '2%', right: '2%', bottom: '15%', top: '10%', containLabel: true
        },
        xAxis: {
            type: 'category',
            boundaryGap: false,
            data: apiData.dates,
            axisLine: { show: false },
            axisTick: { show: false },
            axisLabel: { color: '#64748b', margin: 15 }
        },
        yAxis: {
            type: 'value',
            splitLine: { lineStyle: { color: 'rgba(255,255,255,0.05)' } },
            axisLabel: { color: '#64748b' }
        },
        series: [
            {
                name: '访问量', type: 'line', smooth: true, showSymbol: false,
                lineStyle: { width: 3, color: '#3b82f6' },
                areaStyle: {
                    opacity: 0.8,
                    color: {
                        type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
                        colorStops: [{ offset: 0, color: 'rgba(59, 130, 246, 0.3)' }, { offset: 1, color: 'rgba(59, 130, 246, 0)' }]
                    }
                },
                data: apiData.views
            },
            {
                name: '评论互动', type: 'line', smooth: true, showSymbol: false,
                lineStyle: { width: 3, color: '#10b981' },
                areaStyle: {
                    opacity: 0.8,
                    color: {
                        type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
                        colorStops: [{ offset: 0, color: 'rgba(16, 185, 129, 0.3)' }, { offset: 1, color: 'rgba(16, 185, 129, 0)' }]
                    }
                },
                data: apiData.comments
            }
        ]
    }

    // --- 🍩 饼图：内容构成 ---
    pieChartOption.value = {
        backgroundColor: 'transparent',
        tooltip: {
            trigger: 'item',
            backgroundColor: 'rgba(15, 23, 42, 0.9)',
            borderColor: 'rgba(255,255,255,0.1)',
            textStyle: { color: '#e2e8f0' },
            formatter: '{b}: {c} ({d}%)'
        },
        legend: {
            orient: 'vertical', left: 'right', top: 'center',
            textStyle: { color: '#94a3b8' },
            itemGap: 15
        },
        series: [
            {
                name: '内容分布',
                type: 'pie',
                radius: ['45%', '70%'], // 环形
                center: ['40%', '50%'],
                avoidLabelOverlap: false,
                itemStyle: {
                    borderRadius: 10,
                    borderColor: '#1e293b',
                    borderWidth: 2
                },
                label: { show: false, position: 'center' },
                emphasis: {
                    label: { show: true, fontSize: 20, fontWeight: 'bold', color: '#fff' }
                },
                labelLine: { show: false },
                data: [
                    { value: stats.value.articles, name: '文章', itemStyle: { color: '#8b5cf6' } }, // 紫色
                    { value: stats.value.videos, name: '视频', itemStyle: { color: '#f43f5e' } },  // 红色
                    { value: stats.value.audios, name: '音频', itemStyle: { color: '#f59e0b' } }   // 黄色
                ]
            }
        ]
    }
}

const switchTab = (tab) => {
    activeTab.value = tab
    message.info('切换视图功能开发中，目前展示近7天数据')
}

// 统一加载
onMounted(async () => {
    isLoading.value = true
    await fetchStats() // 先获取数据
    await initCharts() // 再渲染图表
    isLoading.value = false
})
</script>

<template>
    <div class="dashboard-container">

        <div class="welcome-bar animate__animated animate__fadeInDown">
            <div class="welcome-left">
                <h2 class="welcome-title">数据驾驶舱</h2>
                <p class="welcome-subtitle">Overview of Veritas Platform</p>
            </div>
            <div class="status-badge">
                <span class="dot pulse"></span>
                <span>System Online</span>
            </div>
        </div>

        <div class="stats-grid animate__animated animate__fadeInUp">
            <div class="stat-card card-blue">
                <div class="card-inner">
                    <div class="card-header">
                        <span class="card-label">总浏览量 (PV)</span>
                        <span class="trend up">↗ 持续增长</span>
                    </div>
                    <div class="card-value">{{ stats.views.toLocaleString() }}</div>
                    <div class="card-bg-icon">👁️</div>
                    <div class="card-progress">
                        <div class="progress-bar" style="width: 75%"></div>
                    </div>
                </div>
            </div>

            <div class="stat-card card-purple">
                <div class="card-inner">
                    <div class="card-header">
                        <span class="card-label">内容总数 (Content)</span>
                        <span class="trend">All Types</span>
                    </div>
                    <div class="card-value">{{ stats.totalContent.toLocaleString() }}</div>
                    <div class="card-bg-icon">📚</div>
                    <div class="card-progress">
                        <div class="progress-bar" style="width: 55%"></div>
                    </div>
                </div>
            </div>

            <div class="stat-card card-green">
                <div class="card-inner">
                    <div class="card-header">
                        <span class="card-label">互动评论 (Comments)</span>
                        <span class="trend up">↗ Active</span>
                    </div>
                    <div class="card-value">{{ stats.comments.toLocaleString() }}</div>
                    <div class="card-bg-icon">💬</div>
                    <div class="card-progress">
                        <div class="progress-bar" style="width: 60%"></div>
                    </div>
                </div>
            </div>

            <div class="stat-card add-card" @click="router.push('/admin/publish')">
                <div class="add-content">
                    <div class="plus-icon-circle">+</div>
                    <span class="add-text">发布新创作</span>
                </div>
                <div class="card-bg-icon">✒️</div>
            </div>
        </div>

        <div class="charts-row animate__animated animate__fadeInUp" style="animation-delay: 0.1s">

            <div class="chart-section glass-panel main-chart">
                <div class="chart-header">
                    <div class="chart-title">
                        <h3>📈 全站流量趋势</h3>
                        <small>Traffic Trends</small>
                    </div>
                    <div class="chart-tabs">
                        <button class="tab-btn" :class="{ active: activeTab === 'week' }"
                            @click="switchTab('week')">近7天</button>
                    </div>
                </div>
                <div class="chart-container" v-if="lineChartOption">
                    <v-chart class="chart" :option="lineChartOption" autoresize />
                </div>
            </div>

            <div class="chart-section glass-panel sub-chart">
                <div class="chart-header">
                    <div class="chart-title">
                        <h3>🍰 内容构成</h3>
                        <small>Composition</small>
                    </div>
                </div>
                <div class="chart-container" v-if="pieChartOption">
                    <v-chart class="chart" :option="pieChartOption" autoresize />
                </div>
                <div class="composition-list">
                    <div class="comp-item">
                        <span class="dot" style="background: #8b5cf6"></span> 文章: {{ stats.articles }}
                    </div>
                    <div class="comp-item">
                        <span class="dot" style="background: #f43f5e"></span> 视频: {{ stats.videos }}
                    </div>
                    <div class="comp-item">
                        <span class="dot" style="background: #f59e0b"></span> 音频: {{ stats.audios }}
                    </div>
                </div>
            </div>

        </div>

    </div>
</template>

<style scoped>
/* 全局容器 */
.dashboard-container {
    display: flex;
    flex-direction: column;
    gap: 25px;
    max-width: 1400px;
    margin: 0 auto;
    color: #fff;
    padding-bottom: 50px;
}

/* 1. 欢迎栏 */
.welcome-bar {
    display: flex;
    justify-content: space-between;
    align-items: flex-end;
}

.welcome-title {
    font-size: 1.8rem;
    font-weight: 800;
    letter-spacing: 1px;
    margin-bottom: 5px;
    background: linear-gradient(90deg, #fff, #94a3b8);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
}

.welcome-subtitle {
    font-size: 0.9rem;
    color: #64748b;
    font-family: monospace;
}

.status-badge {
    background: rgba(16, 185, 129, 0.1);
    border: 1px solid rgba(16, 185, 129, 0.2);
    padding: 6px 16px;
    border-radius: 50px;
    color: #10b981;
    font-size: 0.8rem;
    font-weight: 600;
    display: flex;
    align-items: center;
    gap: 8px;
}

.dot.pulse {
    width: 8px;
    height: 8px;
    background: #10b981;
    border-radius: 50%;
    box-shadow: 0 0 0 rgba(16, 185, 129, 0.4);
    animation: pulse 2s infinite;
}

@keyframes pulse {
    0% {
        box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.4);
    }

    70% {
        box-shadow: 0 0 0 10px rgba(16, 185, 129, 0);
    }

    100% {
        box-shadow: 0 0 0 0 rgba(16, 185, 129, 0);
    }
}

/* 2. 卡片网格 */
.stats-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 20px;
}

.stat-card {
    border-radius: 20px;
    position: relative;
    overflow: hidden;
    height: 160px;
    cursor: default;
    transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
    border: 1px solid rgba(255, 255, 255, 0.05);
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1);
}

.stat-card:hover {
    transform: translateY(-5px);
    box-shadow: 0 15px 30px rgba(0, 0, 0, 0.2);
}

.card-inner {
    padding: 24px;
    height: 100%;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    position: relative;
    z-index: 2;
}

.card-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
}

.card-label {
    font-size: 0.9rem;
    color: rgba(255, 255, 255, 0.7);
    font-weight: 500;
}

.trend {
    font-size: 0.75rem;
    padding: 2px 8px;
    border-radius: 4px;
    background: rgba(255, 255, 255, 0.1);
}

.trend.up {
    color: #86efac;
    background: rgba(34, 197, 94, 0.2);
}

.card-value {
    font-size: 2.8rem;
    font-weight: 800;
    color: #fff;
    letter-spacing: -1px;
    margin-top: 10px;
}

.card-bg-icon {
    position: absolute;
    right: -15px;
    bottom: -15px;
    font-size: 6rem;
    opacity: 0.1;
    transform: rotate(-15deg);
    z-index: 1;
    pointer-events: none;
}

.card-progress {
    width: 100%;
    height: 4px;
    background: rgba(255, 255, 255, 0.1);
    border-radius: 2px;
    margin-top: auto;
    overflow: hidden;
}

.progress-bar {
    height: 100%;
    background: rgba(255, 255, 255, 0.5);
    border-radius: 2px;
}

/* 颜色主题 */
.card-blue {
    background: linear-gradient(135deg, #1e3a8a 0%, #3b82f6 100%);
}

.card-purple {
    background: linear-gradient(135deg, #4c1d95 0%, #8b5cf6 100%);
}

.card-green {
    background: linear-gradient(135deg, #064e3b 0%, #10b981 100%);
}

/* 添加按钮 */
.add-card {
    background: rgba(255, 255, 255, 0.03);
    border: 2px dashed rgba(255, 255, 255, 0.2);
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
}

.add-card:hover {
    border-color: #f43f5e;
    background: rgba(244, 63, 94, 0.05);
}

.add-content {
    text-align: center;
    z-index: 2;
}

.plus-icon-circle {
    width: 48px;
    height: 48px;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.1);
    font-size: 2rem;
    display: flex;
    align-items: center;
    justify-content: center;
    margin: 0 auto 10px;
    transition: all 0.3s;
}

.add-card:hover .plus-icon-circle {
    background: #f43f5e;
    transform: rotate(90deg);
}

.add-text {
    font-weight: 600;
    color: #94a3b8;
    transition: color 0.3s;
}

.add-card:hover .add-text {
    color: #fff;
}

/* 3. 图表区域 (左右布局) */
.charts-row {
    display: flex;
    gap: 20px;
}

.glass-panel {
    background: rgba(30, 41, 59, 0.4);
    border-radius: 20px;
    padding: 25px;
    border: 1px solid rgba(255, 255, 255, 0.05);
    backdrop-filter: blur(20px);
    box-shadow: 0 4px 30px rgba(0, 0, 0, 0.1);
}

.main-chart {
    flex: 2;
    display: flex;
    flex-direction: column;
}

.sub-chart {
    flex: 1;
    /* 右侧窄 */
    display: flex;
    flex-direction: column;
}

.chart-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 20px;
}

.chart-title h3 {
    font-size: 1.1rem;
    color: #fff;
    margin-bottom: 2px;
}

.chart-title small {
    color: #64748b;
    font-size: 0.75rem;
}

.chart-tabs {
    background: rgba(0, 0, 0, 0.3);
    padding: 3px;
    border-radius: 6px;
}

.tab-btn {
    padding: 4px 12px;
    border-radius: 4px;
    border: none;
    background: transparent;
    color: #64748b;
    font-size: 0.75rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.3s;
}

.tab-btn.active {
    background: #3b82f6;
    color: #fff;
}

.chart-container {
    width: 100%;
    height: 350px !important; /* 使用 !important 确保不被覆盖 */
    position: relative;
    overflow: hidden;
    margin-top: 15px;
}

/* 1. 给图表外层面板设置最小高度，确保 Flex 布局下有空间 */
.chart-section {
    display: flex;
    flex-direction: column;
    min-height: 450px; /* 🔥 关键：强制给一个最小高度 */
}

.chart {
    width: 100%;
    height: 100%;
    min-height: 350px; /* 双重保险 */
}

/* 内容构成详情列表 */
.composition-list {
    display: flex;
    justify-content: space-around;
    margin-top: 10px;
    padding-top: 15px;
    border-top: 1px solid rgba(255, 255, 255, 0.05);
}

.comp-item {
    font-size: 0.85rem;
    color: #94a3b8;
    display: flex;
    align-items: center;
    gap: 6px;
}

.comp-item .dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
}

/* 响应式 */
@media (max-width: 1200px) {
    .stats-grid {
        grid-template-columns: repeat(2, 1fr);
    }

    .charts-row {
        flex-direction: column;
    }

    /* 小屏变上下 */
    .main-chart,
    .sub-chart {
        width: 100%;
    }
}

@media (max-width: 768px) {
    .stats-grid {
        grid-template-columns: 1fr;
    }

    .welcome-bar {
        flex-direction: column;
        align-items: flex-start;
        gap: 10px;
    }
}
</style>