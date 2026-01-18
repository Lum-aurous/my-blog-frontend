<script setup>
import { ref, onMounted, reactive } from 'vue'
import { api } from '@/utils/api'
import { message } from '@/utils/message'

const poems = ref([])
const isLoading = ref(false)
const showModal = ref(false)
const isSubmitting = ref(false)
const isEditMode = ref(false)

const form = reactive({
    id: null,
    title: '',
    author: '',
    content: '', // 存储完整的诗句字符串，用换行符分隔
})

// 获取列表
const fetchPoems = async () => {
    isLoading.value = true
    try {
        const res = await api.get('/admin/poems')
        if (res.data.success) {
            // 🔥 核心修复：后端返回的是分页结构 { list: [], pagination: {} }
            // 并且需要把 content 字符串切分为 lines 数组
            const rawList = res.data.data.list || []

            poems.value = rawList.map(poem => ({
                ...poem,
                // 如果有 content，就按换行符切分；否则给个空数组
                lines: poem.content ? poem.content.split('\n') : []
            }))
        }
    } catch (error) {
        console.error(error)
        message.error('加载诗词失败')
    } finally {
        isLoading.value = false
    }
}

// 核心优化：允许“多选”，建立随机诗句池
const toggleActive = async (item) => {
    try {
        // 统一调用 toggle 接口 (只修改当前这一条的状态，互不影响)
        // 确保后端 index.js 已有 PATCH /api/admin/poems/:id/toggle 接口
        const res = await api.patch(`/admin/poems/${item.id}/toggle`)
        
        if (res.data.success) {
            // 更新前端状态
            item.is_active = item.is_active ? 0 : 1
            
            if (item.is_active) {
                message.success(`《${item.title}》已加入展示池 ✨`)
            } else {
                message.success(`《${item.title}》已移出展示池`)
            }
        }
    } catch (error) {
        console.error(error)
        message.error('状态更新失败')
    }
}

// 弹窗操作
const openAddModal = () => {
    isEditMode.value = false
    Object.assign(form, { id: null, title: '', author: '', content: '' })
    showModal.value = true
}

const openEditModal = (item) => {
    isEditMode.value = true
    // 将数组形式的 lines 转换为字符串，用于编辑
    const contentStr = Array.isArray(item.lines) ? item.lines.join('\n') : item.content
    Object.assign(form, { ...item, content: contentStr })
    showModal.value = true
}

// 提交
const handleSubmit = async () => {
    if (!form.title || !form.content) return message.warning('标题和内容必填')

    isSubmitting.value = true
    // 将换行符分割的内容转为数组
    const payload = {
        ...form,
        lines: form.content.split('\n').filter(line => line.trim() !== '')
    }

    try {
        if (isEditMode.value) {
            await api.put(`/admin/poems/${form.id}`, payload)
            message.success('修改成功')
        } else {
            await api.post('/admin/poems', payload)
            message.success('添加成功')
        }
        showModal.value = false
        fetchPoems()
    } catch (error) {
        message.error('操作失败')
    } finally {
        isSubmitting.value = false
    }
}

// 删除
const handleDelete = async (id) => {
    if (!confirm('确定删除这首诗吗？')) return
    try {
        await api.delete(`/admin/poems/${id}`)
        message.success('删除成功')
        fetchPoems()
    } catch (error) {
        message.error('删除失败')
    }
}

onMounted(fetchPoems)
</script>

<template>
    <div class="poem-manage">
        <div class="page-header animate__animated animate__fadeInDown">
            <div class="header-content">
                <h2>📜 诗词管理</h2>
                <span class="sub-text">管理“联系我”页面的左侧诗句展示</span>
            </div>
            <button class="btn-primary" @click="openAddModal">
                <span class="icon">+</span> 题诗一首
            </button>
        </div>

        <div class="poem-grid animate__animated animate__fadeInUp">
            <div v-if="isLoading" class="loading-state">
                <div class="spinner"></div> 正在吟诗...
            </div>

            <div v-else-if="poems.length === 0" class="empty-state">
                暂无诗词，请赐墨宝 🖌️
            </div>

            <div v-else v-for="item in poems" :key="item.id" class="poem-card" :class="{ active: item.is_active }">
                <div v-if="item.is_active" class="active-badge">🌟 当前展示</div>

                <div class="card-body">
                    <h3 class="poem-title">{{ item.title }}</h3>
                    <span class="poem-author">[{{ item.author || '佚名' }}]</span>
                    <div class="poem-lines">
                        <p v-for="(line, idx) in (Array.isArray(item.lines) ? item.lines : [])" :key="idx">
                            {{ line }}
                        </p>
                    </div>
                </div>

                <div class="card-footer">
                    <div class="status-toggle-wrapper" @click="toggleActive(item)">
                        <div class="toggle-switch" :class="{ active: item.is_active }">
                            <div class="knob"></div>
                        </div>
                        <span class="status-label" :class="{ active: item.is_active }">
                            {{ item.is_active ? '正在展示' : '未展示' }}
                        </span>
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
                        <h3>{{ isEditMode ? '✏️ 修改诗句' : '🖋️ 新增诗句' }}</h3>
                        <button class="close-btn" @click="showModal = false">×</button>
                    </div>

                    <div class="modal-body">
                        <div class="form-row">
                            <div class="form-group flex-1">
                                <label>诗词标题 *</label>
                                <input v-model="form.title" type="text" class="glass-input" placeholder="例如: 一笺寄心意">
                            </div>
                            <div class="form-group w-100">
                                <label>作者</label>
                                <input v-model="form.author" type="text" class="glass-input" placeholder="风雅集">
                            </div>
                        </div>

                        <div class="form-group">
                            <label>诗句内容 (每行一句) *</label>
                            <textarea v-model="form.content" rows="6" class="glass-input text-center-input"
                                placeholder="一笺寄心意&#10;素笔写山河&#10;山河皆过客&#10;唯君入星河"></textarea>
                        </div>
                    </div>

                    <div class="modal-actions">
                        <button class="btn-cancel" @click="showModal = false">取消</button>
                        <button class="btn-confirm" @click="handleSubmit" :disabled="isSubmitting">
                            {{ isSubmitting ? '提交中...' : '完成' }}
                        </button>
                    </div>
                </div>
            </div>
        </Transition>
    </div>
</template>

<style scoped>
.poem-manage {
    max-width: 1200px;
    margin: 0 auto;
    color: #e2e8f0;
    padding-bottom: 60px;
}

/* 头部 (复用) */
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
    font-family: 'Cinzel', serif;
}

.sub-text {
    color: #94a3b8;
    font-size: 0.9rem;
    margin-top: 5px;
    display: block;
}

.btn-primary {
    background: linear-gradient(135deg, #d4af37, #b8860b);
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
    box-shadow: 0 4px 15px rgba(212, 175, 55, 0.3);
}

.btn-primary:hover {
    transform: translateY(-2px);
    box-shadow: 0 6px 20px rgba(212, 175, 55, 0.5);
}

/* 诗词卡片网格 */
.poem-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    gap: 20px;
}

.poem-card {
    background: rgba(30, 41, 59, 0.4);
    backdrop-filter: blur(10px);
    border-radius: 16px;
    border: 1px solid rgba(255, 255, 255, 0.05);
    padding: 20px;
    display: flex;
    flex-direction: column;
    position: relative;
    transition: all 0.3s;
    min-height: 250px;
}

.poem-card:hover {
    transform: translateY(-5px);
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.2);
}

/* 激活状态 */
.poem-card.active {
    border-color: #d4af37;
    background: rgba(212, 175, 55, 0.05);
}

.active-badge {
    position: absolute;
    top: 10px;
    right: 10px;
    background: #d4af37;
    color: #fff;
    font-size: 0.7rem;
    padding: 2px 8px;
    border-radius: 4px;
    font-weight: 700;
}

.card-body {
    flex: 1;
    text-align: center;
    display: flex;
    flex-direction: column;
    align-items: center;
    margin-top: 10px;
}

.poem-title {
    font-family: 'Cinzel', serif;
    font-size: 1.2rem;
    color: #fff;
    margin: 0 0 5px 0;
}

.poem-author {
    font-size: 0.8rem;
    color: #94a3b8;
    margin-bottom: 20px;
    font-style: italic;
}

.poem-lines {
    font-family: 'Kaiti', serif;
    color: #cbd5e1;
    line-height: 1.8;
    font-size: 1rem;
}

.card-footer {
    margin-top: 20px;
    padding-top: 15px;
    border-top: 1px solid rgba(255, 255, 255, 0.05);
    display: flex;
    justify-content: space-between;
    align-items: center;
}

.btn-set-active {
    background: transparent;
    border: 1px solid #d4af37;
    color: #d4af37;
    padding: 4px 12px;
    border-radius: 20px;
    font-size: 0.8rem;
    cursor: pointer;
    transition: 0.2s;
}

.btn-set-active:hover {
    background: #d4af37;
    color: #fff;
}

.status-text {
    color: #d4af37;
    font-size: 0.8rem;
    font-weight: 600;
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

/* 弹窗通用样式 (复用) */
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

.w-100 {
    width: 100px;
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
    border-color: #d4af37;
    background: rgba(255, 255, 255, 0.08);
}

.text-center-input {
    text-align: center;
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
    background: #d4af37;
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
    border: 2px solid #d4af37;
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

/* 🔥🔥🔥 Toggle 开关样式 (复用友链风格) 🔥🔥🔥 */
.status-toggle-wrapper {
    display: flex;
    align-items: center;
    gap: 8px;
    cursor: pointer;
    transition: opacity 0.3s;
}

.status-toggle-wrapper:hover {
    opacity: 0.8;
}

.toggle-switch {
    width: 40px;
    height: 22px;
    background: rgba(255, 255, 255, 0.1);
    border-radius: 20px;
    position: relative;
    transition: all 0.3s cubic-bezier(0.4, 0.0, 0.2, 1);
    border: 1px solid rgba(255, 255, 255, 0.1);
}

.toggle-switch.active {
    background: #d4af37;
    /* 金色激活态 */
    border-color: #d4af37;
    box-shadow: 0 0 10px rgba(212, 175, 55, 0.4);
}

.knob {
    width: 16px;
    height: 16px;
    background: #fff;
    border-radius: 50%;
    position: absolute;
    top: 2px;
    left: 2px;
    transition: all 0.3s cubic-bezier(0.4, 0.0, 0.2, 1);
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
}

.toggle-switch.active .knob {
    transform: translateX(18px);
}

.status-label {
    font-size: 0.85rem;
    color: #64748b;
    font-weight: 500;
    transition: color 0.3s;
}

.status-label.active {
    color: #d4af37;
    /* 金色文字 */
    font-weight: 700;
}
</style>