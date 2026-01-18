<script setup>
import { ref, onMounted, computed } from 'vue'
import { api } from '@/utils/api'
import { message } from '@/utils/message'
import { Instagram, Youtube, Twitter, Github, Mail, PenTool, Feather, Send, Heart } from 'lucide-vue-next'

// 🔥 优化1：移除前端根本用不到的 subject 字段
const form = ref({
    name: '',
    email: '',
    content: ''
})

const isSubmitting = ref(false)

// 动态诗句数据
const poemData = ref({
    title: '一笺寄心意',
    lines: [
        ['一', '笺', '寄', '心', '意', '，'],
        ['素', '笔', '写', '山', '河', '。'],
        ['山', '河', '皆', '过', '客', '，'],
        ['唯', '君', '入', '星', '河', '。']
    ],
    author: '风雅集'
})

// 社交链接配置 (建议替换成你真实的链接)
const socials = [
    { name: 'Instagram', url: 'https://instagram.com/boluomi011', icon: Instagram },
    { name: 'YouTube', url: 'https://youtube.com/@jackjackbobo', icon: Youtube },
    { name: 'X', url: 'https://x.com/your_account', icon: Twitter },
    { name: 'GitHub', url: 'https://github.com/Lum-aurous', icon: Github },
    { name: 'Gmail', url: 'mailto:bojackjck@gmail.com', icon: Mail }
]

// 获取诗句 (随机模式)
const fetchPoem = async () => {
    try {
        // 🔥 核心修改：将 /poem/current 改为 /poem/random
        // 这样每次刷新，后端都会从 is_active=1 的池子里随机吐出一首
        const res = await api.get(`/poem/random?t=${new Date().getTime()}`)
        if (res.data.success) {
            const poem = res.data.data
            // 兼容性处理：防止 lines 为空炸裂
            const linesRaw = poem.lines || []

            // 确保竖排展示的格式正确
            const lines = Array.isArray(linesRaw)
                ? linesRaw
                : (typeof linesRaw === 'string' ? linesRaw.split('\n') : [])

            // 二次处理：过滤空行并切分字符（如果需要）
            // 之前的模板逻辑是 v-for="(char, charIndex) in line"
            // 所以我们需要保证 lines 是字符串数组 ["一笺寄心意", ...]

            poemData.value = {
                title: poem.title,
                lines: lines.map(l => String(l)), // 确保每一行是字符串
                author: poem.author
            }
        }
    } catch (err) {
        console.error('获取诗句失败:', err)
        // 失败默认兜底保持不变
    }
}

const handleSubmit = async () => {
    // 1. 基础非空验证
    if (!form.value.name.trim() || !form.value.email.trim() || !form.value.content.trim()) {
        return message.warning('请将信笺填写完整')
    }

    // 🔥 优化2：添加严格的邮箱格式验证
    // 必须包含@，域名部分必须有点，后缀至少2位字母
    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/

    if (!emailRegex.test(form.value.email)) {
        return message.warning('请填写正确的邮箱地址 (例如: example@domain.com)，以便我给您回信')
    }

    // 防止重复提交
    if (isSubmitting.value) return;

    isSubmitting.value = true

    try {
        // 发送请求（不再包含 subject 字段）
        const res = await api.post('/contact', form.value)

        if (res.data.success) {
            message.success('信笺已寄出，请留意您的邮箱')
            // 重置表单
            form.value = {
                name: '',
                email: '',
                content: ''
            }
        }
    } catch (err) {
        console.error(err)
        if (err.response?.data?.message) {
            message.error(err.response.data.message)
        } else {
            message.error('投递失败，可能是网络问题，请稍后再试')
        }
    } finally {
        isSubmitting.value = false
    }
}

// ==================== 🔥 核心优化：和登录页完全一致的背景逻辑 ====================
const bgUrl = ref('') // 左侧背景

const fetchRandomBackground = async () => {
    try {
        const res = await api.get('/wallpaper/global')
        if (res.data.success) {
            const { randomUrls, websiteUrl } = res.data.data

            if (randomUrls && randomUrls.length > 0) {
                // 随机选一张
                const randomIndex = Math.floor(Math.random() * randomUrls.length)
                bgUrl.value = randomUrls[randomIndex]
            } else if (websiteUrl) {
                bgUrl.value = websiteUrl
            } else {
                // 兜底
                bgUrl.value = 'https://4kwallpapers.com/images/walls/thumbs_3t/13880.jpg'
            }
        }
    } catch (err) {
        console.error('Contact 获取背景失败:', err)
        bgUrl.value = 'https://4kwallpapers.com/images/walls/thumbs_3t/13880.jpg'
    }
}

// 计算样式（最稳方案）
const leftPanelStyle = computed(() => ({
    backgroundImage: `url(${bgUrl.value})`,
    backgroundPosition: 'center',
    backgroundSize: 'cover',
    backgroundRepeat: 'no-repeat'
}))

onMounted(() => {
    fetchPoem()
    fetchRandomBackground() // 🔥 每次进入 Contact 页面都重新获取
})
</script>

<template>
    <div class="contact-page">
        <main class="contact-wrapper">
            <div class="glass-card">

                <!-- 左侧：视觉 + 诗句展示 -->
                <section class="left-panel" :style="leftPanelStyle">
                    <div class="left-overlay"></div>

                    <div class="left-content">
                        <!-- 装饰元素 - 手机端隐藏 -->
                        <div class="decorative-elements">
                            <div class="decorative-line line-top"></div>
                            <div class="decorative-dot"></div>
                            <div class="decorative-line line-bottom"></div>
                        </div>

                        <!-- 动态诗句 -->
                        <div class="poem-container">
                            <!-- 竖排诗句 -->
                            <div class="vertical-poem">
                                <div v-for="(line, lineIndex) in poemData.lines" :key="lineIndex" class="poem-column">
                                    <div v-for="(char, charIndex) in line" :key="charIndex" class="poem-char">
                                        {{ char }}
                                    </div>
                                </div>
                            </div>

                            <!-- 竖排装饰线 - 手机端隐藏 -->
                            <div class="vertical-divider"></div>

                            <!-- 诗句信息 -->
                            <div class="poem-info">
                                <p class="poem-title">{{ poemData.title }}</p>
                                <p class="poem-author">{{ poemData.author }}</p>
                            </div>

                            <!-- 原引用部分 - 手机端隐藏 -->
                            <div class="quote-section">
                                <Feather :size="20" class="quote-icon" />
                                <p class="quote-text">"Words are the voice of the heart"</p>
                            </div>
                        </div>
                    </div>
                </section>


                <!-- 右侧：表单 -->
                <section class="right-panel">
                    <div class="form-container">
                        <!-- 标题 -->
                        <div class="title-container">
                            <div class="title-line"></div>
                            <h3 class="form-title">一笺寄心意</h3>
                            <div class="title-line"></div>
                        </div>

                        <p class="form-subtitle">笔墨传情，纸短情长</p>

                        <form @submit.prevent="handleSubmit" class="form-elements">
                            <div class="input-group">
                                <div class="input-icon">
                                    <PenTool :size="18" />
                                </div>
                                <input v-model="form.name" placeholder="你的名字" class="form-input" />
                            </div>

                            <div class="input-group">
                                <div class="input-icon">
                                    <Mail :size="18" />
                                </div>
                                <input v-model="form.email" placeholder="邮箱地址" class="form-input" />
                            </div>

                            <div class="input-group">
                                <div class="input-icon">
                                    <Feather :size="18" />
                                </div>
                                <textarea v-model="form.content" placeholder="你的想法" class="form-textarea"></textarea>
                            </div>

                            <button :disabled="isSubmitting" class="submit-btn">
                                <Send :size="18" class="btn-icon" />
                                {{ isSubmitting ? '投递中...' : '投递心声' }}
                                <Heart :size="16" class="btn-heart" />
                            </button>
                        </form>

                        <!-- 社交链接 -->
                        <div class="social-links">
                            <p class="social-title">其它联系方式</p>
                            <div class="social-icons">
                                <a v-for="s in socials" :key="s.name" :href="s.url"
                                    :target="s.url.startsWith('mailto') ? '_self' : '_blank'" :title="s.name"
                                    class="social-icon">
                                    <component :is="s.icon" :size="20" />
                                </a>
                            </div>
                        </div>
                    </div>
                </section>
            </div>
        </main>
    </div>
</template>


<style scoped>
/* 引入字体 */
@import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@400;500;600&family=Cormorant+Garamond:wght@300;400;500&family=Playfair+Display:wght@400;500;600&display=swap');

/* 页面背景 */
.contact-page {
    min-height: 100vh;
    background: linear-gradient(135deg, #f5f1e8 0%, #e8e2d5 100%);
    background-image:
        radial-gradient(circle at 10% 20%, rgba(255, 255, 255, 0.8) 0%, transparent 20%),
        radial-gradient(circle at 90% 80%, rgba(232, 226, 213, 0.6) 0%, transparent 20%);
}

/* 居中容器 */
.contact-wrapper {
    min-height: 100vh;
    display: flex;
    justify-content: center;
    align-items: center;
    padding: 90px 20px 40px;
    box-sizing: border-box;
}

/* 毛玻璃主体 */
.glass-card {
    width: 100%;
    max-width: 920px;
    min-height: 600px;
    max-height: 85vh;
    display: flex;
    background: rgba(255, 253, 248, 0.88);
    backdrop-filter: blur(24px);
    border-radius: 24px;
    overflow: hidden;
    border: 1px solid rgba(255, 255, 255, 0.4);
    box-shadow:
        0 20px 40px rgba(168, 144, 96, 0.1),
        inset 0 1px 0 rgba(255, 255, 255, 0.6),
        0 0 0 1px rgba(255, 255, 255, 0.2);
}

/* 左侧面板 */
.left-panel {
    flex: 1.1;
    position: relative;
}

.left-overlay {
    position: absolute;
    inset: 0;
    background: linear-gradient(135deg,
            rgba(139, 128, 107, 0.85) 0%,
            rgba(92, 83, 70, 0.9) 100%);
}

.left-content {
    position: relative;
    z-index: 1;
    height: 100%;
    padding: 30px 30px;
    color: #f5f1e8;
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
}

/* 诗句容器 */
.poem-container {
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    padding: 20px;
    text-align: center;
}

/* 竖排诗句 */
.vertical-poem {
    display: flex;
    gap: 40px;
    margin: 0 auto;
    justify-content: center;
    align-items: flex-start;
    padding: 30px 0;
}

/* 每列诗句 */
.poem-column {
    display: flex;
    flex-direction: column;
    position: relative;
    gap: 30px;
    margin: 0 auto;
    justify-content: center;
    align-items: flex-start;
    padding: 15px 0;
}

/* 每个汉字 - 使用系统行楷字体 */
.poem-char {
    font-family:
        "STXingkai",
        "STKaiti",
        "KaiTi",
        "Microsoft YaHei",
        serif;
    font-size: 2rem;
    color: rgba(245, 241, 232, 0.95);
    line-height: 1;
    writing-mode: vertical-rl;
    text-orientation: upright;
    opacity: 0;
    transform: translateY(20px);
    animation: fadeInUp 0.8s ease-out forwards;
    letter-spacing: 0;
    font-weight: 500;
    text-shadow:
        1px 1px 2px rgba(0, 0, 0, 0.3),
        0 0 8px rgba(255, 255, 255, 0.1);
}

/* 标点符号样式 */
.poem-char:last-child {
    margin-top: 6px;
    font-size: 1.4rem;
}

/* 完善所有诗句的动画延迟 */
.poem-column:nth-child(1) .poem-char:nth-child(1) {
    animation-delay: 0.3s;
}

.poem-column:nth-child(1) .poem-char:nth-child(2) {
    animation-delay: 0.4s;
}

.poem-column:nth-child(1) .poem-char:nth-child(3) {
    animation-delay: 0.5s;
}

.poem-column:nth-child(1) .poem-char:nth-child(4) {
    animation-delay: 0.6s;
}

.poem-column:nth-child(1) .poem-char:nth-child(5) {
    animation-delay: 0.7s;
}

.poem-column:nth-child(2) .poem-char:nth-child(1) {
    animation-delay: 0.8s;
}

.poem-column:nth-child(2) .poem-char:nth-child(2) {
    animation-delay: 0.9s;
}

.poem-column:nth-child(2) .poem-char:nth-child(3) {
    animation-delay: 1.0s;
}

.poem-column:nth-child(2) .poem-char:nth-child(4) {
    animation-delay: 1.1s;
}

.poem-column:nth-child(2) .poem-char:nth-child(5) {
    animation-delay: 1.2s;
}

.poem-column:nth-child(2) .poem-char:nth-child(6) {
    animation-delay: 1.3s;
}

.poem-column:nth-child(3) .poem-char:nth-child(1) {
    animation-delay: 1.4s;
}

.poem-column:nth-child(3) .poem-char:nth-child(2) {
    animation-delay: 1.5s;
}

.poem-column:nth-child(3) .poem-char:nth-child(3) {
    animation-delay: 1.6s;
}

.poem-column:nth-child(3) .poem-char:nth-child(4) {
    animation-delay: 1.7s;
}

.poem-column:nth-child(3) .poem-char:nth-child(5) {
    animation-delay: 1.8s;
}

.poem-column:nth-child(3) .poem-char:nth-child(6) {
    animation-delay: 1.9s;
}

.poem-column:nth-child(4) .poem-char:nth-child(1) {
    animation-delay: 2.0s;
}

.poem-column:nth-child(4) .poem-char:nth-child(2) {
    animation-delay: 2.1s;
}

.poem-column:nth-child(4) .poem-char:nth-child(3) {
    animation-delay: 2.2s;
}

.poem-column:nth-child(4) .poem-char:nth-child(4) {
    animation-delay: 2.3s;
}

.poem-column:nth-child(4) .poem-char:nth-child(5) {
    animation-delay: 2.4s;
}

.poem-column:nth-child(4) .poem-char:nth-child(6) {
    animation-delay: 2.5s;
}

/* 竖排装饰线 */
.vertical-divider {
    width: 1px;
    height: 80px;
    background: linear-gradient(180deg,
            transparent,
            rgba(245, 241, 232, 0.3),
            transparent);
    margin: 0 25px;
    opacity: 0;
    animation: fadeIn 1s ease-out 2.6s forwards;
}

/* 引用部分 */
.quote-section {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-top: 15px;
    opacity: 0;
    animation: fadeIn 1s ease-out 2.8s forwards;
}

.quote-icon {
    opacity: 0.6;
}

.quote-text {
    font-family: 'Playfair Display', serif;
    font-style: italic;
    font-size: 0.9rem;
    opacity: 0.9;
    letter-spacing: 0.5px;
}

/* 装饰元素 */
.decorative-elements {
    position: absolute;
    top: 50%;
    right: 30px;
    transform: translateY(-50%);
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 25px;
}

.decorative-line {
    width: 2px;
    height: 50px;
    background: linear-gradient(to bottom,
            transparent,
            rgba(245, 241, 232, 0.6),
            transparent);
}

.decorative-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: #f5f1e8;
    position: relative;
}

.decorative-dot::after {
    content: '';
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: 12px;
    height: 12px;
    border-radius: 50%;
    border: 1px solid rgba(245, 241, 232, 0.4);
}

/* 右侧面板 */
.right-panel {
    flex: 1;
    background: rgba(255, 253, 248, 0.95);
    padding: 30px 40px;
    display: flex;
    flex-direction: column;
    justify-content: center;
    position: relative;
    overflow: hidden;
}

.form-container {
    max-width: 380px;
    margin: 0 auto;
    width: 100%;
    display: flex;
    flex-direction: column;
    justify-content: center;
    flex: 1;
    min-height: 0;
}

/* 标题 */
.title-container {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 15px;
    margin-bottom: 5px;
    margin-top: 10px;
}

.title-line {
    flex: 1;
    height: 1px;
    background: linear-gradient(90deg,
            transparent,
            rgba(139, 128, 107, 0.3),
            transparent);
}

.form-title {
    font-family: 'Cinzel', serif;
    font-size: 1.8rem;
    font-weight: 500;
    color: #5c5346;
    letter-spacing: 3px;
    text-align: center;
    position: relative;
    padding: 0 8px;
    background: linear-gradient(135deg, #8b806b 0%, #5c5346 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
    text-shadow: 1px 1px 3px rgba(0, 0, 0, 0.1);
    line-height: 1.2;
}

.form-subtitle {
    font-family: 'Cormorant Garamond', serif;
    font-size: 1rem;
    color: #8b806b;
    text-align: center;
    font-style: italic;
    letter-spacing: 0.8px;
    opacity: 0.9;
    margin-bottom: 20px;
}

/* 表单元素 */
.form-elements {
    width: 100%;
    flex: 0 0 auto;
    display: flex;
    flex-direction: column;
    justify-content: center;
}

.input-group {
    position: relative;
    margin-bottom: 15px;
    flex-shrink: 0;
}

.input-icon {
    position: absolute;
    left: 14px;
    top: 50%;
    transform: translateY(-50%);
    color: #8b806b;
    opacity: 0.7;
    z-index: 2;
}

.form-input,
.form-textarea {
    width: 100%;
    padding: 12px 12px 12px 42px;
    border-radius: 10px;
    border: 1px solid rgba(139, 128, 107, 0.2);
    background: rgba(255, 253, 248, 0.8);
    font-size: 0.9rem;
    font-family: 'Cormorant Garamond', serif;
    font-weight: 400;
    color: #5c5346;
    transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
    box-sizing: border-box;
}

.form-input:focus,
.form-textarea:focus {
    outline: none;
    border-color: rgba(139, 128, 107, 0.5);
    background: rgba(255, 253, 248, 1);
    box-shadow:
        0 4px 16px rgba(139, 128, 107, 0.15),
        inset 0 0 0 1px rgba(255, 255, 255, 0.8);
}

.form-input::placeholder,
.form-textarea::placeholder {
    color: #a8997a;
    font-family: 'Cormorant Garamond', serif;
    font-weight: 300;
    letter-spacing: 0.5px;
}

.form-textarea {
    resize: none;
    height: 80px;
    line-height: 1.6;
    flex-shrink: 0;
}

/* 提交按钮 */
.submit-btn {
    width: 100%;
    padding: 14px;
    border-radius: 10px;
    border: none;
    background: linear-gradient(135deg, #8b806b 0%, #5c5346 100%);
    color: #f5f1e8;
    font-family: 'Cormorant Garamond', serif;
    font-size: 1rem;
    font-weight: 500;
    cursor: pointer;
    position: relative;
    overflow: hidden;
    transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    letter-spacing: 0.8px;
    flex-shrink: 0;
    -webkit-appearance: none;
    -moz-appearance: none;
    appearance: none;
}

.submit-btn:hover:not(:disabled) {
    transform: translateY(-2px);
    box-shadow:
        0 8px 25px rgba(139, 128, 107, 0.3),
        0 2px 4px rgba(0, 0, 0, 0.1);
}

.submit-btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
}

.btn-icon {
    transition: transform 0.3s ease;
}

.btn-heart {
    color: #ff6b6b;
    opacity: 0;
    transition: opacity 0.3s ease;
}

.submit-btn:hover:not(:disabled) .btn-icon {
    transform: translateX(2px);
}

.submit-btn:hover:not(:disabled) .btn-heart {
    opacity: 1;
}

.submit-btn::before {
    content: '';
    position: absolute;
    top: 0;
    left: -100%;
    width: 100%;
    height: 100%;
    background: linear-gradient(90deg,
            transparent,
            rgba(255, 255, 255, 0.2),
            transparent);
    transition: left 0.6s ease;
}

.submit-btn:hover::before {
    left: 100%;
}

/* 社交链接 */
.social-links {
    margin-top: 40px;
    padding-top: 20px;
    border-top: 1px solid rgba(139, 128, 107, 0.1);
    flex-shrink: 0;
    margin-bottom: 10px;
}

.social-title {
    font-family: 'Cormorant Garamond', serif;
    font-size: 0.9rem;
    color: #8b806b;
    margin-bottom: 10px;
    text-align: center;
    font-weight: 400;
    letter-spacing: 1.5px;
    text-transform: uppercase;
}

.social-icons {
    display: flex;
    justify-content: center;
    gap: 15px;
}

.social-icon {
    width: 36px;
    height: 36px;
    border-radius: 50%;
    background: linear-gradient(135deg, rgba(139, 128, 107, 0.1) 0%, rgba(92, 83, 70, 0.1) 100%);
    display: flex;
    align-items: center;
    justify-content: center;
    color: #8b806b;
    transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
    border: 1px solid rgba(139, 128, 107, 0.2);
    position: relative;
    overflow: hidden;
}

.social-icon:hover {
    transform: translateY(-2px) scale(1.1);
    background: linear-gradient(135deg, #8b806b 0%, #5c5346 100%);
    color: #f5f1e8;
    border-color: transparent;
    box-shadow: 0 6px 20px rgba(139, 128, 107, 0.25);
}

.social-icon::before {
    content: '';
    position: absolute;
    top: 0;
    left: -100%;
    width: 100%;
    height: 100%;
    background: linear-gradient(90deg,
            transparent,
            rgba(255, 255, 255, 0.3),
            transparent);
    transition: left 0.5s;
}

.social-icon:hover::before {
    left: 100%;
}

/* 诗句信息样式 */
.poem-info {
    margin-top: 20px;
    text-align: center;
    opacity: 0;
    animation: fadeIn 1s ease-out 2.8s forwards;
}

.poem-title {
    font-family: 'Cinzel', serif;
    font-size: 1.2rem;
    color: rgba(245, 241, 232, 0.9);
    margin-bottom: 5px;
    letter-spacing: 2px;
}

.poem-author {
    font-family: 'Cormorant Garamond', serif;
    font-size: 0.9rem;
    color: rgba(245, 241, 232, 0.7);
    font-style: italic;
}

/* ==================== 响应式优化 ==================== */

/* 平板和中等屏幕 (900px以下) */
@media (max-width: 900px) {
    .contact-wrapper {
        padding: 90px 15px 30px;
        align-items: flex-start;
        min-height: auto;
    }

    .glass-card {
        flex-direction: column;
        max-width: 95%;
        max-height: none;
        min-height: auto;
        margin: 0 auto;
        border-radius: 20px;
    }

    .left-panel {
        flex: 0 0 auto;
        min-height: 200px;
        width: 100%;
        position: relative;
        overflow: hidden;
    }

    .left-content {
        padding: 20px 15px;
        height: auto;
        min-height: 220px;
    }

    .poem-container {
        padding: 15px;
        justify-content: center;
        height: 100%;
    }

    .vertical-poem {
        gap: 15px;
        padding: 10px 0;
        width: 100%;
        justify-content: center;
        padding-bottom: 10px;
    }

    .poem-column {
        gap: 12px;
    }

    .poem-char {
        font-size: 1.6rem;
        writing-mode: vertical-rl;
        text-orientation: upright;
    }

    .poem-char:last-child {
        font-size: 1.2rem;
    }

    .vertical-divider {
        height: 80px;
        margin: 0 15px;
        flex-shrink: 0;
    }

    .poem-info {
        margin-top: 10px;
        width: 100%;
        position: static;
        padding: 0;
    }

    .poem-title {
        font-size: 1rem;
    }

    .poem-author {
        font-size: 0.8rem;
    }

    .decorative-elements {
        display: none;
    }

    .quote-section {
        display: none;
    }

    .right-panel {
        flex: 0 0 auto;
        padding: 25px 20px;
        width: 100%;
    }

    .form-container {
        max-width: 100%;
        min-height: auto;
    }

    .title-container {
        margin-top: 5px;
        margin-bottom: 8px;
    }

    .form-title {
        font-size: 1.6rem;
        letter-spacing: 2px;
    }

    .form-subtitle {
        font-size: 0.9rem;
        margin-bottom: 20px;
    }

    .form-elements {
        gap: 15px;
    }

    .input-group {
        margin-bottom: 0;
    }

    .form-input,
    .form-textarea {
        padding: 12px 12px 12px 40px;
        font-size: 0.9rem;
    }

    .input-icon {
        left: 12px;
    }

    .form-textarea {
        height: 100px;
    }

    .submit-btn {
        margin-top: 5px;
        padding: 13px;
        font-size: 1rem;
    }

    .social-links {
        margin-top: 25px;
        padding-top: 15px;
        margin-bottom: 5px;
    }

    .social-title {
        font-size: 0.85rem;
        margin-bottom: 15px;
    }

    .social-icons {
        gap: 15px;
    }

    .social-icon {
        width: 38px;
        height: 38px;
    }
}

/* ==================== 📱 手機端 (600px以下) - 重要修正！ ==================== */
@media (max-width: 600px) {
    .contact-wrapper {
        padding: 80px 12px 25px;
        align-items: flex-start;
    }

    .glass-card {
        flex-direction: column;
        width: 100%;
        max-width: 100%;
        border-radius: 18px;
        box-shadow:
            0 10px 30px rgba(168, 144, 96, 0.08),
            inset 0 1px 0 rgba(255, 255, 255, 0.6),
            0 0 0 1px rgba(255, 255, 255, 0.2);
    }

    /* 左侧面板优化 */
    .left-panel {
        height: auto;
        min-height: 250px;
        /* 增加高度以容納分行詩句 */
        flex: 0 0 auto;
        border-radius: 18px 18px 0 0;
    }

    .left-overlay {
        border-radius: 18px 18px 0 0;
    }

    .left-content {
        padding: 20px 15px;
        min-height: 250px;
        justify-content: center;
        align-items: center;
    }

    /* 詩句容器優化 */
    .poem-container {
        padding: 15px 10px;
        gap: 8px;
        width: 100%;
        height: 100%;
        display: flex;
        flex-direction: column;
        justify-content: center;
        align-items: center;
    }

    /* 🔥 關鍵修正：詩句佈局從「橫向一行」變為「縱向多行」 */
    .vertical-poem {
        display: flex;
        flex-direction: column;
        /* 改為縱向排列，每句詩一行 */
        justify-content: center;
        align-items: center;
        gap: 12px;
        /* 行間距 */
        padding: 0;
        margin: 0;
        width: 100%;
        max-width: 100%;
        height: auto;
    }

    /* 每句詩容器 - 改為橫排，每個字在同一行 */
    .poem-column {
        display: flex;
        flex-direction: row;
        /* 每個字橫向排列 */
        justify-content: center;
        align-items: center;
        gap: 8px;
        /* 字間距 */
        margin: 0;
        padding: 0;
        width: 100%;
        flex-wrap: nowrap;
    }

    /* 單個漢字樣式 - 手機端改為橫排 */
    .poem-char {
        font-size: 1.3rem;
        writing-mode: horizontal-tb;
        /* 橫向書寫 */
        text-orientation: mixed;
        line-height: 1.2;
        transform: translateY(10px);
        animation: fadeInUp 0.6s ease-out forwards;
        display: inline-block;
        white-space: nowrap;
    }

    /* 標點符號修正 */
    .poem-char:last-child {
        font-size: 1.1rem;
        margin-top: 0;
        margin-left: 2px;
        transform: translateY(-2px);
    }

    /* 調整動畫延遲 - 每行詩句依次出現 */
    .vertical-poem .poem-column:nth-child(1) {
        animation-delay: 0.2s;
    }

    .vertical-poem .poem-column:nth-child(2) {
        animation-delay: 0.4s;
    }

    .vertical-poem .poem-column:nth-child(3) {
        animation-delay: 0.6s;
    }

    .vertical-poem .poem-column:nth-child(4) {
        animation-delay: 0.8s;
    }

    /* 裝飾線隱藏 */
    .vertical-divider {
        display: none;
    }

    /* 詩句信息 - 放在詩句下方 */
    .poem-info {
        position: relative;
        bottom: auto;
        left: auto;
        right: auto;
        margin-top: 15px;
        padding: 0;
        width: 100%;
        text-align: center;
        animation: fadeIn 1s ease-out 1.2s forwards;
    }

    .poem-title {
        font-size: 0.95rem;
        margin-bottom: 3px;
        letter-spacing: 1.5px;
    }

    .poem-author {
        font-size: 0.8rem;
    }

    /* 右側面板優化 */
    .right-panel {
        padding: 25px 20px;
        background: rgba(255, 253, 248, 0.98);
        flex: 1;
        border-radius: 0 0 18px 18px;
    }

    .form-container {
        display: flex;
        flex-direction: column;
        gap: 20px;
        min-height: auto;
    }

    .title-container {
        margin: 0 0 10px 0;
        gap: 10px;
    }

    .form-title {
        font-size: 1.4rem;
        letter-spacing: 1px;
        padding: 0 5px;
    }

    .title-line {
        height: 0.5px;
    }

    .form-subtitle {
        font-size: 0.85rem;
        margin-bottom: 15px;
        letter-spacing: 0.5px;
    }

    /* 表單元素優化 */
    .form-elements {
        gap: 12px;
        flex: 1;
        justify-content: flex-start;
    }

    .input-group {
        margin-bottom: 0;
    }

    .form-input,
    .form-textarea {
        padding: 14px 14px 14px 42px;
        font-size: 0.9rem;
        border-radius: 8px;
        border: 1px solid rgba(139, 128, 107, 0.25);
    }

    .form-input:focus,
    .form-textarea:focus {
        border-color: rgba(139, 128, 107, 0.6);
        box-shadow:
            0 2px 8px rgba(139, 128, 107, 0.1),
            inset 0 0 0 1px rgba(255, 255, 255, 0.8);
    }

    .input-icon {
        left: 14px;
    }

    .form-textarea {
        height: 90px;
        min-height: 90px;
        max-height: 120px;
    }

    .submit-btn {
        padding: 14px;
        font-size: 0.95rem;
        margin-top: 10px;
        border-radius: 8px;
        letter-spacing: 0.5px;
    }

    .btn-icon {
        width: 18px;
        height: 18px;
    }

    .btn-heart {
        width: 16px;
        height: 16px;
    }

    /* 社交鏈接優化 */
    .social-links {
        margin-top: 20px;
        padding-top: 15px;
        margin-bottom: 0;
        flex-shrink: 0;
    }

    .social-title {
        font-size: 0.8rem;
        margin-bottom: 12px;
        letter-spacing: 1px;
    }

    .social-icons {
        gap: 12px;
    }

    .social-icon {
        width: 36px;
        height: 36px;
    }

    .social-icon svg {
        width: 18px;
        height: 18px;
    }
}

/* 超小屏幕手机 (400px以下) */
@media (max-width: 400px) {
    .contact-wrapper {
        padding: 70px 8px 20px;
    }

    .glass-card {
        border-radius: 16px;
    }

    .left-panel {
        min-height: 230px;
        border-radius: 16px 16px 0 0;
    }

    .left-overlay {
        border-radius: 16px 16px 0 0;
    }

    .left-content {
        padding: 15px 10px;
        min-height: 230px;
    }

    .poem-container {
        padding: 10px 8px;
        gap: 6px;
    }

    .vertical-poem {
        gap: 10px;
    }

    .poem-column {
        gap: 6px;
    }

    .poem-char {
        font-size: 1.2rem;
    }

    .poem-char:last-child {
        font-size: 1rem;
        margin-left: 1px;
    }

    .poem-info {
        margin-top: 12px;
    }

    .poem-title {
        font-size: 0.9rem;
    }

    .poem-author {
        font-size: 0.75rem;
    }

    /* 右侧面板进一步优化 */
    .right-panel {
        padding: 20px 16px;
        border-radius: 0 0 16px 16px;
    }

    .form-container {
        gap: 16px;
    }

    .title-container {
        gap: 8px;
        margin-bottom: 8px;
    }

    .form-title {
        font-size: 1.3rem;
        letter-spacing: 0.5px;
    }

    .form-subtitle {
        font-size: 0.8rem;
        margin-bottom: 12px;
    }

    .form-elements {
        gap: 10px;
    }

    .form-input,
    .form-textarea {
        padding: 12px 12px 12px 38px;
        font-size: 0.85rem;
        border-radius: 6px;
    }

    .input-icon {
        left: 12px;
    }

    .input-icon svg {
        width: 16px;
        height: 16px;
    }

    .form-textarea {
        height: 80px;
        min-height: 80px;
        max-height: 100px;
    }

    .submit-btn {
        padding: 12px;
        font-size: 0.9rem;
        margin-top: 8px;
        border-radius: 6px;
    }

    .btn-icon {
        width: 16px;
        height: 16px;
    }

    .btn-heart {
        width: 14px;
        height: 14px;
    }

    .social-links {
        margin-top: 18px;
        padding-top: 12px;
    }

    .social-title {
        font-size: 0.75rem;
        margin-bottom: 10px;
    }

    .social-icons {
        gap: 10px;
    }

    .social-icon {
        width: 34px;
        height: 34px;
    }

    .social-icon svg {
        width: 16px;
        height: 16px;
    }
}

/* 横向手机模式优化 */
@media (max-width: 900px) and (orientation: landscape) {
    .contact-wrapper {
        padding: 80px 15px 20px;
        align-items: flex-start;
    }

    .glass-card {
        max-width: 95%;
        min-height: auto;
    }

    .left-panel {
        min-height: 180px;
    }

    .left-content {
        min-height: 180px;
        padding: 15px;
    }

    .vertical-poem {
        gap: 8px;
    }

    .poem-char {
        font-size: 1.1rem;
    }

    .right-panel {
        padding: 20px;
    }

    .form-container {
        gap: 15px;
    }

    .form-elements {
        gap: 10px;
    }

    .form-textarea {
        height: 70px;
        min-height: 70px;
    }

    .social-links {
        margin-top: 15px;
    }
}

/* 特殊小屏幕设备 (320px以下) */
@media (max-width: 320px) {
    .contact-wrapper {
        padding: 65px 6px 15px;
    }

    .glass-card {
        border-radius: 14px;
    }

    .left-panel {
        min-height: 210px;
        border-radius: 14px 14px 0 0;
    }

    .left-overlay {
        border-radius: 14px 14px 0 0;
    }

    .left-content {
        padding: 12px 8px;
        min-height: 210px;
    }

    .vertical-poem {
        gap: 8px;
    }

    .poem-column {
        gap: 4px;
    }

    .poem-char {
        font-size: 1.1rem;
    }

    .poem-char:last-child {
        font-size: 0.9rem;
    }

    .right-panel {
        padding: 18px 14px;
        border-radius: 0 0 14px 14px;
    }

    .form-title {
        font-size: 1.2rem;
    }

    .form-subtitle {
        font-size: 0.75rem;
    }

    .form-input,
    .form-textarea {
        padding: 10px 10px 10px 35px;
        font-size: 0.8rem;
    }

    .social-icon {
        width: 32px;
        height: 32px;
    }
}

/* 动画 */
@keyframes fadeInUp {
    from {
        opacity: 0;
        transform: translateY(20px);
    }

    to {
        opacity: 1;
        transform: translateY(0);
    }
}

@keyframes fadeIn {
    from {
        opacity: 0;
    }

    to {
        opacity: 1;
    }
}

.form-container>* {
    animation: fadeInUp 0.6s ease-out forwards;
}

.form-title {
    animation-delay: 0.1s;
}

.form-subtitle {
    animation-delay: 0.2s;
}

.input-group:nth-child(1) {
    animation-delay: 0.3s;
}

.input-group:nth-child(2) {
    animation-delay: 0.4s;
}

.input-group:nth-child(3) {
    animation-delay: 0.5s;
}

.submit-btn {
    animation-delay: 0.6s;
}

.social-links {
    animation-delay: 0.7s;
}

/* 触摸设备优化 */
@media (hover: none) and (pointer: coarse) {
    .submit-btn:hover:not(:disabled) {
        transform: none;
    }

    .submit-btn:active:not(:disabled) {
        transform: scale(0.98);
    }

    .social-icon:hover {
        transform: none;
    }

    .social-icon:active {
        transform: scale(0.95);
    }

    /* 增加触摸目标大小 */
    .form-input,
    .form-textarea,
    .submit-btn {
        min-height: 44px;
    }

    .social-icon {
        min-width: 44px;
        min-height: 44px;
    }
}
</style>