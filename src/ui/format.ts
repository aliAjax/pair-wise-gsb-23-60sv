// 展示用时间格式化（页面层）

const pad = (n: number) => String(n).padStart(2, "0");

/** ISO → "2026-09-25 14:30"（本地时区） */
export function fmtDateTime(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fmtDuration(ms: number): string {
  const minutes = Math.round(ms / 60000);
  if (minutes < 60) return `${minutes} 分钟`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours} 小时`;
  const days = Math.floor(hours / 24);
  return `${days} 天 ${hours % 24} 小时`;
}

/** 相对期限的剩余/超期描述 */
export function fmtRemain(deadlineIso: string, nowIso: string): string {
  const ms = new Date(deadlineIso).getTime() - new Date(nowIso).getTime();
  if (isNaN(ms)) return "—";
  return ms < 0 ? `已超期 ${fmtDuration(-ms)}` : `剩余 ${fmtDuration(ms)}`;
}

/** Date → datetime-local 输入框值（本地时区，精确到分） */
export function toLocalInputValue(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
