// client/src/utils/debug/quick-debug.js
/**
 * 一键调试脚本
 * 在浏览器控制台运行：await debugConnection()
 */
export async function debugConnection() {
  const debuggerInstance = new ConnectionDebugger();
  return await debuggerInstance.runAllTests();
}

// 添加到全局，方便在浏览器控制台调用
if (import.meta.env.DEV) {
  window.debugConnection = debugConnection;
  window.getConfig = ConnectionDebugger.getConfigSummary;

  console.log(`
🔧 调试工具已加载！
可用命令：
1. debugConnection() - 运行完整连通性测试
2. getConfig() - 查看当前配置
3. 在浏览器控制台查看网络请求
  `);
}
