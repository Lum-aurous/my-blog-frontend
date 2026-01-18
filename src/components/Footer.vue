<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { useUserStore } from '@/stores/user.js'
import { useSiteStore } from '@/stores/site.js'
import { message } from '@/utils/message.js'
import { api } from '@/utils/api' // 🔥 1. 记得引入 API 工具

const router = useRouter()
const userStore = useUserStore()
const siteStore = useSiteStore()
const currentYear = new Date().getFullYear()

// 🔥 2. 定义背景图 (默认给一张兜底图，防止接口慢时白屏)
const footerBgImage = ref('https://images.unsplash.com/photo-1451187580459-43490279c0fa?q=80&w=2072&auto=format&fit=crop')

// --- 1. 暗门逻辑 ---
const clickCount = ref(0)
const lastClickTime = ref(0)
const handleAdminClick = () => {
    const now = Date.now()
    if (now - lastClickTime.value > 3000) clickCount.value = 0
    lastClickTime.value = now
    clickCount.value++
    if (clickCount.value === 5) {
        clickCount.value = 0
        if (userStore.user?.role === 'admin') {
            message.success('🚪 欢迎回来，管理员')
            router.push('/admin')
        }
    }
}

const isAdmin = computed(() => userStore.user?.role === 'admin')
const authorName = computed(() => siteStore.siteInfo.site_author || 'Veritas')
const contactEmail = computed(() => siteStore.siteInfo.contact_email || 'help@iveritas.cn')

// --- 2. 运行时间计时器 ---
const runtimeText = ref('')
let timer = null

const calculateRuntime = () => {
    const startDate = new Date('2025-12-01 00:00:00')
    const now = new Date()
    const diff = now - startDate
    const days = Math.floor(diff / (1000 * 60 * 60 * 24))
    const hours = Math.floor((diff / (1000 * 60 * 60)) % 24)
    const mins = Math.floor((diff / (1000 * 60)) % 60)
    const secs = Math.floor((diff / 1000) % 60)
    runtimeText.value = `${days}天 ${hours}时 ${mins}分 ${secs}秒`
}

// 🔥 3. 获取全局壁纸逻辑
const fetchGlobalWallpaper = async () => {
    try {
        const res = await api.get('/wallpaper/global')
        if (res.data.success) {
            const { randomUrls, dailyUrl, websiteUrl, mode } = res.data.data

            // 逻辑：如果有随机图库，就从中随机选一张；否则看模式
            if (randomUrls && Array.isArray(randomUrls) && randomUrls.length > 0) {
                // 🎲 随机抽取一张，每次刷新页面页脚都不一样，给人惊喜感
                footerBgImage.value = randomUrls[Math.floor(Math.random() * randomUrls.length)]
            } else if (mode === 'daily') {
                footerBgImage.value = dailyUrl
            } else {
                footerBgImage.value = websiteUrl
            }
        }
    } catch (e) {
        console.error('页脚背景加载失败，使用默认图:', e)
    }
}

onMounted(() => {
    calculateRuntime()
    timer = setInterval(calculateRuntime, 1000)

    if (!siteStore.isLoaded) {
        siteStore.fetchSiteInfo()
    }

    // 🔥 4. 组件加载时，获取背景图
    fetchGlobalWallpaper()
})

onUnmounted(() => {
    if (timer) clearInterval(timer)
})
</script>

<template>
    <footer class="site-footer" :style="{ backgroundImage: `url(${footerBgImage})` }">
        <div class="footer-overlay"></div>

        <div class="footer-container">
            <!-- 第一层：运行时间 -->
            <div class="runtime-info animate__animated animate__fadeInUp">
                <span class="icon">⌛</span>
                <span class="label">Veritas 已运行</span>
                <span class="time-text">{{ runtimeText }}</span>
            </div>

            <!-- 第二层：版权信息 -->
            <div class="copyright-line animate__animated animate__fadeInUp" style="animation-delay: 0.1s">
                <span class="copy-left">
                    &copy; {{ currentYear }}
                    <span class="brand-text">{{ siteStore.siteInfo.site_title || 'Veritas' }}</span>
                </span>
                <span class="divider mobile-hide">|</span>
                <span class="dev-text">
                    Designed by
                    <span class="admin-name" :class="{ 'admin-active': isAdmin }" @click="handleAdminClick"
                        title="彩蛋入口">
                        {{ authorName }}
                    </span>
                </span>
            </div>

            <!-- 第三层：快捷链接 -->
            <div class="footer-links animate__animated animate__fadeInUp" style="animation-delay: 0.15s">
                <router-link to="/copyright" class="link-item">版权声明</router-link>
                <span class="dot">·</span>
                <router-link to="/blog" class="link-item">文章归档</router-link>
                <template v-if="siteStore.siteInfo.icp_beian">
                    <span class="dot mobile-hide">·</span>
                    <a href="https://beian.miit.gov.cn/" target="_blank" class="link-item icp-link">
                        {{ siteStore.siteInfo.icp_beian }}
                    </a>
                </template>
            </div>

            <!-- 第四层：联系邮箱 (新增) -->
            <div class="contact-email animate__animated animate__fadeInUp" style="animation-delay: 0.2s">
                <span class="email-label">📧 联系邮箱：</span>
                <a :href="`mailto:${contactEmail}`" class="email-link" :title="`发送邮件到 ${contactEmail}`">
                    {{ contactEmail }}
                </a>
            </div>

            <!-- 第五层：自定义HTML (统计代码等) -->
            <div v-if="siteStore.siteInfo.footer_html" class="custom-html-container animate__animated animate__fadeIn"
                style="animation-delay: 0.25s" v-html="siteStore.siteInfo.footer_html">
            </div>
        </div>
    </footer>
</template>

<style scoped>
/* ========== 核心布局 (瘦身版) ========== */
.site-footer {
    position: relative;
    width: 100%;
    /* 🔥 1. 拉近与正文距离: 80px -> 40px */
    margin-top: 40px;
    background-size: cover;
    background-position: center center;
    /* 保持浅色字体 */
    color: rgba(255, 255, 255, 0.95);
    font-size: 0.85rem;
    /* 字体稍微改小一丢丢，更精致 */
    overflow: hidden;
}

/* 遮罩层保持不变 */
.footer-overlay {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    /* 稍微加深一点遮罩，因为高度变矮了，文字需要更突出 */
    background: linear-gradient(to bottom, rgba(0, 0, 0, 0.5) 0%, rgba(0, 0, 0, 0.85) 100%);
    backdrop-filter: blur(4px);
    z-index: 1;
}

.footer-container {
    position: relative;
    z-index: 2;
    max-width: 1200px;
    margin: 0 auto;

    /* 🔥 2. 核心瘦身：大幅减少上下 Padding */
    /* 上 25px, 下 20px (原 50px/40px) */
    padding: 25px 20px 20px;

    display: flex;
    flex-direction: column;
    align-items: center;

    /* 🔥 3. 收紧行间距: 16px -> 8px */
    gap: 8px;

    text-shadow: 0 1px 3px rgba(0, 0, 0, 0.6);
}

/* ========== 组件样式 (微调) ========== */

/* 1. 运行时间 */
.runtime-info {
    font-size: 0.75rem;
    /* 背景色淡一点，更轻量 */
    background: rgba(255, 255, 255, 0.08);
    padding: 4px 12px;
    /* 缩小胶囊 */
    border-radius: 50px;
    display: flex;
    align-items: center;
    gap: 6px;
    margin-bottom: 4px;
    /* 微调间距 */
    backdrop-filter: blur(4px);
}

.time-text {
    font-family: 'Menlo', 'Monaco', monospace;
    font-weight: 700;
    color: #4ade80;
    letter-spacing: 0.5px;
}

/* 2. 版权行 */
.copyright-line {
    display: flex;
    align-items: center;
    gap: 8px;
    opacity: 0.95;
    font-size: 0.85rem;
}

.brand-text {
    font-weight: 800;
    letter-spacing: 1px;
    color: #fff;
}

.divider {
    opacity: 0.3;
    font-size: 0.8rem;
}

.admin-name {
    font-weight: 700;
    color: #fff;
    transition: all 0.3s;
    padding-bottom: 1px;
    border-bottom: 1px dashed transparent;
    /* 默认不显示线，悬停显示 */
}

.admin-name:hover {
    color: #7ddd9a;
    border-bottom-color: #7ddd9a;
    cursor: pointer;
}

/* 3. 链接行 */
.footer-links {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-top: 2px;
    /* 极紧凑 */
    opacity: 0.8;
}

/* 联系邮箱样式 - 更精致的版本 */
.contact-email {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    margin-top: 6px;
    padding: 6px 18px;
    background: rgba(255, 255, 255, 0.04);
    border-radius: 50px;
    backdrop-filter: blur(6px);
    font-size: 0.78rem;
    border: 1px solid rgba(255, 255, 255, 0.08);
    transition: all 0.3s;
}

.contact-email:hover {
    background: rgba(255, 255, 255, 0.06);
    border-color: rgba(125, 221, 154, 0.3);
    transform: translateY(-1px);
}

.email-label {
    color: rgba(255, 255, 255, 0.6);
    font-weight: 500;
    font-size: 0.75rem;
}

.email-link {
    color: #7ddd9a;
    text-decoration: none;
    font-weight: 600;
    transition: all 0.3s;
    position: relative;
    font-size: 0.8rem;
    letter-spacing: 0.3px;
}

.email-link:hover {
    color: #4ade80;
}

/* 邮箱链接下划线动效 */
.email-link::after {
    content: '';
    position: absolute;
    bottom: -2px;
    left: 0;
    width: 0;
    height: 1px;
    background: #4ade80;
    transition: width 0.3s ease;
}

.email-link:hover::after {
    width: 100%;
}

.link-item {
    color: rgba(255, 255, 255, 0.8);
    text-decoration: none;
    transition: all 0.3s;
    font-size: 0.8rem;
    position: relative;
}

.link-item:hover {
    color: #fff;
}

/* 链接下划线动效 */
.link-item::after {
    content: '';
    position: absolute;
    bottom: -2px;
    left: 0;
    width: 0;
    height: 1px;
    background: #7ddd9a;
    transition: width 0.3s;
}

.link-item:hover::after {
    width: 100%;
}

.dot {
    opacity: 0.3;
}

/* 自定义HTML */
.custom-html-container {
    opacity: 0.6;
    transform: scale(0.85);
    /* 缩小图标 */
    margin-top: 5px;
}

/* ========== 📱 手机端深度适配 ========== */
@media (max-width: 768px) {
    .site-footer {
        margin-top: 20px;
    }

    .footer-container {
        padding: 25px 20px 80px;
        gap: 12px;
        /* 稍微拉开间距 */
    }

    /* 运行时间 */
    .runtime-info {
        font-size: 0.7rem;
        padding: 3px 10px;
    }

    /* 版权行 - 保持横向 */
    .copyright-line {
        flex-direction: row;
        /* 改成横向 */
        flex-wrap: wrap;
        /* 允许换行 */
        justify-content: center;
        gap: 6px;
        font-size: 0.75rem;
        line-height: 1.6;
    }

    .divider {
        display: inline;
        /* 显示竖线 */
    }

    /* 快捷链接行 */
    .footer-links {
        flex-wrap: wrap;
        justify-content: center;
        gap: 8px;
        font-size: 0.72rem;
        margin-top: 0;
        /* 紧凑布局 */
    }

    /* 备案号单独处理 - 不换行 */
    .icp-link {
        display: inline;
        /* 不独占一行 */
        opacity: 0.7;
    }

    /* 移除之前的 mobile-hide，让所有元素都显示 */
    .mobile-hide {
        display: inline;
        /* 显示所有分隔符 */
    }

    /* 邮箱 - 紧凑居中 */
    .contact-email {
        flex-direction: row;
        flex-wrap: wrap;
        justify-content: center;
        gap: 4px;
        padding: 6px 12px;
        font-size: 0.7rem;
        margin-top: 4px;
    }

    .email-label {
        font-size: 0.68rem;
    }

    .email-link {
        font-size: 0.72rem;
    }
}
</style>