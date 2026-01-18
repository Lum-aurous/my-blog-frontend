// client/src/api/email.js
import { api } from "@/utils/api.js";

// 1. 获取邮件日志列表
export function getEmailLogs(params) {
  // params 包含: page, limit, keyword, status
  return api.get("/admin/emails", { params });
}

// 2. 删除单条日志
export function deleteEmailLog(id) {
  return api.delete(`/admin/emails/${id}`);
}

// 3. 清空所有日志
export function clearAllLogs() {
  return api.delete("/admin/emails/clear/all");
}