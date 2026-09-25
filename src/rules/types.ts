// 领域模型：异常事件与每次上报

/** 一次巡检上报（即使被归入同一事件，也逐条保留） */
export interface Report {
  id: string;
  /** 发生时刻（巡检员填报） */
  occurredAt: string;
  /** 录入时刻（进入归并台的时间） */
  reportedAt: string;
  /** 原始现象描述 */
  phenomenon: string;
}

export type EventStatus = "open" | "closed";

/**
 * 异常事件：同一房间 + 同一设备 + 同一缺陷代码，
 * 在整改单关闭前只对应一个事件。
 */
export interface DefectEvent {
  id: string;
  room: string;
  equipment: string;
  defectCode: string;
  /** 开立事件时从缺陷资料中快照，资料后续调整不影响旧单 */
  defectName: string;
  slaHours: number;
  /** 首例发生时刻，期限据此计算，续报不改变 */
  firstOccurredAt: string;
  /** 整改期限 = firstOccurredAt + slaHours，一经生成即冻结 */
  deadline: string;
  createdAt: string;
  status: EventStatus;
  reports: Report[];
  closedAt?: string;
  closeNote?: string;
}

export interface BoardState {
  schemaVersion: 1;
  eventSeq: number;
  reportSeq: number;
  events: DefectEvent[];
}

/** 录入区的原始输入（尚未规范化） */
export interface ReportInput {
  room: string;
  equipment: string;
  defectCode: string;
  occurredAt: string;
  phenomenon: string;
}
