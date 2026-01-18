<script setup>
import { onMounted, onUnmounted, ref, computed, watch, nextTick } from 'vue'
import { useWallpaperStore } from '@/stores/wallpaper'
import { useThemeStore } from '@/stores/theme'
import Navbar from '@/components/Navbar.vue'
import Footer from '@/components/Footer.vue'
import ToastManager from '@/components/ToastManager.vue'
import { useUserStore } from '@/stores/user.js'
import { useRoute } from 'vue-router'
import { api } from '@/utils/api'
import { useSiteStore } from '@/stores/site'
import { Check, X } from 'lucide-vue-next'

const siteStore = useSiteStore()
const route = useRoute()
const userStore = useUserStore()
const wallpaperStore = useWallpaperStore()
const themeStore = useThemeStore()

const isAppReady = ref(false)
const imageLoaded = ref(false)
let themeTimer = null

// ==================== 🔥 核心修复：严格控制显示逻辑 ====================

// 1. 只有在非后台、非登录、非注册页面，才显示全局壁纸层
const showGlobalWallpaper = computed(() => {
  if (route.path.startsWith('/admin')) return false
  if (['/login', '/register'].includes(route.path)) return false // 🔥 强制隐藏
  return true
})

// 2. 控制导航栏显示
const showGlobalUI = computed(() => {
  if (route.path.startsWith('/admin')) return false
  if (route.meta.hideFooter) return false
  return true
})

// ==================== 下面逻辑保持不变 ====================

const recordVisit = async () => {
  const hasVisited = sessionStorage.getItem('site_visited')
  if (!hasVisited) {
    try {
      await api.post('/site/visit')
      sessionStorage.setItem('site_visited', 'true')
    } catch (error) { }
  }
}

const backgroundStyle = computed(() => {
  const url = wallpaperStore.currentWallpaper
  const blur = wallpaperStore.wallpaperBlur
  if (!url) return { display: 'none' }

  let formattedUrl = url.startsWith('http') || url.startsWith('/') ? url : '/' + url

  return {
    backgroundImage: `url("${formattedUrl}")`,
    backgroundSize: 'cover',
    backgroundPosition: 'center',
    backgroundRepeat: 'no-repeat',
    backgroundAttachment: 'fixed',
    filter: `blur(${blur}px)`,
    transition: 'filter 0.3s ease, opacity 0.5s ease',
    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
    zIndex: -999,
    opacity: imageLoaded.value ? 1 : 0
  }
})

watch(() => wallpaperStore.currentWallpaper, (newUrl) => {
  if (!showGlobalWallpaper.value) return // 🔥 如果不显示壁纸，就不执行加载逻辑
  imageLoaded.value = false
  if (newUrl) {
    const img = new Image()
    let src = newUrl.startsWith('http') || newUrl.startsWith('/') ? newUrl : '/' + newUrl
    if (src.includes('/thumbs_3t/')) src = src.replace('/thumbs_3t/', '/')
    img.src = src
    img.onload = () => { imageLoaded.value = true }
    img.onerror = () => { imageLoaded.value = true }
  } else {
    imageLoaded.value = true
  }
}, { immediate: true })

const checkDailyWallpaperUpdate = () => {
  if (wallpaperStore.wallpaperMode === 'daily') {
    const today = new Date().toDateString()
    if (localStorage.getItem('last_daily_update') !== today) {
      wallpaperStore.clearCache()
      localStorage.setItem('last_daily_update', today)
      setTimeout(() => wallpaperStore.initialize(true), 1000)
    }
  }
}

// ==================== 📢 全局公告逻辑 ====================
const globalNotice = ref(null)
const isNoticeVisible = ref(false)
let noticeTimer = null // 用于管理 30s 自动隐藏的定时器

// 获取最新公告并管理生命周期
const fetchActiveNotice = async () => {
  try {
    const res = await api.get('/notices/latest')
    if (res.data.success && res.data.data.content) {
      globalNotice.value = res.data.data.content

      // 1. 初次进入 1.5s 后优雅滑入
      setTimeout(() => {
        isNoticeVisible.value = true
        // 2. 启动 30s 自动隐藏倒计时
        startNoticeTimer()
      }, 1500)
    }
  } catch (error) {
    console.error('公告加载失败')
  }
}

// 启动自动隐藏计时器
const startNoticeTimer = () => {
  // 如果已经存在计时器（比如逻辑复用），先清除
  if (noticeTimer) clearTimeout(noticeTimer)

  noticeTimer = setTimeout(() => {
    closeNotice()
  }, 30000) // 默认停留 30 秒
}

// 关闭公告函数
const closeNotice = () => {
  isNoticeVisible.value = false
  // 清理计时器，防止手动关闭后计时器仍在运行
  if (noticeTimer) {
    clearTimeout(noticeTimer)
    noticeTimer = null
  }
}

// 判断是否允许在当前页面显示公告
const canShowNotice = computed(() => {
  if (route.path.startsWith('/admin')) return false
  return isNoticeVisible.value && globalNotice.value
})

const clearNoticeTimer = () => {
  if (noticeTimer) {
    clearTimeout(noticeTimer)
    noticeTimer = null
  }
}

onMounted(async () => {
  themeStore.checkAutoTheme();
  themeTimer = setInterval(() => { themeStore.checkAutoTheme() }, 60000);
  siteStore.fetchSiteInfo()
  fetchActiveNotice() // 🔥 调用公告接口
  try {
    userStore.checkLoginStatus()
    await nextTick()
    // 🔥 只有需要显示壁纸时才初始化
    if (showGlobalWallpaper.value && !wallpaperStore.isInitialized) {
      await nextTick()
      await wallpaperStore.initialize()
    }
  } catch (error) {
    console.error('App Init Error:', error)
  } finally {
    setTimeout(() => { isAppReady.value = true }, 800)
  }
  recordVisit()
  checkDailyWallpaperUpdate()
})

onUnmounted(() => {
  if (noticeTimer) clearTimeout(noticeTimer)
})
</script>

<template>
  <div class="app-container">
    <ToastManager />

    <transition name="slide-fade">
      <div v-if="canShowNotice" class="global-notice-card" @mouseenter="clearNoticeTimer"
        @mouseleave="startNoticeTimer">

        <div class="notice-icon-box">
          <Check :size="20" stroke-width="3" color="#ffffff" />
        </div>

        <div class="notice-content">
          <span class="notice-tag">站内公告</span>
          <p class="notice-text">{{ globalNotice }}</p>
        </div>

        <button class="notice-close-btn" @click.stop="closeNotice" title="关闭公告">
          <X :size="14" stroke-width="2.5" />
        </button>
      </div>
    </transition>

    <div v-if="showGlobalWallpaper" class="global-background" :style="backgroundStyle"
      :class="{ 'background-loaded': imageLoaded }">
    </div>
    <div v-if="showGlobalWallpaper && wallpaperStore.currentWallpaper" class="wallpaper-overlay"></div>

    <Navbar v-if="showGlobalUI" />

    <main class="main-content">
      <router-view v-slot="{ Component, route }">
        <keep-alive :include="['Home']">
          <component :is="Component" :key="route.path" />
        </keep-alive>
      </router-view>
    </main>

    <Footer v-if="showGlobalUI" />

    <transition name="fade">
      <div v-if="!isAppReady" class="loading-overlay">
        <div class="loading-art-container">Loading...</div>
      </div>
    </transition>
  </div>
</template>

<style scoped>
.app-container {
  min-height: 100vh;
  position: relative;
  /* overflow-x: hidden; // 如果需要粘性定位可以暂时注释 */
}

.global-background {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: -999;
  /* 必须是负数 */
  background-color: transparent;
  /* 必须是透明！ */
  pointer-events: none;
}

.global-background.background-loaded {
  opacity: 1;
}

/* 简单的壁纸遮罩，提升文字可读性 */
.wallpaper-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.1);
  /* 极其轻微的遮罩 */
  pointer-events: none;
  z-index: -998;
}

/* 🔥 修复：登录/注册页面不显示全局背景遮罩 */
:global(.login-page)~* .global-background,
body:has(.login-page) .global-background {
  display: none !important;
}

.main-content {
  position: relative;
  z-index: 1;
  min-height: 100vh;
}

@media (max-width: 768px) {
  .main-content {
    padding-bottom: 1px;
  }
}

/* ==================== Loading 界面样式 (优化为 CSS 变量) ==================== */
.loading-overlay {
  position: fixed;
  inset: 0;
  z-index: 9999;
  display: flex;
  justify-content: center;
  align-items: center;

  /* 🔥 核心优化：直接使用全局 CSS 变量 */
  /* 浅色时是米白，深色时是深蓝灰，自动切换，无需 JS */
  background-color: var(--bg-body);
  color: var(--text-primary);

  transition: background-color 0.5s ease, color 0.5s ease, opacity 0.8s ease;
}

.overlay-texture {
  position: absolute;
  inset: 0;
  opacity: 0.4;
  /* 噪点纹理保留 */
  background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)' opacity='0.1'/%3E%3C/svg%3E");
  pointer-events: none;
  z-index: 0;
}

.loading-art-container {
  position: relative;
  z-index: 10;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 25px;
}

.quill-wrapper {
  position: relative;
  width: 80px;
  height: 80px;
  display: flex;
  justify-content: center;
  align-items: center;
}

.quill-icon {
  width: 50px;
  height: auto;
  /* 使用次级文本色，适配深浅模式 */
  color: var(--text-secondary);
  filter: drop-shadow(2px 4px 6px rgba(0, 0, 0, 0.1));
  animation: writing-bob 2s ease-in-out infinite;
  transform-origin: bottom left;
}

@keyframes writing-bob {

  0%,
  100% {
    transform: rotate(0deg) translateY(0) translateX(0);
  }

  25% {
    transform: rotate(5deg) translateY(-5px) translateX(3px);
  }

  50% {
    transform: rotate(0deg) translateY(0) translateX(6px);
  }

  75% {
    transform: rotate(-3deg) translateY(-3px) translateX(3px);
  }
}

.ink-ripple {
  position: absolute;
  bottom: 10px;
  left: 15px;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  border: 1px solid var(--accent-color);
  /* 使用品牌色 */
  opacity: 0;
  animation: ripple-spread 2s linear infinite;
}

.ink-ripple::after {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: 50%;
  border: 1px solid var(--accent-color);
  animation: ripple-spread 2s linear 1s infinite;
}

@keyframes ripple-spread {
  0% {
    transform: scale(0.5);
    opacity: 0;
    border-width: 2px;
  }

  20% {
    opacity: 0.8;
  }

  100% {
    transform: scale(4);
    opacity: 0;
    border-width: 0px;
  }
}

.text-area {
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.brand-title {
  font-family: "Playfair Display", "Georgia", "Times New Roman", serif;
  font-size: 2rem;
  font-weight: 700;
  letter-spacing: 2px;
  margin-bottom: 8px;
  /* 使用 CSS 变量实现文字渐变 */
  background: linear-gradient(45deg, var(--text-primary), var(--accent-color));
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
  opacity: 0;
  animation: fade-in-up 0.8s ease forwards;
}

.loading-status {
  font-family: "Noto Sans SC", "STKaiti", serif;
  font-size: 0.9rem;
  color: var(--text-secondary);
  letter-spacing: 1px;
  opacity: 0;
  animation: fade-in-up 0.8s ease 0.3s forwards;
}

.dot-1 {
  animation: dot-jump 1.5s infinite 0s;
}

.dot-2 {
  animation: dot-jump 1.5s infinite 0.2s;
}

.dot-3 {
  animation: dot-jump 1.5s infinite 0.4s;
}

@keyframes dot-jump {

  0%,
  100% {
    opacity: 0.3;
    transform: translateY(0);
  }

  50% {
    opacity: 1;
    transform: translateY(-2px);
  }
}

@keyframes fade-in-up {
  from {
    opacity: 0;
    transform: translateY(10px);
  }

  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.8s ease, transform 0.8s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
  transform: scale(1.05);
}

/* ==================== 📢 全局公告样式 ==================== */
.global-notice-card {
  position: fixed;
  top: 90px;
  left: 20px;
  z-index: 1000;
  width: 320px;
  padding-right: 35px;
  /* 🔥 为关闭按钮预留位置 */
  max-width: calc(100vw - 40px);

  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 15px;

  /* 玻璃拟态核心样式 */
  background: rgba(var(--bg-surface-rgb, 255, 255, 255), 0.7);
  backdrop-filter: blur(15px);
  -webkit-backdrop-filter: blur(15px);

  border: 1px solid rgba(214, 163, 84, 0.3);
  /* 淡淡的品牌金边框 */
  border-radius: 12px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.15);

  transition: all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275);
}

:global(html.dark) .global-notice-card {
  background: rgba(30, 41, 59, 0.8);
  border-color: rgba(214, 163, 84, 0.2);
}

.notice-icon-box {
  background: #42b883;
  /* 🔥 你的效果图中的绿色 */
  color: #ffffff;
  width: 34px;
  height: 34px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  /* 确保图标在正中心 */
}

.notice-icon-box svg,
.notice-close-btn svg {
  display: block;
}

.notice-content {
  flex: 1;
  overflow: hidden;
}

.notice-tag {
  font-size: 0.7rem;
  font-weight: 700;
  color: var(--accent-color);
  text-transform: uppercase;
  letter-spacing: 1px;
  margin-bottom: 4px;
  display: block;
}

.notice-text {
  font-size: 0.9rem;
  color: var(--text-primary);
  line-height: 1.5;
  margin: 0;
  word-wrap: break-word;
  font-family: 'Noto Sans SC', sans-serif;
}

/* 优化关闭按钮样式 */
.notice-close-btn {
  position: absolute;
  top: 8px;
  right: 8px;
  width: 24px;
  height: 24px;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.05);
  /* 极浅背景 */
  color: var(--text-tertiary);
  border: none;
  cursor: pointer;
  transition: all 0.2s ease;
}

:global(html.dark) .notice-close-btn {
  background: rgba(255, 255, 255, 0.05);
}

.notice-close-btn:active {
  transform: scale(0.85);
  /* 点击时轻微缩小，模拟物理按键 */
  background: rgba(239, 68, 68, 0.2);
}

.notice-close-btn:hover {
  background: rgba(239, 68, 68, 0.15);
  /* 悬停时淡淡的红色提示 */
  color: #ef4444;
  transform: rotate(90deg);
}

/* 进场与隐退动画 - 确保向左隐退消失 */
.slide-fade-enter-active {
  transition: all 0.6s cubic-bezier(0.34, 1.56, 0.64, 1);
  /* 加入弹性入场 */
}

.slide-fade-leave-active {
  transition: all 0.5s cubic-bezier(0.4, 0, 1, 1);
  /* 顺滑出场 */
}

/* 进场：从左侧划入 */
.slide-fade-enter-from {
  transform: translateX(-110%);
  opacity: 0;
}

/* 退场：向左侧划出 */
.slide-fade-leave-to {
  transform: translateX(-110%);
  /* 🔥 确保是负数，这样它会往左边缩回去 */
  opacity: 0;
}

/* 移动端微调 */
@media (max-width: 600px) {
  .global-notice-card {
    top: 80px;
    left: 10px;
    width: calc(100vw - 20px);
  }
}
</style>