import { strict as assert } from "node:assert";
import { closeIncident, computeStats, ingestReport } from "../src/rules.ts";

const base = (minutes: number): string => {
  const d = new Date("2026-09-25T08:00:00+08:00");
  return new Date(d.getTime() + minutes * 60000).toISOString();
};
const input = (minutes: number, phenomenon: string) => ({
  room: "CR-1201",
  equipment: "FFU-A17",
  defectCode: "FN-07", // SLA 8 小时
  occurredAt: base(minutes),
  phenomenon,
});

const now = new Date("2026-09-25T08:05:00+08:00");

// 1. 首报新建事件
let r1 = ingestReport([], input(0, "首报：异响"), now);
assert.ok(!("error" in r1), "首报应成功");
if ("error" in r1) throw new Error(r1.error);
assert.equal(r1.merged, false, "首报不应归并");
let events = r1.events;
const evId = r1.incidentId;

// 2. 同三项第二次上报 → 并入同一事件
let r2 = ingestReport(events, input(3, "续报：风速仍低"), now);
if ("error" in r2) throw new Error(r2.error);
assert.equal(r2.merged, true, "同三项续报应归并");
assert.equal(r2.incidentId, evId, "续报应挂在同一事件");
events = r2.events;
assert.equal(events.length, 1, "事件数不增加");
assert.equal(events[0].reports.length, 2, "保留 2 次上报");
assert.deepEqual(
  events[0].reports.map((x) => x.phenomenon),
  ["首报：异响", "续报：风速仍低"],
  "每次上报的原始现象都保留"
);

// 3. 期限锚定首报，不被续报推后（首报 00:00Z + 8h = 08:00Z）
assert.equal(
  events[0].deadline,
  new Date("2026-09-25T08:00:00.000Z").toISOString(),
  "期限=首报+SLA"
);

// 4. 同房间不同设备 → 另开
let r3 = ingestReport(events, { ...input(3, "另一台设备"), equipment: "FFU-A18" }, now);
if ("error" in r3) throw new Error(r3.error);
assert.equal(r3.merged, false, "不同设备另开");
events = r3.events;
assert.equal(events.length, 2, "事件数变为 2");

// 5. 待整改按事件计数：2 事件 3 上报
let stats = computeStats(events, now);
assert.equal(stats.pending, 2, "待整改按事件计 2");
assert.equal(stats.totalReports, 3, "上报次数 3");
assert.equal(stats.overdue, 0, "当前无逾期");

// 6. 关闭
events = closeIncident(events, evId, new Date("2026-09-25T10:00:00+08:00"));
const closed = events.find((e) => e.id === evId)!;
assert.equal(closed.status, "closed");
assert.equal(closed.closedAt, new Date("2026-09-25T02:00:00.000Z").toISOString());
assert.equal(
  closed.deadline,
  new Date("2026-09-25T08:00:00.000Z").toISOString(),
  "关闭不改变期限"
);

// 7. 关闭后同三项再报 → 另开新事件；旧事件冻结
let r4 = ingestReport(events, input(4, "关闭后再报"), now);
if ("error" in r4) throw new Error(r4.error);
assert.equal(r4.merged, false, "关闭后再报必须另开");
assert.notEqual(r4.incidentId, evId, "新事件 ID 不同于旧事件");
events = r4.events;
assert.equal(events.length, 3, "事件数变为 3");
const oldClosed = events.find((e) => e.id === evId)!;
assert.equal(oldClosed.reports.length, 2, "旧事件上报数不动");
assert.equal(
  oldClosed.closedAt,
  new Date("2026-09-25T02:00:00.000Z").toISOString(),
  "旧关闭时间不动"
);
assert.equal(
  oldClosed.deadline,
  new Date("2026-09-25T08:00:00.000Z").toISOString(),
  "旧期限不动"
);

// 8. 校验：未来时刻拒绝（发生时刻 18:00，当前 07:00）
const future = ingestReport(
  [],
  { ...input(600, "未来") },
  new Date("2026-09-25T07:00:00+08:00")
);
assert.ok("error" in future, "未来发生时刻应被拒绝");

// 9. 逾期统计
const later = new Date("2026-09-25T20:00:00+08:00");
stats = computeStats(events, later);
assert.equal(stats.closed, 1);
assert.equal(stats.pending, 2);
assert.ok(stats.overdue >= 2, "超过期限的待整改事件计逾期");

console.log("rules 测试全部通过 ✔");
