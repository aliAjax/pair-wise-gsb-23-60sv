// 示例资料：仅在本机从未存过数据时载入一次，随后完全交给本地存储。
// 数据本身也走归并引擎生成，避免绕过规则。

import { DEFECT_CATALOG } from "./catalog";
import { closeEvent, emptyState, ingestReport } from "./engine";
import type { BoardState } from "./types";

const HOUR = 60 * 60 * 1000;

type SeedOp =
  | {
      kind: "report";
      room: string;
      equipment: string;
      defectCode: string;
      /** 相对当前时刻往前偏移的小时数（发生时刻） */
      hoursAgo: number;
      phenomenon: string;
    }
  | {
      kind: "close";
      room: string;
      equipment: string;
      defectCode: string;
      hoursAgo: number;
      note: string;
    };

const SEED_OPS: SeedOp[] = [
  // 一、粒子超限：三次上报 → 1 个开放事件、3 条上报，已超期
  {
    kind: "report",
    room: "CR-1201",
    equipment: "FFU-A07",
    defectCode: DEFECT_CATALOG[0].code,
    hoursAgo: 30,
    phenomenon: "0.5µm 粒子计数 18200/ft³，超过 ISO 5 限值。",
  },
  {
    kind: "report",
    room: "CR-1201",
    equipment: "FFU-A07",
    defectCode: DEFECT_CATALOG[0].code,
    hoursAgo: 20,
    phenomenon: "复测仍 15100/ft³，滤网初阻力偏高。",
  },
  {
    kind: "report",
    room: "CR-1201",
    equipment: "FFU-A07",
    defectCode: DEFECT_CATALOG[0].code,
    hoursAgo: 6,
    phenomenon: "夜班复测 12600/ft³，待更换高效过滤器。",
  },
  // 二、静压差偏离：两次上报后关闭，旧单从此冻结
  {
    kind: "report",
    room: "CR-2107",
    equipment: "DPR-12",
    defectCode: DEFECT_CATALOG[1].code,
    hoursAgo: 72,
    phenomenon: "相对走廊压差仅 4Pa，低于 10Pa 下限。",
  },
  {
    kind: "report",
    room: "CR-2107",
    equipment: "DPR-12",
    defectCode: DEFECT_CATALOG[1].code,
    hoursAgo: 60,
    phenomenon: "调整回风阀后复测 9Pa，仍偏低。",
  },
  {
    kind: "close",
    room: "CR-2107",
    equipment: "DPR-12",
    defectCode: DEFECT_CATALOG[1].code,
    hoursAgo: 48,
    note: "更换风阀执行器并校准，连续两日压差稳定在 12Pa。",
  },
  // 三、同一压差点关闭后再报 → 另开新事件，旧关闭时间与期限不动
  {
    kind: "report",
    room: "CR-2107",
    equipment: "DPR-12",
    defectCode: DEFECT_CATALOG[1].code,
    hoursAgo: 3,
    phenomenon: "压差再次掉到 6Pa，怀疑风阀定位器漂移。",
  },
  // 四、温湿度偏移：单次开放事件
  {
    kind: "report",
    room: "Y-0302",
    equipment: "AHU-Y2",
    defectCode: DEFECT_CATALOG[2].code,
    hoursAgo: 10,
    phenomenon: "湿度 58%RH，超过黄光区 55%RH 上限。",
  },
];

export function buildSeedState(now: Date): BoardState {
  let state = emptyState();

  for (const op of SEED_OPS) {
    const stamp = new Date(now.getTime() - op.hoursAgo * HOUR).toISOString();

    if (op.kind === "report") {
      // 录入时刻设为发生时刻后约 20 分钟，符合"先发生、后录入"
      const enteredAt = new Date(now.getTime() - op.hoursAgo * HOUR + 20 * 60 * 1000).toISOString();
      state = ingestReport(
        state,
        {
          room: op.room,
          equipment: op.equipment,
          defectCode: op.defectCode,
          occurredAt: stamp,
          phenomenon: op.phenomenon,
        },
        enteredAt
      ).state;
    } else {
      const key = [op.room, op.equipment, op.defectCode].join("|");
      const target = state.events.find(
        (e) =>
          e.status === "open" &&
          [e.room, e.equipment, e.defectCode].join("|") === key
      );
      if (target) state = closeEvent(state, target.id, op.note, stamp);
    }
  }

  return state;
}
