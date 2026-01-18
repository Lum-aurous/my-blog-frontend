<script setup>
// ... (JS 逻辑完全保持不变，直接复用原代码即可) ...
import { ref, onMounted, computed } from 'vue'
import Navbar from '@/components/Navbar.vue'
import { message } from '@/utils/message'
import { api } from '@/utils/api'

// ... (数据状态、数据获取、交互逻辑等均不变) ...
const allTools = ref([])
const displayTools = ref([])
const heroImage = ref('')
const isLoading = ref(true)

const page = ref(1)
const pageSize = 12
const hasMore = computed(() => displayTools.value.length < allTools.value.length)

// 获取全局壁纸
const fetchGlobalWallpaper = async () => {
    try {
        const res = await api.get('/wallpaper/global')
        if (res.data.success) {
            const { randomUrls, dailyUrl, websiteUrl, mode } = res.data.data
            if (randomUrls && Array.isArray(randomUrls) && randomUrls.length > 0) {
                heroImage.value = randomUrls[Math.floor(Math.random() * randomUrls.length)]
            } else if (mode === 'daily') {
                heroImage.value = dailyUrl
            } else {
                heroImage.value = websiteUrl
            }
        }
    } catch (e) {
        heroImage.value = 'https://w.wallhaven.cc/full/48/wallhaven-4813e7.jpg'
    }
}

const fetchTools = async () => {
    isLoading.value = true
    try {
        const res = await api.get('/tools')
        if (res.data.success) {
            allTools.value = res.data.data || []
            loadMore()
        }
    } catch (e) {
        console.error('获取工具失败', e)
    } finally {
        isLoading.value = false
    }
}

const loadMore = () => {
    const currentLen = displayTools.value.length
    const totalLen = allTools.value.length
    const nextBatch = allTools.value.slice(currentLen, currentLen + pageSize)

    if (nextBatch.length > 0) {
        displayTools.value.push(...nextBatch)
        page.value++
    }
}

const activeModal = ref(null)
const timer = ref(null)
const timeLeft = ref(25 * 60)
const isTimerRunning = ref(false)
const timerMode = ref('focus')
const passwordResult = ref('')
const passLength = ref(16)
const colors = ref([])

const openTool = (tool) => {
    if (tool.type === 'external') {
        window.open(tool.url, '_blank')
    } else {
        activeModal.value = tool.url
        if (tool.url === 'color') generateColors()
    }
}

const closeModal = () => {
    activeModal.value = null
    if (timer.value) clearInterval(timer.value)
    isTimerRunning.value = false
    timeLeft.value = 25 * 60
}

const toggleTimer = () => {
    if (isTimerRunning.value) {
        clearInterval(timer.value)
        isTimerRunning.value = false
    } else {
        isTimerRunning.value = true
        timer.value = setInterval(() => {
            if (timeLeft.value > 0) {
                timeLeft.value--
            } else {
                clearInterval(timer.value)
                isTimerRunning.value = false
                message.success(timerMode.value === 'focus' ? '专注结束，休息一下吧！' : '休息结束，开始工作！')
                timerMode.value = timerMode.value === 'focus' ? 'break' : 'focus'
                timeLeft.value = timerMode.value === 'focus' ? 25 * 60 : 5 * 60
            }
        }, 1000)
    }
}
const formatTime = (seconds) => {
    const m = Math.floor(seconds / 60).toString().padStart(2, '0')
    const s = (seconds % 60).toString().padStart(2, '0')
    return `${m}:${s}`
}

const generatePassword = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()_+'
    let res = ''
    for (let i = 0; i < passLength.value; i++) {
        res += chars.charAt(Math.floor(Math.random() * chars.length))
    }
    passwordResult.value = res
}
const copyPass = () => {
    navigator.clipboard.writeText(passwordResult.value)
    message.success('已复制')
}

const generateColors = () => {
    colors.value = Array(5).fill(0).map(() => '#' + Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0'))
}
const copyColor = (c) => {
    navigator.clipboard.writeText(c)
    message.success(`色值 ${c} 已复制`)
}

onMounted(() => {
    fetchGlobalWallpaper()
    fetchTools()
})
</script>

<template>
    <div class="toolkit-page">
        <Navbar />

        <header class="toolkit-hero" :style="{ backgroundImage: `url(${heroImage})` }">
            <div class="hero-mask"></div>
            <div class="hero-content animate__animated animate__fadeInDown">
                <h1 class="hero-title">TOOLKIT</h1>
                <p class="hero-desc">工欲善其事，必先利其器。收录高效率工具与资源。</p>
            </div>
        </header>

        <main class="toolkit-container">
            <div v-if="isLoading" class="loading-box">
                <div class="spinner"></div>
            </div>

            <div v-else>
                <div class="tool-grid">
                    <div v-for="tool in displayTools" :key="tool.id"
                        class="tool-card animate__animated animate__fadeInUp" @click="openTool(tool)">
                        <div class="card-icon" :style="{ background: tool.color }">{{ tool.icon }}</div>
                        <div class="card-info">
                            <div class="card-header">
                                <h3 class="card-title">{{ tool.title }}</h3>
                                <span class="category-badge">{{ tool.category }}</span>
                            </div>
                            <p class="card-desc">{{ tool.description }}</p>
                        </div>
                        <div class="card-arrow">↗</div>
                    </div>
                </div>

                <div class="load-more-container">
                    <button v-if="hasMore" class="load-more-btn" @click="loadMore">
                        <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" style="margin-right:6px">
                            <path
                                d="M12 4V1L8 5l4 4V6c3.31 0 6 2.69 6 6 0 1.01-.25 1.97-.7 2.8l1.46 1.46C19.54 15.03 20 13.57 20 12c0-4.42-3.58-8-8-8zm0 14c-3.31 0-6-2.69-6-6 0-1.01.25-1.97.7-2.8L5.24 7.74C4.46 8.97 4 10.43 4 12c0 4.42 3.58 8 8 8v3l4-4-4-4v3z" />
                        </svg>
                        加载更多
                    </button>
                    <div v-else-if="allTools.length > 0" class="no-more-text">
                        - THE END -
                    </div>
                </div>
            </div>
        </main>

        <Teleport to="body">
            <Transition name="modal-fade">
                <div v-if="activeModal" class="modal-overlay" @click.self="closeModal">

                    <div v-if="activeModal === 'pomodoro'"
                        class="modal-card pomodoro-modal animate__animated animate__zoomIn">
                        <div class="modal-header">
                            <h3>🍅 专注时钟</h3>
                            <button class="close-btn" @click="closeModal">×</button>
                        </div>
                        <div class="timer-display" :class="timerMode">{{ formatTime(timeLeft) }}</div>
                        <div class="timer-controls">
                            <button class="control-btn main" @click="toggleTimer">{{ isTimerRunning ? '暂停' : '开始'
                                }}</button>
                            <button class="control-btn" @click="closeModal">放弃</button>
                        </div>
                        <p class="timer-tip">{{ timerMode === 'focus' ? '保持专注，请勿切出页面' : '起来走走，喝杯水' }}</p>
                    </div>

                    <div v-if="activeModal === 'password'"
                        class="modal-card password-modal animate__animated animate__zoomIn">
                        <div class="modal-header">
                            <h3>🔐 密码生成器</h3>
                            <button class="close-btn" @click="closeModal">×</button>
                        </div>
                        <div class="pass-result">
                            <input type="text" v-model="passwordResult" readonly placeholder="点击生成...">
                            <button @click="copyPass">复制</button>
                        </div>
                        <div class="pass-controls">
                            <label>长度: {{ passLength }}</label>
                            <input type="range" v-model="passLength" min="6" max="32">
                            <button class="gen-btn" @click="generatePassword">生成</button>
                        </div>
                    </div>

                    <div v-if="activeModal === 'color'"
                        class="modal-card color-modal animate__animated animate__zoomIn">
                        <div class="modal-header">
                            <h3>🎨 随机配色</h3>
                            <button class="close-btn" @click="closeModal">×</button>
                        </div>
                        <div class="color-palette">
                            <div v-for="c in colors" :key="c" class="color-strip" :style="{ background: c }"
                                @click="copyColor(c)">
                                <span>{{ c }}</span>
                            </div>
                        </div>
                        <button class="gen-btn full" @click="generateColors">换一组</button>
                    </div>

                </div>
            </Transition>
        </Teleport>
    </div>
</template>

<style scoped>
/* ==================== 1. 全局布局适配 ==================== */
.toolkit-page {
    /* 🔥 替换硬编码颜色 */
    background-color: var(--bg-body);
    min-height: 100vh;
    color: var(--text-primary);
    transition: background-color 0.3s ease, color 0.3s ease;
}

/* ==================== 2. Hero 区域 ==================== */
.toolkit-hero {
    position: relative;
    height: 400px;
    background-size: cover;
    background-position: center;
    display: flex;
    justify-content: center;
    align-items: center;
    text-align: center;
    color: white;
    /* Hero 区域无论深浅模式，背景图上的文字保持白色 */
    /* background-color fallback */
    background-color: #667eea;
}

.hero-mask {
    position: absolute;
    inset: 0;
    /* 🔥 使用渐变遮罩，深色模式下稍微深一点 */
    background: linear-gradient(to bottom, rgba(0, 0, 0, 0.3), rgba(0, 0, 0, 0.6));
    backdrop-filter: blur(2px);
}

:global(html.dark) .hero-mask {
    background: linear-gradient(to bottom, rgba(0, 0, 0, 0.5), rgba(0, 0, 0, 0.8));
}

.hero-content {
    position: relative;
    z-index: 10;
}

.hero-title {
    font-size: 3.5rem;
    margin-bottom: 15px;
    font-weight: 800;
    letter-spacing: 6px;
    text-shadow: 0 4px 10px rgba(0, 0, 0, 0.3);
    font-family: 'Georgia', serif;
}

.hero-desc {
    font-size: 1.2rem;
    opacity: 0.95;
    text-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
}

/* ==================== 3. 容器与网格 ==================== */
.toolkit-container {
    max-width: 1200px;
    margin: 40px auto 60px;
    padding: 0 20px;
    position: relative;
    z-index: 20;
}

.tool-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
    /* 稍微调小一点最小宽度，适应性更好 */
    gap: 25px;
}

/* ==================== 4. 卡片样式 (核心适配) ==================== */
.tool-card {
    /* 🔥 替换背景和边框 */
    background: var(--bg-surface);
    border: 1px solid var(--input-border);
    border-radius: 16px;
    padding: 25px;
    display: flex;
    gap: 20px;
    cursor: pointer;
    box-shadow: var(--shadow-neumorphism-light);
    transition: all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);
    position: relative;
}

/* 深色模式下的阴影调整 */
:global(html.dark) .tool-card {
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3);
    border: 1px solid rgba(255, 255, 255, 0.05);
}

.tool-card:hover {
    transform: translateY(-8px);
    border-color: var(--accent-color);
    box-shadow: 0 20px 40px rgba(0, 0, 0, 0.12);
}

:global(html.dark) .tool-card:hover {
    box-shadow: 0 20px 40px rgba(0, 0, 0, 0.5);
    border-color: var(--accent-color);
}

.card-icon {
    width: 60px;
    height: 60px;
    border-radius: 16px;
    display: flex;
    justify-content: center;
    align-items: center;
    font-size: 1.8rem;
    flex-shrink: 0;
    color: white;
    box-shadow: 0 8px 16px rgba(0, 0, 0, 0.15);
}

.card-info {
    flex: 1;
    min-width: 0;
}

.card-header {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 8px;
    flex-wrap: wrap;
}

.card-title {
    font-weight: 700;
    font-size: 1.1rem;
    color: var(--text-primary);
    /* 🔥 变量 */
    margin: 0;
}

.category-badge {
    font-size: 0.75rem;
    background: var(--bg-elevated);
    /* 🔥 变量 */
    color: var(--text-secondary);
    /* 🔥 变量 */
    padding: 3px 8px;
    border-radius: 6px;
    font-weight: 500;
}

.card-desc {
    font-size: 0.9rem;
    color: var(--text-secondary);
    /* 🔥 变量 */
    line-height: 1.6;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
}

.card-arrow {
    position: absolute;
    top: 20px;
    right: 20px;
    color: var(--text-tertiary);
    /* 🔥 变量 */
    font-size: 1.2rem;
    transition: 0.3s;
}

.tool-card:hover .card-arrow {
    color: var(--accent-color);
    transform: translate(3px, -3px);
}

/* ==================== 5. 弹窗样式 (核心适配) ==================== */
.modal-overlay {
    position: fixed;
    top: 0;        /* 显式声明 top */
    left: 0;       /* 显式声明 left */
    width: 100vw;  /* 强制占满视口宽度 */
    height: 100vh; /* 强制占满视口高度 */
    z-index: 9999; /* 🔥 提高层级，防止被 Navbar (通常是 1000-2000) 遮挡 */
    background: rgba(0, 0, 0, 0.6);
    backdrop-filter: blur(8px);
    display: flex;
    justify-content: center;
    align-items: center;
}

.modal-fade-enter-active,
.modal-fade-leave-active {
  transition: opacity 0.3s ease;
}

.modal-fade-enter-from,
.modal-fade-leave-to {
  opacity: 0;
}

.modal-card {
    background: var(--bg-surface);
    /* 🔥 变量 */
    width: 400px;
    padding: 30px;
    border-radius: 20px;
    box-shadow: 0 25px 50px rgba(0, 0, 0, 0.25);
    /* 玻璃边框效果 */
    border: 1px solid var(--glass-border);
    /* 🔥 变量 */
    position: relative;
    /* 修复文字颜色 */
    color: var(--text-primary);
}

:global(html.dark) .modal-card {
    box-shadow: 0 25px 50px rgba(0, 0, 0, 0.7);
    border: 1px solid rgba(255, 255, 255, 0.1);
}

.modal-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 20px;
    border-bottom: 1px solid var(--input-border);
    /* 🔥 变量 */
    padding-bottom: 15px;
}

.modal-header h3 {
    margin: 0;
    color: var(--text-primary);
    /* 🔥 变量 */
}

.close-btn {
    background: none;
    border: none;
    font-size: 1.8rem;
    cursor: pointer;
    color: var(--text-tertiary);
    /* 🔥 变量 */
    line-height: 1;
    transition: color 0.2s;
}

.close-btn:hover {
    color: var(--text-primary);
}

/* --- 加载动画 --- */
.loading-box {
    display: flex;
    justify-content: center;
    padding: 80px;
}

.spinner {
    width: 40px;
    height: 40px;
    border: 3px solid var(--input-border);
    /* 🔥 变量 */
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

/* --- 弹窗内部组件 --- */
.timer-display {
    font-size: 4rem;
    font-weight: 700;
    text-align: center;
    margin: 30px 0;
    font-variant-numeric: tabular-nums;
    /* 默认颜色，具体状态会覆盖 */
    color: var(--text-primary);
}

.timer-display.focus {
    color: #ff6b6b;
}

.timer-display.break {
    color: #4ecdc4;
}

.timer-controls {
    display: flex;
    justify-content: center;
    gap: 15px;
}

.control-btn {
    padding: 12px 36px;
    border-radius: 50px;
    border: 1px solid var(--input-border);
    background: var(--bg-surface);
    color: var(--text-secondary);
    cursor: pointer;
    font-weight: 600;
    transition: all 0.2s;
}

.control-btn:hover {
    transform: scale(1.05);
    background: var(--bg-elevated);
}

.control-btn.main {
    background: var(--text-primary);
    /* 深色模式下是白，浅色是黑 */
    color: var(--bg-surface);
    border: none;
    box-shadow: 0 4px 15px rgba(0, 0, 0, 0.2);
}

.timer-tip {
    text-align: center;
    color: var(--text-tertiary);
    font-size: 0.9rem;
    margin-top: 25px;
}

.pass-result {
    display: flex;
    gap: 10px;
    margin-bottom: 25px;
}

.pass-result input {
    flex: 1;
    padding: 12px;
    border: 1px solid var(--input-border);
    border-radius: 8px;
    font-family: monospace;
    font-size: 1.1rem;
    background: var(--bg-body);
    /* 输入框背景 */
    color: var(--text-primary);
}

.pass-result button {
    padding: 0 20px;
    background: var(--text-primary);
    color: var(--bg-surface);
    border: none;
    border-radius: 8px;
    cursor: pointer;
}

.pass-controls {
    display: flex;
    align-items: center;
    gap: 15px;
    background: var(--bg-elevated);
    /* 控制区背景 */
    padding: 15px;
    border-radius: 12px;
    color: var(--text-secondary);
}

.gen-btn {
    padding: 10px 24px;
    background: var(--accent-color);
    color: white;
    border: none;
    border-radius: 8px;
    cursor: pointer;
    font-weight: 600;
}

.gen-btn.full {
    width: 100%;
    margin-top: 20px;
    height: 45px;
    font-size: 1rem;
}

.color-palette {
    display: flex;
    height: 120px;
    border-radius: 12px;
    overflow: hidden;
    cursor: copy;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}

.color-strip {
    flex: 1;
    display: flex;
    align-items: end;
    justify-content: center;
    padding-bottom: 15px;
    color: white;
    font-size: 0.85rem;
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
    transition: flex 0.3s;
    font-family: monospace;
}

.color-strip:hover {
    flex: 2;
}

/* ==================== 6. 加载更多按钮 (复用统一风格) ==================== */
.load-more-container {
    padding: 40px 0 20px;
    display: flex;
    justify-content: center;
    align-items: center;
    flex-direction: column;
    /* 加上这个方便 END 文字居中 */
}

.load-more-btn {
    padding: 12px 36px;
    background: var(--bg-surface);
    border: 1px solid var(--input-border);
    color: var(--text-secondary);
    border-radius: 50px;
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.3s ease;
    display: flex;
    align-items: center;
    box-shadow: var(--shadow-neumorphism-light);
}

.load-more-btn:hover {
    border-color: var(--accent-color);
    color: var(--accent-color);
    background: var(--bg-elevated);
    transform: translateY(-2px);
    box-shadow: var(--shadow-neumorphism-dark);
}

.no-more-text {
    font-size: 13px;
    color: var(--text-tertiary);
    padding: 10px;
    letter-spacing: 1px;
}

/* ==================== 📱 移动端适配 ==================== */
@media (max-width: 768px) {
    .toolkit-hero {
        height: 300px;
    }

    .hero-title {
        font-size: 2.5rem;
    }

    .modal-card {
        width: 90%;
        padding: 20px;
    }

    .tool-grid {
        grid-template-columns: 1fr;
        /* 手机端单列 */
    }
}
</style>