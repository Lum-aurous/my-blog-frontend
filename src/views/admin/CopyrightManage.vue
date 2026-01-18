<script setup>
import { ref, onMounted, computed } from 'vue'
import { api } from '@/utils/api'
import { message } from '@/utils/message'
import MarkdownIt from 'markdown-it'
// 🔥 引入 MdEditor
import { MdEditor } from 'md-editor-v3'
import 'md-editor-v3/lib/style.css'
import { useSiteStore } from '@/stores/site' // 🔥 1. 引入全局 Store

const siteStore = useSiteStore() // 🔥 2. 初始化
const md = new MarkdownIt({ html: true, breaks: true })
const copyrightContent = ref('')
const loading = ref(false)
const saving = ref(false)

// 定制工具栏，去除不必要的复杂功能
const toolbars = [
    'bold', 'underline', 'italic', '-', 'strikeThrough', 'title', 'quote', 'unorderedList', 'orderedList', '-', 'link', 'code', 'emoji', '=', 'pageFullscreen', 'fullscreen'
]

// 获取当前版权内容
const fetchCopyright = async () => {
    loading.value = true
    try {
        // 🔥 3. 核心修复：加上时间戳参数 _t
        // 这样每次请求 URL 都不一样 (e.g. ?_t=1736671234)，浏览器就无法使用缓存，必须去服务器拿最新数据
        const res = await api.get('/configs/copyright_detail', {
            params: { _t: Date.now() }
        })

        if (res.data.success) {
            copyrightContent.value = res.data.data || ''
        }
    } catch (err) {
        message.error('加载失败')
    } finally {
        loading.value = false
    }
}

// 修改 handleSave 函数
const handleSave = async () => {
    if (!copyrightContent.value.trim()) return message.warning('内容不能为空')
    saving.value = true
    try {
        const res = await api.post('/admin/configs/copyright_detail', {
            value: copyrightContent.value
        })
        if (res.data.success) {
            message.success('🎉 版权声明已更新，去前台看看效果吧！')

            // 🔥 4. 核心修复：保存成功后，立即强制刷新全局 Store 的配置
            // 这样 Footer.vue 里的数据也会立即更新，不用等刷新
            await siteStore.fetchSiteInfo()
        }
    } catch (err) {
        message.error('保存失败')
    } finally {
        saving.value = false
    }
}

// 字数统计
const charCount = computed(() => copyrightContent.value.length)

onMounted(fetchCopyright)
</script>

<template>
    <div class="copyright-manage">
        <div class="manage-header animate__animated animate__fadeInDown">
            <div class="title-section">
                <h2>⚖️ 版权声明配置</h2>
                <p>使用专业 Markdown 编辑器，打造独一无二的版权说明书。</p>
            </div>
            <button class="save-btn" :disabled="saving" @click="handleSave">
                <span v-if="!saving">💾 保存更改</span>
                <span v-else class="saving-spinner"></span>
            </button>
        </div>

        <div class="manage-body animate__animated animate__fadeInUp">
            <div class="editor-pane glass-panel">
                <div class="pane-header">
                    <span class="label">Markdown 编辑</span>
                    <span class="count">{{ charCount }} 字符</span>
                </div>

                <div class="editor-wrapper">
                    <MdEditor v-model="copyrightContent" theme="dark" :preview="false" :toolbars="toolbars"
                        class="glass-editor" placeholder="在此输入版权声明，支持 Markdown 语法..." />
                </div>

                <div class="editor-footer">
                    <div class="tip-item">✨ 提示：右侧将实时渲染艺术信纸效果</div>
                </div>
            </div>

            <div class="preview-pane">
                <div class="pane-header">
                    <span class="label">信纸效果预览</span>
                </div>
                <div class="art-paper-mock">
                    <div class="pin"></div>
                    <div class="paper-content markdown-body" v-html="md.render(copyrightContent || '> 暂无内容，请在左侧输入...')">
                    </div>
                    <div class="stamp-mark">Veritas</div>
                </div>
            </div>
        </div>
    </div>
</template>

<style scoped>
.copyright-manage {
    max-width: 1400px;
    margin: 0 auto;
    color: #fff;
    padding-bottom: 40px;
}

/* 头部 */
.manage-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-end;
    margin-bottom: 30px;
}

.title-section h2 {
    margin: 0 0 8px 0;
    font-size: 1.8rem;
}

.title-section p {
    margin: 0;
    color: #94a3b8;
    font-size: 0.95rem;
}

.save-btn {
    padding: 12px 36px;
    background: linear-gradient(135deg, #6366f1, #8b5cf6);
    border: none;
    border-radius: 50px;
    color: white;
    font-weight: 700;
    font-size: 1rem;
    cursor: pointer;
    box-shadow: 0 4px 15px rgba(99, 102, 241, 0.4);
    transition: all 0.3s;
    display: flex;
    align-items: center;
    gap: 8px;
}

.save-btn:hover:not(:disabled) {
    transform: translateY(-2px);
    box-shadow: 0 6px 20px rgba(99, 102, 241, 0.5);
}

.save-btn:disabled {
    opacity: 0.7;
    cursor: not-allowed;
    filter: grayscale(0.5);
}

/* 加载动画 */
.saving-spinner {
    width: 20px;
    height: 20px;
    border: 3px solid rgba(255, 255, 255, 0.3);
    border-radius: 50%;
    border-top-color: #fff;
    animation: spin 1s linear infinite;
}

@keyframes spin {
    to {
        transform: rotate(360deg);
    }
}

/* 主体布局 */
.manage-body {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 40px;
    height: calc(100vh - 220px);
    min-height: 500px;
}

/* 左侧编辑器容器 */
.glass-panel {
    background: rgba(30, 41, 59, 0.4);
    backdrop-filter: blur(10px);
    border: 1px solid rgba(255, 255, 255, 0.05);
    border-radius: 16px;
    display: flex;
    flex-direction: column;
    padding: 20px;
    overflow: hidden;
    /* 防止编辑器溢出 */
}

.pane-header {
    display: flex;
    justify-content: space-between;
    margin-bottom: 15px;
    font-size: 0.85rem;
    color: #94a3b8;
    text-transform: uppercase;
    letter-spacing: 1px;
    font-weight: 700;
    flex-shrink: 0;
}

.editor-wrapper {
    flex: 1;
    overflow: hidden;
    border-radius: 8px;
    border: 1px solid rgba(255, 255, 255, 0.1);
}

/* 🔥🔥🔥 核心：深度定制 MdEditor 样式，使其透明化 🔥🔥🔥 */
.glass-editor {
    height: 100%;
    /* 覆盖 MdEditor 的默认背景变量 */
    --md-bk-color: transparent !important;
    --md-content-bk-color: transparent !important;
    --md-color: #e2e8f0 !important;
    --md-border-color: rgba(255, 255, 255, 0.1) !important;
    --md-toolbar-hover-color: rgba(255, 255, 255, 0.1) !important;
    --md-toolbar-active-color: rgba(255, 255, 255, 0.2) !important;
}

/* 强制输入区域透明 */
:deep(.cm-editor),
:deep(.cm-scroller) {
    background-color: transparent !important;
}

:deep(.md-editor-toolbar-wrapper) {
    background-color: rgba(0, 0, 0, 0.2) !important;
    border-bottom: 1px solid rgba(255, 255, 255, 0.05) !important;
}

:deep(.md-editor-footer) {
    background-color: rgba(0, 0, 0, 0.2) !important;
    border-top: 1px solid rgba(255, 255, 255, 0.05) !important;
}

.editor-footer {
    display: flex;
    gap: 20px;
    margin-top: 15px;
    font-size: 0.8rem;
    color: #64748b;
    flex-shrink: 0;
}

/* 右侧预览容器 */
.preview-pane {
    display: flex;
    flex-direction: column;
}

/* 📜 艺术信纸效果 */
.art-paper-mock {
    flex: 1;
    background-color: #fdfaf2;
    background-image: url('https://www.transparenttextures.com/patterns/natural-paper.png');
    border-radius: 4px;
    padding: 60px 50px;
    overflow-y: auto;
    position: relative;
    box-shadow:
        0 1px 1px rgba(0, 0, 0, 0.15),
        0 10px 0 -5px #eee,
        0 10px 1px -4px rgba(0, 0, 0, 0.15),
        0 20px 0 -10px #eee,
        0 20px 1px -9px rgba(0, 0, 0, 0.15);
    transform: rotate(-1deg);
    transition: transform 0.3s;
}

.art-paper-mock:hover {
    transform: rotate(0deg) scale(1.01);
}

/* 装饰钉 */
.pin {
    width: 15px;
    height: 15px;
    border-radius: 50%;
    background: radial-gradient(circle at 30% 30%, #e74c3c, #c0392b);
    position: absolute;
    top: 20px;
    left: 50%;
    transform: translateX(-50%);
    box-shadow: 0 3px 5px rgba(0, 0, 0, 0.3);
}

/* 装饰印章 */
.stamp-mark {
    position: absolute;
    bottom: 30px;
    right: 30px;
    font-family: 'Georgia', serif;
    font-weight: 900;
    color: rgba(192, 57, 43, 0.15);
    font-size: 3rem;
    border: 3px double rgba(192, 57, 43, 0.15);
    padding: 5px 15px;
    transform: rotate(-15deg);
    pointer-events: none;
}

/* 内容样式 */
.paper-content {
    color: #5d4037;
    font-family: "STKaiti", "KaiTi", serif;
    font-size: 1.1rem;
    line-height: 2;
}

/* Markdown 样式覆盖 */
.paper-content :deep(h1),
.paper-content :deep(h2) {
    color: #8d6e63;
    border-bottom: 2px solid #d7ccc8;
    padding-bottom: 10px;
    margin-bottom: 20px;
    text-align: center;
}

.paper-content :deep(p) {
    margin-bottom: 1.5em;
}

.paper-content :deep(del) {
    text-decoration: none;
    border-bottom: 2px wavy #ff7043;
    color: #d84315;
    padding: 0 2px;
}

.paper-content :deep(strong) {
    color: #3e2723;
}

.paper-content :deep(a) {
    color: #d35400;
    text-decoration: underline;
}

.paper-content :deep(ul) {
    padding-left: 20px;
    margin-bottom: 1.5em;
}

.paper-content :deep(li) {
    margin-bottom: 0.5em;
}

/* 响应式 */
@media (max-width: 900px) {
    .manage-body {
        grid-template-columns: 1fr;
        height: auto;
    }

    .editor-pane {
        min-height: 400px;
    }

    .art-paper-mock {
        min-height: 400px;
        margin-top: 20px;
    }
}

/* 🔥🔥🔥 修复 Markdown 编辑器下拉菜单透明度问题 🔥🔥🔥 */
:deep(.md-editor-dropdown) {
    background-color: #1e293b !important;
    /* 使用深蓝灰色底色，确保不透明 */
    border: 1px solid rgba(255, 255, 255, 0.1) !important;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5) !important;
    border-radius: 8px !important;
    backdrop-filter: none !important;
    /* 关掉背景模糊，直接用实色背景更稳 */
    z-index: 9999 !important;
    /* 确保在最上层 */
}

/* 下拉菜单项样式 */
:deep(.md-editor-dropdown-item) {
    color: #e2e8f0 !important;
    /* 浅灰白色文字 */
    transition: all 0.2s;
}

/* 鼠标悬停时的样式 */
:deep(.md-editor-dropdown-item:hover),
:deep(.md-editor-dropdown-item.active) {
    background-color: #6366f1 !important;
    /* 悬停时变紫色 */
    color: #ffffff !important;
    /* 悬停时文字变纯白 */
}

/* 修复标题下拉框里的 H1-H6 预览字体颜色 */
:deep(.md-editor-dropdown-item h1),
:deep(.md-editor-dropdown-item h2),
:deep(.md-editor-dropdown-item h3),
:deep(.md-editor-dropdown-item h4),
:deep(.md-editor-dropdown-item h5),
:deep(.md-editor-dropdown-item h6) {
    color: inherit !important;
    /* 让标题继承 item 的颜色 */
    margin: 0 !important;
}
</style>