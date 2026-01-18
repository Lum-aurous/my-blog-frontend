<script setup>
import { ref, onMounted, reactive } from 'vue'
import { api } from '@/utils/api'
import { message } from '@/utils/message'

const isLoading = ref(false)
const isSaving = ref(false)

// 表单数据模型
const form = reactive({
    site_title: '',
    site_slogan: '',
    site_author: '',
    contact_email: '', // 🔥 新增：联系邮箱
    site_logo: '',
    site_favicon: '',
    site_keywords: '',
    site_desc: '',
    icp_beian: '',
    footer_html: ''
})

// 获取配置
const fetchConfigs = async () => {
    isLoading.value = true
    try {
        const res = await api.get('/admin/configs')
        if (res.data.success) {
            // 合并数据，保留默认空值防止 undefined
            Object.assign(form, res.data.data)
        }
    } catch (error) {
        message.error('加载配置失败')
    } finally {
        isLoading.value = false
    }
}

// 保存配置
const handleSave = async () => {
    isSaving.value = true
    try {
        const res = await api.post('/admin/configs/batch', form)
        if (res.data.success) {
            message.success('全站配置已更新！🚀')
            // 可选：在这里触发一个全局事件通知 Navbar 更新 Logo
        }
    } catch (error) {
        message.error('保存失败')
    } finally {
        isSaving.value = false
    }
}

// 图片上传处理
const handleUpload = async (file, type) => {
    if (!file) return
    const formData = new FormData()
    formData.append('image', file)

    try {
        const res = await api.post('/upload', formData)
        if (res.data.success) {
            if (type === 'logo') form.site_logo = res.data.data.url
            if (type === 'favicon') form.site_favicon = res.data.data.url
            message.success('上传成功')
        }
    } catch (error) {
        message.error('上传图片失败')
    }
}

// 触发文件选择
const triggerFile = (type) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/*'
    input.onchange = (e) => handleUpload(e.target.files[0], type)
    input.click()
}

onMounted(fetchConfigs)
</script>

<template>
    <div class="global-config">
        <div class="page-header animate__animated animate__fadeInDown">
            <div class="header-content">
                <h2>⚙️ 全局站点配置</h2>
                <span class="sub-text">掌控网站的核心参数，实时生效</span>
            </div>
            <button class="btn-save" :disabled="isSaving" @click="handleSave">
                <span v-if="!isSaving">💾 保存所有配置</span>
                <span v-else class="spinner-sm"></span>
            </button>
        </div>

        <div class="config-container animate__animated animate__fadeInUp">
            <div v-if="isLoading" class="loading-state">
                <div class="spinner"></div> 加载配置中...
            </div>

            <div v-else class="config-grid">
                <div class="config-card">
                    <div class="card-title">🏠 基础信息</div>

                    <div class="form-group">
                        <label>网站标题 (Title)</label>
                        <input v-model="form.site_title" type="text" class="glass-input" placeholder="Veritas Blog">
                    </div>

                    <div class="form-group">
                        <label>网站副标题 (Slogan)</label>
                        <input v-model="form.site_slogan" type="text" class="glass-input" placeholder="看见真理，追寻自由">
                    </div>

                    <div class="form-group">
                        <label>站长昵称 / 署名</label>
                        <input v-model="form.site_author" type="text" class="glass-input" placeholder="Jack">
                    </div>

                    <div class="form-group">
                        <label>联系邮箱</label>
                        <input v-model="form.contact_email" type="email" class="glass-input"
                            placeholder="help@iveritas.cn">
                        <small class="tip">显示在页脚，用户可点击直接发送邮件</small>
                    </div>
                </div>

                <div class="config-card">
                    <div class="card-title">🎨 视觉识别</div>

                    <div class="form-group">
                        <label>网站 Logo</label>
                        <div class="upload-box" @click="triggerFile('logo')">
                            <img v-if="form.site_logo" :src="form.site_logo" class="preview-img">
                            <div v-else class="placeholder">点击上传 Logo</div>
                        </div>
                    </div>

                    <div class="form-group">
                        <label>浏览器图标 (Favicon)</label>
                        <div class="upload-box small" @click="triggerFile('favicon')">
                            <img v-if="form.site_favicon" :src="form.site_favicon" class="preview-img icon">
                            <div v-else class="placeholder">上传图标</div>
                        </div>
                    </div>
                </div>

                <div class="config-card">
                    <div class="card-title">🔍 SEO 优化</div>

                    <div class="form-group">
                        <label>SEO 关键词 (Keywords)</label>
                        <input v-model="form.site_keywords" type="text" class="glass-input"
                            placeholder="博客, 技术, 生活, 摄影">
                        <small class="tip">多个关键词请用英文逗号分隔</small>
                    </div>

                    <div class="form-group">
                        <label>SEO 描述 (Description)</label>
                        <textarea v-model="form.site_desc" rows="4" class="glass-input"
                            placeholder="网站的简短介绍，利于搜索引擎收录..."></textarea>
                    </div>
                </div>

                <div class="config-card">
                    <div class="card-title">⚓ 页脚 & 合规</div>

                    <div class="form-group">
                        <label>ICP 备案号</label>
                        <input v-model="form.icp_beian" type="text" class="glass-input" placeholder="京ICP备12345678号">
                    </div>

                    <div class="form-group">
                        <label>页脚自定义 HTML</label>
                        <textarea v-model="form.footer_html" rows="4" class="glass-input code-font"
                            placeholder="<script>统计代码</script>"></textarea>
                        <small class="tip">支持 HTML 标签，可用于放置统计代码或额外的版权信息</small>
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>

<style scoped>
.global-config {
    max-width: 1200px;
    margin: 0 auto;
    color: #e2e8f0;
    padding-bottom: 60px;
}

/* 头部 */
.page-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-end;
    margin-bottom: 30px;
}

.header-content h2 {
    margin: 0;
    font-size: 1.8rem;
    color: #fff;
    font-weight: 700;
}

.sub-text {
    color: #94a3b8;
    font-size: 0.9rem;
    margin-top: 5px;
    display: block;
}

.btn-save {
    background: linear-gradient(135deg, #10b981, #059669);
    border: none;
    padding: 12px 36px;
    border-radius: 50px;
    color: #fff;
    font-weight: 700;
    cursor: pointer;
    font-size: 1rem;
    box-shadow: 0 4px 15px rgba(16, 185, 129, 0.3);
    transition: all 0.3s;
}

.btn-save:hover:not(:disabled) {
    transform: translateY(-2px);
    box-shadow: 0 6px 20px rgba(16, 185, 129, 0.5);
}

.btn-save:disabled {
    opacity: 0.7;
    cursor: not-allowed;
}

/* 网格布局 */
.config-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(350px, 1fr));
    /* 自适应列 */
    gap: 30px;
}

/* 卡片样式 */
.config-card {
    background: rgba(30, 41, 59, 0.4);
    backdrop-filter: blur(10px);
    border-radius: 16px;
    border: 1px solid rgba(255, 255, 255, 0.05);
    padding: 25px;
    display: flex;
    flex-direction: column;
    gap: 20px;
}

.card-title {
    font-size: 1.1rem;
    font-weight: 700;
    color: #fff;
    border-bottom: 1px solid rgba(255, 255, 255, 0.05);
    padding-bottom: 15px;
    margin-bottom: 5px;
}

/* 表单组件 */
.form-group {
    display: flex;
    flex-direction: column;
    gap: 8px;
}

.form-group label {
    font-size: 0.9rem;
    color: #94a3b8;
    font-weight: 500;
}

.glass-input {
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 8px;
    padding: 12px;
    color: #fff;
    outline: none;
    transition: 0.3s;
    font-size: 0.95rem;
    width: 100%;
}

.glass-input:focus {
    border-color: #10b981;
    background: rgba(255, 255, 255, 0.08);
}

.code-font {
    font-family: 'Consolas', monospace;
    font-size: 0.85rem;
}

.tip {
    font-size: 0.8rem;
    color: #64748b;
}

/* 上传框 */
.upload-box {
    width: 100%;
    height: 120px;
    border: 2px dashed rgba(255, 255, 255, 0.1);
    border-radius: 8px;
    display: flex;
    justify-content: center;
    align-items: center;
    cursor: pointer;
    transition: all 0.3s;
    background: rgba(0, 0, 0, 0.2);
    overflow: hidden;
}

.upload-box:hover {
    border-color: #10b981;
    background: rgba(255, 255, 255, 0.02);
}

.upload-box.small {
    width: 80px;
    height: 80px;
}

.preview-img {
    height: 100%;
    object-fit: contain;
}

.preview-img.icon {
    width: 32px;
    height: 32px;
}

.placeholder {
    color: #64748b;
    font-size: 0.9rem;
}

/* 加载状态 */
.loading-state {
    grid-column: 1 / -1;
    text-align: center;
    padding: 60px;
    color: #94a3b8;
}

.spinner {
    display: inline-block;
    width: 30px;
    height: 30px;
    border: 3px solid #10b981;
    border-top-color: transparent;
    border-radius: 50%;
    animation: spin 1s linear infinite;
    margin-bottom: 10px;
}

.spinner-sm {
    display: inline-block;
    width: 16px;
    height: 16px;
    border: 2px solid #fff;
    border-top-color: transparent;
    border-radius: 50%;
    animation: spin 1s linear infinite;
}

@keyframes spin {
    to {
        transform: rotate(360deg);
    }
}
</style>