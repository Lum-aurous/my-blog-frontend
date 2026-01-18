<script setup>
import { ref, onMounted, reactive } from 'vue'
import { api } from '@/utils/api'
import { message } from '@/utils/message'

const tools = ref([])
const isLoading = ref(false)
const showModal = ref(false)
const isSubmitting = ref(false)
const isEditMode = ref(false)

const form = reactive({
    id: null,
    title: '',
    description: '',
    icon: '📦', // 默认 Emoji
    color: '#3b82f6', // 默认颜色
    category: '常用',
    url: '',
    type: 'external' // external 或 internal (如果未来支持内部组件)
})

// 预设颜色供选择
const presetColors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#6366f1', '#14b8a6']

// 获取工具列表
const fetchTools = async () => {
    isLoading.value = true
    try {
        const res = await api.get('/tools')
        if (res.data.success) {
            tools.value = res.data.data
        }
    } catch (error) {
        message.error('加载工具失败')
    } finally {
        isLoading.value = false
    }
}

// 打开新增弹窗
const openAddModal = () => {
    isEditMode.value = false
    Object.assign(form, { id: null, title: '', description: '', icon: '📦', color: '#3b82f6', category: '常用', url: '', type: 'external' })
    showModal.value = true
}

// 打开编辑弹窗
const openEditModal = (item) => {
    isEditMode.value = true
    Object.assign(form, item)
    showModal.value = true
}

// 提交
const handleSubmit = async () => {
    if (!form.title || !form.url) return message.warning('标题和链接必填')

    isSubmitting.value = true
    try {
        if (isEditMode.value) {
            await api.put(`/admin/tools/${form.id}`, form)
            message.success('修改成功')
        } else {
            await api.post('/admin/tools', form)
            message.success('添加成功')
        }
        showModal.value = false
        fetchTools()
    } catch (error) {
        message.error('操作失败')
    } finally {
        isSubmitting.value = false
    }
}

// 删除
const handleDelete = async (id) => {
    if (!confirm('确定删除这个工具吗？')) return
    try {
        await api.delete(`/admin/tools/${id}`)
        message.success('删除成功')
        tools.value = tools.value.filter(t => t.id !== id)
    } catch (error) {
        message.error('删除失败')
    }
}

onMounted(fetchTools)
</script>

<template>
    <div class="tool-manage">
        <div class="page-header animate__animated animate__fadeInDown">
            <div class="header-content">
                <h2>📦 百宝箱管理</h2>
                <span class="sub-text">配置前台“百宝箱”页面显示的效率工具卡片</span>
            </div>
            <button class="btn-primary" @click="openAddModal">
                <span class="icon">+</span> 添加工具
            </button>
        </div>

        <div class="tool-grid animate__animated animate__fadeInUp">
            <div v-if="isLoading" class="loading-state">
                <div class="spinner"></div> 加载中...
            </div>

            <div v-else-if="tools.length === 0" class="empty-state">
                暂无工具，快去添加吧 🛠️
            </div>

            <div v-else v-for="item in tools" :key="item.id" class="tool-card">
                <div class="card-icon" :style="{ background: item.color }">{{ item.icon }}</div>
                <div class="card-body">
                    <div class="card-top">
                        <h3 class="tool-title">{{ item.title }}</h3>
                        <span class="tool-cat">{{ item.category }}</span>
                    </div>
                    <p class="tool-desc">{{ item.description }}</p>
                    <a :href="item.url" target="_blank" class="tool-link">{{ item.url }}</a>
                </div>
                <div class="card-actions">
                    <button class="btn-icon edit" @click="openEditModal(item)">✏️</button>
                    <button class="btn-icon delete" @click="handleDelete(item.id)">🗑️</button>
                </div>
            </div>
        </div>

        <Transition name="fade">
            <div v-if="showModal" class="modal-overlay" @click.self="showModal = false">
                <div class="modal-card animate__animated animate__zoomIn">
                    <div class="modal-header">
                        <h3>{{ isEditMode ? '✏️ 编辑工具' : '✨ 新增工具' }}</h3>
                        <button class="close-btn" @click="showModal = false">×</button>
                    </div>

                    <div class="modal-body">
                        <div class="form-row">
                            <div class="form-group flex-1">
                                <label>工具名称 *</label>
                                <input v-model="form.title" type="text" class="glass-input" placeholder="例如: ChatGPT">
                            </div>
                            <div class="form-group w-80">
                                <label>图标 (Emoji)</label>
                                <input v-model="form.icon" type="text" class="glass-input text-center" placeholder="🤖">
                            </div>
                        </div>

                        <div class="form-group">
                            <label>工具链接 *</label>
                            <input v-model="form.url" type="text" class="glass-input" placeholder="https://...">
                        </div>

                        <div class="form-group">
                            <label>一句话描述</label>
                            <textarea v-model="form.description" rows="2" class="glass-input"
                                placeholder="简单介绍它的用途..."></textarea>
                        </div>

                        <div class="form-row">
                            <div class="form-group flex-1">
                                <label>分类标签</label>
                                <input v-model="form.category" type="text" class="glass-input"
                                    placeholder="例如: AI, 设计, 开发">
                            </div>
                        </div>

                        <div class="form-group">
                            <label>图标背景色</label>
                            <div class="color-picker">
                                <div v-for="c in presetColors" :key="c" class="color-dot" :style="{ background: c }"
                                    :class="{ active: form.color === c }" @click="form.color = c">
                                </div>
                                <input type="color" v-model="form.color" class="color-input">
                            </div>
                        </div>
                    </div>

                    <div class="modal-actions">
                        <button class="btn-cancel" @click="showModal = false">取消</button>
                        <button class="btn-confirm" @click="handleSubmit" :disabled="isSubmitting">
                            {{ isSubmitting ? '保存中...' : '确定保存' }}
                        </button>
                    </div>
                </div>
            </div>
        </Transition>
    </div>
</template>

<style scoped>
/* 样式复用 FriendLinkList.vue 的风格，并针对工具卡片微调 */
.tool-manage {
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
    margin-bottom: 25px;
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

.btn-primary {
    background: linear-gradient(135deg, #3b82f6, #2563eb);
    border: none;
    padding: 10px 24px;
    border-radius: 8px;
    color: #fff;
    font-weight: 600;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 8px;
    transition: transform 0.2s;
    box-shadow: 0 4px 15px rgba(59, 130, 246, 0.3);
}

.btn-primary:hover {
    transform: translateY(-2px);
    box-shadow: 0 6px 20px rgba(59, 130, 246, 0.5);
}

/* 网格 */
.tool-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
    gap: 20px;
}

/* 卡片 */
.tool-card {
    background: rgba(30, 41, 59, 0.4);
    backdrop-filter: blur(10px);
    border-radius: 16px;
    border: 1px solid rgba(255, 255, 255, 0.05);
    padding: 20px;
    display: flex;
    gap: 15px;
    position: relative;
    transition: transform 0.3s, box-shadow 0.3s;
}

.tool-card:hover {
    transform: translateY(-5px);
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.2);
    border-color: rgba(255, 255, 255, 0.1);
}

.card-icon {
    width: 50px;
    height: 50px;
    border-radius: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 1.5rem;
    flex-shrink: 0;
    box-shadow: 0 4px 10px rgba(0, 0, 0, 0.2);
}

.card-body {
    flex: 1;
    min-width: 0;
}

.card-top {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 5px;
}

.tool-title {
    margin: 0;
    font-size: 1.1rem;
    color: #fff;
    font-weight: 600;
}

.tool-cat {
    font-size: 0.75rem;
    background: rgba(255, 255, 255, 0.1);
    padding: 2px 6px;
    border-radius: 4px;
    color: #cbd5e1;
}

.tool-desc {
    font-size: 0.85rem;
    color: #94a3b8;
    line-height: 1.4;
    margin-bottom: 8px;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
}

.tool-link {
    color: #60a5fa;
    font-size: 0.8rem;
    text-decoration: none;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    display: block;
}

.card-actions {
    display: flex;
    flex-direction: column;
    gap: 8px;
    justify-content: center;
}

.btn-icon {
    width: 30px;
    height: 30px;
    border-radius: 6px;
    border: none;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: 0.2s;
    font-size: 0.9rem;
}

.edit {
    background: rgba(255, 255, 255, 0.1);
    color: #fff;
}

.edit:hover {
    background: #3b82f6;
}

.delete {
    background: rgba(239, 68, 68, 0.15);
    color: #fb7185;
}

.delete:hover {
    background: #f43f5e;
    color: #fff;
}

/* 弹窗表单 */
.modal-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.8);
    backdrop-filter: blur(5px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
}

.modal-card {
    background: #1e293b;
    width: 500px;
    padding: 30px;
    border-radius: 20px;
    border: 1px solid rgba(255, 255, 255, 0.1);
    box-shadow: 0 25px 50px rgba(0, 0, 0, 0.5);
}

.modal-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 25px;
}

.modal-header h3 {
    margin: 0;
    font-size: 1.4rem;
    color: #fff;
}

.close-btn {
    background: none;
    border: none;
    color: #94a3b8;
    font-size: 1.5rem;
    cursor: pointer;
}

.form-group {
    margin-bottom: 18px;
}

.form-row {
    display: flex;
    gap: 15px;
}

.flex-1 {
    flex: 1;
}

.w-80 {
    width: 80px;
}

.text-center {
    text-align: center;
}

.form-group label {
    display: block;
    margin-bottom: 8px;
    color: #cbd5e1;
    font-size: 0.9rem;
}

.glass-input {
    width: 100%;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 8px;
    padding: 12px;
    color: #fff;
    outline: none;
    transition: 0.3s;
    font-size: 0.95rem;
}

.glass-input:focus {
    border-color: #3b82f6;
    background: rgba(255, 255, 255, 0.08);
}

/* 颜色选择器 */
.color-picker {
    display: flex;
    gap: 10px;
    align-items: center;
    flex-wrap: wrap;
}

.color-dot {
    width: 24px;
    height: 24px;
    border-radius: 50%;
    cursor: pointer;
    border: 2px solid transparent;
    transition: transform 0.2s;
}

.color-dot:hover {
    transform: scale(1.1);
}

.color-dot.active {
    border-color: #fff;
    transform: scale(1.1);
    box-shadow: 0 0 10px rgba(255, 255, 255, 0.3);
}

.color-input {
    width: 30px;
    height: 30px;
    border: none;
    background: transparent;
    cursor: pointer;
    padding: 0;
}

.modal-actions {
    display: flex;
    justify-content: flex-end;
    gap: 12px;
    margin-top: 30px;
}

.btn-cancel {
    background: transparent;
    border: 1px solid rgba(255, 255, 255, 0.2);
    color: #ccc;
    padding: 10px 20px;
    border-radius: 8px;
    cursor: pointer;
}

.btn-confirm {
    background: #3b82f6;
    border: none;
    color: #fff;
    padding: 10px 24px;
    border-radius: 8px;
    cursor: pointer;
    font-weight: 600;
}

/* 动画 & 加载 */
.fade-enter-active,
.fade-leave-active {
    transition: opacity 0.3s;
}

.fade-enter-from,
.fade-leave-to {
    opacity: 0;
}

.loading-state,
.empty-state {
    grid-column: 1 / -1;
    text-align: center;
    padding: 60px;
    color: #94a3b8;
    background: rgba(255, 255, 255, 0.02);
    border-radius: 16px;
    border: 2px dashed rgba(255, 255, 255, 0.05);
}

.spinner {
    display: inline-block;
    width: 20px;
    height: 20px;
    border: 2px solid #3b82f6;
    border-top-color: transparent;
    border-radius: 50%;
    animation: spin 1s linear infinite;
    margin-right: 10px;
    vertical-align: middle;
}

@keyframes spin {
    to {
        transform: rotate(360deg);
    }
}
</style>