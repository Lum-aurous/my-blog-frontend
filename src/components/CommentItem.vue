<script setup>
import { computed, inject, ref } from 'vue'
import { useUserStore } from '@/stores/user.js'

defineOptions({ name: 'CommentItem' })

// 注入灯箱方法
const triggerLightbox = inject('triggerLightbox', () => { })

const props = defineProps({
    comment: Object,
    articleAuthorId: [Number, String]
})

const emit = defineEmits(['reply', 'like', 'dislike', 'delete'])
const userStore = useUserStore()

// 控制子评论展开/折叠
const showReplies = ref(false)

/* 是否文章作者 */
const isArticleAuthor = computed(() => {
    const cid = props.comment.commenter_id || props.comment.user_id
    return Number(cid) === Number(props.articleAuthorId)
})

/* 作者是否赞过 */
const isAuthorLiked = computed(() => props.comment.author_liked)

/* 删除权限 */
const canDelete = computed(() => {
    const user = userStore.user
    if (!user) return false
    if (user.role === 'admin') return true
    return user.username === props.comment.author_username || user.nickname === props.comment.nickname
})

/* 时间格式化 */
const formatRelativeTime = (dateStr) => {
    const diff = (Date.now() - new Date(dateStr)) / 1000
    if (diff < 60) return '刚刚'
    if (diff < 3600) return `${Math.floor(diff / 60)} 分钟前`
    if (diff < 86400) return `${Math.floor(diff / 3600)} 小时前`
    const d = new Date(dateStr)
    return `${d.getMonth() + 1}-${d.getDate()}`
}
</script>

<template>
    <div class="comment-node-wrapper">
        <div class="comment-main-card">

            <div class="avatar-column">
                <img :src="comment.avatar" class="avatar user-avatar" />
                <div v-if="comment.replies?.length && showReplies" class="thread-line-vertical"></div>
            </div>

            <div class="content-column">
                <div class="comment-header">
                    <span class="comment-author" :class="{ 'is-author': isArticleAuthor }">
                        {{ comment.nickname }}
                    </span>
                    <span v-if="isArticleAuthor" class="author-badge">
                        <span class="pen-icon">🖋️</span> 楼主
                    </span>
                </div>

                <div class="comment-text">
                    <span v-if="comment.parent_id" class="reply-target-tag">
                        回复 @{{ comment.reply_to_user_nickname || '层主' }} :
                    </span>
                    {{ comment.content }}

                    <div v-if="isAuthorLiked" class="author-liked-badge">
                        <span class="heart-mini">❤️</span> 作者赞过
                    </div>
                </div>

                <div v-if="comment.images?.length" class="comment-gallery">
                    <div v-for="(img, i) in comment.images" :key="i" class="polaroid-img"
                        @click.stop="triggerLightbox(img)">
                        <img :src="img" loading="lazy">
                    </div>
                </div>

                <div class="comment-footer">
                    <div class="info-left">
                        <span class="time">{{ formatRelativeTime(comment.created_at) }}</span>
                        <span class="location" v-if="comment.location">· {{ comment.location }}</span>

                        <button class="text-action-btn" @click="emit('reply', comment)">回复</button>

                        <button v-if="comment.replies?.length" class="text-action-btn toggle-btn"
                            @click="showReplies = !showReplies">
                            {{ showReplies ? '收起' : `展开(${comment.replies.length})` }}
                        </button>

                        <button v-if="canDelete" class="text-action-btn delete"
                            @click="emit('delete', comment.id)">删除</button>
                    </div>

                    <div class="action-right">
                        <button class="icon-btn like-btn" :class="{ active: comment.is_liked }"
                            @click="emit('like', comment)">
                            <svg v-if="comment.is_liked" viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
                                <path
                                    d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
                            </svg>
                            <svg v-else viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor"
                                stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <path
                                    d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z">
                                </path>
                            </svg>
                            <span v-if="comment.likes_count > 0" class="count-num">{{ comment.likes_count }}</span>
                        </button>
                        <button class="icon-btn dislike-btn" :class="{ active: comment.is_disliked }"
                            @click="emit('dislike', comment)">
                            <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor"
                                stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <path
                                    d="M16.5 3c-1.74 0-3.41.81-4.5 2.09C10.91 3.81 9.24 3 7.5 3 4.42 3 2 5.42 2 8.5c0 3.78 3.4 6.86 8.55 11.54L12 21.35l1.45-1.32C18.6 15.36 22 12.28 22 8.5 22 5.42 19.58 3 16.5 3z">
                                </path>
                                <polyline points="12 5.5 11 10.5 13 13.5 12 19"></polyline>
                            </svg>
                        </button>
                    </div>
                </div>
            </div>
        </div>

        <div v-if="comment.replies?.length" v-show="showReplies" class="children-container">
            <div v-for="reply in comment.replies" :key="reply.id" class="child-wrapper">
                <div class="branch-curve"></div>

                <CommentItem :comment="reply" :article-author-id="articleAuthorId" @reply="(c) => emit('reply', c)"
                    @like="(c) => emit('like', c)" @dislike="(c) => emit('dislike', c)"
                    @delete="(id) => emit('delete', id)" />
            </div>
        </div>
    </div>
</template>

<style scoped>
/* ================= 🌳 整体布局 ================= */
.comment-node-wrapper {
    position: relative;
    margin-bottom: 20px;
    animation: fadeIn 0.5s ease;
}

@keyframes fadeIn {
    from {
        opacity: 0;
        transform: translateY(10px);
    }

    to {
        opacity: 1;
        transform: translateY(0);
    }
}

.comment-main-card {
    display: flex;
    gap: 15px;
    position: relative;
}

/* ================= 👤 左侧头像与树干 ================= */
.avatar-column {
    display: flex;
    flex-direction: column;
    align-items: center;
    width: 40px;
    flex-shrink: 0;
}

.user-avatar {
    width: 40px;
    height: 40px;
    border-radius: 50%;
    object-fit: cover;
    border: 2px solid var(--bg-surface);
    box-shadow: 0 2px 8px rgba(139, 90, 43, 0.15);
    z-index: 2;
    background: var(--bg-surface);
}

.thread-line-vertical {
    flex: 1;
    width: 2px;
    background: #eaddca;
    margin-top: 5px;
    min-height: 20px;
    border-radius: 2px;
    transition: background 0.3s;
}

:global(html.dark) .thread-line-vertical {
    background: rgba(255, 255, 255, 0.2);
}

/* ================= 📝 右侧内容卡片 (核心适配) ================= */
.content-column {
    flex: 1;
    background: rgba(255, 255, 255, 0.8);
    border: 1px solid rgba(210, 166, 121, 0.25);
    border-radius: 0 12px 12px 12px;
    padding: 15px;
    transition: all 0.3s ease;
    position: relative;
}

:global(html.dark) .content-column {
    background: var(--bg-elevated);
    /* 使用更亮的背景色 */
    border-color: rgba(201, 168, 106, 0.25);
    box-shadow:
        0 4px 15px rgba(0, 0, 0, 0.25),
        0 1px 0 rgba(255, 255, 255, 0.05) inset;
}

.content-column:hover {
    background: rgba(255, 255, 255, 0.95);
    box-shadow: 0 4px 20px rgba(139, 90, 43, 0.1);
    border-color: rgba(210, 166, 121, 0.4);
}

:global(html.dark) .content-column:hover {
    background: var(--bg-elevated);
    border-color: var(--accent-color);
    box-shadow:
        0 6px 20px rgba(0, 0, 0, 0.3),
        0 0 0 1px rgba(201, 168, 106, 0.15) inset;
}

.comment-header {
    display: flex;
    align-items: center;
    margin-bottom: 10px;
    font-size: 0.9rem;
}

.comment-author {
    font-weight: 700;
    color: #3c3c3c;
    /* 确保浅色模式下的深色文字 */
    font-family: 'Cormorant Garamond', 'Noto Serif SC', serif;
    font-size: 1.1em;
}

:global(html.dark) .comment-author {
    color: #f0f0f0;
    /* 深色模式下使用亮色 */
    font-weight: 600;
}

.comment-author.is-author {
    color: #b8860b;
    /* 金色 */
    position: relative;
}

:global(html.dark) .comment-author.is-author {
    color: #ffd700;
    /* 深色模式下更亮的金色 */
    text-shadow: 0 0 8px rgba(255, 215, 0, 0.3);
}

.author-badge {
    display: inline-flex;
    align-items: center;
    gap: 2px;
    margin-left: 8px;
    font-size: 0.7rem;
    color: #fff;
    background: linear-gradient(135deg, #d4af37, #b8860b);
    padding: 2px 8px;
    border-radius: 6px;
    font-weight: normal;
    box-shadow: 0 2px 5px rgba(212, 175, 55, 0.4);
}

:global(html.dark) .author-badge {
    background: linear-gradient(135deg, #ffd700, #d4af37);
    box-shadow: 0 2px 8px rgba(255, 215, 0, 0.4);
}

/* 🔥 修复文字颜色 - 增强深色模式对比度 */
.comment-text {
    font-size: 1.05rem;
    color: #3c3c3c;
    /* 确保浅色模式下是深色 */
    line-height: 1.7;
    font-family: 'Cormorant Garamond', 'Noto Serif SC', serif;
    white-space: pre-wrap;
    margin-bottom: 12px;
    letter-spacing: 0.01em;
}

:global(html.dark) .comment-text {
    color: #f5f5f5;
    /* 深色模式下使用非常亮的颜色 */
    font-weight: 400;
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.2);
}

.reply-target-tag {
    color: #8a9a5b;
    /* 橄榄绿 */
    font-weight: 600;
    margin-right: 6px;
    font-size: 0.95rem;
}

:global(html.dark) .reply-target-tag {
    color: #c9a86a;
    /* 深色模式下用金色 */
    font-weight: 500;
}

.author-liked-badge {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 11px;
    color: #ff4d4f;
    background: rgba(255, 77, 79, 0.1);
    padding: 4px 10px;
    border-radius: 12px;
    margin-top: 8px;
    border: 1px solid rgba(255, 77, 79, 0.2);
}

:global(html.dark) .author-liked-badge {
    background: rgba(255, 77, 79, 0.15);
    color: #ff7875;
    border-color: rgba(255, 77, 79, 0.3);
}

/* ================= 🖼️ 拍立得图片墙 ================= */
.comment-gallery {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    margin: 12px 0;
}

.polaroid-img {
    width: 80px;
    height: 80px;
    border: 4px solid #fff;
    box-shadow: 0 3px 8px rgba(0, 0, 0, 0.15);
    overflow: hidden;
    cursor: zoom-in;
    border-radius: 2px;
    transition: all 0.3s;
    background: #fff;
}

:global(html.dark) .polaroid-img {
    border: 4px solid #2e2e2e;
    box-shadow: 0 3px 8px rgba(0, 0, 0, 0.3);
    background: #2e2e2e;
}

.polaroid-img:hover {
    transform: rotate(-2deg) scale(1.08);
    z-index: 5;
    box-shadow: 0 8px 20px rgba(0, 0, 0, 0.2);
}

:global(html.dark) .polaroid-img:hover {
    box-shadow: 0 8px 20px rgba(201, 168, 106, 0.3);
    border-color: #c9a86a;
}

.polaroid-img img {
    width: 100%;
    height: 100%;
    object-fit: cover;
}

/* ================= 🦶 底部栏 ================= */
.comment-footer {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-top: 8px;
    padding-top: 10px;
    border-top: 1px solid rgba(0, 0, 0, 0.08);
}

:global(html.dark) .comment-footer {
    border-top-color: rgba(255, 255, 255, 0.12);
}

.info-left {
    display: flex;
    align-items: center;
    gap: 12px;
    font-size: 13px;
    color: #6e6e6e;
    /* 确保浅色模式下的灰色 */
}

:global(html.dark) .info-left {
    color: #cccccc;
    /* 深色模式下用浅灰色 */
}

.time,
.location {
    opacity: 0.9;
}

:global(html.dark) .time,
:global(html.dark) .location {
    opacity: 0.8;
}

.text-action-btn {
    background: none;
    border: none;
    padding: 2px 6px;
    color: #6e6e6e;
    /* 浅色模式灰色 */
    cursor: pointer;
    font-size: 13px;
    transition: all 0.2s;
    border-radius: 4px;
}

:global(html.dark) .text-action-btn {
    color: #b0b0b0;
    /* 深色模式浅灰色 */
}

.text-action-btn:hover {
    color: #8a9a5b;
    /* 橄榄绿 */
    background: rgba(138, 154, 91, 0.1);
}

:global(html.dark) .text-action-btn:hover {
    color: #c9a86a;
    /* 金色 */
    background: rgba(201, 168, 106, 0.15);
}

.text-action-btn.delete:hover {
    color: #ff4d4f;
    background: rgba(255, 77, 79, 0.1);
}

:global(html.dark) .text-action-btn.delete:hover {
    color: #ff7875;
    background: rgba(255, 77, 79, 0.15);
}

.toggle-btn {
    font-weight: 600;
}

.action-right {
    display: flex;
    gap: 15px;
}

.icon-btn {
    background: none;
    border: none;
    cursor: pointer;
    font-size: 14px;
    color: #6e6e6e;
    /* 浅色模式灰色 */
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 4px;
    border-radius: 6px;
    transition: all 0.2s;
}

:global(html.dark) .icon-btn {
    color: #b0b0b0;
    /* 深色模式浅灰色 */
}

.icon-btn:hover {
    color: #8a9a5b;
    background: rgba(138, 154, 91, 0.1);
}

:global(html.dark) .icon-btn:hover {
    color: #c9a86a;
    background: rgba(201, 168, 106, 0.15);
}

.icon-btn.active {
    color: #ff5f7e;
    animation: like-bounce 0.3s;
}

:global(html.dark) .icon-btn.active {
    color: #ff7c9c;
}

@keyframes like-bounce {
    0% {
        transform: scale(1);
    }

    50% {
        transform: scale(1.3);
    }

    100% {
        transform: scale(1);
    }
}

/* ================= 🌿 递归子评论与连接线 ================= */
.children-container {
    padding-left: 40px;
    margin-top: 12px;
}

.child-wrapper {
    position: relative;
}

.branch-curve {
    position: absolute;
    top: -20px;
    left: -22px;
    width: 22px;
    height: 40px;
    border-bottom: 2px solid #eaddca;
    border-left: 2px solid #eaddca;
    border-bottom-left-radius: 12px;
    z-index: 1;
    transition: border-color 0.3s;
}

:global(html.dark) .branch-curve {
    border-color: rgba(201, 168, 106, 0.4);
}

@media (max-width: 600px) {
    .children-container {
        padding-left: 20px;
    }

    .branch-curve {
        left: -12px;
        width: 12px;
    }

    .avatar-column,
    .user-avatar {
        width: 32px;
    }

    .user-avatar {
        height: 32px;
    }

    .comment-text {
        font-size: 0.95rem;
        line-height: 1.6;
    }
}
</style>