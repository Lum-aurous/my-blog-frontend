// stores/wallpaper.js
import { defineStore } from "pinia";
import { ref, computed, watch } from "vue";
import { useUserStore } from "@/stores/user";
import logger from "@/utils/logger";

export const useWallpaperStore = defineStore("wallpaper", () => {
  // ==================== 状态定义 ====================
  const currentWallpaper = ref("");
  const wallpaperMode = ref("website");
  const wallpaperBlur = ref(0);
  const wallpaperMask = ref(true);
  const isLoading = ref(false);
  const userHasCustom = ref(false);
  const isInitialized = ref(false);
  let isFetchingUserWallpaper = false;

  // 缓存配置
  const wallpaperCache = ref({
    website: "",
    daily: "",
    random: [],
    userCustom: "",
  });

  const imageCache = new Map();

  // ==================== 🔥 修复点1：优化URL处理函数 ====================
  const normalizeUrl = (url) => {
    if (!url) return "";

    // 如果是相对路径（用户上传的图片）
    if (!url.startsWith("http") && !url.startsWith("/")) {
      return "/" + url;
    }

    // 🔥 关键修复：移除encodeURI，因为URL通常已经编码过了
    // 二次编码会导致Chrome拒绝加载
    return url;
  };

  // ==================== 计算属性 ====================
  const wallpaperStyle = computed(() => {
    // 🔥 修复点2：使用优化后的URL处理
    const url = normalizeUrl(currentWallpaper.value);

    // 🔥 修复点3：添加更多CSS属性确保正确渲染
    return {
      backgroundImage: url ? `url("${url}")` : "none",
      backgroundSize: "cover",
      backgroundPosition: "center center", // 明确居中
      backgroundRepeat: "no-repeat",
      backgroundAttachment: "fixed",
      filter: `blur(${wallpaperBlur.value}px)`,
      position: "fixed",
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      width: "100vw", // 🔥 新增：确保覆盖整个视口
      height: "100vh", // 🔥 新增
      zIndex: -1,
      transition: "filter 0.2s ease, opacity 0.3s ease-in-out",
      opacity: url ? 1 : 0,
      backgroundColor: wallpaperMask.value
        ? "rgba(0, 0, 0, 0.2)"
        : "transparent",
      backgroundBlendMode: wallpaperMask.value ? "overlay" : "normal",
      // 🔥 新增：强制硬件加速
      transform: "translateZ(0)",
      willChange: "opacity",
    };
  });

  // ==================== 私有方法 ====================

  // 🔥 修复点4：改进图片预加载逻辑（增加404检测）
  const preloadImage = (url) => {
    return new Promise((resolve) => {
      if (!url) {
        resolve(false);
        return;
      }

      const normalizedUrl = normalizeUrl(url);

      if (imageCache.has(normalizedUrl)) {
        resolve(true);
        return;
      }

      const img = new Image();

      // 🔥 关键修复：添加crossOrigin属性
      // Chrome需要明确声明才能加载跨域图片
      if (normalizedUrl.startsWith("http")) {
        img.crossOrigin = "anonymous";
      }

      const timeoutId = setTimeout(() => {
        logger.debug("图片预加载超时，继续执行");
        resolve(false);
      }, 3000); // 增加超时时间，Chrome加载可能较慢

      img.onload = () => {
        clearTimeout(timeoutId);
        imageCache.set(normalizedUrl, img);
        logger.success("✅ 图片预加载成功:", normalizedUrl);
        resolve(true);
      };

      img.onerror = (e) => {
        clearTimeout(timeoutId);
        logger.error("❌ 图片加载失败（可能404）:", normalizedUrl);

        // 🔥 新增：如果是用户自定义壁纸加载失败，清除缓存并切换到默认
        if (
          normalizedUrl.includes("1767286435270-343524652.jpg") ||
          !normalizedUrl.startsWith("http")
        ) {
          logger.warn("检测到无效的用户壁纸，自动清除并切换到默认");

          // 清除用户壁纸缓存
          const userStore = useUserStore();
          if (userStore.user?.id) {
            const cacheKey = `user_wallpaper_${userStore.user.id}`;
            sessionStorage.removeItem(cacheKey);
          }

          // 清除内存缓存
          wallpaperCache.value.userCustom = "";
          userHasCustom.value = false;

          // 如果当前是用户自定义模式，自动切换
          if (wallpaperMode.value === "userCustom") {
            wallpaperMode.value = "website";
            localStorage.setItem("preferredWallpaperMode", "website");
          }
        }

        resolve(false);
      };

      img.src = normalizedUrl;
    });
  };

  // 获取全局壁纸配置（带缓存）
  const fetchGlobalConfig = async () => {
    try {
      const cacheKey = "global_wallpaper_config";
      const cached = sessionStorage.getItem(cacheKey);

      if (cached) {
        try {
          const { data, timestamp } = JSON.parse(cached);
          const isDailyMode = wallpaperMode.value === "daily";
          const cacheDuration = isDailyMode ? 60 * 60 * 1000 : 10 * 60 * 1000;

          if (Date.now() - timestamp < cacheDuration) {
            logger.debug("使用缓存的全局配置");
            return data;
          }
        } catch (e) {
          logger.warn("解析缓存失败:", e);
        }
      }

      logger.debug("请求全局壁纸配置...");
      const res = await fetch("/api/wallpaper/global");
      if (!res.ok) throw new Error("Network response was not ok");

      const json = await res.json();
      const data = json.data;

      if (wallpaperMode.value === "daily") {
        logger.info(`📅 获取每日壁纸: ${data.dailyUrl ? "已设置" : "未设置"}`);
      }

      sessionStorage.setItem(
        cacheKey,
        JSON.stringify({
          data,
          timestamp: Date.now(),
        })
      );

      return data;
    } catch (err) {
      logger.error("获取全局配置失败:", err);
      return {
        mode: "website",
        websiteUrl:
          "https://images.unsplash.com/photo-1493246507139-91e8fad9978e",
        dailyUrl:
          "https://images.unsplash.com/photo-1493246507139-91e8fad9978e",
        randomUrls: [],
      };
    }
  };

  // 获取用户壁纸
  const fetchUserWallpaper = async () => {
    if (isFetchingUserWallpaper) {
      console.log("⏸️ 用户壁纸获取已在进行中，跳过");
      return null;
    }

    isFetchingUserWallpaper = true;
    const userStore = useUserStore();
    if (!userStore.isLoggedIn) {
      isFetchingUserWallpaper = false;
      return null;
    }

    try {
      const cacheKey = `user_wallpaper_${userStore.user.id}`;
      const cached = sessionStorage.getItem(cacheKey);

      if (cached) {
        try {
          const { url, timestamp } = JSON.parse(cached);
          if (Date.now() - timestamp < 15 * 60 * 1000) {
            logger.debug("使用缓存的用户壁纸");
            userHasCustom.value = true;
            wallpaperCache.value.userCustom = url;
            isFetchingUserWallpaper = false;
            return url;
          }
        } catch (e) {}
      }

      const res = await fetch(
        `/api/wallpaper/user?userId=${userStore.user.id}`
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const json = await res.json();
      const data = json.data;

      if (json.success && data && data.hasCustom && data.url) {
        const cleanUrl = normalizeUrl(data.url);

        sessionStorage.setItem(
          cacheKey,
          JSON.stringify({
            url: cleanUrl,
            timestamp: Date.now(),
          })
        );

        userHasCustom.value = true;
        wallpaperCache.value.userCustom = cleanUrl;
        isFetchingUserWallpaper = false;
        return cleanUrl;
      }
    } catch (err) {
      logger.error("获取用户壁纸失败:", err);
    } finally {
      isFetchingUserWallpaper = false;
    }

    userHasCustom.value = false;
    return null;
  };

  // 🔥 修复点5：优化立即切换壁纸逻辑
  const switchWallpaperImmediately = async (mode, config) => {
    let url = "";

    switch (mode) {
      case "userCustom":
        url = wallpaperCache.value.userCustom || "";
        break;
      case "daily":
        url =
          wallpaperCache.value.daily || config.dailyUrl || config.websiteUrl;
        break;
      case "random":
        const randomList = config.randomUrls || [];
        if (randomList.length > 0) {
          const randomIndex = Math.floor(Math.random() * randomList.length);
          url = randomList[randomIndex];
        } else {
          url = config.websiteUrl;
        }
        break;
      case "website":
      default:
        url = config.websiteUrl;
        break;
    }

    if (url) {
      // 🔥 修复点6：先预加载再更新
      logger.debug(`开始加载壁纸 [${mode}]:`, url);

      const loaded = await preloadImage(url);

      if (loaded) {
        currentWallpaper.value = url;
        logger.success(`✅ 壁纸切换成功 [${mode}]`);
      } else {
        // 即使预加载失败，也尝试设置（可能只是超时）
        currentWallpaper.value = url;
        logger.warn(`⚠️ 壁纸预加载超时，但仍尝试显示 [${mode}]`);
      }
    } else {
      logger.error(`❌ 无法获取壁纸URL [${mode}]`);
    }

    return url;
  };

  // ==================== 公共方法 ====================
  const forceRefreshGlobalConfig = async () => {
    try {
      sessionStorage.removeItem("global_wallpaper_config");
      logger.debug("强制刷新全局配置...");

      const res = await fetch("/api/wallpaper/global?t=" + Date.now());
      if (!res.ok) throw new Error("Network response was not ok");

      const json = await res.json();
      const data = json.data;

      sessionStorage.setItem(
        "global_wallpaper_config",
        JSON.stringify({
          data,
          timestamp: Date.now(),
        })
      );

      wallpaperCache.value.website = data.websiteUrl || "";
      wallpaperCache.value.daily = data.dailyUrl || "";
      wallpaperCache.value.random = data.randomUrls || [];

      return data;
    } catch (err) {
      logger.error("强制刷新全局配置失败:", err);
      return null;
    }
  };

  const initialize = async (forceRefresh = false) => {
    if (isInitialized.value && !forceRefresh) {
      logger.info("壁纸已初始化，跳过重复请求");
      return;
    }

    isLoading.value = true;
    logger.info("🎨 初始化壁纸系统" + (forceRefresh ? "（强制刷新）" : ""));

    try {
      let config;
      if (forceRefresh) {
        config = await forceRefreshGlobalConfig();
      } else {
        config = await fetchGlobalConfig();
      }

      const userCustomUrl = await fetchUserWallpaper();

      logger.debug("全局配置:", config);
      logger.debug("用户壁纸:", userCustomUrl);

      wallpaperCache.value.website = config.websiteUrl || "";
      wallpaperCache.value.daily = config.dailyUrl || "";
      wallpaperCache.value.random = config.randomUrls || [];

      if (userCustomUrl) {
        wallpaperCache.value.userCustom = userCustomUrl;
      }

      const savedMode = localStorage.getItem("preferredWallpaperMode");
      const effectiveMode = savedMode || config.mode || "website";

      logger.debug("壁纸模式:", effectiveMode);

      await switchWallpaperImmediately(effectiveMode, config);
      wallpaperMode.value = effectiveMode;

      if (!currentWallpaper.value) {
        logger.warn("壁纸未设置，使用默认");
        currentWallpaper.value =
          config.websiteUrl ||
          "https://images.unsplash.com/photo-1493246507139-91e8fad9978e";
      }

      logger.success("✅ 壁纸初始化完成:", currentWallpaper.value);
      isInitialized.value = true;
    } catch (error) {
      logger.error("❌ 壁纸初始化失败:", error);
      const defaultUrl =
        "https://images.unsplash.com/photo-1493246507139-91e8fad9978e";
      currentWallpaper.value = defaultUrl;
      logger.info("使用默认壁纸:", defaultUrl);
    } finally {
      isLoading.value = false;
    }
  };

  const changeWallpaper = async (mode, forceRefresh = false) => {
    if (mode === wallpaperMode.value && mode !== "random" && !forceRefresh) {
      return;
    }

    wallpaperMode.value = mode;
    localStorage.setItem("preferredWallpaperMode", mode);

    try {
      let config;
      if (forceRefresh) {
        config = await forceRefreshGlobalConfig();
      } else {
        config = await fetchGlobalConfig();
      }
      await switchWallpaperImmediately(mode, config);
      logger.debug("壁纸切换完成:", mode);
    } catch (error) {
      logger.error("壁纸切换失败:", error);
    }
  };

  const refreshWallpaper = async () => {
    logger.info("🔄 手动刷新壁纸");
    clearCache();
    await initialize(true);
    return currentWallpaper.value;
  };

  const uploadUserWallpaper = async (file) => {
    const userStore = useUserStore();

    if (!userStore.isLoggedIn) {
      throw new Error("请先登录才能上传自定义壁纸");
    }

    if (!file || !file.type.startsWith("image/")) {
      throw new Error("请选择有效的图片文件");
    }

    const formData = new FormData();
    formData.append("image", file);
    formData.append("userId", userStore.user.id);
    formData.append("username", userStore.user.username);

    const token = userStore.token || localStorage.getItem("token");

    try {
      const res = await fetch("/api/wallpaper/user", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: formData,
      });

      const json = await res.json();

      if (json.success) {
        const newUrl = normalizeUrl(json.data.url);

        const cacheKey = `user_wallpaper_${userStore.user.id}`;
        sessionStorage.setItem(
          cacheKey,
          JSON.stringify({
            url: newUrl,
            timestamp: Date.now(),
          })
        );

        wallpaperCache.value.userCustom = newUrl;
        userHasCustom.value = true;

        currentWallpaper.value = newUrl;
        wallpaperMode.value = "userCustom";
        localStorage.setItem("preferredWallpaperMode", "userCustom");

        logger.success("壁纸上传成功");
        return json;
      } else {
        throw new Error(json.message || "上传失败");
      }
    } catch (err) {
      logger.error("上传壁纸失败:", err);
      throw err;
    }
  };

  const resetInitialization = () => {
    isInitialized.value = false;
  };

  const clearCache = () => {
    wallpaperCache.value = {
      website: "",
      daily: "",
      random: [],
      userCustom: "",
    };
    imageCache.clear();

    const keys = [];
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i);
      if (
        key.startsWith("user_wallpaper_") ||
        key === "global_wallpaper_config"
      ) {
        keys.push(key);
      }
    }
    keys.forEach((key) => sessionStorage.removeItem(key));

    resetInitialization();
  };

  watch(
    () => useUserStore().isLoggedIn,
    (isLoggedIn) => {
      if (isLoggedIn) {
        fetchUserWallpaper().then((customUrl) => {
          if (customUrl && wallpaperMode.value === "userCustom") {
            currentWallpaper.value = customUrl;
          }
        });
      } else {
        userHasCustom.value = false;
        wallpaperCache.value.userCustom = "";

        if (wallpaperMode.value === "userCustom") {
          wallpaperMode.value = "website";
          localStorage.setItem("preferredWallpaperMode", "website");
          resetInitialization();
          initialize();
        }
      }
    },
    { immediate: false }
  );

  /**
   * 🩺 壁纸健康检查：验证所有壁纸URL是否有效
   * @returns {Promise<Object>} 检查结果
   */
  const healthCheck = async () => {
    const results = {
      website: { valid: false, url: "" },
      daily: { valid: false, url: "" },
      random: { valid: true, urls: [] },
      userCustom: { valid: false, url: "" },
    };

    logger.info("🩺 开始壁纸健康检查...");

    try {
      // 1. 检查全局配置
      const config = await fetchGlobalConfig();

      // 检查网站默认壁纸
      if (config.websiteUrl) {
        results.website.url = config.websiteUrl;
        results.website.valid = await preloadImage(config.websiteUrl);
      }

      // 检查每日壁纸
      if (config.dailyUrl) {
        results.daily.url = config.dailyUrl;
        results.daily.valid = await preloadImage(config.dailyUrl);
      }

      // 检查随机壁纸列表
      if (config.randomUrls && config.randomUrls.length > 0) {
        const validUrls = [];
        for (const url of config.randomUrls) {
          const valid = await preloadImage(url);
          if (valid) {
            validUrls.push(url);
          }
        }
        results.random.urls = validUrls;
        results.random.valid = validUrls.length > 0;
      }

      // 2. 检查用户自定义壁纸
      const userUrl = await fetchUserWallpaper();
      if (userUrl) {
        results.userCustom.url = userUrl;
        results.userCustom.valid = await preloadImage(userUrl);

        // 如果用户壁纸无效，自动清除
        if (!results.userCustom.valid) {
          logger.warn("⚠️ 用户壁纸无效，已自动清除");
          const userStore = useUserStore();
          if (userStore.user?.id) {
            sessionStorage.removeItem(`user_wallpaper_${userStore.user.id}`);
          }
          wallpaperCache.value.userCustom = "";
          userHasCustom.value = false;
        }
      }

      // 3. 输出检查报告
      console.log("📊 壁纸健康检查报告:");
      console.table({
        网站默认: results.website.valid ? "✅ 正常" : "❌ 失败",
        每日壁纸: results.daily.valid ? "✅ 正常" : "❌ 失败",
        随机壁纸: results.random.valid
          ? `✅ ${results.random.urls.length}个有效`
          : "❌ 无有效图片",
        用户自定义: results.userCustom.url
          ? results.userCustom.valid
            ? "✅ 正常"
            : "❌ 失败"
          : "⚪ 未设置",
      });

      // 4. 如果当前壁纸无效，自动切换
      if (
        !currentWallpaper.value ||
        (wallpaperMode.value === "userCustom" && !results.userCustom.valid)
      ) {
        logger.warn("🔄 当前壁纸无效，自动切换到默认");
        if (results.website.valid) {
          currentWallpaper.value = config.websiteUrl;
          wallpaperMode.value = "website";
          localStorage.setItem("preferredWallpaperMode", "website");
        }
      }

      logger.success("✅ 健康检查完成");
      return results;
    } catch (error) {
      logger.error("❌ 健康检查失败:", error);
      return results;
    }
  };

  return {
    currentWallpaper,
    wallpaperMode,
    wallpaperBlur,
    wallpaperMask,
    isLoading,
    userHasCustom,
    isInitialized,

    wallpaperStyle,

    healthCheck,
    forceRefreshGlobalConfig,
    refreshWallpaper,
    initialize,
    changeWallpaper,
    uploadUserWallpaper,
    clearCache,
    resetInitialization,
    fetchGlobalConfig,
    fetchUserWallpaper,
  };
});
