// client/src/utils/debug/connection-debug.js
/**
 * 终极前后端连通性调试工具
 */
export class ConnectionDebugger {
  constructor() {
    this.results = [];
    this.startTime = Date.now();
  }

  log(message, type = "info") {
    const timestamp = new Date().toLocaleTimeString();
    const prefix = {
      info: "ℹ️",
      success: "✅",
      error: "❌",
      warning: "⚠️",
    }[type];

    const msg = `[${timestamp}] ${prefix} ${message}`;
    console.log(msg);
    this.results.push({ time: timestamp, type, message });
    return msg;
  }

  async testBackendHealth() {
    try {
      const response = await fetch("http://localhost:3000/api/health", {
        method: "GET",
        headers: { Accept: "application/json" },
      });

      if (response.ok) {
        const data = await response.json();
        return this.log(
          `后端健康检查: ${data.status} (${response.status})`,
          "success"
        );
      } else {
        return this.log(
          `后端异常: ${response.status} ${response.statusText}`,
          "error"
        );
      }
    } catch (error) {
      return this.log(`无法连接到后端: ${error.message}`, "error");
    }
  }

  async testViteProxy() {
    try {
      // 通过Vite代理请求
      const response = await fetch("/api/health", {
        method: "GET",
        headers: { Accept: "application/json" },
      });

      if (response.ok) {
        return this.log("Vite代理正常: 成功转发请求到后端", "success");
      } else {
        return this.log(`Vite代理异常: ${response.status}`, "error");
      }
    } catch (error) {
      return this.log(`Vite代理失败: ${error.message}`, "error");
    }
  }

  async testCORS() {
    try {
      // 测试OPTIONS预检请求
      const response = await fetch("http://localhost:3000/api/contact", {
        method: "OPTIONS",
        headers: {
          Origin: "http://localhost:5173",
          "Access-Control-Request-Method": "POST",
          "Access-Control-Request-Headers": "Content-Type",
        },
      });

      const corsHeaders = {
        "Access-Control-Allow-Origin": response.headers.get(
          "Access-Control-Allow-Origin"
        ),
        "Access-Control-Allow-Methods": response.headers.get(
          "Access-Control-Allow-Methods"
        ),
        "Access-Control-Allow-Headers": response.headers.get(
          "Access-Control-Allow-Headers"
        ),
      };

      if (response.ok) {
        return this.log(
          `CORS配置正确: ${JSON.stringify(corsHeaders)}`,
          "success"
        );
      } else {
        return this.log(`CORS预检失败: ${response.status}`, "error");
      }
    } catch (error) {
      return this.log(`CORS测试异常: ${error.message}`, "error");
    }
  }

  async testContactAPI() {
    const testData = {
      name: "调试用户",
      email: "debug@test.com",
      subject: "连接调试测试",
      content:
        "这是一条调试消息，用于验证联系我功能的连通性。时间戳: " + Date.now(),
    };

    try {
      const response = await fetch("/api/contact", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(testData),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        return this.log(
          `联系接口正常: ${data.message} (ID: ${data.data?.messageId})`,
          "success"
        );
      } else {
        return this.log(
          `联系接口失败: ${data.message || response.status}`,
          "error"
        );
      }
    } catch (error) {
      return this.log(`联系接口异常: ${error.message}`, "error");
    }
  }

  async testEmailConfig() {
    try {
      // 可以通过后端特定接口测试邮件配置，或者检查环境变量
      const response = await fetch("/api/reset-password/send-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ account: "test@test.com" }),
      });

      const data = await response.json();

      if (response.ok || data.message) {
        return this.log("邮件服务配置存在", "success");
      }
    } catch (error) {
      return this.log("邮件服务测试失败（可能正常）", "warning");
    }
  }

  async runAllTests() {
    this.log("🔍 开始前后端连通性调试...", "info");
    this.log(`前端环境: ${import.meta.env.VITE_APP_ENV}`, "info");
    this.log(`API Target: ${import.meta.env.VITE_API_TARGET}`, "info");
    this.log(`当前域名: ${window.location.origin}`, "info");

    console.group("🧪 运行调试测试");

    await this.testBackendHealth();
    await this.testViteProxy();
    await this.testCORS();
    await this.testContactAPI();
    await this.testEmailConfig();

    console.groupEnd();

    const duration = Date.now() - this.startTime;
    this.log(`🎯 调试完成 (耗时: ${duration}ms)`, "info");

    // 生成报告
    const successCount = this.results.filter(
      (r) => r.type === "success"
    ).length;
    const errorCount = this.results.filter((r) => r.type === "error").length;

    console.log("\n📊 调试报告:");
    console.log("-".repeat(50));
    console.log(`✅ 成功: ${successCount} 个`);
    console.log(`❌ 失败: ${errorCount} 个`);
    console.log(
      `⚠️ 警告: ${this.results.filter((r) => r.type === "warning").length} 个`
    );
    console.log("-".repeat(50));

    return {
      success: errorCount === 0,
      results: this.results,
      summary: { successCount, errorCount, duration },
    };
  }

  static getConfigSummary() {
    return {
      environment: import.meta.env.VITE_APP_ENV,
      apiTarget: import.meta.env.VITE_API_TARGET,
      apiBaseUrl: import.meta.env.VITE_API_BASE_URL,
      debug: import.meta.env.VITE_DEBUG,
      currentOrigin: window.location.origin,
      userAgent: navigator.userAgent,
      timestamp: new Date().toISOString(),
    };
  }
}

// 导出单例
export const connectionDebugger = new ConnectionDebugger();
