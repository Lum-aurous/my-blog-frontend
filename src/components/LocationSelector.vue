<script setup>
import { ref, watch } from 'vue'
import axios from 'axios'
import _ from 'lodash' // 需安装: npm install lodash

const props = defineProps(['modelValue'])
const emit = defineEmits(['update:modelValue', 'select-geo'])

const query = ref(props.modelValue || '')
const suggestions = ref([])
const showDropdown = ref(false)
const isLoading = ref(false)

// 防抖查询 Open-Meteo
const searchLocation = _.debounce(async (text) => {
    if (!text || text.length < 2) {
        suggestions.value = []
        return
    }
    isLoading.value = true
    try {
        const res = await axios.get(`https://geocoding-api.open-meteo.com/v1/search`, {
            params: { name: text, count: 5, language: 'zh', format: 'json' }
        })
        if (res.data.results) {
            suggestions.value = res.data.results.map(item => ({
                id: item.id,
                name: item.name,
                country: item.country,
                admin1: item.admin1 || '', // 省/州
                lat: item.latitude,
                lng: item.longitude
            }))
            showDropdown.value = true
        } else {
            suggestions.value = []
        }
    } catch (e) {
        console.error(e)
    } finally {
        isLoading.value = false
    }
}, 500)

watch(query, (val) => {
    emit('update:modelValue', val) // 保持 v-model 同步
    searchLocation(val)
})

const handleSelect = (item) => {
    query.value = item.name // 输入框仅显示城市名
    showDropdown.value = false
    // 🔥 发射精准坐标
    emit('select-geo', {
        location: item.name,
        lat: item.lat,
        lng: item.lng,
        country: item.country
    })
}

// 失去焦点延迟关闭，以便能点击下拉项
const handleBlur = () => {
    setTimeout(() => showDropdown.value = false, 200)
}

const handleFocus = () => {
    // 注意：在 script 中访问 ref 需要加 .value
    if (query.value.length > 1) {
        showDropdown.value = true
    }
}
</script>

<template>
    <div class="geo-selector-wrapper">
        <div class="input-inner">
            <span class="prefix-icon">📍</span>
            <input v-model="query" class="geo-input" placeholder="搜索地点 (如: Tokyo)..." @focus="handleFocus"
                @blur="handleBlur">
            <span v-if="isLoading" class="loading-spin">↻</span>
        </div>

        <div v-if="showDropdown && suggestions.length > 0" class="geo-dropdown animate__animated animate__fadeIn">
            <div v-for="item in suggestions" :key="item.id" class="geo-item" @click="handleSelect(item)">
                <div class="geo-main">{{ item.name }}</div>
                <div class="geo-sub">{{ item.admin1 ? item.admin1 + ', ' : '' }}{{ item.country }}</div>
            </div>
        </div>
    </div>
</template>

<style scoped>
.geo-selector-wrapper {
    position: relative;
    /* 🔥 核心修复：移除固定宽度，改为 100% 撑满父容器 */
    width: 100%;
}

.input-inner {
    display: flex;
    align-items: center;
    padding: 5px 0;
    transition: border-color 0.3s;
}

.input-inner:focus-within {
    border-color: #42b883;
}

.prefix-icon {
    margin-right: 8px;
    font-size: 1.2rem;
}

.geo-input {
    border: none;
    background: transparent;
    outline: none;
    font-size: 1rem;
    width: 100%;
    color: #333;
}

.loading-spin {
    font-size: 12px;
    color: #999;
    animation: spin 1s linear infinite;
}

/* 下拉框样式 - 适配你的地中海风格 */
.geo-dropdown {
    position: absolute;
    top: 100%;
    left: 0;
    /* 🔥 让下拉框宽度跟随输入框，或者稍微宽一点但受 max-width 限制 */
    width: 100%;
    min-width: 200px;
    /* 保证电脑端不至于太窄 */
    max-width: 80vw;
    /* 防止手机端撑爆屏幕 */
    /* 稍微宽一点以显示完整信息 */
    background: rgba(255, 255, 255, 0.95);
    backdrop-filter: blur(10px);
    border: 1px solid #e8dcc4;
    border-radius: 8px;
    box-shadow: 0 4px 20px rgba(139, 90, 43, 0.15);
    z-index: 1000;
    margin-top: 5px;
    overflow: hidden;
}

.geo-item {
    padding: 10px 15px;
    cursor: pointer;
    border-bottom: 1px solid rgba(210, 166, 121, 0.1);
    transition: background 0.2s;
    text-align: left;
}

.geo-item:last-child {
    border-bottom: none;
}

.geo-item:hover {
    background: #fdfbf7;
}

.geo-main {
    font-weight: 700;
    color: #5d4037;
    font-size: 0.95rem;
}

.geo-sub {
    font-size: 0.8rem;
    color: #bca38a;
    margin-top: 2px;
}

@keyframes spin {
    100% {
        transform: rotate(360deg);
    }
}
</style>