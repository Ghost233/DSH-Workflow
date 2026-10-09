/**
 * macOS 工作区键单源。宿主与客户端保留大小写和文件名中的反斜杠，
 * 只折叠重复正斜杠、去掉非根路径尾斜杠；符号链接不解析。
 * 浏览器所在系统不改变 macOS 宿主工作区的路径语义。
 */
export function keyOf(raw, os) {
  if (raw == null) return '';
  let s = String(raw).trim();
  if (!s) return '';
  s = s.replace(/\/+/g, '/');
  while (s.length > 1 && s.endsWith('/')) s = s.slice(0, -1);
  return s;
}

export function currentOs() { return 'darwin'; }

// 保留宿主侧公共包装接口。
export function normalizeWorkspacePath(raw, platform) { return keyOf(raw); }
