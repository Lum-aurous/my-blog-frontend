// @/utils/api.js
import axios from "axios";
import { message } from "./message.js";

// 根据环境自动选择 API 地址
const getApiBaseUrl = () => {
  if (import.meta.env.DEV) {
    return "/api"; // 开发环境走代理
  } else {
    // 生产环境：直接使用当前域名的 /api 路径
    // 这样可以适配 IP 访问、域名访问等各种情况，避免 CORS
    return "/api";
  }
};

const api = axios.create({
  baseURL: getApiBaseUrl(),
  timeout: 60000, // 1分钟超时，上传大文件够用了
  withCredentials: true,
  headers: {
    "Content-Type": "application/json",
    Accept: "application/json",
  },
});

// ==========================================
// 🔥 请求拦截器：Token 注入 + 智能文件上传处理
// ==========================================
api.interceptors.request.use(
  (config) => {
    // 1. 自动注入 Token
    const token = localStorage.getItem("token");
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    // 2. 🔥🔥🔥 核心修复：自动处理文件上传 🔥🔥🔥
    // 如果 data 是 FormData 类型（说明是文件上传），
    // 必须删除 Content-Type，让浏览器自动生成带 boundary 的头！
    if (config.data instanceof FormData) {
      delete config.headers["Content-Type"];
    }

    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// ==========================================
// 响应拦截器
// ==========================================
api.interceptors.response.use(
  (response) => {
    // 这种写法兼容部分后端虽然 HTTP 200 但返回 success: false 的情况
    if (response.data && response.data.success === false) {
      const msg = response.data.message || "请求失败";

      // 如果消息里包含“尚未”或“未注册”，我们用 warning，否则用 error
      if (msg.includes("尚未") || msg.includes("未注册")) {
        message.warning(msg);
      } else {
        message.error(msg);
      }

      return Promise.reject(new Error(msg));
    }
    return response;
  },
  (error) => {
    if (error.response) {
      switch (error.response.status) {
        case 401:
          // 避免重复提示，可以加个防抖，这里简单处理
          if (!window.is401Shown) {
            message.error("登录已过期，请重新登录");
            window.is401Shown = true;
            // 3秒后重置标记
            setTimeout(() => (window.is401Shown = false), 3000);
          }

          localStorage.removeItem("token");
          localStorage.removeItem("user");
          // 建议使用 router.push 而不是 window.location，体验更好
          // 但在 api.js 里拿不到 router，window.location 是最稳妥的
          if (window.location.pathname !== "/login") {
            setTimeout(() => (window.location.href = "/login"), 1000);
          }
          break;
        case 403:
          message.error("权限不足或令牌失效");
          break;
        case 404:
          message.error("请求的资源不存在");
          break;
        case 413:
          message.error("上传的文件太大了！"); // 针对大文件上传的提示
          break;
        case 500:
          message.error("服务器开小差了，请稍后再试");
          break;
        default:
          message.error(
            error.response.data?.message || `请求错误 ${error.response.status}`
          );
      }
    } else if (error.code === "ECONNABORTED") {
      message.error("请求超时，请检查网络");
    } else {
      message.error("网络连接异常");
    }
    return Promise.reject(error);
  }
);

export { api };
