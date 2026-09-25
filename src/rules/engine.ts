// 归并引擎：纯函数，不读写存储、不碰 DOM。
// 规则：
//   1. 整改单关闭前，房间+设备+缺陷代码相同的上报归入同一事件，每次上报都保留；
//   2. 事件关闭后再报同一代码 → 另开新事件，旧事件的关闭时间与期限不动；
//   3. 整改期限只在事件开立时生成（首例发生时刻 + 代码SLA），续报不顺延。

import { lookupDefect } from "./catalog";
import {
  eventKey,
  normalizeDefectCode,
  normalizeEquipment,
  normalizeRoom,
} from "./normalize";
import type {
  BoardState,
  DefectEvent,
  Report,
  ReportInput,
} from "./types";

const HOUR_MS = 60 * 60 * 1000;

export function emptyState(): BoardState {
  return { schemaVersion: 1, eventSeq: 0, reportSeq: 0, events: [] };
}

function nextEventId(state: BoardState): { id: string; seq: number } {
  const seq = state.eventSeq + 1;
  return { id: "EVT-" + String(seq).padStart(4, "0"), seq };
}

function nextReportId(state: BoardState): { id: string; seq: number } {
  const seq = state.reportSeq + 1;
  return { id: "RPT-" + String(seq).padStart(4, "0"), seq };
}

/** 输入校验，返回错误信息；通过则返回规范化后的字段 */
export function validateInput(input: ReportInput, nowIso: string) {
  const room = normalizeRoom(input.room);
  const equipment = normalizeEquipment(input.equipment);
  const defectCode = normalizeDefectCode(input.defectCode);
  const phenomenon = input.phenomenon.trim();
  const occurredAt = input.occurredAt ? new Date(input.occurredAt).toISOString() : "";

  if (!room) return { ok: false as const, message: "请填写房间编号" };
  if (!equipment) return { ok: false as const, message: "请填写设备编号" };
  if (!defectCode) return { ok: false as const, message: "请填写或选择缺陷代码" };
  if (!input.occurredAt || isNaN(new Date(input.occurredAt).getTime()))
    return { ok: false as const, message: "请填写正确的发生时刻" };
  // 允许小幅时钟偏差（1 分钟），但不接受未来时刻
  if (new Date(occurredAt).getTime() > new Date(nowIso).getTime() + 60_000)
    return { ok: false as const, message: "发生时刻不能晚于当前时间" };
  if (!phenomenon) return { ok: false as const, message: "请填写原始现象" };

  return {
    ok: true as const,
    value: { room, equipment, defectCode, phenomenon, occurredAt },
  };
}

export interface IngestResult {
  state: BoardState;
  eventId: string;
  /** merged：并入已有开放事件；created：另开新事件 */
  action: "merged" | "created";
}

/** 处理一次上报：找得到开放事件就并入，否则开立新事件 */
export function ingestReport(
  state: BoardState,
  raw: ReportInput,
  nowIso: string
): IngestResult {
  const checked = validateInput(raw, nowIso);
  if (!checked.ok) throw new Error(checked.message);
  const { room, equipment, defectCode, phenomenon, occurredAt } = checked.value;

  const key = eventKey({ room, equipment, defectCode });
  const target = state.events.find(
    (e) => e.status === "open" && eventKey(e) === key
  );

  const reportSeq = state.reportSeq + 1;
  const report: Report = {
    id: "RPT-" + String(reportSeq).padStart(4, "0"),
    occurredAt,
    reportedAt: nowIso,
    phenomenon,
  };

  if (target) {
    return {
      action: "merged",
      eventId: target.id,
      state: {
        ...state,
        reportSeq,
        events: state.events.map((e) =>
          e.id === target.id ? { ...e, reports: [...e.reports, report] } : e
        ),
      },
    };
  }

  const def = lookupDefect(defectCode);
  const eventSeq = state.eventSeq + 1;
  const firstMs = new Date(occurredAt).getTime();
  const newEvent: DefectEvent = {
    id: "EVT-" + String(eventSeq).padStart(4, "0"),
    room,
    equipment,
    defectCode,
    defectName: def.name,
    slaHours: def.slaHours,
    firstOccurredAt: occurredAt,
    deadline: new Date(firstMs + def.slaHours * HOUR_MS).toISOString(),
    createdAt: nowIso,
    status: "open",
    reports: [report],
  };

  return {
    action: "created",
    eventId: newEvent.id,
    state: {
      ...state,
      eventSeq,
      reportSeq,
      events: [newEvent, ...state.events],
    },
  };
}

/** 关闭整改单；关闭后同三项再来上报会另开事件，本单冻结 */
export function closeEvent(
  state: BoardState,
  eventId: string,
  note: string,
  nowIso: string
): BoardState {
  const trimmed = note.trim();
  if (!trimmed) throw new Error("请填写整改说明后再关单");
  return {
    ...state,
    events: state.events.map((e) =>
      e.id === eventId && e.status === "open"
        ? { ...e, status: "closed", closedAt: nowIso, closeNote: trimmed }
        : e
    ),
  };
}

// ---- 只读统计与展示口径（待整改按事件计数，不按上报条数） ----

export function openEvents(state: BoardState): DefectEvent[] {
  return state.events.filter((e) => e.status === "open");
}

export function closedEvents(state: BoardState): DefectEvent[] {
  return state.events.filter((e) => e.status === "closed");
}

export function reportCount(state: BoardState): number {
  return state.events.reduce((sum, e) => sum + e.reports.length, 0);
}

export type DueState = "overdue" | "due24h" | "normal";

export function dueState(e: DefectEvent, nowIso: string): DueState {
  if (e.status === "closed") return "normal";
  const ms = new Date(e.deadline).getTime() - new Date(nowIso).getTime();
  if (ms < 0) return "overdue";
  if (ms <= 24 * HOUR_MS) return "due24h";
  return "normal";
}
