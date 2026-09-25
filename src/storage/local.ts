// 本机存储：只负责把看板状态放进 localStorage，重开浏览器仍在。
// 首次打开（从未存过）时载入示例资料，之后一切改动都落盘。

import { buildSeedState } from "../rules/seed";
import type { BoardState } from "../rules/types";

const STORAGE_KEY = "hxwl09.mergeBoard.v1";

function isBoardState(raw: unknown): raw is BoardState {
  if (!raw || typeof raw !== "object") return false;
  const s = raw as BoardState;
  return (
    s.schemaVersion === 1 &&
    Array.isArray(s.events) &&
    typeof s.eventSeq === "number" &&
    typeof s.reportSeq === "number"
  );
}

export function loadBoardState(): BoardState {
  try {
    const text = window.localStorage.getItem(STORAGE_KEY);
    if (text) {
      const parsed: unknown = JSON.parse(text);
      if (isBoardState(parsed)) return parsed;
    }
  } catch {
    // 存储不可用或内容损坏时，按首次使用处理
  }
  const seeded = buildSeedState(new Date());
  saveBoardState(seeded);
  return seeded;
}

export function saveBoardState(state: BoardState): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // 存储被禁用时静默失败，页面仍可当次使用
  }
}

export function clearBoardState(): void {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // 忽略
  }
}
