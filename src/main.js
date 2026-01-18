// src/main.js
import { createApp } from "vue";
import { createPinia } from "pinia";
import piniaPluginPersistedstate from "pinia-plugin-persistedstate";
import App from "./App.vue";
import router from "./router.js";
import scrollManager from "@/utils/scrollManager.js";
import AuthManager from "@/utils/auth.js";
import config from "@/config/index.js";
import { ErrorHandler } from "@/utils/error-handler.js";
import "./utils/debug.js";

// 🔥 引入重构后的样式文件
import "./style.css";

// ✅ MdEditor 插件
import { MdEditor, MdPreview, MdCatalog } from "md-editor-v3";
import "md-editor-v3/lib/style.css";

// --- 🔥 核心优化：在 App 挂载前立即应用主题 (防闪烁) ---
// 这里的逻辑必须保留，它确保了刷新页面瞬间背景色就是对的
const initTheme = () => {
  try {
    const rawData = localStorage.getItem("theme");
    // 如果没有存储过，默认不操作（由 CSS 变量决定默认浅色）
    if (!rawData) return;

    const themeState = JSON.parse(rawData);

    // 逻辑优化：直接判断 isDark 状态
    // 如果是自动模式，theme.js 保存时会自动计算好 isDark
    if (themeState.isDark) {
      document.documentElement.classList.add("dark");
      document.documentElement.setAttribute("data-theme", "dark");
    } else {
      document.documentElement.classList.remove("dark");
      document.documentElement.setAttribute("data-theme", "light");
    }
  } catch (e) {
    // 忽略解析错误
    console.warn("主题初始化异常，降级为默认主题");
  }
};

// 立即执行主题初始化
initTheme();

// 初始化错误处理器
ErrorHandler.init();

// ==================== 处理浏览器扩展错误 (保留原样) ====================
if (typeof window !== "undefined") {
  const originalErrorHandler = window.onerror;
  window.onerror = function (message, source, lineno, colno, error) {
    if (
      typeof message === "string" &&
      (message.includes("adblock360") ||
        message.includes("filtering.adblock360.com") ||
        message.includes("CORS policy") ||
        message.includes("contentScript") ||
        message.includes("defineProperty called on non-object") ||
        (message.includes("Failed to fetch") &&
          source &&
          source.includes("adblock")))
    ) {
      console.log("🔕 忽略扩展相关错误:", message);
      return true;
    }

    if (originalErrorHandler) {
      return originalErrorHandler(message, source, lineno, colno, error);
    }
    return false;
  };

  const originalRejectionHandler = window.onunhandledrejection;
  window.onunhandledrejection = function (event) {
    if (
      event.reason &&
      (event.reason.message?.includes("adblock360") ||
        event.reason.message?.includes("Failed to fetch") ||
        event.reason.message?.includes("contentScript"))
    ) {
      console.log("🔕 忽略Promise中的扩展相关错误");
      event.preventDefault();
      return;
    }

    if (originalRejectionHandler) {
      return originalRejectionHandler(event);
    }
  };
}

const app = createApp(App);
const pinia = createPinia();

pinia.use(piniaPluginPersistedstate);

app.use(pinia);
app.use(router);

// ✅ 全局注册 md-editor-v3 组件
app.component("MdEditor", MdEditor);
app.component("MdPreview", MdPreview);
app.component("MdCatalog", MdCatalog);

// 全局挂载配置
app.config.globalProperties.$config = config;

// 初始化环境配置
if (config.isDev) {
  console.group("🌍 环境配置");
  console.table(config);
  console.groupEnd();
}

// 初始化滚动管理器
scrollManager.init(router);

// 启动 token 监控
let tokenMonitor = null;
if (typeof window !== "undefined") {
  setTimeout(() => {
    tokenMonitor = AuthManager.startTokenMonitor((reason) => {
      if (reason === "expired") {
        console.log("Token 过期，需要重新登录");
      }
    });
  }, 3000);
}

// Vue 错误处理配置
app.config.errorHandler = (err, instance, info) => {
  console.error("Vue 错误详情:", {
    error: err,
    component: instance?.$options?.name || "Unknown",
    info: info,
    stack: err.stack,
  });

  const ignorableErrors = [
    "Cannot read properties of undefined",
    "path attribute d",
    "Failed to fetch",
    "adblock360",
    "CORS policy",
    "contentScript",
    "defineProperty called on non-object",
  ];

  if (
    err.message &&
    ignorableErrors.some((pattern) => err.message.includes(pattern))
  ) {
    console.warn("忽略已知错误:", err.message);
    return;
  }

  if (config.isDev && !err.message.includes("adblock")) {
    const errorMsg = err.message || "未知错误";
    if (typeof window !== "undefined" && window.alert) {
      setTimeout(() => {
        // 开发模式下稍微提示一下，避免错过重要 bug
        // alert(`应用程序错误: ${errorMsg}\n\n查看控制台获取详细信息。`);
      }, 100);
    }
  }
};

// 性能警告处理
app.config.warnHandler = (msg, vm, trace) => {
  // console.warn("Vue 警告:", { message: msg, trace });
  if (msg.includes("component is rendering non-reactive")) {
    return;
  }
};

// 挂载应用
try {
  app.mount("#app");
  console.log("✅ 应用挂载成功");
} catch (mountError) {
  console.error("❌ 应用挂载失败:", mountError);

  if (typeof window !== "undefined") {
    const appDiv = document.getElementById("app");
    if (appDiv) {
      appDiv.innerHTML = `
        <div style="padding: 20px; color: #666; text-align: center; font-family: sans-serif;">
          <h2>😕 应用启动失败</h2>
          <p>请尝试以下步骤:</p>
          <ol style="text-align: left; display: inline-block;">
            <li>刷新页面</li>
            <li>清除浏览器缓存</li>
            <li>禁用广告拦截扩展</li>
            <li>检查控制台错误</li>
          </ol>
          <br>
          <button onclick="window.location.reload()" style="margin-top: 20px; padding: 10px 20px; cursor: pointer;">
            刷新页面
          </button>
        </div>
      `;
    }
  }
}

// 应用卸载时清理
if (typeof window !== "undefined") {
  window.addEventListener("beforeunload", () => {
    if (tokenMonitor) {
      AuthManager.stopTokenMonitor(tokenMonitor);
    }
  });
}

// 开发环境热重载错误处理
if (import.meta.hot) {
  import.meta.hot.accept();
  import.meta.hot.dispose(() => {
    console.log("🔄 热重载中...");
  });
}
