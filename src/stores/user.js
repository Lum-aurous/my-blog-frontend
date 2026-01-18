// src/stores/user.js
import { ref, computed } from "vue";
import { defineStore } from "pinia";
// ❌ 删除了 import axios from "axios"; 因为我们下面用了更高级的 api
import { api } from "@/utils/api";

export const useUserStore = defineStore("user", () => {
  const user = ref(null);
  const token = ref(localStorage.getItem("token") || "");
  const location = ref(null);
  const isLoadingLocation = ref(false);
  const isRefreshing = ref(false);

  const isLoggedIn = computed(() => !!user.value && !!token.value);

  // 内存缓存配置
  const userProfileCache = {
    data: null,
    timestamp: 0,
    ttl: 2 * 60 * 1000, // 2分钟
  };

  // ==========================================
  // 1. 基础状态管理
  // ==========================================
  const setUser = (userData) => {
    user.value = userData;
    if (userData) {
      localStorage.setItem("user", JSON.stringify(userData));
      localStorage.setItem("username", userData.username);
    } else {
      localStorage.removeItem("user");
      localStorage.removeItem("username");
    }
  };

  const login = (userData, userToken) => {
    setUser(userData);
    token.value = userToken;
    localStorage.setItem("token", userToken);
    localStorage.setItem("isLoggedIn", "true");
    console.log("✅ 用户登录成功:", userData.username);

    // 登录成功后，自动尝试获取一次位置
    getLocation();
  };

  const logout = () => {
    user.value = null;
    token.value = "";
    location.value = null;

    localStorage.removeItem("token");
    localStorage.removeItem("user");
    localStorage.removeItem("username");
    localStorage.removeItem("isLoggedIn");
    localStorage.removeItem("userLocation");

    console.log("🚪 用户已登出");
  };

  const setToken = (newToken) => {
    token.value = newToken;
    localStorage.setItem("token", newToken);
  };

  const updateUser = (updatedData) => {
    if (user.value) {
      user.value = { ...user.value, ...updatedData };
      localStorage.setItem("user", JSON.stringify(user.value));
      if (updatedData.username) {
        localStorage.setItem("username", updatedData.username);
      }
      return true;
    }
    return false;
  };

  // ==========================================
  // 2. 用户信息刷新 (API)
  // ==========================================
  const refreshUserInfo = async () => {
    try {
      const currentUsername = user.value?.username;
      if (!currentUsername) return null;

      // 检查缓存
      const now = Date.now();
      if (
        userProfileCache.data &&
        userProfileCache.timestamp + userProfileCache.ttl > now
      ) {
        console.log("♻️ 使用缓存的用户信息");
        user.value = userProfileCache.data;
        return userProfileCache.data;
      }

      // 🔥 修正路径：/user/profile (单数)
      const res = await api.get("/user/profile", {
        params: { username: currentUsername },
      });

      if (res.data.success && res.data.data) {
        const userData = res.data.data;
        user.value = userData;
        // 更新缓存
        userProfileCache.data = userData;
        userProfileCache.timestamp = now;
        return userData;
      }
    } catch (error) {
      console.error("刷新用户信息失败:", error);
      // 如果 Token 失效，api.js 里的拦截器会处理，这里只需做逻辑清理
      if (error.response && error.response.status === 401) {
        logout();
      }
    }
    return null;
  };

  // 从 Token 恢复用户 (用于页面刷新)
  const restoreUserFromToken = async (tokenToRestore) => {
    try {
      const payload = JSON.parse(atob(tokenToRestore.split(".")[1]));
      const username = payload.username;

      if (username) {
        // 🔥 修正路径：/user/profile (单数)
        const res = await api.get("/user/profile", {
          params: { username: username },
        });

        if (res.data.success && res.data.data) {
          login(res.data.data, tokenToRestore);
          console.log("✅ 从 token 恢复用户成功");
        }
      }
    } catch (error) {
      console.warn("Token 恢复失败:", error);
      logout();
    }
  };

  const checkLoginStatus = async () => {
    const storedToken = localStorage.getItem("token");
    const storedUser = localStorage.getItem("user");
    const loggedIn = localStorage.getItem("isLoggedIn") === "true";

    if (loggedIn && storedToken && storedUser) {
      if (isRefreshing.value) return;
      isRefreshing.value = true;

      try {
        user.value = JSON.parse(storedUser);
        token.value = storedToken;

        // 恢复位置缓存
        const storedLocation = localStorage.getItem("userLocation");
        if (storedLocation) {
          location.value = JSON.parse(storedLocation);
        }

        // 后台静默刷新
        setTimeout(async () => {
          await refreshUserInfo();
          isRefreshing.value = false;
        }, 1000);
      } catch (e) {
        logout();
      }
    } else if (storedToken) {
      // 只有 Token 没有用户信息的情况
      await restoreUserFromToken(storedToken);
    }
  };

  // ==========================================
  // 3. 地理位置逻辑 (修正后)
  // ==========================================

  const formatLocationText = (data) => {
    if (!data) return "位置获取失败";
    if (data.country === "中国") {
      if (data.regionName === data.city) {
        return `${data.country} · ${data.regionName}`;
      }
      return `${data.regionName} · ${data.city}`;
    }
    return `${data.country} · ${data.city || data.regionName}`;
  };

  // 核心：请求后端
  const getLocationFromBackend = async () => {
    try {
      // 🔥🔥🔥 修正路径：/user/location (单数) 🔥🔥🔥
      const res = await api.get("/user/location");

      if (res.data.success) {
        const data = res.data.data;
        const newLocation = {
          country: data.country || "中国",
          region: data.regionName || data.region || "未知",
          city: data.city || "未知",
          text: formatLocationText(data),
          ip: data.ip,
        };
        location.value = newLocation;
        localStorage.setItem("userLocation", JSON.stringify(newLocation));
        return newLocation;
      }
    } catch (e) {
      console.error("后端获取位置失败:", e);
      throw e;
    }
  };

  async function getLocation() {
    if (isLoadingLocation.value) return;

    // 1. 优先使用缓存
    const cachedLocation = localStorage.getItem("userLocation");
    if (cachedLocation) {
      location.value = JSON.parse(cachedLocation);
      // 后台静默更新
      getLocationFromBackend().catch(() => {});
      return;
    }

    // 2. 无缓存，发起请求
    isLoadingLocation.value = true;
    try {
      await getLocationFromBackend();
    } catch (error) {
      location.value = {
        country: "中国",
        region: "未知",
        city: "未知",
        text: "位置获取失败",
      };
    } finally {
      isLoadingLocation.value = false;
    }
  }

  async function refreshLocation() {
    localStorage.removeItem("userLocation");
    location.value = null;
    return getLocation();
  }

  function updateLocation(newLocation) {
    location.value = newLocation;
    localStorage.setItem("userLocation", JSON.stringify(newLocation));
  }

  function clearLocation() {
    location.value = null;
    localStorage.removeItem("userLocation");
  }

  return {
    user,
    token,
    location,
    isLoadingLocation,
    isLoggedIn,
    setUser,
    login,
    logout,
    checkLoginStatus,
    updateUser,
    setToken,
    refreshUserInfo,
    getLocation,
    refreshLocation,
    updateLocation,
    clearLocation,
  };
});
