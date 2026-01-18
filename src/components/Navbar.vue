<script setup>
import { ref, onMounted, watch, computed, nextTick, onUnmounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useUserStore } from '@/stores/user.js'
import { message } from '@/utils/message.js'
import AuthManager from '@/utils/auth.js'
import { useSiteStore } from '@/stores/site'
import { useThemeStore } from '@/stores/theme'
import { navItems, loginIcon } from '@/config/navData.js'

const themeStore = useThemeStore()
const siteStore = useSiteStore()
const router = useRouter()
const route = useRoute()
const userStore = useUserStore()

// ==================== 1. 核心响应式状态 ====================
const showUserMenu = ref(false)
const activeDropdown = ref(null)
const navbarHeight = ref(80)
const prevScrollY = ref(0)
const scrollY = ref(0)
const isNavbarVisible = ref(true)
const isMouseOnNavbar = ref(false)

// ==================== 2. 智能交互计算逻辑 ====================
const shouldShowBackground = computed(() => isMouseOnNavbar.value || scrollY.value > 10)
const shouldShowNavbar = computed(() => {
  if (isMouseOnNavbar.value) return true
  return isNavbarVisible.value
})

// ==================== 3. 响应式用户数据绑定 ====================
const isLoggedIn = computed(() => userStore.isLoggedIn)
const isAdmin = computed(() => userStore.user?.role === 'admin')
const username = computed(() => userStore.user?.username || 'Guest')
const userAvatar = computed(() => userStore.user?.avatar || '')
const nickname = computed(() => userStore.user?.nickname || userStore.user?.username || '用户')
const avatarText = computed(() => nickname.value ? nickname.value.charAt(0).toUpperCase() : '?')
const handle = computed(() => userStore.user?.username ? '@' + userStore.user.username.toLowerCase().replace(/\s+/g, '') : '')

const handleAvatarError = (e) => {
  e.target.src = 'https://w.wallhaven.cc/full/9o/wallhaven-9oog5d.jpg'
}

// ==================== 4. 导航显隐交互函数 ====================
const handleMouseEnter = () => {
  isMouseOnNavbar.value = true
  isNavbarVisible.value = true
}
const handleMouseLeave = () => {
  isMouseOnNavbar.value = false
  activeDropdown.value = null
}
const onScroll = () => {
  if (isMouseOnNavbar.value) return
  requestAnimationFrame(() => {
    const currentScrollY = window.scrollY
    const scrollDelta = currentScrollY - prevScrollY.value
    scrollY.value = currentScrollY
    if (currentScrollY <= navbarHeight.value) {
      isNavbarVisible.value = true
    } else if (scrollDelta > 10 && currentScrollY > navbarHeight.value + 50) {
      isNavbarVisible.value = false
    } else if (scrollDelta < -10) {
      isNavbarVisible.value = true
    }
    prevScrollY.value = currentScrollY
  })
}

// ==================== 5. 账号切换与登录逻辑 ====================
const switchAccount = () => {
  showUserMenu.value = false
  sessionStorage.setItem('isSwitchingAccount', 'true')
  router.push('/login')
  message.info('请登录另一个账号')
}
const handleUserLogin = (event) => {
  const isSwitching = sessionStorage.getItem('isSwitchingAccount') === 'true'
  if (event.detail.user && event.detail.token) {
    userStore.login(event.detail.user, event.detail.token)
    if (isSwitching) {
      message.success(`已切换至账号: ${event.detail.user.nickname || event.detail.user.username}`)
      sessionStorage.removeItem('isSwitchingAccount')
    }
  }
}

// ==================== 6. 其他业务功能 ====================
const handleLogout = () => {
  if (confirm('确定要退出登录吗？')) {
    AuthManager.logout()
    userStore.logout()
    window.dispatchEvent(new CustomEvent('user-logout'))
    router.push('/login').then(() => window.location.reload())
  }
}

const isDark = ref(document.documentElement.classList.contains('dark'))
watch(() => themeStore.isDark, (newValue) => {
  isDark.value = newValue
})

const handleLocationClick = () => {
  if (!isLoggedIn.value) return message.warning('请先登录')
  userStore.location ? userStore.refreshLocation() : userStore.getLocation()
}

let closeTimer = null
const handleNavEnter = (name) => {
  if (closeTimer) clearTimeout(closeTimer);
  activeDropdown.value = name;
};
const handleNavLeave = () => {
  closeTimer = setTimeout(() => {
    activeDropdown.value = null;
    showUserMenu.value = false;
  }, 200);
};

const handleAvatarEnter = () => {
  if (closeTimer) clearTimeout(closeTimer);
  if (isLoggedIn.value) {
    showUserMenu.value = true;
  }
};

// ==================== [新增] 设置弹窗逻辑 ====================
const isSettingsOpen = ref(false)
const settings = ref({
  enableBarrage: true,
  barrageOpacity: 100,
  reduceMotion: false
})
const openSettingsModal = () => {
  showUserMenu.value = false
  activeDropdown.value = null
  isMobileMenuOpen.value = false
  isSettingsOpen.value = true
}
const closeSettingsModal = () => {
  isSettingsOpen.value = false
}
const handleThemeChange = (mode) => {
  themeStore.setMode(mode)
}
const goToPrivacy = () => {
  showUserMenu.value = false
  router.push({ path: '/account', query: { tab: 'privacy' } })
}

// --- 手机端侧边栏与菜单控制 ---
const isMobileMenuOpen = ref(false)
const toggleMobileMenu = () => {
  isMobileMenuOpen.value = !isMobileMenuOpen.value
}
const openMobileMenuName = ref('')
const toggleMobileSubMenu = (name) => {
  if (openMobileMenuName.value === name) {
    openMobileMenuName.value = ''
  } else {
    openMobileMenuName.value = name
  }
}

// --- 手机端底部导航数据 ---
const bottomNavList = computed(() => {
  const findIcon = (name) => {
    const item = navItems.find(i => i.name === name)
    return item ? { paths: item.paths, viewBox: item.viewBox } : null
  }
  return [
    { name: '博客', path: '/blog', icon: findIcon('博客') },
    { name: '游记', path: '/travel', icon: findIcon('游记') },

    // 🔥 修改开始：将原来的“百宝箱”替换为“联系我”
    // 注意：这里假设您的联系我页面路径是 /contact，请根据实际情况确认路径
    { name: '联系我', path: '/contact', icon: findIcon('联系我') },
    // 🔥 修改结束

    { name: '随笔', path: '/comments', icon: findIcon('随笔') },
    {
      name: '我的',
      path: isLoggedIn.value ? `/profile/${userStore.user?.username}` : '/login',
      isProfile: true
    }
  ]
})

// 🔥 新增：专门给手机侧边栏用的菜单列表（过滤掉 '联系我'）
const mobileSideNavItems = computed(() => {
  if (!navItems) return []
  return navItems.filter(item => item.name !== '联系我')
})

// ==================== 7. 监听与生命周期 ====================
watch(() => route.path, () => {
  isMobileMenuOpen.value = false
  openMobileMenuName.value = ''
  activeDropdown.value = null
  showUserMenu.value = false
  if (localStorage.getItem('token') && !userStore.user) userStore.checkLoginStatus()
})

onMounted(async () => {
  const authStatus = AuthManager.checkAuthStatus()
  if (authStatus.isLoggedIn) {
    if (!userStore.user) {
      userStore.setUser(authStatus.user);
    }
    try {
      await userStore.refreshUserInfo();
    } catch (err) {
      console.error('同步用户信息失败:', err);
    }
  }
  window.addEventListener('scroll', onScroll, { passive: true })
  window.addEventListener('user-login', handleUserLogin)
  window.addEventListener('click', () => showUserMenu.value = false)
  nextTick(() => {
    const el = document.querySelector('.navbar')
    if (el) navbarHeight.value = el.offsetHeight
  })
  if (!siteStore.isLoaded) {
    siteStore.fetchSiteInfo()
  }
})

onUnmounted(() => {
  window.removeEventListener('scroll', onScroll)
  window.removeEventListener('user-login', handleUserLogin)
})
</script>

<template>
  <nav class="navbar" :class="{
    'navbar-active': shouldShowBackground,
    'navbar-hidden': !shouldShowNavbar
  }" @mouseenter="handleMouseEnter()" @mouseleave="handleMouseLeave">
    <div class="nav-content pc-only">
      <router-link to="/" class="logo-wrapper">
        <img v-if="siteStore.siteInfo.site_logo" :src="siteStore.siteInfo.site_logo" class="site-logo-img" alt="Logo" />
        <span v-else class="logo-icon">💠</span>
        <div class="logo-text-group">
          <span class="site-title">{{ siteStore.siteInfo.site_title || '𝓥𝓮𝓻𝓲𝓽𝓪𝓼' }}</span>
          <span v-if="siteStore.siteInfo.site_slogan" class="site-slogan">
            {{ siteStore.siteInfo.site_slogan }}
          </span>
        </div>
      </router-link>

      <div class="menu">
        <div v-for="item in navItems" :key="item.name" class="nav-item-wrapper"
          @mouseenter="item.isDropdown ? handleNavEnter(item.name) : null" @mouseleave="handleNavLeave">
          <router-link :to="item.path" class="nav-item">
            <svg v-if="item.paths" :viewBox="item.viewBox" class="nav-icon" xmlns="http://www.w3.org/2000/svg">
              <path v-for="(path, idx) in item.paths" :key="idx" :d="path.d" :fill="path.fill" />
            </svg>
            <span>{{ item.name }}</span>
          </router-link>
          <transition name="fade-slide">
            <div v-if="item.isDropdown && item.children && activeDropdown === item.name" class="dropdown-menu"
              @mouseenter="handleDropdownEnter" @mouseleave="handleNavLeave">
              <router-link v-for="child in item.children" :key="child.name" :to="child.path" class="dropdown-item">
                <svg v-if="child.paths" :viewBox="child.viewBox" class="dropdown-icon"
                  xmlns="http://www.w3.org/2000/svg">
                  <path v-for="(path, idx) in child.paths" :key="idx" :d="path.d" :fill="path.fill" />
                </svg>
                <span>{{ child.name }}</span>
              </router-link>
            </div>
          </transition>
        </div>

        <div class="avatar-container" @mouseenter="handleAvatarEnter" @mouseleave="handleNavLeave"
          @click.stop="isLoggedIn ? (showUserMenu = !showUserMenu) : router.push('/login')">
          <div class="avatar-frame" :class="{ 'active': showUserMenu }">
            <img v-if="isLoggedIn && userAvatar" :src="userAvatar" class="avatar-img" alt="User Avatar"
              @error="handleAvatarError" />
            <span v-else-if="isLoggedIn" class="avatar-text">{{ avatarText }}</span>
            <svg v-else class="avatar-icon" :viewBox="loginIcon.viewBox" xmlns="http://www.w3.org/2000/svg">
              <g :transform="loginIcon.gTransform">
                <path v-for="(path, idx) in loginIcon.paths" :key="idx" :d="path.d" :fill="path.fill" />
              </g>
            </svg>
          </div>
          <transition name="fade-slide">
            <div v-if="showUserMenu" class="user-dropdown-horizontal" @mouseenter="handleAvatarEnter"
              @mouseleave="handleNavLeave" @click.stop>
              <div class="user-header-horizontal">
                <div class="user-avatar-big rainbow-ring">
                  <img v-if="userAvatar" :src="userAvatar" class="avatar-img-big" alt="Avatar" />
                  <span v-else class="avatar-text-big">{{ avatarText }}</span>
                </div>
                <div class="user-info-right">
                  <div class="user-name-big">{{ nickname || username }}</div>
                  <div class="user-handle-big">{{ handle }}</div>
                </div>
              </div>
              <div class="dropdown-items">
                <router-link :to="`/profile/${userStore.user?.username}`" class="dropdown-item"
                  @click="showUserMenu = false">
                  <svg viewBox="0 0 24 24" class="menu-icon">
                    <path
                      d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zm0 14.2c-2.5 0-4.71-1.28-6-3.22.03-1.99 4-3.08 6-3.08 1.99 0 5.97 1.09 6 3.08-1.29 1.94-3.5 3.22-6 3.22z"
                      fill="currentColor" />
                  </svg>
                  我的主页
                </router-link>
                <router-link to="/account" class="dropdown-item" @click="showUserMenu = false">
                  <svg viewBox="0 0 24 24" class="menu-icon">
                    <path
                      d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
                  </svg>
                  账号中心
                </router-link>
                <router-link v-if="isAdmin" to="/admin" class="dropdown-item" @click="showUserMenu = false">
                  <svg viewBox="0 0 1024 1024" class="menu-icon" xmlns="http://www.w3.org/2000/svg">
                    <path
                      d="M879.177 626.688l-37.303-8.265a112.494 112.494 0 0 0-11.703-26.99l19.822-34.158c7.022-11.702 11.703-30.646 0-41.179l-20.992-21.211c-5.851-5.779-12.873-8.12-20.992-8.12s-15.287 2.341-22.162 6.95l-30.428 21.21a187.173 187.173 0 0 0-26.843-11.848l-8.119-37.523c-2.34-14.116-15.14-29.403-30.281-29.403h-29.184c-16.457 0-25.746 15.287-29.11 29.403l-9.436 37.523c-9.29 3.584-20.041 7.168-28.014 11.849l-33.865-21.285a54.272 54.272 0 0 0-22.162-5.778 29.989 29.989 0 0 0-20.992 8.265l-20.992 19.968c-11.703 11.776-7.022 29.477 0 41.18l20.992 35.254-10.533 24.723-37.303 8.338c-13.97 2.267-29.184 15.287-29.184 30.574v29.257c0 16.603 15.14 25.892 29.111 29.403l37.303 9.436c2.267 8.265 5.851 15.286 9.289 23.552l-20.846 35.181c-7.168 11.776-11.703 30.574 0 41.18l22.163 23.479c5.851 5.778 12.873 8.118 20.992 8.118a38.766 38.766 0 0 0 22.162-6.948l33.865-21.285c9.435 4.535 18.725 9.436 28.014 11.85l9.435 37.595c3.438 13.97 12.727 29.403 29.111 29.403h29.11c16.458 0 28.015-15.433 30.282-29.403l8.046-38.912c9.435-3.438 17.408-6.949 26.843-10.533l32.622 21.285c5.851 4.535 13.97 6.948 22.235 6.948a29.842 29.842 0 0 0 20.992-8.118l21.065-21.212c11.557-11.703 6.949-29.403 0-41.106l-19.821-34.231c3.291-8.119 8.119-16.603 10.532-24.722l37.45-9.436c13.823-3.584 29.11-12.873 29.11-29.403v-29.257c-2.34-16.311-16.164-28.087-30.28-31.598zM675.035 743.205a70.73 70.73 0 0 1 0-141.24c38.4 0 69.852 31.818 69.852 70.73 0 38.766-31.452 70.51-69.852 70.51z"
                      fill="currentColor" />
                    <path
                      d="M367.69 799.817h-0.586l-46.153-0.731c-64.366 0-125.586-25.308-171.813-71.315A242.615 242.615 0 0 1 77.97 555.447c0-64.951 25.308-126.098 71.241-172.252a240.786 240.786 0 0 1 117.687-65.316c3.804-20.7 9.875-40.74 18.14-59.758 14.263-34.158 35.108-65.243 61.952-91.867a292.279 292.279 0 0 1 91.867-62.025 293.595 293.595 0 0 1 244.882 8.923 291.109 291.109 0 0 1 100.352 84.919 36.645 36.645 0 0 1-7.68 51.2 36.937 36.937 0 0 1-51.273-7.826 217.234 217.234 0 0 0-74.825-63.269 219.575 219.575 0 0 0-183.003-6.656 217.82 217.82 0 0 0-115.054 115.054 208.677 208.677 0 0 0-16.31 65.828 36.571 36.571 0 0 1-32.696 33.353 170.277 170.277 0 0 0-152.137 169.692 169.91 169.91 0 0 0 170.423 170.496l39.57 0.658a32.402 32.402 0 0 1 6.583-0.658l0.073 0.731v-0.731a35.401 35.401 0 0 1 39.497 31.232 37.45 37.45 0 0 1-23.113 38.692 36.425 36.425 0 0 1-16.457 3.95z"
                      fill="currentColor" />
                  </svg>
                  后台管理
                </router-link>
                <div class="dropdown-item" @click="switchAccount">
                  <svg viewBox="0 0 1024 1024" class="menu-icon switch-account-icon">
                    <path
                      d="M736.305 546.133c9.752-19.504 4.876-39.01-14.629-48.762-24.38-14.628-48.762-24.38-73.143-34.133 53.638-43.886 92.648-107.276 92.648-185.295C746.057 151.162 638.781 48.762 512 48.762s-234.057 102.4-234.057 234.057c0 73.143 34.133 141.41 92.647 180.42C204.8 521.751 82.895 677.79 82.895 867.961c0 19.505 14.629 39.01 39.01 39.01s39.01-14.63 39.01-39.01c0-195.048 160.914-351.086 351.085-351.086 63.39 0 121.905 14.629 175.543 48.762 19.505 4.876 39.01 0 48.762-19.505zM355.962 282.82c0-87.771 68.267-160.914 156.038-160.914s156.038 73.143 156.038 156.038S599.771 438.857 512 438.857 355.962 365.714 355.962 282.82z"
                      fill="currentColor" />
                    <path
                      d="M560.762 707.048h390.095c14.629 0 29.257-9.753 34.133-24.381 4.877-14.629 4.877-29.257-9.752-39.01l-97.524-97.524c-14.628-14.628-39.01-14.628-53.638 0s-14.628 39.01 0 53.638l34.134 34.134H560.762c-19.505 0-39.01 14.628-39.01 39.01s19.505 34.133 39.01 34.133z m390.095 73.142H560.762c-14.629 0-29.257 9.753-34.133 24.381s-4.877 29.258 9.752 39.01l97.524 97.524c4.876 4.876 14.628 9.752 24.38 9.752s19.505-4.876 24.382-9.752c14.628-14.629 14.628-39.01 0-53.638l-34.134-34.134h302.324c19.505 0 39.01-14.628 39.01-39.01s-19.505-34.133-39.01-34.133z"
                      fill="currentColor" />
                  </svg>
                  切换账号<span class="arrow">></span>
                </div>
                <div class="dropdown-item sign-out" @click="handleLogout(); showUserMenu = false">
                  <svg viewBox="0 0 24 24" class="menu-icon">
                    <path
                      d="M17 7l-1.41 1.41L18.17 11H8v2h10.17l-2.58 2.58L17 17l5-5-5-5zM4 5h8V3H4c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h8v-2H4V5z" />
                  </svg>
                  退出登录
                </div>
              </div>
              <hr class="divider" />
              <div class="dropdown-items">
                <div class="dropdown-item" @click="goToPrivacy">
                  <svg viewBox="0 0 24 24" class="menu-icon">
                    <path
                      d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.05-.24-.24-.41-.47-.41h-3.84c-.24 0-1.24-.17-.47-.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.07-.47 0-.59.22L2.74 10.45c-.12.21-.07.48.12.61l2.03 1.58c-.05.3-.09.63-.09.94 0 .31.04.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.47.41h3.84c.24 0 .43-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.07.47 0 .59-.22l1.92-3.32c.12-.22.07-.48-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z" />
                  </svg>
                  你的数据
                </div>
                <div class="dropdown-item" @click="handleLocationClick">
                  <svg viewBox="0 0 24 24" class="menu-icon">
                    <path
                      d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" />
                  </svg>
                  <div class="location-content">
                    <div class="location-label">位置</div>
                    <div class="location-value">
                      <template v-if="!isLoggedIn">请先登录</template>
                      <template v-else-if="userStore.isLoadingLocation">
                        <span class="loading-dots">正在获取位置</span>
                      </template>
                      <template v-else-if="userStore.location">{{ userStore.location.text }}</template>
                      <template v-else>点击获取位置</template>
                    </div>
                  </div>
                  <span class="arrow">↻</span>
                </div>
                <div class="dropdown-item settings-entry" @click="openSettingsModal">
                  <svg viewBox="0 0 24 24" class="menu-icon">
                    <path
                      d="M19.43 12.98c.04-.32.07-.64.07-.98 0-.34-.03-.66-.07-.98l2.11-1.65c.19-.15.24-.42.12-.64l-2-3.46c-.12-.22-.39-.3-.61-.22l-2.49 1c-.52-.4-1.06-.73-1.69-.98l-.38-2.65C14.46 2.18 14.25 2 14 2h-4c-.25 0-.46.18-.49.42l-.38 2.65-.63.25-1.17.59-1.69.98l-2.49-1c-.23-.09-.49 0-.61.22l-2 3.46c-.13.22-.07.49.12.64l2.11 1.65c-.04.32-.07.65-.07.98 0 .33.03.66.07.98l-2.11 1.65c-.19.15-.24.42-.12.64l2 3.46c.12.22.39.3.61.22l2.49-1c.52.4 1.06.73 1.69.98l.38 2.65c.03.24.24.42.49.42h4c.25 0 .46-.18.49-.42l.38-2.65c.63-.25 1.17-.59 1.69-.98l2.49 1c.23.09.49 0 .61-.22l2-3.46c.12-.22.07-.49-.12-.64l-2.11-1.65zM12 15.5c-1.93 0-3.5-1.57-3.5-3.5s1.57-3.5 3.5-3.5 3.5 1.57 3.5 3.5-1.57 3.5-3.5 3.5z"
                      fill="currentColor" />
                  </svg>
                  设置与偏好<span class="setting-badge">主题</span>
                </div>
              </div>
            </div>
          </transition>
        </div>
      </div>
    </div>

    <div class="mobile-header mobile-only">
      <div class="mobile-logo">
        <router-link to="/" class="logo-wrapper">
          <img v-if="siteStore.siteInfo.site_logo" :src="siteStore.siteInfo.site_logo" class="site-logo-img mobile-img"
            alt="Logo" />
          <span v-else class="logo-icon mobile-icon-fix">💠</span>
          <div class="logo-text-group">
            <span class="site-title mobile-title">{{ siteStore.siteInfo.site_title || '𝓥𝓮𝓻𝓲𝓽𝓪𝓼' }}</span>
            <span v-if="siteStore.siteInfo.site_slogan" class="site-slogan mobile-slogan">
              {{ siteStore.siteInfo.site_slogan }}
            </span>
          </div>
        </router-link>
      </div>
      <div class="mobile-menu-btn" @click="toggleMobileMenu">
        <svg class="icon" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" width="32"
          height="32">
          <path
            d="M193.422222 506.311111c85.333333 0 153.6-62.577778 167.822222-142.222222H995.555556v-56.888889H361.244444c-14.222222-79.644444-82.488889-142.222222-167.822222-142.222222-93.866667 0-170.666667 76.8-170.666666 170.666666s76.8 170.666667 170.666666 170.666667z m0-284.444444c62.577778 0 113.777778 51.2 113.777778 113.777777s-51.2 113.777778-113.777778 113.777778-113.777778-51.2-113.777778-113.777778 51.2-113.777778 113.777778-113.777777zM1001.244444 713.955556h-108.088888c-14.222222-79.644444-82.488889-142.222222-167.822223-142.222223-85.333333 0-153.6 62.577778-167.822222 142.222223H28.444444v56.888888h531.911112c14.222222 79.644444 82.488889 142.222222 167.822222 142.222223s153.6-62.577778 167.822222-142.222223h108.088889v-56.888888z m-275.911111 142.222222c-62.577778 0-113.777778-51.2-113.777777-113.777778s51.2-113.777778 113.777777-113.777778 113.777778 51.2 113.777778 113.777778-51.2 113.777778-113.777778 113.777778z"
            :fill="isDark ? '#e0e0e0' : '#545E68'"></path>
        </svg>
      </div>
    </div>
  </nav>

  <div class="mobile-overlay" :class="{ 'open': isMobileMenuOpen }" @click="isMobileMenuOpen = false"></div>
  <div class="mobile-sidebar" :class="{ 'open': isMobileMenuOpen }">
    <div class="mobile-header-art" @click="isLoggedIn ? router.push('/account') : router.push('/login')">
      <div class="art-avatar-container">
        <img v-if="isLoggedIn && userAvatar" :src="userAvatar" class="art-avatar-img" />
        <div v-else class="art-avatar-placeholder">
          {{ avatarText ? avatarText.charAt(0).toUpperCase() : 'G' }}
        </div>
      </div>
      <div class="art-user-info">
        <h2 class="art-title">{{ isLoggedIn ? (nickname || username) : '旅人，请登录' }}</h2>
        <p class="art-subtitle">{{ isLoggedIn ? (handle || '欢迎回来') : '山河皆过客，唯君入星河。' }}</p>
      </div>
    </div>
    <div class="mobile-nav-list">
      <div class="mobile-nav-item-wrapper">
        <router-link :to="isLoggedIn ? '/account' : '/login'" class="mobile-link" active-class="mobile-link-active"
          @click="isMobileMenuOpen = false">
          <div class="link-content">
            <svg class="mobile-icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path
                d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zm0 14.2c-2.5 0-4.71-1.28-6-3.22.03-1.99 4-3.08 6-3.08 1.99 0 5.97 1.09 6 3.08-1.29 1.94-3.5 3.22-6 3.22z"
                fill="currentColor" />
            </svg>
            <span class="link-text">账号中心</span>
          </div>
        </router-link>
      </div>

      <div v-for="item in mobileSideNavItems" :key="item.name" class="mobile-nav-item-wrapper">
        <router-link v-if="!item.children" :to="item.path" class="mobile-link" active-class="mobile-link-active"
          @click="isMobileMenuOpen = false">
          <div class="link-content">
            <svg v-if="item.paths" :viewBox="item.viewBox" class="mobile-icon" xmlns="http://www.w3.org/2000/svg">
              <path v-for="(path, idx) in item.paths" :key="idx" :d="path.d" :fill="path.fill" />
            </svg>
            <span class="link-text">{{ item.name }}</span>
          </div>
        </router-link>

        <div v-else class="mobile-dropdown-group">
          <div class="mobile-link dropdown-title" :class="{ 'is-open': openMobileMenuName === item.name }"
            @click="toggleMobileSubMenu(item.name)">
            <div class="link-content">
              <svg v-if="item.paths" :viewBox="item.viewBox" class="mobile-icon" xmlns="http://www.w3.org/2000/svg">
                <path v-for="(path, idx) in item.paths" :key="idx" :d="path.d" :fill="path.fill" />
              </svg>
              <span class="link-text">{{ item.name }}</span>
            </div>
            <svg class="dropdown-arrow" viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg" width="16"
              height="16">
              <path
                d="M831.872 340.864 512 652.672 192.128 340.864a30.592 30.592 0 0 0-42.752 0 29.12 29.12 0 0 0 0 41.6L489.664 714.24a32 32 0 0 0 44.672 0l340.288-331.712a29.12 29.12 0 0 0 0-41.728 30.592 30.592 0 0 0-42.752 0z"
                fill="currentColor" />
            </svg>
          </div>
          <transition name="slide-down">
            <div v-if="openMobileMenuName === item.name" class="mobile-sub-list">
              <router-link v-for="child in item.children" :key="child.name" :to="child.path" class="mobile-sub-link"
                active-class="mobile-sub-active" @click="isMobileMenuOpen = false">
                <svg v-if="child.paths" :viewBox="child.viewBox" class="mobile-sub-icon"
                  xmlns="http://www.w3.org/2000/svg">
                  <path v-for="(path, idx) in child.paths" :key="idx" :d="path.d" :fill="path.fill" />
                </svg>
                {{ child.name }}
              </router-link>
            </div>
          </transition>
        </div>
      </div>

      <div class="mobile-nav-item-wrapper">
        <div class="mobile-link settings-entry-mobile" @click="openSettingsModal">
          <div class="link-content">
            <svg class="mobile-icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path
                d="M19.43 12.98c.04-.32.07-.64.07-.98 0-.34-.03-.66-.07-.98l2.11-1.65c.19-.15.24-.42.12-.64l-2-3.46c-.12-.22-.39-.3-.61-.22l-2.49 1c-.52-.4-1.06-.73-1.69-.98l-.38-2.65C14.46 2.18 14.25 2 14 2h-4c-.25 0-.46.18-.49.42l-.38 2.65-.63.25-1.17.59-1.69.98l-2.49-1c-.23-.09-.49 0-.61.22l-2 3.46c-.13.22-.07.49.12.64l2.11 1.65c-.04.32-.07.65-.07.98 0 .33.03.66.07.98l-2.11 1.65c-.19.15-.24.42-.12.64l2 3.46c.12.22.39.3.61.22l2.49-1c.52.4 1.06.73 1.69.98l.38 2.65c.03.24.24.42.49.42h4c.25 0 .46-.18.49-.42l.38-2.65c.63-.25 1.17-.59 1.69-.98l2.49 1c.23.09.49 0 .61-.22l2-3.46c.12-.22.07-.49-.12-.64l-2.11-1.65zM12 15.5c-1.93 0-3.5-1.57-3.5-3.5s1.57-3.5 3.5-3.5 3.5 1.57 3.5 3.5-1.57 3.5-3.5 3.5z"
                fill="currentColor" />
            </svg>
            <span class="link-text">设置与偏好</span>
          </div>
          <span class="mobile-badge">主题</span>
        </div>
      </div>
      <div v-if="isLoggedIn" class="mobile-nav-divider"></div>
      <div v-if="isLoggedIn" class="mobile-nav-item-wrapper">
        <div class="mobile-link mobile-sign-out" @click="handleLogout(); isMobileMenuOpen = false">
          <div class="link-content">
            <svg class="mobile-icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path
                d="M17 7l-1.41 1.41L18.17 11H8v2h10.17l-2.58 2.58L17 17l5-5-5-5zM4 5h8V3H4c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h8v-2H4V5z"
                fill="currentColor" />
            </svg>
            <span class="link-text">退出登录</span>
          </div>
        </div>
      </div>
    </div>
  </div>

  <div class="mobile-bottom-bar mobile-only">
    <router-link v-for="item in bottomNavList" :key="item.name" :to="item.path" class="bottom-nav-item"
      active-class="bottom-nav-active">
      <div v-if="item.isProfile && isLoggedIn && userAvatar" class="bottom-user-avatar">
        <img :src="userAvatar" alt="Avatar" />
      </div>
      <svg v-else-if="item.icon || item.isProfile" class="bottom-icon" xmlns="http://www.w3.org/2000/svg"
        :viewBox="item.icon ? item.icon.viewBox : '0 0 24 24'">
        <template v-if="item.icon">
          <path v-for="(path, idx) in item.icon.paths" :key="idx" :d="path.d" :fill="path.fill" />
        </template>
        <path v-else
          d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"
          fill="currentColor" />
      </svg>
      <span class="bottom-text">{{ item.name === '我的主页' ? '我的' : item.name }}</span>
    </router-link>
  </div>

  <Teleport to="body">
    <Transition name="modal-fade">
      <div v-if="isSettingsOpen" class="settings-overlay" @click.self="closeSettingsModal">
        <div class="settings-modal art-card">
          <div class="modal-header">
            <h3>全局偏好</h3>
            <button class="close-btn" @click="closeSettingsModal">✕</button>
          </div>
          <div class="modal-body">
            <div class="setting-group">
              <div class="group-title">外观模式</div>
              <div class="theme-selector">
                <div class="theme-option" :class="{ active: themeStore.mode === 'light' }"
                  @click="handleThemeChange('light')">
                  <div class="theme-icon">🌞</div>
                  <span>浅色</span>
                  <div v-if="themeStore.mode === 'light'" class="badge">默认</div>
                </div>

                <div class="theme-option" :class="{ active: themeStore.mode === 'dark' }"
                  @click="handleThemeChange('dark')">
                  <div class="theme-icon">🌙</div>
                  <span>深色</span>
                </div>

                <div class="theme-option" :class="{ active: themeStore.mode === 'auto' }"
                  @click="handleThemeChange('auto')" style="opacity: 0.5; cursor: not-allowed;" title="暂不支持自动切换">
                  <div class="theme-icon">🤖</div>
                  <span>自动</span>
                </div>
              </div>
            </div>
          </div>
          <div class="modal-footer">
            <div class="version-info">Veritas v2.0</div>
            <button class="save-btn" @click="closeSettingsModal">完成</button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
/* ==================== 1. 导航栏主体 (PC) ==================== */
.navbar {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 80px;
  z-index: 2000;
  background: transparent;
  border-bottom: 1px solid transparent;
  transform: translateY(0);
  transition: transform 0.4s cubic-bezier(0.165, 0.84, 0.44, 1), background 0.3s ease, backdrop-filter 0.3s ease, border-bottom 0.3s ease;
}

.navbar::before {
  content: '';
  position: absolute;
  bottom: -20px;
  left: 0;
  width: 100%;
  height: 20px;
}

.navbar-active {
  background: rgba(255, 255, 255, 0.2);
  backdrop-filter: blur(15px) saturate(180%);
  -webkit-backdrop-filter: blur(15px) saturate(180%);
  border-bottom: 1px solid rgba(214, 163, 84, 0.15);
  box-shadow: 0 4px 30px rgba(0, 0, 0, 0.05);
}

:global(html.dark) .navbar-active {
  background: rgba(20, 20, 30, 0.4) !important;
  border-bottom: 1px solid rgba(255, 255, 255, 0.05) !important;
  backdrop-filter: blur(20px) saturate(180%) !important;
  box-shadow: 0 4px 30px rgba(0, 0, 0, 0.5) !important;
}

.navbar-hidden {
  transform: translateY(-100%);
}

.nav-content {
  max-width: 1200px;
  margin: 0 auto;
  padding: 10px 30px;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

/* ==================== 2. Logo 与标题 ==================== */
.logo-wrapper {
  display: flex;
  align-items: center;
  text-decoration: none;
  gap: 12px;
  height: 100%;
}

.site-logo-img {
  height: 42px;
  width: auto;
  object-fit: contain;
  filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.1));
  transition: transform 0.3s ease;
}

.site-logo-img:hover {
  transform: scale(1.05);
}

.logo-icon {
  font-size: 2rem;
  line-height: 1;
  filter: drop-shadow(0 0 5px rgba(255, 255, 255, 0.5));
}

.logo-text-group {
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: flex-start;
  line-height: 1.2;
}

.site-title {
  font-size: 1.5rem;
  font-weight: 700;
  font-family: 'Georgia', serif;
  letter-spacing: 1px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 50%, #f093fb 100%);
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
  /* 修复：移除重的发光阴影，改用轻微阴影 */
  text-shadow: 0 1px 2px rgba(102, 126, 234, 0.1);
  -webkit-font-smoothing: antialiased;
}

:global(html.dark) .site-title {
  background: linear-gradient(135deg, #60a5fa 0%, #a78bfa 50%, #f472b6 100%);
  filter: brightness(1.2);
  text-shadow: none;
}

.site-slogan {
  font-size: 0.75rem;
  color: rgba(255, 255, 255, 0.7);
  font-weight: 400;
  letter-spacing: 0.5px;
  margin-top: 2px;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  -webkit-font-smoothing: antialiased;
}

.navbar-active .site-slogan {
  color: #64748b;
}

:global(html.dark) .site-slogan {
  color: rgba(226, 232, 240, 0.8);
  text-shadow: none;
}

:global(html.dark) .navbar-active .site-slogan {
  color: #94a3b8;
}

/* ==================== 3. 导航菜单项 (PC) ==================== */
.menu {
  display: flex;
  align-items: center;
  gap: 35px;
}

.nav-item-wrapper {
  position: relative;
  height: 100%;
  display: flex;
  align-items: center;
}

.nav-item-wrapper::after {
  content: '';
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  height: 20px;
  background: transparent;
  z-index: 10;
}

.nav-item {
  /* 修复：提高不透明度，去除 text-shadow 模糊 */
  color: rgba(255, 255, 255, 0.95);
  text-decoration: none;
  cursor: pointer;
  padding: 8px 4px;
  margin: 0 5px;
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 1rem;
  font-weight: 500;
  position: relative;
  transition: color 0.3s ease;
  /* 修复：字体抗锯齿 + 硬阴影 */
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
}

.nav-item::after {
  content: '';
  position: absolute;
  bottom: -2px;
  left: 0;
  width: 0;
  height: 2px;
  background: #48cbb6;
  transition: width 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94);
}

.nav-item:hover,
.nav-item.router-link-active,
.nav-item.router-link-exact-active {
  color: #48cbb6;
}

.nav-item:hover::after,
.nav-item.router-link-active::after,
.nav-item.router-link-exact-active::after {
  width: 100%;
  background: #48cbb6;
}

.nav-item:hover .nav-icon {
  transform: translateY(-2px);
}

.navbar-active .nav-item {
  color: #1e293b;
  text-shadow: none;
}

/* 深色模式适配 */
:global(html.dark) .navbar-active .nav-item {
  color: #e2e8f0;
  text-shadow: none;
}

:global(html.dark) .nav-item {
  /* 融合补丁：强制纯白，移除模糊阴影 */
  color: #ffffff !important;
  text-shadow: none !important;
  font-weight: 600 !important;
}

:global(html.dark) .nav-item.router-link-active {
  color: #51d5c0 !important;
}

:global(html.dark) .nav-item.router-link-active::after {
  background: #51d5c0;
}

.nav-icon {
  width: 18px;
  height: 18px;
  transition: transform 0.3s ease;
}

/* ==================== 4. 下拉菜单容器 ==================== */
.dropdown-menu,
.user-dropdown-horizontal {
  position: absolute;
  top: 100%;
  margin-top: 12px;
  padding: 6px 0 !important;
  border-radius: 20px;
  min-width: 140px;
  display: flex;
  flex-direction: column;
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(24px) saturate(180%);
  border: 1px solid rgba(0, 0, 0, 0.08);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.25);
  z-index: 3000;
  /* 修复：移除 will-change 防止字体位图化模糊 */
  overflow: visible;
  -webkit-font-smoothing: antialiased;
}

.dropdown-menu {
  left: 50%;
  transform: translateX(-50%);
}

.user-dropdown-horizontal {
  width: 260px;
  right: 0;
  left: auto;
  left: 50% !important;
  right: auto !important;
  transform: translateX(-50%) !important;
}

.dropdown-menu::before,
.user-dropdown-horizontal::before {
  content: '';
  position: absolute;
  top: -6px;
  left: 50%;
  transform: translateX(-50%);
  width: 0;
  height: 0;
  border-left: 6px solid transparent;
  border-right: 6px solid transparent;
  border-bottom: 6px solid rgba(255, 255, 255, 0.95);
  z-index: 3001;
}

:global(html.dark) .dropdown-menu,
:global(html.dark) .user-dropdown-horizontal {
  background: #1c1c2e !important;
  border: 1px solid rgba(255, 255, 255, 0.1) !important;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.6) !important;
}

:global(html.dark) .dropdown-menu::before,
:global(html.dark) .user-dropdown-horizontal::before {
  border-bottom-color: #1c1c2e !important;
}

/* ==================== 5. 下拉菜单项 ==================== */
.dropdown-item {
  display: flex !important;
  align-items: center;
  justify-content: center !important;
  padding: 10px 20px !important;
  color: #333 !important;
  font-size: 0.9rem !important;
  font-weight: 500;
  text-decoration: none !important;
  position: relative;
  border-radius: 8px;
  margin: 0 6px;
  transition: all 0.2s !important;
  -webkit-font-smoothing: antialiased;
}

.user-dropdown-horizontal .dropdown-item {
  justify-content: flex-start !important;
}

.dropdown-item:hover {
  background: rgba(66, 184, 131, 0.1) !important;
  color: #42b883 !important;
  padding-left: 25px !important;
}

.dropdown-menu .dropdown-item:hover {
  padding-left: 10px !important;
  background: rgba(66, 184, 131, 0.1) !important;
}

.dropdown-icon,
.menu-icon {
  width: 18px;
  height: 18px;
  margin-right: 10px;
  flex-shrink: 0;
  opacity: 0.8;
  transition: transform 0.2s ease;
  fill: currentColor;
}

.dropdown-item:hover .dropdown-icon,
.dropdown-item:hover .menu-icon {
  transform: scale(1.1);
  opacity: 1;
  filter: drop-shadow(0 0 1px currentColor);
  /* 减轻光晕 */
}

.divider {
  margin: 8px 0;
  height: 1px;
  background: rgba(0, 0, 0, 0.08);
}

:global(html.dark) .dropdown-item {
  color: #f2f2f2 !important;
  font-weight: 600 !important;
}

:global(html.dark) .dropdown-item:hover {
  background: rgba(255, 255, 255, 0.1) !important;
  color: #48cbb6 !important;
  transform: translateX(3px);
}

:global(html.dark) .dropdown-item:hover .dropdown-icon,
:global(html.dark) .dropdown-item:hover .menu-icon {
  filter: none !important;
}

:global(html.dark) .divider {
  background: rgba(255, 255, 255, 0.25) !important;
  height: 2px;
}

.sign-out {
  color: #d93025 !important;
}

.dropdown-item.sign-out:hover {
  background: rgba(239, 68, 68, 0.1) !important;
  color: #ef4444 !important;
}

:global(html.dark) .sign-out {
  color: #f28b82 !important;
}

/* ==================== 6. 头像与用户面板 ==================== */
.avatar-container {
  position: relative;
  cursor: pointer;
  display: flex;
  align-items: center;
}

.avatar-container::after {
  content: '';
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  height: 20px;
  background: transparent;
  z-index: 10;
}

.avatar-frame {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  border: 2px solid rgba(255, 255, 255, 0.8);
  background: rgba(255, 255, 255, 0.9);
  backdrop-filter: blur(5px);
  overflow: hidden;
  display: flex;
  justify-content: center;
  align-items: center;
  transition: all 0.3s ease;
  box-shadow: 0 4px 10px rgba(0, 0, 0, 0.1);
  padding: 4px;
}

.navbar-active .avatar-frame {
  border-color: rgba(0, 0, 0, 0.1);
}

:global(html.dark) .navbar-active .avatar-frame {
  border-color: rgba(255, 255, 255, 0.2);
  background: rgba(255, 255, 255, 0.1);
}

.avatar-frame:hover {
  transform: scale(1.1);
  box-shadow: 0 6px 15px rgba(59, 130, 246, 0.3);
  border-color: #3b82f6;
}

.avatar-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: 50%;
  display: block;
}

.avatar-text {
  font-size: 1.2rem;
  font-weight: 600;
  color: #1296db;
  user-select: none;
  text-transform: uppercase;
}

.user-header-horizontal {
  display: flex !important;
  align-items: center;
  padding: 18px !important;
  gap: 15px;
  border-bottom: 1px solid rgba(0, 0, 0, 0.06);
}

:global(html.dark) .user-header-horizontal {
  border-bottom: 1px solid rgba(255, 255, 255, 0.2);
}

.user-avatar-big.rainbow-ring {
  width: 50px !important;
  height: 50px !important;
  margin: 0 !important;
  flex-shrink: 0;
  border-radius: 50% !important;
  overflow: hidden;
}

:global(html.dark) .user-avatar-big.rainbow-ring {
  background: linear-gradient(#212121, #212121) padding-box,
    conic-gradient(#ea4335, #fbbc05, #34a853, #4285f4, #ea4335) border-box;
}

.avatar-img-big {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.avatar-text-big {
  font-size: 2.5rem;
  font-weight: 700;
  color: #202124;
  user-select: none;
}

:global(html.dark) .avatar-text-big {
  color: #fff;
}

.user-info-right {
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.user-name-big {
  font-size: 1rem;
  font-weight: 600;
  color: #1a1a1a;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

:global(html.dark) .user-name-big {
  color: #ffffff !important;
  font-weight: 700 !important;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
}

.user-handle-big {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 150px;
}

:global(html.dark) .user-handle-big {
  color: #d0d0d0 !important;
  font-weight: 500 !important;
}

.switch-account-icon {
  width: 22px !important;
  height: 22px !important;
  margin-right: 14px !important;
}

/* ==================== 7. 移动端 (Header & Sidebar) ==================== */
.mobile-only {
  display: none !important;
}

@media (max-width: 768px) {
  .pc-only {
    display: none !important;
  }

  .mobile-only {
    display: flex !important;
  }

  .navbar {
    height: 60px;
  }

  .mobile-header {
    width: 100%;
    height: 60px;
    padding: 0 20px;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .mobile-img {
    height: 32px;
  }

  .mobile-title {
    font-size: 1.2rem;
  }

  .mobile-slogan {
    font-size: 0.65rem;
    max-width: 150px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
}

.mobile-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  background: rgba(0, 0, 0, 0.3);
  backdrop-filter: blur(3px);
  z-index: 2900;
  opacity: 0;
  visibility: hidden;
  transition: all 0.4s ease;
}

.mobile-overlay.open {
  opacity: 1;
  visibility: visible;
}

.mobile-sidebar {
  position: fixed;
  top: 0;
  left: 0;
  width: 300px;
  height: 100vh;
  background: #ffffff;
  z-index: 3000;
  transform: translateX(-100%);
  transition: transform 0.4s cubic-bezier(0.23, 1, 0.32, 1);
  box-shadow: 10px 0 30px rgba(0, 0, 0, 0.05);
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  scrollbar-width: none;
}

:global(html.dark) .mobile-sidebar {
  background: #101014 !important;
}

.mobile-sidebar.open {
  transform: translateX(0);
}

.mobile-header-art {
  background: linear-gradient(135deg, #a8edea 0%, #fed6e3 100%);
  padding: 60px 20px 40px;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  cursor: pointer;
  border-bottom-left-radius: 30px;
  border-bottom-right-radius: 30px;
  box-shadow: 0 10px 30px -10px rgba(254, 214, 227, 0.5);
  margin-bottom: 20px;
}

:global(html.dark) .mobile-header-art {
  background: linear-gradient(135deg, #1f4037 0%, #99f2c8 100%);
  box-shadow: none;
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
}

.mobile-header-art:active {
  transform: scale(0.98);
  filter: brightness(0.95);
  transition: transform 0.1s;
}

.art-avatar-img,
.art-avatar-placeholder {
  width: 90px;
  height: 90px;
  border-radius: 50%;
  box-shadow: 0 8px 20px rgba(0, 0, 0, 0.15);
}

.art-avatar-img {
  border: 4px solid rgba(255, 255, 255, 0.9);
  object-fit: cover;
}

.art-avatar-placeholder {
  background: #ffffff;
  color: #555;
  font-size: 40px;
  font-weight: 300;
  display: flex;
  align-items: center;
  justify-content: center;
}

:global(html.dark) .art-avatar-placeholder {
  background: #333;
  color: #eee;
}

.art-title {
  font-size: 1.4rem;
  font-weight: 700;
  margin: 0 0 8px 0;
  color: #333;
}

.art-subtitle {
  font-size: 0.95rem;
  color: #666;
  margin: 0;
}

:global(html.dark) .art-title {
  color: #fff;
}

:global(html.dark) .art-subtitle {
  color: #bbb;
}

.mobile-nav-list {
  flex: 1;
  padding: 10px 15px 100px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.mobile-link {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  text-decoration: none;
  border-radius: 12px;
  transition: all 0.2s ease;
  color: #555;
  font-weight: 500;
  cursor: pointer;
}

:global(html.dark) .mobile-link {
  color: #ffffff !important;
  border-bottom: 1px solid rgba(255, 255, 255, 0.05) !important;
}

.mobile-link:active {
  transform: scale(0.95);
  background: rgba(0, 0, 0, 0.05);
  transition: transform 0.1s cubic-bezier(0.4, 0, 0.2, 1);
}

:global(html.dark) .mobile-link:active {
  background: rgba(255, 255, 255, 0.05);
}

.mobile-link-active,
.dropdown-title.is-open {
  background: linear-gradient(to right, #e0f7fa, #e8f5e9);
  color: #00bcd4;
  font-weight: 600;
}

:global(html.dark) .mobile-link-active,
:global(html.dark) .dropdown-title.is-open {
  background: rgba(0, 188, 212, 0.15);
  color: #4dd0e1;
}

.mobile-link-active .mobile-icon path,
.dropdown-title.is-open .mobile-icon path {
  fill: #00bcd4;
}

:global(html.dark) .mobile-link-active .mobile-icon path,
:global(html.dark) .dropdown-title.is-open .mobile-icon path {
  fill: #4dd0e1;
}

.mobile-icon {
  width: 22px;
  height: 22px;
  margin-right: 14px;
  opacity: 0.8;
}

.dropdown-arrow {
  color: #999;
  transition: transform 0.3s ease;
}

.dropdown-title.is-open .dropdown-arrow {
  transform: rotate(180deg);
  color: #00bcd4;
}

.mobile-sub-list {
  padding-left: 52px;
  padding-top: 5px;
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.mobile-sub-link {
  padding: 10px 12px;
  text-decoration: none;
  color: #666;
  font-size: 0.95rem;
  border-radius: 10px;
  transition: all 0.2s;
  display: flex;
  align-items: center;
}

:global(html.dark) .mobile-sub-link {
  color: #cbd5e1;
}

.mobile-sub-link:active {
  transform: scale(0.96);
  background: rgba(0, 0, 0, 0.04);
}

.mobile-sub-active {
  color: #00bcd4;
  font-weight: 600;
  background: rgba(0, 188, 212, 0.08);
}

.mobile-sub-active .mobile-sub-icon path {
  fill: #00bcd4;
}

.mobile-sub-icon {
  width: 18px;
  height: 18px;
  margin-right: 10px;
  opacity: 0.7;
}

.mobile-nav-divider {
  height: 1px;
  background: rgba(0, 0, 0, 0.06);
  margin: auto 16px;
}

:global(html.dark) .mobile-nav-divider {
  background: rgba(255, 255, 255, 0.1);
}

.mobile-sign-out {
  color: #ff4d4f !important;
  background: rgba(255, 77, 79, 0.05);
}

.mobile-sign-out .mobile-icon path {
  fill: #ff4d4f;
}

.mobile-sign-out:active {
  background: rgba(255, 77, 79, 0.15) !important;
}

:global(html.dark) .mobile-sign-out {
  color: #ff7875 !important;
  background: rgba(255, 77, 79, 0.1);
}

:global(html.dark) .mobile-sign-out .mobile-icon path {
  fill: #ff7875;
}

/* ==================== 8. 移动端底栏 ==================== */
.mobile-bottom-bar {
  position: fixed;
  bottom: 0;
  left: 0;
  width: 100%;
  height: 75px;
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border-top: 1px solid rgba(0, 0, 0, 0.05);
  display: flex;
  justify-content: space-around;
  align-items: center;
  z-index: 2000;
  padding-bottom: env(safe-area-inset-bottom);
  padding-left: 10px;
  padding-right: 10px;
  box-sizing: border-box;
  box-shadow: 0 -5px 20px rgba(0, 0, 0, 0.02);
}

:global(html.dark) .mobile-bottom-bar {
  background: rgba(28, 28, 46, 0.95) !important;
  border-top: 1px solid rgba(255, 255, 255, 0.05) !important;
}

.bottom-nav-item {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  text-decoration: none;
  height: 54px;
  border-radius: 16px;
  transition: all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);
  margin: 0 4px;
  position: relative;
  color: #999;
}

:global(html.dark) .bottom-nav-item {
  color: #a0a0a0 !important;
}

.bottom-nav-item:active {
  transform: scale(0.9);
}

.bottom-icon {
  width: 24px;
  height: 24px;
  margin-bottom: 3px;
  transition: transform 0.3s ease;
}

.bottom-text {
  font-size: 10px;
  font-weight: 500;
  transform: scale(0.95);
  transition: color 0.3s;
}

.bottom-nav-active {
  background: linear-gradient(to right, #e0f7fa, #e8f5e9);
  transform: translateY(-2px);
  box-shadow: 0 4px 10px rgba(0, 188, 212, 0.15);
}

.bottom-nav-active .bottom-text {
  color: #00bcd4;
  font-weight: 700;
}

.bottom-nav-active .bottom-icon {
  transform: scale(1.1);
}

:global(html.dark) .bottom-nav-active {
  background: rgba(0, 188, 212, 0.15);
}

:global(html.dark) .bottom-nav-active .bottom-text {
  color: #48cbb6 !important;
}

.bottom-user-avatar {
  width: 26px;
  height: 26px;
  border-radius: 50%;
  overflow: hidden;
  border: 2px solid #fff;
  box-shadow: 0 2px 5px rgba(0, 0, 0, 0.1);
  margin-bottom: 2px;
  transition: border-color 0.3s;
}

.bottom-user-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.bottom-nav-active .bottom-user-avatar {
  border-color: #00bcd4;
}

:global(html.dark) .bottom-user-avatar {
  border-color: #333;
}

/* ==================== 9. 设置弹窗 ==================== */
.settings-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  background: rgba(0, 0, 0, 0.4);
  backdrop-filter: blur(8px);
  z-index: 9999;
  display: flex;
  justify-content: center;
  align-items: center;
}

.settings-modal {
  width: 420px;
  max-width: 90%;
  background: rgba(255, 255, 255, 0.85);
  backdrop-filter: blur(20px) saturate(180%);
  border: 1px solid rgba(255, 255, 255, 0.6);
  border-radius: 24px;
  box-shadow: 0 20px 50px rgba(0, 0, 0, 0.15);
  overflow: hidden;
  display: flex;
  flex-direction: column;
  animation: modal-pop 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
}

:global(html.dark) .settings-modal {
  background: linear-gradient(135deg, rgba(30, 30, 35, 0.95) 0%, rgba(25, 25, 30, 0.92) 100%);
  border: 1px solid rgba(255, 255, 255, 0.15);
  box-shadow: 0 25px 60px rgba(0, 0, 0, 0.7);
}

.modal-header {
  padding: 20px 24px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 1px solid rgba(0, 0, 0, 0.05);
}

:global(html.dark) .modal-header {
  border-bottom-color: rgba(255, 255, 255, 0.05);
}

.modal-header h3 {
  margin: 0;
  font-size: 1.2rem;
  font-weight: 700;
  color: #333;
}

:global(html.dark) .modal-header h3 {
  color: #e2e8f0;
}

.close-btn {
  background: none;
  border: none;
  font-size: 1.2rem;
  color: #999;
  cursor: pointer;
  transition: color 0.2s;
}

.close-btn:hover {
  color: #333;
}

.modal-body {
  padding: 24px;
  max-height: 60vh;
  overflow-y: auto;
}

.theme-selector {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 12px;
  margin-bottom: 10px;
}

.theme-option {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 12px;
  background: rgba(0, 0, 0, 0.03);
  border: 2px solid transparent;
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.2s ease;
  position: relative;
  overflow: hidden;
}

:global(html.dark) .theme-option {
  background: rgba(255, 255, 255, 0.05);
}

.theme-option.active {
  background: rgba(66, 184, 131, 0.1);
  border-color: #42b883;
  color: #42b883;
}

.theme-option:hover {
  transform: translateY(-3px);
  background: rgba(72, 203, 182, 0.08);
  box-shadow: 0 8px 20px rgba(72, 203, 182, 0.15);
}

.theme-icon {
  font-size: 24px;
  margin-bottom: 6px;
}

.badge {
  position: absolute;
  top: 0;
  right: 0;
  background: #42b883;
  color: white;
  font-size: 0.6rem;
  padding: 2px 6px;
  border-bottom-left-radius: 8px;
  font-weight: 700;
}

.setting-hint {
  font-size: 0.8rem;
  color: #888;
  margin-top: 5px;
  text-align: center;
}

.modal-footer {
  padding: 16px 24px;
  background: rgba(0, 0, 0, 0.02);
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-top: 1px solid rgba(0, 0, 0, 0.05);
}

.version-info {
  font-size: 0.8rem;
  color: #bbb;
}

.save-btn {
  background: linear-gradient(135deg, #48cbb6 0%, #2ba895 100%);
  color: white;
  border: none;
  padding: 8px 24px;
  border-radius: 20px;
  font-weight: 600;
  cursor: pointer;
  transition: transform 0.2s, box-shadow 0.2s;
}

.save-btn:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(72, 203, 182, 0.3);
}

/* ==================== 10. 辅助功能与动画 ==================== */
.settings-entry,
.settings-entry-mobile {
  position: relative;
}

.settings-entry .link-content,
.settings-entry-mobile .link-content {
  display: flex;
  align-items: center;
}

.setting-badge,
.mobile-badge {
  font-size: 0.7rem;
  background: linear-gradient(135deg, #48cbb6, #42b883);
  color: white;
  padding: 2px 8px;
  border-radius: 10px;
  font-weight: 600;
  margin-left: auto;
  animation: badge-pulse 2s ease-in-out infinite;
}

.mobile-badge {
  padding: 2px 6px;
  border-radius: 8px;
}

.arrow {
  float: right;
  color: #5f6368;
  font-weight: bold;
  margin-top: 2px;
  animation: pulse 2s infinite;
}

:global(html.dark) .arrow {
  color: #9aa0a6;
}

.location-content {
  flex: 1;
  min-width: 0;
  margin-right: 10px;
}

.location-label {
  font-size: 0.9rem;
  font-weight: 500;
  margin-bottom: 2px;
  color: #202124;
}

:global(html.dark) .location-label {
  color: #e8eaed;
}

.location-value {
  font-size: 0.8rem;
  color: #5f6368;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 180px;
}

:global(html.dark) .location-value {
  color: #9aa0a6;
}

/* 核心修复：SVG 图标隐身问题 (补丁融合) */
:global(html.dark) .nav-icon,
:global(html.dark) .dropdown-icon,
:global(html.dark) .menu-icon,
:global(html.dark) .mobile-icon,
:global(html.dark) .switch-account-icon {
  filter: brightness(0) invert(1) !important;
  opacity: 1 !important;
}

:global(html.dark) .bottom-icon {
  filter: brightness(0) invert(1) !important;
  opacity: 0.7 !important;
}

:global(html.dark) .bottom-nav-active .bottom-icon {
  filter: none !important;
  fill: #48cbb6 !important;
  opacity: 1 !important;
}

/* 强制深色模式图标变亮 (备用逻辑) */
:global(html.dark) .dropdown-icon,
:global(html.dark) .menu-icon {
  opacity: 1 !important;
  filter: brightness(1.3);
}

@keyframes dots {

  0%,
  20% {
    content: '';
  }

  40% {
    content: '.';
  }

  60% {
    content: '..';
  }

  80%,
  100% {
    content: '...';
  }
}

@keyframes pulse {

  0%,
  100% {
    opacity: 0.6;
  }

  50% {
    opacity: 1;
  }
}

@keyframes badge-pulse {

  0%,
  100% {
    box-shadow: 0 0 5px rgba(72, 203, 182, 0.3);
  }

  50% {
    box-shadow: 0 0 15px rgba(72, 203, 182, 0.6);
  }
}

@keyframes modal-pop {
  0% {
    transform: scale(0.9);
    opacity: 0;
  }

  100% {
    transform: scale(1);
    opacity: 1;
  }
}

@keyframes rotate {
  from {
    transform: rotate(0deg);
  }

  to {
    transform: rotate(360deg);
  }
}

.loading-dots::after {
  content: '...';
  animation: dots 1.5s steps(4, end) infinite;
  display: inline-block;
  width: 1.5em;
  text-align: left;
}

/* Vue Transitions */
.fade-slide-enter-active,
.fade-slide-leave-active {
  transition: opacity 0.25s ease, transform 0.25s ease;
}

.fade-slide-enter-from,
.fade-slide-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(0px) !important;
}

.nav-item-wrapper .fade-slide-enter-from,
.nav-item-wrapper .fade-slide-leave-to {
  transform: translateX(-50%) translateY(15px) !important;
}

.avatar-container .fade-slide-enter-from,
.avatar-container .fade-slide-leave-to {
  transform: translateY(0px) !important;
}

.slide-down-enter-active,
.slide-down-leave-active {
  transition: all 0.3s ease-in-out;
  max-height: 500px;
  opacity: 1;
  overflow: hidden;
}

.slide-down-enter-from,
.slide-down-leave-to {
  max-height: 0;
  opacity: 0;
  padding-top: 0;
  padding-bottom: 0;
}

.modal-fade-enter-active,
.modal-fade-leave-active {
  transition: opacity 0.3s;
}

.modal-fade-enter-from,
.modal-fade-leave-to {
  opacity: 0;
}
</style>