<script setup>
import { ref, reactive, computed, onMounted, onBeforeUnmount } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useUserStore } from '@/stores/user.js'
import { message } from '@/utils/message.js'
import { api } from '@/utils/api'
import axios from 'axios'
import AuthManager from '@/utils/auth.js'

const router = useRouter()
const route = useRoute() // Access current route
const userStore = useUserStore()

// ==================== 1. State Management ====================
// Determine mode based on URL path initially
const isLoginMode = ref(route.path === '/login')

const bgUrl = ref('https://images.unsplash.com/photo-1493246507139-91e8fad9978e?w=1920&q=80')
const illustrationUrl = ref('')
const isLoading = ref(false)
const captchaCode = ref('')
const captchaText = ref('')
const showForgotPassword = ref(false)
const showPhoneInput = ref(false)
const showPassword = ref(false)
const showConfirmPassword = ref(false)

const form = reactive({
    account: '',
    password: '',
    confirmPassword: '',
    phone: ''
})

// Forgot Password State
const resetStep = ref(1)
const resetForm = reactive({ account: '', code: '', newPassword: '', confirmNewPassword: '' })
const resetLoading = ref(false)
const showResetPassword = ref(false)
const showResetConfirmPassword = ref(false)
const countdown = ref(0)
let timer = null

// ==================== 2. Core Logic ====================

// Fetch Background (Robust error handling)
const fetchBackground = async () => {
    try {
        const res = await api.get('/wallpaper/global').catch(() => null)
        if (res?.data?.success) {
            const { randomUrls, websiteUrl } = res.data.data
            if (randomUrls?.length > 0) {
                bgUrl.value = randomUrls[Math.floor(Math.random() * randomUrls.length)]
                // Try to pick a different one for illustration if possible
                let i = Math.floor(Math.random() * randomUrls.length)
                if (randomUrls.length > 1) {
                    while (randomUrls[i] === bgUrl.value) i = Math.floor(Math.random() * randomUrls.length)
                }
                illustrationUrl.value = randomUrls[i]
            } else if (websiteUrl) {
                bgUrl.value = websiteUrl
                illustrationUrl.value = websiteUrl
            }
        }
    } catch (e) {
        console.warn('Background load failed, using default')
    }
}

const leftStyle = computed(() => ({
    backgroundImage: `url(${illustrationUrl.value || bgUrl.value})`,
    backgroundSize: 'cover',
    backgroundPosition: 'center'
}))

// Local Captcha Generation
const initCaptcha = () => {
    const chars = '0123456789ABCDEFGHJKLMNPQRSTUVWXYZ'
    let code = ''
    for (let i = 0; i < 4; i++) code += chars.charAt(Math.floor(Math.random() * chars.length))
    captchaText.value = code
    captchaCode.value = ''
}

// Check Input Type (Phone vs Username/Email)
const checkInputType = () => {
    const input = form.account
    if (/^\d{11}$/.test(input)) {
        showPhoneInput.value = true
        form.phone = input
    } else {
        showPhoneInput.value = false
        form.phone = ''
    }
}

// Toggle Mode (Updates URL)
const toggleMode = () => {
    const targetPath = isLoginMode.value ? '/register' : '/login'
    router.push(targetPath).then(() => {
        isLoginMode.value = !isLoginMode.value
        // Reset form errors/captcha on switch
        form.password = ''
        form.confirmPassword = ''
        initCaptcha()
    })
}

// Submit Logic
const handleSubmit = async () => {
    if (!form.account || !form.password) return message.warning('请填写完整信息')

    if (isLoginMode.value) {
        if (captchaCode.value.toUpperCase() !== captchaText.value) {
            initCaptcha()
            return message.error('验证码错误')
        }
    } else {
        if (form.password.length < 6) return message.warning('密码至少需要 6 位')
        if (form.password !== form.confirmPassword) return message.warning('两次输入的密码不一致')
        if (form.account.includes('@')) {
            const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/
            if (!emailRegex.test(form.account)) return message.warning('邮箱格式不正确')
        }
    }

    isLoading.value = true
    try {
        const url = isLoginMode.value ? '/api/login' : '/api/register'
        const res = await axios.post(url, { account: form.account, password: form.password })

        if (res.data.success) {
            if (isLoginMode.value) {
                const { token, user } = res.data.data
                AuthManager.login(user, token)
                userStore.login(user, token)
                window.dispatchEvent(new CustomEvent('user-login', { detail: { user, token } }))
                message.success(`欢迎回来，${user.nickname || user.username}`)

                // Handle redirect if stored
                const redirectPath = sessionStorage.getItem('redirectPath') || '/'
                sessionStorage.removeItem('redirectPath')

                router.push(redirectPath)
                // Reload to ensure all states (like navbar) update correctly
                setTimeout(() => window.location.reload(), 500)
            } else {
                message.success('注册成功，请登录')
                toggleMode()
            }
        } else {
            message.error(res.data.message || '操作失败')
            initCaptcha()
        }
    } catch (error) {
        const msg = error.response?.data?.message || '网络请求失败'
        message.error(msg)
        initCaptcha()
    } finally {
        isLoading.value = false
    }
}

// Forgot Password Logic
const openForgotPassword = () => { showForgotPassword.value = true; resetStep.value = 1; resetForm.account = form.account }

const sendResetCode = async () => {
    if (countdown.value > 0) return
    if (!resetForm.account) return message.warning('请输入账号')

    resetLoading.value = true
    try {
        // 由于 api.js 拦截器会拦截 success: false，
        // 如果邮箱未注册，这里会直接跳到 catch 块，不会执行下面的 res 判断
        const res = await api.post('/reset-password/send-code', { account: resetForm.account })

        if (res.data.success) {
            message.success('验证码已发送')
            resetStep.value = 2
            countdown.value = 60
            // ... 倒计时逻辑 ...
            if (timer) clearInterval(timer)
            timer = setInterval(() => {
                countdown.value--
                if (countdown.value <= 0) clearInterval(timer)
            }, 1000)
        }
    } catch (e) {
        // 🔥 关键：在这里我们保持沉默
        // 因为拦截器已经根据后端返回的 message 弹出了提示
        // 这样页面上就只会有一个弹窗，而且是后端给出的文案
        console.warn('业务逻辑未通过，拦截器已处理提示')
    } finally {
        resetLoading.value = false
    }
}

const handleResetPassword = async () => {
    if (!resetForm.code || !resetForm.newPassword) return message.warning('请填写完整')
    resetLoading.value = true
    try {
        const res = await api.post('/reset-password/verify', { ...resetForm })
        if (res.data.success) {
            message.success('密码重置成功')
            showForgotPassword.value = false
        } else { message.error(res.data.message) }
    } catch (e) { message.error('重置失败') }
    finally { resetLoading.value = false }
}

onMounted(() => {
    fetchBackground()
    initCaptcha()
    if (sessionStorage.getItem('isSwitchingAccount') === 'true') {
        isSwitchingAccount.value = true
        isLoginMode.value = true // Force login mode for switching
    }
})

onBeforeUnmount(() => {
    if (timer) clearInterval(timer)
})
</script>

<template>
    <div class="login-page-container">
        <div class="page-bg" :style="{ backgroundImage: `url(${bgUrl})` }"></div>
        <div class="page-mask"></div>

        <div class="card-container animate__animated animate__fadeInUp">

            <div class="left-panel" :style="leftStyle">
                <div class="panel-overlay"></div>
                <div class="panel-content">
                    <div class="deco-box">
                        <div class="line"></div>
                        <div class="dot"></div>
                        <div class="line"></div>
                    </div>
                    <h1 class="brand">Veritas</h1>
                    <p class="slogan">记录生活，发现美好</p>
                </div>
            </div>

            <div class="right-panel">
                <div class="form-box">
                    <div class="header">
                        <span class="header-line"></span>
                        <h2>{{ isLoginMode ? '登 录' : '注 册' }}</h2>
                        <span class="header-line"></span>
                    </div>

                    <p class="sub-text">{{ isLoginMode ? '欢迎回到 Veritas' : '开启新的旅程' }}</p>

                    <div class="form-elements">
                        <div class="input-group">
                            <div class="icon">
                                <svg v-if="!showPhoneInput" viewBox="0 0 24 24" width="18" height="18" fill="none"
                                    stroke="currentColor" stroke-width="2" stroke-linecap="round"
                                    stroke-linejoin="round">
                                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                                    <circle cx="12" cy="7" r="4"></circle>
                                </svg>
                                <svg v-else viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor"
                                    stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                    <path
                                        d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z">
                                    </path>
                                </svg>
                            </div>
                            <input v-model="form.account" :placeholder="isLoginMode ? '邮箱账号/用户名' : '邮箱'"
                                @input="checkInputType" @keyup.enter="handleSubmit" />
                        </div>

                        <div class="input-group">
                            <div class="icon">
                                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor"
                                    stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                                    <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                                </svg>
                            </div>

                            <input :type="showPassword ? 'text' : 'password'" v-model="form.password" placeholder="密码"
                                @keyup.enter="handleSubmit" />

                            <div class="eye-icon" @click="showPassword = !showPassword">
                                <svg v-if="showPassword" viewBox="0 0 24 24" width="18" height="18" fill="none"
                                    stroke="currentColor" stroke-width="2" stroke-linecap="round"
                                    stroke-linejoin="round">
                                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                                    <circle cx="12" cy="12" r="3"></circle>
                                </svg>
                                <svg v-else viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor"
                                    stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                    <path
                                        d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24">
                                    </path>
                                    <line x1="1" y1="1" x2="23" y2="23"></line>
                                </svg>
                            </div>
                        </div>

                        <div class="input-group" v-if="!isLoginMode">
                            <div class="icon">
                                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor"
                                    stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
                                </svg>
                            </div>

                            <input :type="showConfirmPassword ? 'text' : 'password'" v-model="form.confirmPassword"
                                placeholder="确认密码" @keyup.enter="handleSubmit" />

                            <div class="eye-icon" @click="showConfirmPassword = !showConfirmPassword">
                                <svg v-if="showConfirmPassword" viewBox="0 0 24 24" width="18" height="18" fill="none"
                                    stroke="currentColor" stroke-width="2" stroke-linecap="round"
                                    stroke-linejoin="round">
                                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                                    <circle cx="12" cy="12" r="3"></circle>
                                </svg>
                                <svg v-else viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor"
                                    stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                    <path
                                        d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24">
                                    </path>
                                    <line x1="1" y1="1" x2="23" y2="23"></line>
                                </svg>
                            </div>
                        </div>

                        <div class="captcha-row" v-if="isLoginMode">
                            <div class="input-group short">
                                <div class="icon">
                                    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor"
                                        stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                        <path
                                            d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4">
                                        </path>
                                    </svg>
                                </div>
                                <input v-model="captchaCode" placeholder="验证码" @keyup.enter="handleSubmit" />
                            </div>
                            <div class="captcha-img" @click="initCaptcha">{{ captchaText }}</div>
                        </div>

                        <div class="links" v-if="isLoginMode">
                            <span @click="openForgotPassword">忘记密码?</span>
                        </div>

                        <button class="submit-btn" @click="handleSubmit" :disabled="isLoading">
                            {{ isLoading ? '处理中...' : (isLoginMode ? '进 入' : '加 入') }}
                        </button>

                        <div class="footer-link">
                            <span @click="toggleMode">{{ isLoginMode ? '没有账号？去注册' : '已有账号？去登录' }}</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <div v-if="showForgotPassword" class="modal-mask" @click.self="showForgotPassword = false">
            <div class="art-modal" @click.stop>

                <div class="art-modal-header">
                    <span class="decoration-line"></span>
                    <h3>找回密码</h3>
                    <span class="decoration-line"></span>
                    <button class="art-close-btn" @click="showForgotPassword = false">✕</button>
                </div>

                <div class="art-modal-body">
                    <p class="art-desc">𝓥𝓮𝓻𝓲𝓽𝓪𝓼 将向您的账号发送验证码</p>

                    <div v-if="resetStep === 1" class="animate__animated animate__fadeIn">
                        <div class="input-group">
                            <input v-model="resetForm.account" type="text" class="art-input" placeholder=" " autofocus>
                            <label>请输入邮箱账号</label>
                            <span class="input-underline"></span>
                        </div>

                        <button class="art-btn-primary full-width" @click="sendResetCode"
                            :disabled="resetLoading || countdown > 0">
                            {{ countdown > 0 ? `${countdown}秒后重试` : (resetLoading ? '发送中...' : '发送验证码') }}
                        </button>
                    </div>

                    <div v-else class="animate__animated animate__fadeIn">

                        <div class="input-group">
                            <input v-model="resetForm.code" type="text" class="art-input" placeholder=" ">
                            <label>验证码</label>
                            <span class="input-underline"></span>

                            <span class="resend-link-art" :class="{ disabled: countdown > 0 }" @click="sendResetCode">
                                {{ countdown > 0 ? `${countdown}s` : '重新发送' }}
                            </span>
                        </div>

                        <div class="input-group">
                            <input :type="showResetPassword ? 'text' : 'password'" v-model="resetForm.newPassword"
                                class="art-input" placeholder=" ">
                            <label>新密码</label>
                            <span class="input-underline"></span>

                            <div class="eye-icon-art" @click="showResetPassword = !showResetPassword">
                                <svg v-if="showResetPassword" viewBox="0 0 24 24" width="18" height="18" fill="none"
                                    stroke="currentColor" stroke-width="2" stroke-linecap="round"
                                    stroke-linejoin="round">
                                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                                    <circle cx="12" cy="12" r="3"></circle>
                                </svg>
                                <svg v-else viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor"
                                    stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                    <path
                                        d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24">
                                    </path>
                                    <line x1="1" y1="1" x2="23" y2="23"></line>
                                </svg>
                            </div>
                        </div>

                        <div class="input-group">
                            <input :type="showResetConfirmPassword ? 'text' : 'password'"
                                v-model="resetForm.confirmNewPassword" class="art-input" placeholder=" ">
                            <label>确认新密码</label>
                            <span class="input-underline"></span>

                            <div class="eye-icon-art" @click="showResetConfirmPassword = !showResetConfirmPassword">
                                <svg v-if="showResetConfirmPassword" viewBox="0 0 24 24" width="18" height="18"
                                    fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"
                                    stroke-linejoin="round">
                                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                                    <circle cx="12" cy="12" r="3"></circle>
                                </svg>
                                <svg v-else viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor"
                                    stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                    <path
                                        d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24">
                                    </path>
                                    <line x1="1" y1="1" x2="23" y2="23"></line>
                                </svg>
                            </div>
                        </div>

                        <button class="art-btn-primary full-width" @click="handleResetPassword"
                            :disabled="resetLoading">
                            {{ resetLoading ? '重置中...' : '确认重置' }}
                        </button>
                    </div>
                </div>
            </div>
        </div>

    </div>
</template>

<style scoped>
/* Import Artistic Fonts */
@import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@500;700&family=Cormorant+Garamond:wght@400;600&display=swap');

/* ==================== 1. Layout & Background (Fixes white screen issue) ==================== */
.login-page-container {
    position: relative;
    top: 0;
    left: 0;
    width: 100vw;
    min-height: 100vh;
    z-index: 100;
    display: flex;
    align-items: center;
    background-color: #f5f1e8;
    justify-content: space-between;
    /* 保证内容居中，Footer 在底 */
    overflow-y: auto;
    overflow-x: hidden;
}

.page-bg {
    position: fixed;
    inset: 0;
    background-size: cover;
    background-position: center;
    z-index: 0;
    transition: background-image 0.5s ease;
}

.page-mask {
    position: fixed;
    inset: 0;
    background: rgba(245, 241, 232, 0.4);
    backdrop-filter: blur(8px);
    z-index: 1;
}

.content-wrapper {
    flex: 1;
    /* 占据剩余空间，把 Footer 挤到底部 */
    display: flex;
    justify-content: center;
    align-items: center;
    width: 100%;
    padding: 40px 20px;
    /* 给上下留点呼吸空间，防止卡片贴边 */
    position: relative;
    z-index: 2;
}

/* ==================== 2. Main Card Styling ==================== */
.card-container {
    /* 不需要绝对定位了，由 flex 控制居中 */
    position: relative;
    z-index: 2;
    width: 900px;
    min-height: 550px;
    background: rgba(255, 255, 255, 0.9);
    border-radius: 20px;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.15);
    display: flex;
    overflow: hidden;
    border: 1px solid rgba(255, 255, 255, 0.8);
    margin: 0 auto;
}

/* Left Panel */
.left-panel {
    flex: 1.2;
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
}

.panel-overlay {
    position: absolute;
    inset: 0;
    background: linear-gradient(135deg, rgba(92, 83, 70, 0.8), rgba(50, 40, 30, 0.8));
}

.panel-content {
    position: relative;
    z-index: 2;
    text-align: center;
    color: #fff;
}

.brand {
    font-family: 'Cinzel', serif;
    font-size: 3rem;
    margin-bottom: 10px;
    text-shadow: 0 2px 10px rgba(0, 0, 0, 0.3);
}

.slogan {
    font-family: 'Cormorant Garamond', serif;
    font-size: 1.2rem;
    letter-spacing: 2px;
    opacity: 0.9;
}

.deco-box {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
    margin-bottom: 20px;
    opacity: 0.6;
}

.line {
    width: 1px;
    height: 40px;
    background: #fff;
}

.dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: #fff;
}

/* Right Panel */
.right-panel {
    flex: 1;
    padding: 40px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(255, 253, 248, 0.6);
}

.form-box {
    width: 100%;
    max-width: 320px;
}

.header {
    display: flex;
    align-items: center;
    gap: 15px;
    margin-bottom: 10px;
}

.header h2 {
    font-family: 'Cinzel', serif;
    font-size: 1.8rem;
    color: #5c5346;
    margin: 0;
}

.header-line {
    flex: 1;
    height: 1px;
    background: rgba(92, 83, 70, 0.2);
}

.sub-text {
    text-align: center;
    color: #8b806b;
    font-size: 0.9rem;
    margin-bottom: 30px;
    font-family: 'Cormorant Garamond', serif;
    font-style: italic;
}

/* Form Elements */
.form-elements {
    display: flex;
    flex-direction: column;
    gap: 18px;
}

.input-group {
    position: relative;
    display: flex;
    align-items: center;
}

/* 浮动 Label 逻辑 */
.input-group label {
    position: absolute;
    top: 18px;
    /* 🔥 3. Label 左对齐：跟输入文字保持一致，留出 10px 间距 */
    left: 10px;
    color: #999;
    font-size: 0.95rem;
    transition: all 0.3s ease;
    pointer-events: none;
}

.icon {
    position: absolute;
    left: 12px;
    top: 50%;
    transform: translateY(-50%);
    color: #8b806b;
    display: flex;
}

.input-group input {
    flex: 1;
    padding: 12px 40px 12px 40px;
    border: 1px solid rgba(139, 128, 107, 0.2);
    border-radius: 8px;
    background: rgba(255, 255, 255, 0.6);
    font-size: 0.95rem;
    color: #5c5346;
    outline: none;
    font-family: 'Cormorant Garamond', serif;
    font-weight: 600;
    transition: all 0.3s;
}

/* 🔥 新增：小眼睛图标样式 */
.eye-icon {
    position: absolute;
    right: 12px;
    top: 50%;
    transform: translateY(-50%);
    color: #a8997a;
    /* 和左侧图标颜色呼应 */
    cursor: pointer;
    display: flex;
    align-items: center;
    transition: color 0.3s;
}

.eye-icon:hover {
    color: #5c5346;
    /* 悬停变深色 */
}

.input-group input:focus {
    background: #fff;
    border-color: #8b806b;
    box-shadow: 0 4px 10px rgba(139, 128, 107, 0.1);
}

.captcha-row {
    display: flex;
    gap: 10px;
    margin-bottom: 0px;
}

.captcha-input {
    flex: 1;
    padding: 12px;
    border: 1px solid rgba(139, 128, 107, 0.2);
    border-radius: 8px;
}

.captcha-img {
    width: 100px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(139, 128, 107, 0.1);
    border-radius: 8px;
    font-weight: bold;
    color: #5c5346;
    cursor: pointer;
    letter-spacing: 2px;
}

.links {
    text-align: right;
    margin-top: -10px;
    margin-bottom: -10px;
}

.links span {
    font-size: 0.85rem;
    color: #8b806b;
    cursor: pointer;
}

.links span:hover {
    text-decoration: underline;
}

.submit-btn {
    width: 100%;
    padding: 12px;
    margin-top: 10px;
    background: linear-gradient(135deg, #8b806b 0%, #5c5346 100%);
    color: #fff;
    border: none;
    border-radius: 8px;
    font-size: 1.1rem;
    cursor: pointer;
    font-weight: 600;
    font-family: 'Cormorant Garamond', serif;
    letter-spacing: 1px;
    transition: transform 0.2s;
}

.submit-btn:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 15px rgba(92, 83, 70, 0.3);
}

.submit-btn:disabled {
    opacity: 0.7;
    cursor: not-allowed;
}

.footer-link {
    text-align: center;
    margin-top: 15px;
    font-size: 0.9rem;
    color: #8b806b;
}

.footer-link span {
    cursor: pointer;
    font-weight: 600;
}

.footer-link span:hover {
    text-decoration: underline;
}

/* Modal */
.modal-mask {
    position: fixed;
    inset: 0;
    /* 黑色半透明背景 */
    background: rgba(0, 0, 0, 0.5);
    /* 🔥 关键点1：层级设为最高，保证盖住所有内容 */
    z-index: 9999;
    /* 使用 Flex 布局让内容居中 */
    display: flex;
    justify-content: center;
    align-items: center;
    backdrop-filter: blur(4px);
    /* 🔥 关键点2：使用 dvh 适配手机浏览器地址栏变化，兼容性写法 */
    height: 100vh;
    height: 100dvh;
    /* 防止遮罩层下的页面滚动 */
    overscroll-behavior: contain;
}

.modal-box {
    /* 🔥 关键点3：手机端宽度90%，电脑端最大360px */
    width: 90%;
    max-width: 360px;
    background: #fff;
    padding: 30px;
    border-radius: 16px;
    /*稍微圆润一点*/
    position: relative;
    text-align: center;
    /* 加上漂亮的阴影和动画 */
    box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
    animation: modal-pop 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
}

@keyframes modal-pop {
    0% {
        transform: scale(0.95) translateY(10px);
        opacity: 0;
    }

    100% {
        transform: scale(1) translateY(0);
        opacity: 1;
    }
}

.modal-box h3 {
    margin: 0 0 10px;
    color: #5c5346;
    font-family: 'Cinzel', serif;
    font-size: 1.5rem;
}

.desc {
    font-size: 0.9rem;
    color: #888;
    margin-bottom: 25px;
}

/* --- 🔥 新增样式：倒计时与禁用状态 --- */

/* 验证码输入框组合 */
.code-group {
    position: relative;
    margin-bottom: 15px;
}

/* 重新发送链接 */
.resend-link {
    position: absolute;
    right: 12px;
    top: 50%;
    transform: translateY(-50%);
    font-size: 0.85rem;
    color: #8b806b;
    cursor: pointer;
    font-weight: 600;
    user-select: none;
    transition: color 0.2s;
}

.resend-link:hover {
    color: #5c5346;
    text-decoration: underline;
}

.resend-link.disabled {
    color: #ccc;
    cursor: not-allowed;
    text-decoration: none;
}

/* 禁用的按钮样式 */
.modal-btn:disabled,
.disabled-btn {
    background-color: #ccc !important;
    cursor: not-allowed;
    opacity: 0.8;
}

.modal-input {
    width: 100%;
    padding: 12px;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    box-sizing: border-box;
    font-size: 0.95rem;
    outline: none;
    transition: border-color 0.2s;
    /* 确保右边有空间放眼睛图标 */
    padding-right: 40px;
}

.modal-input:focus {
    border-color: #8b806b;
}

/* 🔥 新增：弹窗输入框包装器 (用于定位图标) */
.modal-input-wrapper {
    position: relative;
    width: 100%;
    margin-bottom: 15px;
}

.modal-input-wrapper .modal-input {
    margin-bottom: 0;
    padding-right: 40px;
    /* 给眼睛图标留位置 */
}

/* 🔥 新增：弹窗内的小眼睛图标样式 */
.eye-icon-modal {
    position: absolute;
    right: 12px;
    top: 50%;
    transform: translateY(-50%);
    color: #a8997a;
    cursor: pointer;
    display: flex;
    align-items: center;
}

.eye-icon-modal:hover {
    color: #5c5346;
}

.modal-btn {
    width: 100%;
    padding: 12px;
    background: #5c5346;
    color: #fff;
    border: none;
    border-radius: 8px;
    cursor: pointer;
    font-weight: 600;
    margin-top: 10px;
    transition: background 0.2s;
}

.modal-btn:active {
    transform: scale(0.98);
}

.close {
    position: absolute;
    top: 15px;
    right: 15px;
    width: 30px;
    height: 30px;
    line-height: 30px;
    font-size: 1.2rem;
    cursor: pointer;
    color: #999;
    background: rgba(0, 0, 0, 0.05);
    border-radius: 50%;
    transition: all 0.2s;
}

.close:hover {
    background: rgba(0, 0, 0, 0.1);
    color: #333;
}

@media (max-width: 768px) {
    .content-wrapper {
        padding: 20px 15px;
        min-height: auto;
    }

    .card-container {
        flex-direction: column;
        width: 100%;
        max-width: 400px;
        height: auto;
        /* 👈 强制高度自适应 */
        min-height: auto;
        /* 👈 取消 PC 端的最小高度限制 */
        border-radius: 16px;
        /* 手机端圆角稍微收敛 */
    }

    .left-panel {
        /* 手机端作为顶部横条展示 */
        height: 120px;
        /* 从 150px 压缩到 120px，防止占地过多 */
        flex: none;
    }

    .brand {
        font-size: 2rem;
        /* 手机端标题缩小，避免压迫感 */
    }

    .slogan {
        font-size: 0.9rem;
    }

    .deco-box {
        display: none;
        /* 手机端隐藏垂直装饰线，节省垂直空间 */
    }

    .right-panel {
        padding: 30px 24px;
        /* 增加左右内边距，提升输入体验 */
        flex: none;
    }

    .form-box {
        max-width: 100%;
        /* 让表单填满右侧面板 */
    }

    .input-group input {
        padding: 14px 40px 14px 42px;
        /* 稍微增加点击区域的高度 */
        font-size: 16px !important;
        /* 🔥 关键：移动端输入框字体不小于16px，防止 iOS 自动放大页面 */
    }

    .captcha-row {
        gap: 8px !important;
        flex-direction: row;
        align-items: stretch;
        flex-wrap: nowrap; /* 再次确认不换行 */
    }

    .captcha-row .input-group {
        flex: 1; 
        min-width: 0; /* 允许压缩 */
        width: 0; /* 🔥 关键修复：强制 flex 计算宽度，防止被撑大导致覆盖 */
    }

    /* 🔥 核心修复：专门针对验证码输入框，去掉右边多余的 padding */
    .captcha-row .input-group input {
        /* 左边保留 42px 给图标，右边改成 10px 即可（因为没有小眼睛） */
        padding: 14px 10px 14px 42px !important; 
    }

    .captcha-img {
        width: 90px;
        font-size: 14px;
        flex-shrink: 0; /* 铁打的图片，不许缩 */
        height: auto; /* 确保高度跟随输入框 */
        border-radius: 8px; /* 保持圆角一致 */
    }
}

/* 1. 弹窗主体：羊皮纸 + 噪点 */
.art-modal {
    width: 90%;
    max-width: 400px;
    background-color: #fdfbf7;
    /* 羊皮纸暖色 */
    border-radius: 12px;
    /* 噪点背景图 (Data URI) */
    background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)' opacity='0.05'/%3E%3C/svg%3E");
    box-shadow: 0 25px 50px rgba(0, 0, 0, 0.25), 0 0 0 1px rgba(139, 90, 43, 0.1);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    position: relative;
    animation: modal-pop 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
}

/* 2. 头部设计 */
.art-modal-header {
    padding: 25px 20px 10px;
    display: flex;
    align-items: center;
    justify-content: center;
    position: relative;
}

.art-modal-header h3 {
    margin: 0 15px;
    font-family: "Georgia", "Songti SC", serif;
    /* 衬线字体 */
    font-size: 1.3rem;
    color: #5c4033;
    /* 深咖啡色 */
    font-weight: 700;
    letter-spacing: 1px;
}

.decoration-line {
    height: 1px;
    width: 30px;
    background: linear-gradient(90deg, transparent, #d4c5b0, transparent);
}

.art-close-btn {
    position: absolute;
    right: 15px;
    top: 15px;
    background: none;
    border: none;
    font-size: 1.2rem;
    color: #bca38a;
    cursor: pointer;
    transition: color 0.3s;
}

.art-close-btn:hover {
    color: #8b5a2b;
}

.art-modal-body {
    padding: 10px 30px 35px;
}

.art-desc {
    text-align: center;
    font-size: 0.9rem;
    color: #888;
    margin-bottom: 20px;
    font-family: 'Cormorant Garamond', serif;
}

.art-modal-body .input-group {
    margin-bottom: 5px;
    padding-top: 10px;
}

.art-input {
    width: 100%;
    border: none;
    background: transparent;
    /* 🔥 2. 核心修改：内边距 */
    /* 上8px, 右45px(避让图标), 下8px, 左10px(不贴左边) */
    padding: 8px 45px 8px 10px;
    font-size: 1rem;
    color: #2c1e0f;
    font-family: inherit;
    outline: none;
    border-bottom: 1px solid #d4c5b0;
    transition: border-color 0.3s;
    box-sizing: border-box;
    /* 确保 padding 不撑大宽度 */
}

.art-input:focus~label,
.art-input:not(:placeholder-shown)~label {
    top: -8px;
    /* 稍微再高一点，不压线 */
    font-size: 0.75rem;
    color: #8b5a2b;
    /* 上浮后依然保持左侧对齐 */
    left: 10px;
}

/* 底部线条动画 */
.input-underline {
    position: absolute;
    bottom: 0;
    left: 0;
    width: 0;
    height: 2px;
    background: #8b5a2b;
    transition: width 0.3s ease;
}

.art-input:focus~.input-underline {
    width: 100%;
}

/* 4. 按钮样式 */
.art-btn-primary {
    background: #2c1e0f;
    /* 深咖啡 */
    color: #f7f1e3;
    border: none;
    padding: 12px;
    border-radius: 6px;
    font-size: 0.95rem;
    font-family: serif;
    letter-spacing: 1px;
    cursor: pointer;
    transition: all 0.3s;
    box-shadow: 0 4px 10px rgba(44, 30, 20, 0.2);
}

.art-btn-primary:hover:not(:disabled) {
    background: #4a3b2a;
    transform: translateY(-1px);
    box-shadow: 0 6px 15px rgba(44, 30, 20, 0.3);
}

.art-btn-primary:disabled {
    background: #8d7e70;
    cursor: not-allowed;
    opacity: 0.8;
}

.full-width {
    width: 100%;
    margin-top: 10px;
}

/* 5. 辅助图标 (优化版：不贴右边) */
.resend-link-art {
    position: absolute;
    /* 🔥 4. 右侧留白：不再贴边，留出 10px */
    right: 10px;
    bottom: 8px;
    font-size: 0.85rem;
    /* 稍微大一点点看更清楚 */
    color: #8b5a2b;
    cursor: pointer;
    font-weight: 600;
    z-index: 5;
    transition: color 0.2s;
}

.resend-link-art:hover {
    text-decoration: underline;
}

.resend-link-art.disabled {
    color: #ccc;
    cursor: not-allowed;
    text-decoration: none;
}

.eye-icon-art {
    position: absolute;
    /* 🔥 5. 右侧留白：同上 */
    right: 10px;
    bottom: 8px;
    color: #a8997a;
    cursor: pointer;
    display: flex;
    align-items: center;
    z-index: 5;
    transition: color 0.2s;
}

.eye-icon-art:hover {
    color: #5c5346;
}

/* ==================== 📱 艺术弹窗移动端深度适配 ==================== */
@media (max-width: 600px) {

    /* 1. 弹窗尺寸调整 */
    .art-modal {
        width: 92%;
        /* 🔥 关键：让弹窗居中且不被软键盘完全顶死 */
        margin-bottom: 20px;
        max-height: 80vh;
        /* 限制高度，防止内容多时撑出屏幕 */
        display: flex;
        flex-direction: column;
        max-width: none;
        /* 取消最大宽度限制 */
        border-radius: 16px;
        /* 手机上圆角大一点更好看 */
        overflow-y: auto;
        /* 内容过多时允许弹窗内部滚动 */
    }

    /* 2. 头部压缩 */
    .art-modal-header {
        padding: 20px 15px 5px;
        /* 减少上下留白 */
    }

    .art-modal-header h3 {
        font-size: 1.1rem;
        /* 字体稍微调小 */
        margin: 0 10px;
    }

    .decoration-line {
        width: 20px;
        /* 装饰线缩短 */
    }

    /* 3. 关闭按钮扩大点击区域 (防误触) */
    .art-close-btn {
        top: 10px;
        right: 10px;
        padding: 10px;
        /* 增加透明点击范围 */
        font-size: 1.4rem;
    }

    .art-modal-body {
        padding: 15px 20px 25px;
        /* 稍微收紧内边距 */
        overflow-y: auto;
        /* 内部内容过多时允许滚动 */
    }

    .art-desc {
        margin-bottom: 20px;
        font-size: 0.85rem;
    }

    /* 5. 输入框优化 */
    .input-group {
        margin-bottom: 0;
        /* 间距缩小 */
    }

    .sub-text {
        margin-bottom: 20px !important;
    }

    .form-elements {
        gap: 12px !important;
    }

    .art-input {
        font-size: 16px !important;
        /* 同样防止 iOS 缩放 */
        /* 手机端保持同样的舒适间距 */
        padding: 8px 40px 8px 10px;
    }

    /* 6. 按钮更易点击 */
    .art-btn-primary {
        padding: 14px;
        /* 增加按钮高度，方便手指点击 */
        font-size: 1rem;
        margin-top: 10px;
    }

    /* 7. 辅助链接调整 */
    .resend-link-art {
        font-size: 0.85rem;
        bottom: 8px;
        /* 稍微抬高 */
    }

    .resend-link-art,
    .eye-icon-art {
        bottom: 10px;
        right: 12px;
        padding: 5px;
        /* 增加点击热区 */
        font-size: 0.85rem;
    }

    .links {
        /* 讓忘記密碼離輸入框更近一點 */
        margin-top: -4px !important;
        margin-bottom: 2px !important;
    }

    .submit-btn {
        /* 按鈕上方的間距收緊 */
        margin-top: 6px !important;
        padding: 12px !important;
        /* 稍微減小一點 padding，讓按鈕看起來更靈動 */
    }

    .footer-link {
        /* 縮小底部切換鏈接的邊距 */
        margin-top: 12px !important;
    }
}

/* ==================== 0. 全局重置 (修复手机端双图标Bug) ==================== */
/* 隐藏 Edge/IE/部分手机浏览器的默认密码查看图标 */
input::-ms-reveal,
input::-ms-clear {
    display: none;
}

/* 隐藏部分 WebKit 浏览器的密码自动填充图标（可选，视情况而定） */
input::-webkit-credentials-auto-fill-button {
    visibility: hidden;
    position: absolute;
    right: 0;
}


/* ==================== 🚀 极限小屏适配 (比 iPhone SE 更小) ==================== */
/* 当屏幕宽度小于 350px 时触发（针对 Galaxy Fold 外屏、老款 SE 等） */
@media (max-width: 350px) {

    /* 1. 进一步缩小页面两侧的内边距，寸土寸金 */
    .right-panel {
        padding: 30px 12px !important; /* 原来是 24px，现在改成 12px，左右各省出 12px */
    }

    /* 2. 验证码图片稍微缩窄一点点，视觉上几乎看不出区别，但能救命 */
    .captcha-img {
        width: 75px !important; /* 原来 90px -> 改为 75px */
        font-size: 13px !important; /* 字号微调 */
    }

    /* 3. 输入框和图片之间的缝隙也收紧一点 */
    .captcha-row {
        gap: 5px !important;
    }
    
    /* 4. 输入框左边的图标区域稍微收紧 (可选，防止文字被图标顶太远) */
    .captcha-row .input-group input {
         padding-left: 36px !important; /* 原来 42px -> 改为 36px */
    }
    .captcha-row .input-group .icon {
        left: 8px !important; /* 图标往左挪一点 */
    }
}

/* ==================== 🔥 终极小屏适配 (兼容 Honor Play6T 及 <300px 极端机型) ==================== */

/* 只要屏幕宽度小于 380px (涵盖 iPhone SE、荣耀 Play6T、各种老旧安卓) 就强制生效 */
@media (max-width: 380px) {

    /* 1. 极致压缩页面两侧边距 */
    /* 从原来的 24px -> 10px！给中间留出救命的 28px 空间 */
    .right-panel {
        padding: 30px 10px !important;
    }

    /* 2. 验证码这一行：间距极限压缩 */
    .captcha-row {
        gap: 4px !important; /* 缝隙只留 4px */
    }

    /* 3. 验证码图片：继续瘦身 */
    .captcha-img {
        width: 70px !important; /* 90px -> 70px，只要能看清就行 */
        font-size: 12px !important;
        border-radius: 6px !important;
    }

    /* 4. 输入框本身：Flex 权重最高，同时允许极限缩小 */
    .captcha-row .input-group {
        flex: 1;
        width: 0 !important; /* 再次强调，忽略内容宽度 */
        min-width: 0 !important;
    }

    /* 5. 🚨【核心手术】输入框内部 Padding 大瘦身 🚨 */
    .captcha-row .input-group input {
        /* 左边：图标位。从 42px -> 30px (图标也得跟着挪) */
        /* 右边：彻底清零！从 10px -> 0px (反正没小眼睛，也不怕字贴边) */
        padding: 12px 2px 12px 30px !important; 
        
        font-size: 14px !important; /* 强制字体变小，防止文字太长撑开 */
        letter-spacing: -0.5px; /* 字间距稍微收紧一点点 */
    }

    /* 6. 图标：配合输入框 Padding 也要往左挪 */
    .captcha-row .input-group .icon {
        left: 6px !important; /* 贴紧左边 */
        transform: translateY(-50%) scale(0.85); /* 图标本身也缩小 85% */
    }
    
    /* 修正图标内的 svg 大小，确保不溢出 */
    .captcha-row .input-group .icon svg {
        width: 16px !important;
        height: 16px !important;
    }
}
</style>