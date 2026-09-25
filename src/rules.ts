/**
 * 资料规则层（纯数据 + 纯函数，不碰 DOM、不碰存储、无第三方依赖）
 *
 * 归并规则：
 * - 归并键 = 房间 + 设备 + 缺陷代码（“相同三项”）。
 * - 整改单关闭前：相同三项的新上报并入同一事件，事件计数不变，每次上报逐条保留；
 *   期限锚定首报发生时刻，不随后续上报顺延。
 * - 关闭后：再报同代码（同三项）另开新事件；旧事件的关闭时间与期限保持不动。
 */

export type Severity = "critical" | "major" | "minor";

/** 缺陷代码资料（资料规则的一部分，与页面、存储分离） */
export interface DefectCodeRule {
  code: string;
  name: string;
  severity: Severity;
  /** 整改期限（自首报发生时刻起，小时） */
  slaHours: number;
}

/** 单次上报：同一事件可保留多条 */
export interface Report {
  id: string;
  /** 发生时刻（ISO 字符串，由录入的本地时间转换） */
  occurredAt: string;
  /** 登记时刻（本机录入时间） */
  recordedAt: string;
  /** 原始现象描述 */
  phenomenon: string;
}

/** 归并后的异常事件，对应一张整改单 */
export interface Incident {
  id: string;
  room: string;
  equipment: string;
  defectCode: string;
  reports: Report[];
  /** 期限 = 首报发生时刻 + 缺陷代码 SLA，创建后不再变化 */
  deadline: string;
  status: "open" | "closed";
  closedAt: string | null;
}

export interface IngestInput {
  room: string;
  equipment: string;
  defectCode: string;
  /** 发生时刻：datetime-local 提交值（本地时区，无尾缀） */
  occurredAt: string;
  phenomenon: string;
}

export type ValidationResult =
  | { ok: true; input: IngestInput }
  | { ok: false; message: string };

/** 缺陷代码字典：代码、名称、严重度、整改期限（小时） */
export const DEFECT_CODES: DefectCodeRule[] = [
  { code: "PT-01", name: "悬浮粒子超限", severity: "critical", slaHours: 4 },
  { code: "PD-02", name: "房间压差失效", severity: "critical", slaHours: 8 },
  { code: "AH-03", name: "温湿度偏移", severity: "major", slaHours: 24 },
  { code: "SE-04", name: "密封/气密泄漏", severity: "critical", slaHours: 12 },
  { code: "CL-05", name: "清洁度不合格", severity: "major", slaHours: 24 },
  { code: "ST-06", name: "设备表面静电异常", severity: "major", slaHours: 24 },
  { code: "FN-07", name: "过滤器/FFU异常", severity: "critical", slaHours: 8 },
  { code: "DR-08", name: "地漏/排水污染", severity: "major", slaHours: 24 },
  { code: "GT-09", name: "门禁/气闸联锁失效", severity: "critical", slaHours: 2 },
  { code: "GN-10", name: "手套/隔离器破损", severity: "critical", slaHours: 4 },
  { code: "LB-11", name: "照明/照度不足", severity: "minor", slaHours: 72 },
  { code: "DC-12", name: "文件/标识缺失", severity: "minor", slaHours: 72 },
];

export const SEVERITY_LABEL: Record<Severity, string> = {
  critical: "严重",
  major: "主要",
  minor: "一般",
};

export function defectRuleOf(code: string): DefectCodeRule | undefined {
  return DEFECT_CODES.find((rule) => rule.code === code);
}

/** 归并键：相同房间 + 相同设备 + 相同缺陷代码 */
export function mergeKey(room: string, equipment: string, defectCode: string): string {
  return `${room.trim()}${equipment.trim()}${defectCode.trim()}`;
}

export function incidentKey(incident: Pick<Incident, "room" | "equipment" | "defectCode">): string {
  return mergeKey(incident.room, incident.equipment, incident.defectCode);
}

/** 期限：首报发生时刻 + SLA 小时 */
export function calcDeadline(firstOccurredAt: string, slaHours: number): string {
  return new Date(new Date(firstOccurredAt).getTime() + slaHours * 3600_000).toISOString();
}

/** 录入校验 */
export function validateInput(raw: IngestInput, now: Date = new Date()): ValidationResult {
  const room = raw.room.trim();
  const equipment = raw.equipment.trim();
  const defectCode = raw.defectCode.trim();
  const occurredAt = raw.occurredAt.trim();
  const phenomenon = raw.phenomenon.trim();

  if (!room) return { ok: false, message: "请填写房间编号" };
  if (!equipment) return { ok: false, message: "请填写设备" };
  if (!defectCode) return { ok: false, message: "请选择缺陷代码" };
  if (!defectRuleOf(defectCode)) return { ok: false, message: `未知缺陷代码：${defectCode}` };
  if (!occurredAt) return { ok: false, message: "请填写发生时刻" };

  const occurred = new Date(occurredAt);
  if (Number.isNaN(occurred.getTime())) {
    return { ok: false, message: "发生时刻格式不正确" };
  }
  // 允许 2 分钟时钟偏差，避免把“刚刚”误判为未来时刻
  if (occurred.getTime() > now.getTime() + 2 * 60_000) {
    return { ok: false, message: "发生时刻不能晚于当前时间" };
  }
  if (!phenomenon) return { ok: false, message: "请填写原始现象" };
  if (phenomenon.length > 500) return { ok: false, message: "原始现象请控制在 500 字以内" };

  return {
    ok: true,
    input: { room, equipment, defectCode, occurredAt, phenomenon },
  };
}

function makeId(prefix: string): string {
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}-${Date.now().toString(36)}${rand}`.toUpperCase();
}

/**
 * 处理一次上报：
 * - 同归并键存在未关闭事件 → 并入（保留上报，期限不动）；
 * - 否则 → 另开新事件。
 * 返回新的事件数组与处理结果，不修改入参。
 */
export function ingestReport(
  events: Incident[],
  raw: IngestInput,
  now: Date = new Date()
): { events: Incident[]; incidentId: string; merged: boolean } | { error: string } {
  const checked = validateInput(raw, now);
  if (!checked.ok) return { error: checked.message };
  const { input } = checked;

  const occurredIso = new Date(input.occurredAt).toISOString();
  const report: Report = {
    id: makeId("RPT"),
    occurredAt: occurredIso,
    recordedAt: now.toISOString(),
    phenomenon: input.phenomenon,
  };

  const key = mergeKey(input.room, input.equipment, input.defectCode);
  const openIndex = events.findIndex(
    (event) => event.status === "open" && incidentKey(event) === key
  );

  if (openIndex >= 0) {
    const target = events[openIndex];
    const mergedEvent: Incident = {
      ...target,
      // 新上报排在后面，展开时按时间顺序呈现每次上报
      reports: [...target.reports, report],
    };
    const next = events.slice();
    next[openIndex] = mergedEvent;
    return { events: next, incidentId: target.id, merged: true };
  }

  const rule = defectRuleOf(input.defectCode)!;
  const incident: Incident = {
    id: makeId("EV"),
    room: input.room,
    equipment: input.equipment,
    defectCode: input.defectCode,
    reports: [report],
    deadline: calcDeadline(occurredIso, rule.slaHours),
    status: "open",
    closedAt: null,
  };
  return { events: [incident, ...events], incidentId: incident.id, merged: false };
}

/** 关闭整改单：仅写入关闭时刻，期限保持原样 */
export function closeIncident(
  events: Incident[],
  incidentId: string,
  now: Date = new Date()
): Incident[] {
  return events.map((event) =>
    event.id === incidentId && event.status === "open"
      ? { ...event, status: "closed", closedAt: now.toISOString() }
      : event
  );
}

export interface DeskStats {
  /** 待整改：按事件计数（不是按上报条数） */
  pending: number;
  /** 待整改中的逾期事件数 */
  overdue: number;
  closed: number;
  /** 全部上报次数（含被归并的续报） */
  totalReports: number;
}

export function computeStats(events: Incident[], now: Date = new Date()): DeskStats {
  const nowMs = now.getTime();
  let pending = 0;
  let overdue = 0;
  let closed = 0;
  let totalReports = 0;
  for (const event of events) {
    totalReports += event.reports.length;
    if (event.status === "closed") {
      closed += 1;
    } else {
      pending += 1;
      if (new Date(event.deadline).getTime() < nowMs) overdue += 1;
    }
  }
  return { pending, overdue, closed, totalReports };
}

export function isOverdue(event: Incident, now: Date = new Date()): boolean {
  return event.status === "open" && new Date(event.deadline).getTime() < now.getTime();
}

/** 首报发生时刻 */
export function firstReportAt(event: Incident): string {
  return event.reports
    .map((report) => report.occurredAt)
    .sort()[0];
}

/** 待整改：逾期在前，其余按期限先后；已关闭：关闭时间新的在前 */
export function sortIncidents(events: Incident[]): Incident[] {
  return events.slice().sort((a, b) => {
    if (a.status !== b.status) return a.status === "open" ? -1 : 1;
    if (a.status === "open") {
      return new Date(a.deadline).getTime() - new Date(b.deadline).getTime();
    }
    return new Date(b.closedAt ?? 0).getTime() - new Date(a.closedAt ?? 0).getTime();
  });
}

/* ----------------------------- 时间展示（仅格式化，无依赖） ----------------------------- */

const pad = (value: number): string => String(value).padStart(2, "0");

/** 格式化为 yyyy-MM-dd HH:mm */
export function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(
    date.getHours()
  )}:${pad(date.getMinutes())}`;
}

/** 当前时刻对应的 datetime-local 初值 */
export function nowLocalInputValue(now: Date = new Date()): string {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(
    now.getHours()
  )}:${pad(now.getMinutes())}`;
}

/** 期限与当前时刻的差值文案，如“剩余 3小时20分”“已逾期 2天5小时” */
export function formatRemaining(deadlineIso: string, now: Date = new Date()): {
  overdue: boolean;
  text: string;
} {
  let diffMs = new Date(deadlineIso).getTime() - now.getTime();
  const overdue = diffMs < 0;
  diffMs = Math.abs(diffMs);

  const minutes = Math.floor(diffMs / 60_000);
  const days = Math.floor(minutes / (60 * 24));
  const hours = Math.floor((minutes % (60 * 24)) / 60);
  const mins = minutes % 60;

  const parts: string[] = [];
  if (days > 0) parts.push(`${days}天`);
  if (hours > 0) parts.push(`${hours}小时`);
  if (days === 0 && mins > 0) parts.push(`${mins}分`);
  if (parts.length === 0) parts.push("不足1分");

  return { overdue, text: `${overdue ? "已逾期 " : "剩余 "}${parts.join("")}` };
}
