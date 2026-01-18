<script setup>
import { ref, onMounted, reactive, computed } from 'vue'
import { api } from '@/utils/api'
import { message } from '@/utils/message'

const links = ref([])
const isLoading = ref(false)
const showModal = ref(false)
const isSubmitting = ref(false)
const isEditMode = ref(false)
const filterStatus = ref('all') // 筛选状态: 'all', 'active', 'pending'

const form = reactive({
    id: null,
    name: '',
    link: '',
    avatar: '',
    description: '',
    status: 1 // 1: 显示, 0: 隐藏/待审核
})

// 获取列表
const fetchLinks = async () => {
    isLoading.value = true
    try {
        const res = await api.get('/friend_links')
        if (res.data.success) {
            links.value = res.data.data
        }
    } catch (error) {
        message.error('加载友链失败')
    } finally {
        isLoading.value = false
    }
}

// 列表筛选计算属性
const filteredLinks = computed(() => {
    if (filterStatus.value === 'all') return links.value
    const statusVal = filterStatus.value === 'active' ? 1 : 0
    return links.value.filter(link => link.status === statusVal)
})

// 打开新增弹窗
const openAddModal = () => {
    isEditMode.value = false
    Object.assign(form, { id: null, name: '', link: '', avatar: '', description: '', status: 1 })
    showModal.value = true
}

// 打开编辑弹窗
const openEditModal = (item) => {
    isEditMode.value = true
    Object.assign(form, item)
    showModal.value = true
}

// 提交表单
const handleSubmit = async () => {
    if (!form.name || !form.link) return message.warning('网站名称和链接必填')

    isSubmitting.value = true
    try {
        if (isEditMode.value) {
            await api.put(`/admin/friend_links/${form.id}`, form)
            message.success('修改成功')
        } else {
            await api.post('/admin/friend_links', form)
            message.success('添加成功')
        }
        showModal.value = false
        fetchLinks()
    } catch (error) {
        message.error('操作失败')
    } finally {
        isSubmitting.value = false
    }
}

// 快速切换状态 (上架/下架)
const toggleStatus = async (link) => {
    const newStatus = link.status === 1 ? 0 : 1
    // 乐观更新
    link.status = newStatus
    try {
        await api.put(`/admin/friend_links/${link.id}`, { status: newStatus })
        message.success(newStatus ? '友链已上架' : '友链已隐藏')
    } catch (error) {
        link.status = link.status === 1 ? 0 : 1 // 失败回滚
        message.error('状态更新失败')
    }
}

// 删除
const handleDelete = async (id) => {
    if (!confirm('确定要删除这个友链吗？')) return
    try {
        await api.delete(`/admin/friend_links/${id}`)
        message.success('删除成功')
        links.value = links.value.filter(l => l.id !== id)
    } catch (error) {
        message.error('删除失败')
    }
}

// 图片代理 (复用之前的逻辑)
const getProxyUrl = (url) => {
    if (!url) return ''
    if (url.startsWith('http') || url.startsWith('data:')) return url
    const apiBase = import.meta.env.VITE_API_BASE_URL || ''
    return `${apiBase}${url.startsWith('/') ? '' : '/'}${url}`
}

// 智能头像 (如果没头像，生成首字母图标)
const getAvatar = (item) => {
    if (item.avatar) return getProxyUrl(item.avatar)
    return `https://ui-avatars.com/api/?name=${encodeURIComponent(item.name)}&background=random`
}

onMounted(fetchLinks)
</script>

<template>
    <div class="link-manager">
        <div class="page-header animate__animated animate__fadeInDown">
            <div class="header-content">
                <h2>🤝 友链管理</h2>
                <span class="sub-text">连接世界，管理您的朋友圈</span>
            </div>
            <button class="btn-primary" @click="openAddModal">
                <span class="icon">+</span> 添加友链
            </button>
        </div>

        <div class="filter-tabs animate__animated animate__fadeIn">
            <button v-for="tab in ['all', 'active', 'pending']" :key="tab" class="tab-btn"
                :class="{ active: filterStatus === tab }" @click="filterStatus = tab">
                {{ tab === 'all' ? '全部' : (tab === 'active' ? '✅ 已上架' : '⏸️ 待审核/隐藏') }}
            </button>
        </div>

        <div class="link-grid animate__animated animate__fadeInUp">
            <div v-if="isLoading" class="loading-state">
                <div class="spinner"></div> 加载中...
            </div>

            <div v-else-if="filteredLinks.length === 0" class="empty-state">
                暂无相关友链 🍃
            </div>

            <div v-else v-for="item in filteredLinks" :key="item.id" class="link-card">
                <div class="card-status" :class="{ active: item.status === 1 }"></div>

                <div class="card-body">
                    <img :src="getAvatar(item)" class="link-avatar" alt="logo" loading="lazy">
                    <div class="link-info">
                        <h3 class="link-name">{{ item.name }}</h3>
                        <a :href="item.link" target="_blank" class="link-url">{{ item.link }}</a>
                        <p class="link-desc">{{ item.description || '暂无简介' }}</p>
                    </div>
                </div>

                <div class="card-footer">
                    <div class="status-toggle" @click="toggleStatus(item)" :title="item.status === 1 ? '点击隐藏' : '点击上架'">
                        <span class="status-dot" :class="{ on: item.status === 1 }"></span>
                        {{ item.status === 1 ? '已显示' : '已隐藏' }}
                    </div>
                    <div class="actions">
                        <button class="btn-icon edit" @click="openEditModal(item)">✏️</button>
                        <button class="btn-icon delete" @click="handleDelete(item.id)">🗑️</button>
                    </div>
                </div>
            </div>
        </div>

        <Transition name="fade">
            <div v-if="showModal" class="modal-overlay" @click.self="showModal = false">
                <div class="modal-card animate__animated animate__zoomIn">
                    <div class="modal-header">
                        <h3>{{ isEditMode ? '✏️ 编辑友链' : '✨ 添加新朋友' }}</h3>
                        <button class="close-btn" @click="showModal = false">×</button>
                    </div>

                    <div class="modal-body">
                        <div class="form-group">
                            <label>网站名称 <span class="required">*</span></label>
                            <input v-model="form.name" type="text" class="glass-input" placeholder="例如: Vue.js 官网">
                        </div>

                        <div class="form-group">
                            <label>网站链接 <span class="required">*</span></label>
                            <input v-model="form.link" type="text" class="glass-input" placeholder="https://vuejs.org">
                        </div>

                        <div class="form-group">
                            <label>Logo / 头像</label>
                            <div class="input-with-preview">
                                <input v-model="form.avatar" type="text" class="glass-input"
                                    placeholder="https://.../logo.png">
                                <img :src="form.avatar || 'https://via.placeholder.com/40'" class="preview-mini">
                            </div>
                        </div>

                        <div class="form-group">
                            <label>网站简介</label>
                            <textarea v-model="form.description" rows="3" class="glass-input"
                                placeholder="一句话介绍..."></textarea>
                        </div>

                        <div class="form-group row">
                            <label>状态</label>
                            <div class="toggle-switch" :class="{ active: form.status === 1 }"
                                @click="form.status = form.status === 1 ? 0 : 1">
                                <div class="knob"></div>
                            </div>
                            <span class="status-text">{{ form.status === 1 ? '上架显示' : '暂不显示' }}</span>
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
.link-manager {
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
    background: linear-gradient(135deg, #10b981, #059669);
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
    box-shadow: 0 4px 15px rgba(16, 185, 129, 0.3);
}

.btn-primary:hover {
    transform: translateY(-2px);
    box-shadow: 0 6px 20px rgba(16, 185, 129, 0.5);
}

/* 筛选 Tab */
.filter-tabs {
    display: flex;
    gap: 10px;
    margin-bottom: 20px;
}

.tab-btn {
    background: rgba(30, 41, 59, 0.4);
    border: 1px solid rgba(255, 255, 255, 0.1);
    color: #94a3b8;
    padding: 8px 16px;
    border-radius: 20px;
    cursor: pointer;
    transition: all 0.3s;
    font-size: 0.9rem;
}

.tab-btn:hover {
    background: rgba(255, 255, 255, 0.1);
    color: #fff;
}

.tab-btn.active {
    background: #3b82f6;
    color: #fff;
    border-color: #3b82f6;
    box-shadow: 0 4px 10px rgba(59, 130, 246, 0.3);
}

/* 网格布局 */
.link-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    gap: 20px;
}

/* 友链卡片 */
.link-card {
    background: rgba(30, 41, 59, 0.4);
    backdrop-filter: blur(10px);
    border-radius: 16px;
    border: 1px solid rgba(255, 255, 255, 0.05);
    overflow: hidden;
    transition: transform 0.3s, box-shadow 0.3s;
    display: flex;
    flex-direction: column;
    position: relative;
}

.link-card:hover {
    transform: translateY(-5px);
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.2);
    border-color: rgba(255, 255, 255, 0.1);
}

.card-status {
    height: 4px;
    width: 100%;
    background: #64748b;
}

.card-status.active {
    background: #10b981;
}

.card-body {
    padding: 20px;
    flex: 1;
    display: flex;
    gap: 15px;
    align-items: flex-start;
}

.link-avatar {
    width: 50px;
    height: 50px;
    border-radius: 12px;
    object-fit: cover;
    border: 2px solid rgba(255, 255, 255, 0.1);
    background: #1e293b;
}

.link-info {
    flex: 1;
    min-width: 0;
}

.link-name {
    margin: 0 0 4px 0;
    font-size: 1.1rem;
    color: #fff;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.link-url {
    color: #60a5fa;
    font-size: 0.85rem;
    text-decoration: none;
    display: block;
    margin-bottom: 8px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.link-url:hover {
    text-decoration: underline;
}

.link-desc {
    font-size: 0.85rem;
    color: #94a3b8;
    line-height: 1.4;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
}

.card-footer {
    padding: 12px 20px;
    background: rgba(0, 0, 0, 0.2);
    border-top: 1px solid rgba(255, 255, 255, 0.05);
    display: flex;
    justify-content: space-between;
    align-items: center;
}

.status-toggle {
    font-size: 0.8rem;
    color: #cbd5e1;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 6px;
}

.status-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #64748b;
}

.status-dot.on {
    background: #10b981;
    box-shadow: 0 0 8px #10b981;
}

.actions {
    display: flex;
    gap: 8px;
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
    background: rgba(59, 130, 246, 0.15);
    color: #60a5fa;
}

.edit:hover {
    background: #3b82f6;
    color: #fff;
}

.delete {
    background: rgba(239, 68, 68, 0.15);
    color: #fb7185;
}

.delete:hover {
    background: #f43f5e;
    color: #fff;
}

/* 空状态 & 加载 */
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
    border: 2px solid #8b5cf6;
    border-top-color: transparent;
    border-radius: 50%;
    animation: spin 1s linear infinite;
    margin-right: 10px;
    vertical-align: middle;
}

/* 弹窗 */
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
    width: 450px;
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

.close-btn:hover {
    color: #fff;
}

.form-group {
    margin-bottom: 18px;
}

.form-group label {
    display: block;
    margin-bottom: 8px;
    color: #cbd5e1;
    font-size: 0.9rem;
}

.required {
    color: #f43f5e;
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
    border-color: #8b5cf6;
    background: rgba(255, 255, 255, 0.08);
}

.input-with-preview {
    display: flex;
    gap: 10px;
    align-items: center;
}

.preview-mini {
    width: 40px;
    height: 40px;
    border-radius: 8px;
    object-fit: cover;
    border: 1px solid rgba(255, 255, 255, 0.1);
    flex-shrink: 0;
}

.form-group.row {
    display: flex;
    align-items: center;
    gap: 15px;
}

.form-group.row label {
    margin-bottom: 0;
}

.status-text {
    font-size: 0.9rem;
    color: #94a3b8;
}

/* 开关样式 (复用) */
.toggle-switch {
    width: 40px;
    height: 22px;
    background: rgba(255, 255, 255, 0.1);
    border-radius: 20px;
    position: relative;
    cursor: pointer;
    transition: 0.3s;
}

.toggle-switch.active {
    background: #10b981;
}

.knob {
    width: 16px;
    height: 16px;
    background: #fff;
    border-radius: 50%;
    position: absolute;
    top: 3px;
    left: 3px;
    transition: 0.3s;
}

.toggle-switch.active .knob {
    transform: translateX(18px);
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
    transition: 0.2s;
}

.btn-cancel:hover {
    background: rgba(255, 255, 255, 0.05);
    color: #fff;
}

.btn-confirm {
    background: #8b5cf6;
    border: none;
    color: #fff;
    padding: 10px 24px;
    border-radius: 8px;
    cursor: pointer;
    font-weight: 600;
    transition: 0.2s;
}

.btn-confirm:hover {
    background: #7c3aed;
}

.btn-confirm:disabled {
    opacity: 0.6;
    cursor: wait;
}

/* 动画 */
.fade-enter-active,
.fade-leave-active {
    transition: opacity 0.3s;
}

.fade-enter-from,
.fade-leave-to {
    opacity: 0;
}

@keyframes spin {
    to {
        transform: rotate(360deg);
    }
}
</style>