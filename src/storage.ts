/**
 * 本机存储层：只负责 localStorage 的读写与数据迁移，不含业务判断。
 * 数据保存在浏览器本机，关闭重开仍在；不发送到任何服务器，无第三方依赖。
 */

import type { Incident } from "./rules";

const STORAGE_KEY = "cleanroom-merge-desk:v1";

export interface DeskState {
  version: 1;
  incidents: Incident[];
}

function emptyState(): DeskState {
  return { version: 1, incidents: [] };
}

/**
 * 从本机读取数据。任何异常（隐私模式、存储损坏、版本不符）都安全回退为空，
 * 避免一条坏数据让整个看板打不开。
 */
export function loadState(): DeskState {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyState();
    const parsed = JSON.parse(raw) as Partial<DeskState>;
    if (parsed.version !== 1 || !Array.isArray(parsed.incidents)) {
      return emptyState();
    }
    return { version: 1, incidents: parsed.incidents as Incident[] };
  } catch {
    return emptyState();
  }
}

/** 写入本机；存储配额不足等异常向调用方抛出，由页面提示 */
export function saveState(state: DeskState): void {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function clearState(): void {
  window.localStorage.removeItem(STORAGE_KEY);
}
