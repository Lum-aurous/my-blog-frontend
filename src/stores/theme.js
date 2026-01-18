// src/stores/theme.js
import { defineStore } from "pinia";
import { ref, computed, watch } from "vue";

export const useThemeStore = defineStore(
  "theme",
  () => {
    // ===========================
    // 🎨 State (状态)
    // ===========================

    // 🔥 优化点 1: 默认模式设为 'light'
    const mode = ref("light");

    // 实际是否为深色模式
    const isDark = ref(false);

    // ===========================
    // 🖼️ Computed (色彩逻辑保持不变)
    // ===========================

    const accentColor = computed(() => {
      if (isDark.value) return "#66ccc9";
      return "#42b983";
    });

    const gradientColors = computed(() => {
      if (isDark.value) {
        return { start: "#1a1c2c", middle: "#2d3447", end: "#232526" };
      } else {
        return { start: "#fdfbf7", middle: "#f5f7fa", end: "#eef2f3" };
      }
    });

    // ===========================
    // 🛠️ Actions (动作)
    // ===========================

    const syncThemeToDOM = () => {
      const root = document.documentElement;
      if (isDark.value) {
        root.classList.add("dark");
        root.setAttribute("data-theme", "dark");
      } else {
        root.classList.remove("dark");
        root.setAttribute("data-theme", "light");
      }

      root.style.setProperty("--accent-color", accentColor.value);
      root.style.setProperty("--bg-gradient-start", gradientColors.value.start);
      root.style.setProperty(
        "--bg-gradient-middle",
        gradientColors.value.middle
      );
      root.style.setProperty("--bg-gradient-end", gradientColors.value.end);

      updateMetaThemeColor();
    };

    const updateMetaThemeColor = () => {
      const metaThemeColor = document.querySelector('meta[name="theme-color"]');
      if (metaThemeColor) {
        metaThemeColor.setAttribute(
          "content",
          isDark.value ? gradientColors.value.start : "#ffffff"
        );
      }
    };

    /**
     * 🔥 优化点 2: 简化检查逻辑
     * 只有当模式明确为 'dark' 时，isDark 才为 true
     */
    const checkAutoTheme = () => {
      // 现在的逻辑：除非手动选 dark，否则一律视为 light
      isDark.value = mode.value === "dark";
    };

    /**
     * 🔥 优化点 3: 切换模式逻辑
     * 极简切换：只在 light 和 dark 之间循环
     */
    const toggleTheme = () => {
      mode.value = mode.value === "dark" ? "light" : "dark";
    };

    const setMode = (newMode) => {
      mode.value = newMode;
    };

    // ===========================
    // 👀 Watchers (监听器)
    // ===========================

    // 监听 mode 变化
    watch(
      mode,
      () => {
        checkAutoTheme();
      },
      { immediate: true }
    );

    // 监听 isDark 变化同步 DOM
    watch(isDark, () => {
      syncThemeToDOM();
    });

    return {
      mode,
      isDark,
      accentColor,
      gradientColors,
      toggleTheme,
      setMode,
      checkAutoTheme,
      syncThemeToDOM,
    };
  },
  {
    persist: true, // 🔥 关键：记录用户的手动选择
  }
);
