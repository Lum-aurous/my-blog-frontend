<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { message } from '@/utils/message'
import { api } from '@/utils/api'

const emit = defineEmits(['close'])

const tools = ref([])
const isLoading = ref(true)
const activeModal = ref(null) // 'pomodoro', 'password', 'color'

// ==================== 1. 数据获取 ====================
const fetchTools = async () => {
    try {
        const res = await api.get('/tools')
        if (res.data.success) {
            tools.value = res.data.data
        }
    } catch (e) {
        console.error('获取工具失败', e)
    } finally {
        isLoading.value = false
    }
}

// ==================== 2. 内部工具逻辑 ====================

// --- 🍅 专注时钟 (重构版) ---
const timer = ref(null)
const defaultTime = 25 * 60
const timeLeft = ref(defaultTime)
const isTimerRunning = ref(false)
const timerMode = ref('focus') // 'focus' | 'break'
const progress = ref(100) // 进度条百分比

const toggleTimer = () => {
    if (isTimerRunning.value) {
        // 暂停
        clearInterval(timer.value)
        isTimerRunning.value = false
    } else {
        // 开始
        isTimerRunning.value = true
        timer.value = setInterval(() => {
            if (timeLeft.value > 0) {
                timeLeft.value--
                // 计算进度条 (剩余时间 / 总时间)
                const total = timerMode.value === 'focus' ? 25 * 60 : 5 * 60
                progress.value = (timeLeft.value / total) * 100
            } else {
                // 时间到
                clearInterval(timer.value)
                isTimerRunning.value = false
                const nextMode = timerMode.value === 'focus' ? 'break' : 'focus'
                message.success(timerMode.value === 'focus' ? '专注完成，休息一下吧！☕' : '休息结束，加油工作！💪')

                // 切换模式
                timerMode.value = nextMode
                timeLeft.value = nextMode === 'focus' ? 25 * 60 : 5 * 60
                progress.value = 100
            }
        }, 1000)
    }
}

const resetTimer = () => {
    clearInterval(timer.value)
    isTimerRunning.value = false
    timerMode.value = 'focus'
    timeLeft.value = defaultTime
    progress.value = 100
}

const formatTime = (seconds) => {
    const m = Math.floor(seconds / 60).toString().padStart(2, '0')
    const s = (seconds % 60).toString().padStart(2, '0')
    return `${m}:${s}`
}

// --- 🔐 密码生成器 ---
const passwordResult = ref('')
const passLength = ref(16)
const generatePassword = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()_+'
    let res = ''
    for (let i = 0; i < passLength.value; i++) res += chars.charAt(Math.floor(Math.random() * chars.length))
    passwordResult.value = res
}
const copyPass = () => {
    if (!passwordResult.value) return generatePassword()
    navigator.clipboard.writeText(passwordResult.value)
    message.success('密码已复制')
}

// --- 🎨 配色灵感 ---
const colors = ref([])
const generateColors = () => {
    colors.value = Array(5).fill(0).map(() => '#' + Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0'))
}
const copyColor = (c) => {
    navigator.clipboard.writeText(c)
    message.success(`色值 ${c} 已复制`)
}

// ==================== 3. 交互控制 ====================
const openTool = (tool) => {
    if (tool.type === 'external') {
        window.open(tool.url, '_blank')
    } else {
        // 强制重置状态
        if (tool.url === 'pomodoro') resetTimer()
        if (tool.url === 'password') generatePassword()
        if (tool.url === 'color') generateColors()

        activeModal.value = tool.url
    }
}

const closeInternalModal = () => {
    activeModal.value = null
    if (timer.value) clearInterval(timer.value) // 关闭弹窗时停止计时
    isTimerRunning.value = false
}

onMounted(() => {
    fetchTools()
    // 防止主页滚动
    document.body.style.overflow = 'hidden'
})

onUnmounted(() => {
    if (timer.value) clearInterval(timer.value)
    // 恢复滚动
    document.body.style.overflow = ''
})
</script>

<template>
    <Teleport to="body">
        <div class="toolkit-modal-wrapper" @click.self="$emit('close')">
            <div class="toolkit-content-card animate__animated animate__zoomIn">
                <div class="modal-header-bar">
                    <div class="header-left">
                        <span class="header-icon">🧰</span>
                        <span class="header-title">百宝箱 Toolkit</span>
                    </div>
                    <button class="close-main-btn" @click="$emit('close')">
                        <svg viewBox="0 0 24 24" width="24" height="24">
                            <path
                                d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"
                                fill="currentColor" />
                        </svg>
                    </button>
                </div>

                <div class="modal-body-scroll">
                    <div v-if="isLoading" class="loading-box">
                        <div class="spinner"></div>
                    </div>

                    <div v-else class="tool-grid-centered">
                        <div v-for="tool in tools" :key="tool.id" class="tool-card-mini" @click="openTool(tool)">
                            <div class="card-icon" :style="{ background: tool.color }">{{ tool.icon }}</div>
                            <div class="card-info">
                                <h3 class="card-title">{{ tool.title }}</h3>
                                <p class="card-desc">{{ tool.description }}</p>
                            </div>
                            <div class="card-arrow">↗</div>
                        </div>
                    </div>
                </div>

                <transition name="fade">
                    <div v-if="activeModal" class="inner-modal-overlay" @click.self="closeInternalModal">

                        <div v-if="activeModal === 'pomodoro'"
                            class="inner-card artistic-pomodoro animate__animated animate__fadeInUp">
                            <div class="art-header">
                                <h3>专注时钟</h3>
                                <button class="art-close" @click="closeInternalModal">×</button>
                            </div>

                            <div class="timer-circle-container">
                                <div class="timer-text" :class="{ 'focusing': isTimerRunning }">
                                    {{ formatTime(timeLeft) }}
                                </div>
                                <div class="timer-status">{{ isTimerRunning ? (timerMode === 'focus' ? '专注中...' :
                                    '休息中...') : '准备好了吗？' }}</div>
                            </div>

                            <div class="progress-bar-bg">
                                <div class="progress-bar-fill" :style="{ width: progress + '%' }"></div>
                            </div>

                            <div class="art-controls">
                                <button class="art-btn primary" @click="toggleTimer">
                                    {{ isTimerRunning ? '⏸ 暂停' : '▶ 开始专注' }}
                                </button>
                                <button class="art-btn secondary" @click="resetTimer">↺ 重置</button>
                            </div>
                        </div>

                        <div v-if="activeModal === 'password'"
                            class="inner-card artistic-password animate__animated animate__fadeInUp">
                            <div class="art-header">
                                <h3>强密码生成器</h3>
                                <button class="art-close" @click="closeInternalModal">×</button>
                            </div>
                            <div class="pass-display" @click="copyPass">
                                {{ passwordResult }}
                                <span class="copy-hint">点击复制</span>
                            </div>
                            <div class="pass-slider-box">
                                <label>长度: {{ passLength }}</label>
                                <input type="range" v-model="passLength" min="6" max="32" class="art-range">
                            </div>
                            <button class="art-btn full" @click="generatePassword">🔄 重新生成</button>
                        </div>

                        <div v-if="activeModal === 'color'"
                            class="inner-card artistic-color animate__animated animate__fadeInUp">
                            <div class="art-header">
                                <h3>灵感配色</h3>
                                <button class="art-close" @click="closeInternalModal">×</button>
                            </div>
                            <div class="palette-grid">
                                <div v-for="c in colors" :key="c" class="color-block" :style="{ background: c }"
                                    @click="copyColor(c)">
                                    <span class="color-code">{{ c }}</span>
                                </div>
                            </div>
                            <button class="art-btn full" @click="generateColors">🎨 换一组颜色</button>
                        </div>

                    </div>
                </transition>
            </div>
        </div>
    </Teleport>
</template>

<style scoped>
/* ==================== 1. 主模态框容器 ==================== */
.toolkit-modal-wrapper {
    position: fixed;
    inset: 0;
    /* 🔥🔥🔥 核心修复：层级提高到 9999，确保在 Navbar(2000) 之上 */
    z-index: 9999;
    background: rgba(0, 0, 0, 0.4);
    /* 深色背景遮罩 */
    backdrop-filter: blur(15px);
    /* 强力模糊背景 */
    display: flex;
    justify-content: center;
    align-items: center;
    padding: 20px;
}

/* 毛玻璃卡片主体 */
.toolkit-content-card {
    width: 900px;
    max-width: 95%;

    /* 优先使用 650px，但如果屏幕不够高，就只占屏幕高度的 85% */
    height: 650px;
    max-height: 85vh;
    /* 🔥 核心保护：永远不会超过屏幕高度的 85% */
    background: rgba(255, 255, 255, 0.85);
    /* 提高不透明度，防止透字 */
    backdrop-filter: blur(30px) saturate(180%);
    border-radius: 24px;
    box-shadow:
        0 25px 50px -12px rgba(0, 0, 0, 0.25),
        inset 0 0 0 1px rgba(255, 255, 255, 0.5);
    /* 内部高光描边 */
    display: flex;
    flex-direction: column;
    overflow: hidden;
    position: relative;
}

/* 深色模式适配 */
@media (prefers-color-scheme: dark) {
    .toolkit-content-card {
        background: rgba(30, 30, 30, 0.85);
        box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.1);
    }
}

/* ==================== 2. 顶部栏 ==================== */
.modal-header-bar {
    padding: 18px 30px;
    border-bottom: 1px solid rgba(0, 0, 0, 0.06);
    display: flex;
    justify-content: space-between;
    align-items: center;
    background: rgba(255, 255, 255, 0.4);
}

.header-left {
    display: flex;
    align-items: center;
    gap: 12px;
}

.header-icon {
    font-size: 24px;
}

.header-title {
    font-size: 18px;
    font-weight: 700;
    color: #333;
    /* 强制深色文字 */
    letter-spacing: 0.5px;
}

.close-main-btn {
    background: rgba(0, 0, 0, 0.05);
    border: none;
    width: 32px;
    height: 32px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    color: #666;
    transition: all 0.2s;
}

.close-main-btn:hover {
    background: rgba(0, 0, 0, 0.1);
    color: #000;
    transform: rotate(90deg);
}

/* ==================== 3. 工具列表 (完美居中 Grid) ==================== */
.modal-body-scroll {
    flex: 1;
    overflow-y: auto;
    padding: 30px;
}

.tool-grid-centered {
    display: grid;
    /* 自动填充，每列最小260px，自适应宽度 */
    grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
    gap: 20px;
    /* 关键：如果数量少，整体居中 */
    justify-content: center;
    max-width: 100%;
    margin: 0 auto;
}

/* 小工具卡片 */
.tool-card-mini {
    background: #fff;
    border-radius: 16px;
    padding: 20px;
    display: flex;
    align-items: flex-start;
    gap: 16px;
    cursor: pointer;
    position: relative;
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    border: 1px solid rgba(0, 0, 0, 0.04);
    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.02);
}

.tool-card-mini:hover {
    transform: translateY(-5px);
    box-shadow: 0 12px 24px rgba(0, 0, 0, 0.08);
    border-color: rgba(66, 184, 131, 0.4);
}

.card-icon {
    width: 48px;
    height: 48px;
    border-radius: 12px;
    display: flex;
    justify-content: center;
    align-items: center;
    font-size: 24px;
    color: #fff;
    flex-shrink: 0;
    box-shadow: 0 4px 10px rgba(0, 0, 0, 0.1);
}

.card-info {
    flex: 1;
    min-width: 0;
}

.card-title {
    font-size: 16px;
    font-weight: 700;
    margin: 0 0 6px 0;
    color: #2c3e50;
}

.card-desc {
    font-size: 12px;
    color: #888;
    margin: 0;
    line-height: 1.5;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
}

.card-arrow {
    position: absolute;
    top: 15px;
    right: 15px;
    color: #ddd;
    font-size: 14px;
    transition: 0.2s;
}

.tool-card-mini:hover .card-arrow {
    color: #42b883;
    transform: translate(2px, -2px);
}

/* ==================== 4. 内部工具弹窗 (艺术风格) ==================== */
.inner-modal-overlay {
    position: absolute;
    inset: 0;
    background: rgba(255, 255, 255, 0.6);
    /* 浅色遮罩 */
    backdrop-filter: blur(8px);
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 100;
}

/* 通用内部卡片样式 */
.inner-card {
    background: #fff;
    width: 360px;
    padding: 25px;
    border-radius: 24px;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.15);
    border: 1px solid rgba(0, 0, 0, 0.05);
    display: flex;
    flex-direction: column;
    align-items: center;
}

.art-header {
    width: 100%;
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 25px;
}

.art-header h3 {
    margin: 0;
    font-size: 18px;
    font-weight: 800;
    color: #333;
}

.art-close {
    border: none;
    background: #f0f0f0;
    width: 28px;
    height: 28px;
    border-radius: 50%;
    color: #666;
    cursor: pointer;
    transition: 0.2s;
}

.art-close:hover {
    background: #e0e0e0;
    color: #000;
}

/* 🍅 专注时钟专属样式 */
.timer-circle-container {
    text-align: center;
    margin-bottom: 25px;
}

.timer-text {
    font-size: 64px;
    /* 超大字体 */
    font-weight: 700;
    color: #2c3e50;
    /* 强制深色 */
    font-family: 'Segoe UI', monospace;
    /* 等宽字体防止跳动 */
    letter-spacing: -2px;
    line-height: 1;
    transition: color 0.3s;
}

.timer-text.focusing {
    color: #ff6b6b;
}

/* 运行时变红 */
.timer-status {
    font-size: 14px;
    color: #999;
    margin-top: 5px;
    font-weight: 500;
}

/* 进度条 */
.progress-bar-bg {
    width: 100%;
    height: 6px;
    background: #f0f0f0;
    border-radius: 10px;
    overflow: hidden;
    margin-bottom: 30px;
}

.progress-bar-fill {
    height: 100%;
    background: linear-gradient(90deg, #ff6b6b, #ff8787);
    transition: width 1s linear;
}

.art-controls {
    display: flex;
    gap: 15px;
    width: 100%;
}

.art-btn {
    flex: 1;
    padding: 12px;
    border-radius: 12px;
    font-weight: 600;
    cursor: pointer;
    border: none;
    transition: 0.2s;
    display: flex;
    justify-content: center;
    align-items: center;
    gap: 6px;
}

.art-btn.primary {
    background: #2c3e50;
    color: #fff;
    box-shadow: 0 4px 12px rgba(44, 62, 80, 0.3);
}

.art-btn.primary:hover {
    background: #34495e;
    transform: translateY(-2px);
}

.art-btn.secondary {
    background: #f0f2f5;
    color: #555;
}

.art-btn.secondary:hover {
    background: #e1e4e8;
}

.art-btn.full {
    width: 100%;
    background: #333;
    color: white;
    margin-top: 15px;
}

/* 🔐 密码生成器样式 */
.pass-display {
    width: 100%;
    padding: 20px;
    background: #f8f9fa;
    border-radius: 12px;
    font-family: monospace;
    font-size: 18px;
    color: #333;
    text-align: center;
    margin-bottom: 20px;
    cursor: pointer;
    position: relative;
    word-break: break-all;
    border: 1px dashed #ddd;
    transition: 0.2s;
}

.pass-display:hover {
    border-color: #42b883;
    background: #f0fdf4;
}

.copy-hint {
    display: block;
    font-size: 10px;
    color: #bbb;
    margin-top: 5px;
    font-family: sans-serif;
}

.pass-slider-box {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 10px;
    color: #666;
    font-size: 14px;
    margin-bottom: 10px;
}

.art-range {
    flex: 1;
    accent-color: #333;
}

/* 🎨 配色样式 */
.palette-grid {
    display: flex;
    width: 100%;
    height: 120px;
    border-radius: 16px;
    overflow: hidden;
    box-shadow: 0 4px 15px rgba(0, 0, 0, 0.1);
}

.color-block {
    flex: 1;
    display: flex;
    align-items: flex-end;
    justify-content: center;
    padding-bottom: 15px;
    cursor: pointer;
    transition: flex 0.3s ease;
    position: relative;
}

.color-block:hover {
    flex: 2;
}

.color-code {
    font-size: 12px;
    color: #fff;
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.5);
    opacity: 0.8;
    font-family: monospace;
    text-transform: uppercase;
}

/* 动画 */
.fade-enter-active,
.fade-leave-active {
    transition: opacity 0.2s;
}

.fade-enter-from,
.fade-leave-to {
    opacity: 0;
}

.loading-box {
    display: flex;
    justify-content: center;
    padding: 100px;
}

.spinner {
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
</style>