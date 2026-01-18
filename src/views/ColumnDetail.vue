<script setup>
import { ref, onMounted, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { api } from '@/utils/api'
import { message } from '@/utils/message'
import ArticleItem from '@/components/ArticleItem.vue'
import { useUserStore } from '@/stores/user.js'

const route = useRoute()
const router = useRouter()
const userStore = useUserStore()

const columnData = ref(null)
const coverUploading = ref(false)
const coverInput = ref(null)
const showEditModal = ref(false);
const editForm = ref({ name: '', description: '' });
const isSaving = ref(false);

// ==================== 0. 分页状态管理 (新增) ====================
const pagination = ref({
  page: 1,
  pageSize: 12, // 每次加载12篇，不多不少
  hasMore: true,
  loading: false
})

// ==================== 🛠️ 通用数据清洗函数 ====================
const sanitizeItem = (item) => {
  let type = item.work_type;
  if (!type) {
    if (item.video_url) type = 'video';
    else if (item.audio_url) type = 'audio';
    else type = 'article';
  }
  let cover = item.cover_image || item.cover || item.cover_url || item.poster;
  if ((type === 'short' || !cover) && item.content) {
    const imgMatch = item.content.match(/!\[.*?\]\((.*?)\)/);
    if (imgMatch && imgMatch[1]) {
      cover = imgMatch[1];
      if (type === 'article') type = 'short';
    }
  }
  if (type === 'video' && item.video_url) {
    if (!item.video_url.startsWith('http') && !item.video_url.startsWith('/')) {
      item.video_url = '/' + item.video_url;
    }
  }
  return {
    ...item,
    id: item.id,
    entry_id: item.entry_id,
    title: item.title,
    summary: item.summary || item.description || '',
    work_type: type,
    cover_image: cover,
    views: Number(item.views || 0),
    comments: Number(item.comments || 0),
    likes: Number(item.likes || 0),
    favorites: Number(item.favorites || 0),
    created_at: item.created_at
  };
}

// 路径处理
const getProxyUrl = (url) => {
  if (!url || url === 'null' || url === 'undefined') {
    return 'https://images.unsplash.com/photo-1484417894907-623942c8ee29?w=500';
  }
  if (url.startsWith('http')) return url;
  if (url.startsWith('/uploads') || url.startsWith('/')) {
    let cleanPath = url.startsWith('/') ? url : '/' + url
    if (!cleanPath.startsWith('/api')) {
      cleanPath = '/api' + cleanPath
    }
    return cleanPath
  }
  return `/api/proxy-image?url=${encodeURIComponent(url)}`
};

// ==================== 🔥 核心优化：获取专栏内容 (支持分页) ====================
const fetchColumnContent = async (isLoadMore = false) => {
  if (pagination.value.loading) return

  pagination.value.loading = true

  // 如果是初次加载（非加载更多），重置页码
  if (!isLoadMore) {
    pagination.value.page = 1
    pagination.value.hasMore = true
  }

  try {
    // 调用 API 时带上 page 和 limit
    const res = await api.get(`/columns/${route.params.id}`, {
      params: {
        page: pagination.value.page,
        limit: pagination.value.pageSize
      }
    })

    const serverData = (res.data && res.data.success !== undefined) ? res.data : res;

    if (serverData.success) {
      const rawData = serverData.data;
      const newArticles = (rawData.articles || []).map(sanitizeItem)

      // 判断是否还有更多数据
      if (newArticles.length < pagination.value.pageSize) {
        pagination.value.hasMore = false
      }

      if (isLoadMore) {
        // 追加模式：只增加文章
        if (columnData.value) {
          columnData.value.articles.push(...newArticles)
        }
      } else {
        // 覆盖模式：初始化整个专栏信息
        columnData.value = {
          ...rawData,
          articles: newArticles
        }
      }

      // 准备下一页
      pagination.value.page++
      console.log("📂 专栏数据加载成功, 当前数量:", columnData.value?.articles.length);
    }
  } catch (err) {
    console.error(err)
    message.error('无法加载专栏内容')
  } finally {
    pagination.value.loading = false
  }
}

const isMyColumn = computed(() => {
  return columnData.value?.info.user_id === userStore.user?.id
})

// 触发文件选择
const triggerCoverUpload = () => {
  if (coverUploading.value) return;
  coverInput.value.click();
};

// 处理封面更换
const handleCoverChange = async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const formData = new FormData();
  formData.append('cover', file);
  coverUploading.value = true;
  try {
    const res = await api.put(`/columns/${route.params.id}/cover`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
    const serverData = (res.data && res.data.success !== undefined) ? res.data : res;
    if (serverData.success) {
      message.success('专栏背景同步成功！');
      columnData.value.info.cover = serverData.data;
    }
  } catch (err) {
    message.error('封面同步失败');
  } finally {
    coverUploading.value = false;
    e.target.value = '';
  }
};

// 打开编辑弹窗
const openEditModal = () => {
  if (!columnData.value?.info) return;
  editForm.value = {
    name: columnData.value.info.name,
    description: columnData.value.info.description || ''
  };
  showEditModal.value = true;
};

// 提交修改
const handleSaveInfo = async () => {
  if (!editForm.value.name.trim()) return message.warning('专栏名称不能为空');
  isSaving.value = true;
  try {
    const res = await api.put(`/columns/${route.params.id}/info`, editForm.value);
    const serverData = (res.data && res.data.success !== undefined) ? res.data : res;
    if (serverData.success) {
      message.success('专栏信息更新成功！');
      columnData.value.info.name = editForm.value.name;
      columnData.value.info.description = editForm.value.description;
      showEditModal.value = false;
    }
  } catch (err) {
    message.error('修改失败');
  } finally {
    isSaving.value = false;
  }
};

// 移除作品
const handleRemoveArticle = async (entry) => {
  if (!confirm('确定要将此内容从专栏中移除吗？')) return
  try {
    const linkId = entry.entry_id || entry.id
    const res = await api.delete(`/columns/${route.params.id}/articles/${linkId}`)
    const serverData = (res.data && res.data.success !== undefined) ? res.data : res;
    if (serverData.success) {
      message.success('已从专栏移除')
      // 移除后重新刷新当前列表（保持分页逻辑简单，直接刷新第一页或者在本地移除）
      // 这里为了简单，直接本地移除 UI 元素，不重新请求 API，体验更好
      columnData.value.articles = columnData.value.articles.filter(item => item.id !== entry.id)
    }
  } catch (err) {
    message.error('移除失败')
  }
}

// 初始化加载
onMounted(() => {
  fetchColumnContent() // 默认加载第一页
})
</script>

<template>
  <div class="column-detail-page" v-if="columnData">
    <header class="profile-header-flat">
      <div class="banner-box">
        <img :src="getProxyUrl(columnData.info.cover)" class="banner-img" :class="{ 'loading-blur': coverUploading }"
          alt="banner">
        <template v-if="isMyColumn">
          <div class="banner-tag" @click="triggerCoverUpload">
            {{ coverUploading ? '同步中...' : '📷 更换专栏背景' }}
          </div>
          <input type="file" ref="coverInput" style="display: none" accept="image/*" @change="handleCoverChange">
        </template>
      </div>

      <div class="header-info-container">
        <div class="info-content-main">
          <div class="avatar-box">
            <img :src="columnData.info.avatar || 'https://w.wallhaven.cc/full/9o/wallhaven-9oog5d.jpg'"
              class="avatar-img" alt="creator">
          </div>

          <div class="user-detail">
            <div class="name-row">
              <h1 class="nickname">{{ columnData.info.name }}</h1>
              <span class="user-badge">专题专栏</span>
            </div>

            <div class="stats-row-top">
              <span class="top-stat">创建者：<b>{{ columnData.info.nickname || columnData.info.username }}</b></span>
              <span class="top-stat">📦 <b>{{ columnData.articles.length }}+</b> 个作品</span>
            </div>

            <div class="bio-box">
              <p class="user-bio">专栏描述：{{ columnData.info.description || '这个专栏文件夹暂时没有描述。' }}</p>
            </div>
          </div>

          <div class="header-actions">
            <button v-if="isMyColumn" class="action-btn outline edit-btn" @click="openEditModal">
              🖊️ 编辑信息
            </button>
            <button class="action-btn outline" @click="router.back()">返回上一页</button>
          </div>

          <Teleport to="body">
            <div v-if="showEditModal" class="column-modal-overlay" @click="showEditModal = false">
              <div class="column-modal art-modal" @click.stop>

                <div class="art-modal-header">
                  <span class="decoration-line"></span>
                  <h3>修缮专栏资料</h3> <span class="decoration-line"></span>
                  <button class="art-close-btn" @click="showEditModal = false">✕</button>
                </div>

                <div class="art-modal-body">
                  <div class="art-create-form animate__animated animate__fadeIn">

                    <div class="input-group">
                      <input v-model="editForm.name" type="text" class="art-input" placeholder=" " autofocus>
                      <label>专栏名称</label>
                      <span class="input-underline"></span>
                    </div>

                    <div class="input-group">
                      <textarea v-model="editForm.description" class="art-input textarea" placeholder=" "
                        rows="3"></textarea>
                      <label>专栏描述 / 背后的故事...</label>
                      <span class="input-underline"></span>
                    </div>

                    <div class="art-form-ops">
                      <button class="art-btn-text" @click="showEditModal = false">取消</button>
                      <button class="art-btn-primary" @click="handleSaveInfo" :disabled="isSaving">
                        {{ isSaving ? '保存中...' : '确认修改' }}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </Teleport>
        </div>
      </div>
    </header>

    <main class="column-articles-container">
      <div v-if="columnData.articles.length > 0" class="articles-list">
        <div v-for="article in columnData.articles" :key="article.id" class="article-item-wrapper">
          <button v-if="isMyColumn" class="remove-article-btn" @click.stop="handleRemoveArticle(article)" title="从专栏移除">
            <span class="cross-icon">×</span>
          </button>
          <ArticleItem v-if="article && article.id" :data="article" @click="router.push({
            path: `/article/${article.id}`,
            query: { type: article.work_type }
          })" />
        </div>

        <div class="load-more-container">
          <button v-if="pagination.hasMore" class="load-more-btn" :class="{ loading: pagination.loading }"
            @click="fetchColumnContent(true)">
            <span v-if="pagination.loading" class="loader"></span>
            {{ pagination.loading ? '正在加载...' : '加载更多' }}
          </button>
          <div v-else class="no-more-text">
            🌱 专栏内容已全部加载完毕
          </div>
        </div>
      </div>

      <div v-else class="empty-state">
        <p>📭 这个“文件夹”还是空的哦</p>
        <button class="go-back-btn" @click="router.back()">返回上一页</button>
      </div>
    </main>
  </div>

  <div v-else class="loading-box">
    <div class="spinner"></div>
  </div>
</template>

<style scoped>
/* ==================== 1. 基础页面布局 ==================== */
.column-detail-page {
  background: #f4f6f8;
  min-height: 100vh;
  padding-bottom: 50px;
}

.loading-box {
  min-height: 100vh;
  display: flex;
  justify-content: center;
  align-items: center;
}

.spinner {
  width: 40px;
  height: 40px;
  border: 4px solid #f3f3f3;
  border-top: 4px solid #42b883;
  border-radius: 50%;
  animation: rotation 1s linear infinite;
}

/* ==================== 2. 头部视觉模型 (Profile Flat Style) ==================== */
.profile-header-flat {
  background: #fff;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.05);
  margin-bottom: 20px;
}

.banner-box {
  height: 180px;
  overflow: hidden;
  position: relative;
}

.banner-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: filter 0.5s ease;
}

.loading-blur {
  filter: blur(10px);
  opacity: 0.7;
}

.banner-tag {
  position: absolute;
  bottom: 10px;
  right: 20px;
  color: white;
  background: rgba(0, 0, 0, 0.3);
  padding: 4px 10px;
  border-radius: 4px;
  font-size: 12px;
  cursor: pointer;
  backdrop-filter: blur(4px);
}

.header-info-container {
  max-width: 900px;
  margin: 0 auto;
  padding: 0 20px;
  position: relative;
  top: -50px;
  /* 关键：允许点击穿透给Banner上的按钮 */
  pointer-events: none;
}

.info-content-main {
  display: flex;
  align-items: flex-start;
  gap: 24px;
  /* 恢复子元素的点击能力 */
  pointer-events: auto;
}

.avatar-box {
  width: 120px;
  height: 120px;
  border-radius: 20px;
  border: 5px solid #fff;
  background: #fff;
  overflow: hidden;
  flex-shrink: 0;
  box-shadow: 0 8px 25px rgba(0, 0, 0, 0.15);
}

.avatar-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.user-detail {
  flex: 1;
  padding-top: 60px;
}

.name-row {
  display: flex;
  align-items: center;
  gap: 15px;
  margin-bottom: 12px;
}

.nickname {
  font-size: 26px;
  font-weight: 800;
  color: #1a1a1a;
  margin: 0;
}

.user-badge {
  font-size: 11px;
  color: #42b883;
  background: rgba(66, 184, 131, 0.1);
  padding: 3px 12px;
  border-radius: 50px;
  font-weight: 600;
  border: 1px solid rgba(66, 184, 131, 0.2);
}

.stats-row-top {
  display: flex;
  gap: 25px;
  margin-bottom: 15px;
  color: #555;
  font-size: 14px;
}

.bio-box {
  background: #f9f9f9;
  padding: 10px 15px;
  border-radius: 8px;
  border-left: 3px solid #42b883;
}

.user-bio {
  font-size: 14px;
  color: #5d4a3b;
  line-height: 1.8;
  white-space: pre-wrap;
  word-break: break-all;
}

.header-actions {
  padding-top: 65px;
}

.action-btn.outline {
  padding: 8px 18px;
  border-radius: 50px;
  background: #fff;
  border: 1px solid #e0e0e0;
  color: #555;
  cursor: pointer;
  margin-right: 10px;
  /* 按钮之间加点间距 */
  transition: all 0.3s;
}

.edit-btn:hover {
  border-color: #42b883 !important;
  color: #42b883 !important;
  background: rgba(66, 184, 131, 0.05) !important;
}

.input-label {
  /* 保留给部分显示用，虽然弹窗里不用了 */
  font-size: 13px;
  font-weight: 700;
  color: #888;
  margin-bottom: 5px;
  display: block;
  text-align: left;
}

/* ==================== 🏛️ 文艺时尚风弹窗 (Art Modal - 1:1 复刻版) ==================== */

/* 1. 遮罩层：深色毛玻璃 */
.column-modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  background: rgba(44, 30, 20, 0.6);
  /* 深棕色半透明 */
  backdrop-filter: blur(6px);
  z-index: 3000;
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 20px;
  animation: fadeIn 0.3s ease;
}

/* 2. 弹窗主体：羊皮纸质感 + 噪点纹理 */
.art-modal {
  width: 100%;
  max-width: 400px;
  background-color: #fdfbf7;
  /* 暖白色/羊皮纸色 */
  border-radius: 12px;
  box-shadow: 0 20px 50px rgba(0, 0, 0, 0.2), 0 0 0 1px rgba(139, 90, 43, 0.1);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  position: relative;
  /* 关键：噪点背景图 */
  background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)' opacity='0.05'/%3E%3C/svg%3E");
  animation: slideUp 0.4s cubic-bezier(0.165, 0.84, 0.44, 1);
}

/* 3. 头部设计 */
.art-modal-header {
  padding: 25px 20px 15px;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
}

.art-modal-header h3 {
  margin: 0 15px;
  font-family: "Georgia", "Songti SC", serif;
  font-size: 1.2rem;
  color: #5c4033;
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

/* 4. 输入框组：浮动 Label 效果 */
.input-group {
  position: relative;
  margin-bottom: 30px;
  padding-top: 10px;
}

.art-input {
  width: 100%;
  border: none;
  background: transparent;
  padding: 8px 0;
  font-size: 1rem;
  color: #2c1e0f;
  font-family: inherit;
  outline: none;
  border-bottom: 1px solid #d4c5b0;
  transition: border-color 0.3s;
}

.art-input.textarea {
  resize: none;
  line-height: 1.6;
}

/* 浮动 Label 逻辑 */
.input-group label {
  position: absolute;
  top: 18px;
  left: 0;
  color: #999;
  font-size: 0.95rem;
  transition: all 0.3s ease;
  pointer-events: none;
}

/* 当输入框聚焦 或 占位符不显示（即有内容）时，Label 上浮 */
.art-input:focus~label,
.art-input:not(:placeholder-shown)~label {
  top: -5px;
  font-size: 0.75rem;
  color: #8b5a2b;
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

/* 5. 按钮组 */
.art-form-ops {
  display: flex;
  justify-content: flex-end;
  gap: 20px;
  margin-top: 15px;
  align-items: center;
}

.art-btn-text {
  background: none;
  border: none;
  color: #888;
  cursor: pointer;
  font-size: 0.9rem;
  transition: color 0.2s;
}

.art-btn-text:hover {
  color: #555;
}

.art-btn-primary {
  background: #2c1e0f;
  /* 深咖啡色 */
  color: #f7f1e3;
  border: none;
  padding: 10px 28px;
  border-radius: 4px;
  font-size: 0.9rem;
  font-family: serif;
  letter-spacing: 1px;
  cursor: pointer;
  transition: all 0.3s;
  box-shadow: 0 4px 10px rgba(44, 30, 20, 0.2);
}

.art-btn-primary:hover {
  background: #4a3b2a;
  transform: translateY(-1px);
  box-shadow: 0 6px 15px rgba(44, 30, 20, 0.3);
}

.art-btn-primary:disabled {
  background: #8d7e70;
  cursor: not-allowed;
}

/* 6. 动画关键帧 */
@keyframes fadeIn {
  from {
    opacity: 0;
  }

  to {
    opacity: 1;
  }
}

@keyframes slideUp {
  from {
    transform: translateY(30px);
    opacity: 0;
  }

  to {
    transform: translateY(0);
    opacity: 1;
  }
}

/* ==================== 4. 作品列表 & 按钮 ==================== */
.column-articles-container {
  max-width: 900px;
  margin: 0 auto;
  background: white;
  border-radius: 12px;
  padding: 20px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.03);
}

.article-item-wrapper {
  position: relative;
  margin-bottom: 15px;
}

.remove-article-btn {
  position: absolute;
  top: 15px;
  right: 15px;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.9);
  color: #ff5f7e;
  border: 1px solid #eee;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  z-index: 10;
  opacity: 0;
  transition: 0.3s;
}

.article-item-wrapper:hover .remove-article-btn {
  opacity: 1;
}

/* Load More 按钮样式 */
.load-more-container {
  padding: 20px 0 10px;
  display: flex;
  justify-content: center;
  align-items: center;
}

.load-more-btn {
  padding: 10px 30px;
  background: #fff;
  border: 1px solid #e0e0e0;
  color: #666;
  border-radius: 50px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.3s ease;
  display: flex;
  align-items: center;
  gap: 8px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
}

.load-more-btn:hover {
  border-color: #42b883;
  color: #42b883;
  background: #f0fdf4;
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(66, 184, 131, 0.15);
}

.load-more-btn.loading {
  opacity: 0.7;
  cursor: not-allowed;
  background: #f9f9f9;
}

.loader {
  width: 16px;
  height: 16px;
  border: 2px solid #ccc;
  border-bottom-color: transparent;
  border-radius: 50%;
  display: inline-block;
  animation: rotation 1s linear infinite;
}

.no-more-text {
  font-size: 13px;
  color: #b0b0b0;
  padding: 10px;
  letter-spacing: 1px;
}

.empty-state {
  padding: 60px 0;
  text-align: center;
  color: #999;
}

.go-back-btn {
  margin-top: 15px;
  padding: 8px 20px;
  border-radius: 20px;
  border: 1px solid #ddd;
  background: white;
  cursor: pointer;
  color: #666;
}

/* ==================== 5. 动画关键帧 ==================== */
@keyframes fadeIn {
  from {
    opacity: 0;
  }

  to {
    opacity: 1;
  }
}

@keyframes slideUp {
  from {
    transform: translateY(30px);
    opacity: 0;
  }

  to {
    transform: translateY(0);
    opacity: 1;
  }
}

@keyframes rotation {
  0% {
    transform: rotate(0deg);
  }

  100% {
    transform: rotate(360deg);
  }
}

/* ==================== 6. 📱 移动端深度适配 ==================== */
@media (max-width: 600px) {

  /* Banner & Header 调整 */
  .banner-box {
    height: 140px;
  }

  .header-info-container {
    top: -40px;
    padding: 0 15px;
  }

  .info-content-main {
    flex-direction: column;
    align-items: center;
    text-align: center;
    gap: 15px;
  }

  .avatar-box {
    width: 90px;
    height: 90px;
    border-width: 4px;
    margin: 0 auto;
  }

  .user-detail {
    padding-top: 0;
    width: 100%;
  }

  .name-row {
    justify-content: center;
    flex-wrap: wrap;
    margin-bottom: 10px;
  }

  .nickname {
    font-size: 22px;
  }

  .stats-row-top {
    justify-content: center;
    font-size: 13px;
    gap: 15px;
    margin-bottom: 20px;
    flex-wrap: wrap;
  }

  .bio-box {
    text-align: left;
    font-size: 13px;
    padding: 12px;
    margin-top: 10px;
    background: #fdfdfd;
  }

  .header-actions {
    padding-top: 20px;
    display: flex;
    justify-content: center;
    gap: 12px;
    width: 100%;
  }

  .action-btn.outline {
    padding: 8px 20px;
    font-size: 13px;
    flex: 1;
    max-width: 140px;
    margin-right: 0;
    /* 移动端清除右间距 */
  }

  .column-articles-container {
    padding: 15px;
    border-radius: 12px 12px 0 0;
    margin-top: -20px;
    box-shadow: none;
  }

  .remove-article-btn {
    opacity: 1;
    width: 24px;
    height: 24px;
    top: 10px;
    right: 10px;
    background: rgba(255, 255, 255, 0.95);
    box-shadow: 0 2px 5px rgba(0, 0, 0, 0.1);
  }

  .banner-tag {
    font-size: 10px !important;
    padding: 4px 10px !important;
    bottom: 10px !important;
    right: 10px !important;
    background: rgba(0, 0, 0, 0.6) !important;
    z-index: 10;
  }

  /* 罗马弹窗移动端适配 */
  .roman-modal {
    width: 95%;
    max-height: 85vh;
    overflow-y: auto;
  }

  .roman-body {
    padding: 20px;
  }

  .roman-actions {
    flex-direction: column-reverse;
  }

  .roman-btn {
    width: 100%;
    padding: 16px;
  }
}
</style>