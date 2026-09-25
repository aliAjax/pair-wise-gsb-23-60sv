import { useEffect, useMemo, useState } from "react";
import "./styles.css";
import {
  closeEvent,
  dueState,
  emptyState,
  ingestReport,
  openEvents,
  closedEvents,
  reportCount,
} from "./rules/engine";
import { eventKey, normalizeDefectCode, normalizeEquipment, normalizeRoom } from "./rules/normalize";
import { buildSeedState } from "./rules/seed";
import type { BoardState, ReportInput } from "./rules/types";
import { clearBoardState, loadBoardState, saveBoardState } from "./storage/local";
import { EntryForm, type MergePeek } from "./ui/EntryForm";
import { EventCard } from "./ui/EventCard";

type FilterKey = "all" | "overdue" | "due24h";

interface Toast {
  kind: "created" | "merged" | "closed" | "info";
  text: string;
}

function nowIsoValue(): string {
  return new Date().toISOString();
}

export default function App() {
  const [board, setBoard] = useState<BoardState>(() => loadBoardState());
  const [nowIso, setNowIso] = useState(nowIsoValue);
  const [expandedIds, setExpandedIds] = useState<string[]>([]);
  const [filter, setFilter] = useState<FilterKey>("all");
  const [toast, setToast] = useState<Toast | null>(null);

  // 落盘时机：任何状态变化都写入本机存储，重开浏览器仍在
  useEffect(() => {
    saveBoardState(board);
  }, [board]);

  // 每 30 秒刷新一次，"剩余/超期"时间保持准确
  useEffect(() => {
    const timer = window.setInterval(() => setNowIso(nowIsoValue()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 4500);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const opens = useMemo(
    () =>
      openEvents(board).sort(
        (a, b) => new Date(a.deadline).getTime() - new Date(b.deadline).getTime()
      ),
    [board]
  );
  const closes = useMemo(
    () =>
      closedEvents(board).sort(
        (a, b) => new Date(b.closedAt ?? 0).getTime() - new Date(a.closedAt ?? 0).getTime()
      ),
    [board]
  );

  const overdueCount = opens.filter((e) => dueState(e, nowIso) === "overdue").length;
  const dueCount = opens.filter((e) => dueState(e, nowIso) === "due24h").length;
  const filteredOpens = opens.filter((e) => {
    if (filter === "overdue") return dueState(e, nowIso) === "overdue";
    if (filter === "due24h") return dueState(e, nowIso) === "due24h";
    return true;
  });

  const toggle = (id: string) =>
    setExpandedIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));

  const peekMerge = (room: string, equipment: string, code: string): MergePeek | null => {
    const r = normalizeRoom(room);
    const eq = normalizeEquipment(equipment);
    const c = normalizeDefectCode(code);
    if (!r || !eq || !c) return null;
    const key = eventKey({ room: r, equipment: eq, defectCode: c });
    const hit = board.events.find((e) => e.status === "open" && eventKey(e) === key);
    return hit
      ? { willMerge: true, eventId: hit.id, reportCount: hit.reports.length }
      : { willMerge: false };
  };

  const handleIngest = (input: ReportInput): string | null => {
    try {
      const res = ingestReport(board, input, nowIsoValue());
      const target = res.state.events.find((e) => e.id === res.eventId);
      setBoard(res.state);
      setExpandedIds((ids) => (ids.includes(res.eventId) ? ids : [...ids, res.eventId]));
      setToast(
        res.action === "merged"
          ? {
              kind: "merged",
              text: `已并入 ${res.eventId}，该事件现有 ${target?.reports.length ?? 0} 次上报，期限不顺延。`,
            }
          : {
              kind: "created",
              text: `已开立 ${res.eventId}，整改期限按缺陷代码 SLA 一次生成。`,
            }
      );
      return null;
    } catch (err) {
      return err instanceof Error ? err.message : "录入失败";
    }
  };

  const handleClose = (eventId: string, note: string): string | null => {
    try {
      setBoard(closeEvent(board, eventId, note, nowIsoValue()));
      setToast({ kind: "closed", text: `${eventId} 已关闭，关闭时间与整改期限已冻结。` });
      return null;
    } catch (err) {
      return err instanceof Error ? err.message : "关单失败";
    }
  };

  const handleClear = () => {
    if (!window.confirm("确定清空本机全部事件与上报记录？此操作不可恢复。")) return;
    clearBoardState();
    setBoard(emptyState());
    setExpandedIds([]);
    setToast({ kind: "info", text: "本机数据已清空。" });
  };

  const handleSeed = () => {
    setBoard(buildSeedState(new Date()));
    setToast({ kind: "info", text: "已载入示例资料。" });
  };

  return (
    <main className="app-shell">
      <section className="hero">
        <div>
          <p className="eyebrow">hxwl-09 · 异常归并台</p>
          <h1>洁净室异常归并台</h1>
          <p className="subtitle">
            同一房间 · 同一设备 · 同一缺陷代码，整改单关闭前只算一件事；每次上报逐条保留。
          </p>
        </div>
        <div className="rule-card">
          <span>归并规则</span>
          <strong>关单前同三项归一单 · 关单后同代码另开</strong>
          <small>旧单关闭时间与期限冻结不动，待整改按事件计数。</small>
        </div>
      </section>

      <section className="metrics-grid">
        <article className="metric-card">
          <span>待整改事件</span>
          <strong>{opens.length}</strong>
          <i className="status-badge-blue">按事件计数，非按上报条数</i>
        </article>
        <article className="metric-card">
          <span>已超期</span>
          <strong>{overdueCount}</strong>
          <i className="status-badge-rose">{dueCount} 件 24h 内到期</i>
        </article>
        <article className="metric-card">
          <span>累计上报条数</span>
          <strong>{reportCount(board)}</strong>
          <i className="status-badge-muted">续报都保留在事件内</i>
        </article>
        <article className="metric-card">
          <span>已关闭事件</span>
          <strong>{closes.length}</strong>
          <i className="status-badge-muted">关闭时间与期限不可改</i>
        </article>
      </section>

      <section className="workspace">
        <EntryForm onSubmit={handleIngest} peekMerge={peekMerge} />

        <section className="panel board">
          <div className="section-heading">
            <div>
              <p>整改看板</p>
              <h2>事件列表</h2>
            </div>
            <button className="ghost-btn" type="button" onClick={handleClear}>
              清空本机数据
            </button>
          </div>

          {board.events.length === 0 ? (
            <div className="empty-board">
              <p>本机还没有任何事件与上报。</p>
              <button className="primary-action" type="button" onClick={handleSeed}>
                载入示例资料
              </button>
            </div>
          ) : (
            <div className="board-columns">
              <div className="board-column">
                <div className="column-head">
                  <h3>待整改（{opens.length} 件）</h3>
                  <div className="filter-chips">
                    {(
                      [
                        ["all", "全部"],
                        ["overdue", "已超期"],
                        ["due24h", "24h 内"],
                      ] as [FilterKey, string][]
                    ).map(([key, label]) => (
                      <button
                        key={key}
                        type="button"
                        className={filter === key ? "chip chip-on" : "chip"}
                        onClick={() => setFilter(key)}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
                {filteredOpens.length === 0 ? (
                  <p className="empty-line">该筛选下没有事件</p>
                ) : (
                  filteredOpens.map((e) => (
                    <EventCard
                      key={e.id}
                      event={e}
                      nowIso={nowIso}
                      expanded={expandedIds.includes(e.id)}
                      onToggle={() => toggle(e.id)}
                      onClose={handleClose}
                    />
                  ))
                )}
              </div>

              <div className="board-column">
                <div className="column-head">
                  <h3>已关闭（{closes.length} 件）</h3>
                </div>
                {closes.length === 0 ? (
                  <p className="empty-line">暂无已关闭事件</p>
                ) : (
                  closes.map((e) => (
                    <EventCard
                      key={e.id}
                      event={e}
                      nowIso={nowIso}
                      expanded={expandedIds.includes(e.id)}
                      onToggle={() => toggle(e.id)}
                      onClose={handleClose}
                    />
                  ))
                )}
              </div>
            </div>
          )}
        </section>
      </section>

      {toast && <div className={`toast toast-${toast.kind}`}>{toast.text}</div>}
    </main>
  );
}
