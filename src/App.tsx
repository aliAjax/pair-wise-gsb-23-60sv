import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import "./styles.css";
import {
  DEFECT_CODES,
  SEVERITY_LABEL,
  closeIncident,
  computeStats,
  defectRuleOf,
  firstReportAt,
  formatDateTime,
  formatRemaining,
  ingestReport,
  isOverdue,
  nowLocalInputValue,
  sortIncidents,
  type Incident,
  type IngestInput,
} from "./rules";
import { loadState, saveState } from "./storage";

type Toast = { kind: "merge" | "create" | "error"; text: string } | null;

const makeEmptyForm = (): IngestInput => ({
  room: "",
  equipment: "",
  defectCode: "",
  occurredAt: nowLocalInputValue(),
  phenomenon: "",
});

export default function App() {
  const [incidents, setIncidents] = useState<Incident[]>(() => loadState().incidents);
  const [form, setForm] = useState<IngestInput>(makeEmptyForm);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [toast, setToast] = useState<Toast>(null);
  const [now, setNow] = useState<Date>(() => new Date());
  const toastTimer = useRef<number | null>(null);

  // 本机持久化：任何变更都写回 localStorage，关闭重开仍在
  useEffect(() => {
    try {
      saveState({ version: 1, incidents });
    } catch {
      showToast({ kind: "error", text: "本机存储写入失败（可能是浏览器存储已满或处于隐私模式）" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [incidents]);

  // 每 30 秒刷新一次，逾期/剩余时间自动更新；录入中不打断
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  function showToast(next: NonNullable<Toast>): void {
    setToast(next);
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 4000);
  }

  function updateField<K extends keyof IngestInput>(key: K, value: IngestInput[K]): void {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function submitReport(event: FormEvent): void {
    event.preventDefault();
    const result = ingestReport(incidents, form);
    if ("error" in result) {
      showToast({ kind: "error", text: result.error });
      return;
    }
    setIncidents(result.events);
    setExpanded((prev) => ({ ...prev, [result.incidentId]: true }));
    if (result.merged) {
      const merged = result.events.find((item) => item.id === result.incidentId);
      showToast({
        kind: "merge",
        text: `已归入待整改事件 ${result.incidentId}：这是第 ${merged?.reports.length ?? ""} 次上报，整改期限不延长`,
      });
    } else {
      showToast({ kind: "create", text: `已新建待整改事件 ${result.incidentId}` });
    }
    // 房间、设备、缺陷代码保留便于连续巡检录入，现象与发生时刻重置
    setForm((prev) => ({
      ...prev,
      phenomenon: "",
      occurredAt: nowLocalInputValue(),
    }));
  }

  function closeOne(incidentId: string): void {
    const target = incidents.find((item) => item.id === incidentId);
    if (!target || target.status !== "open") return;
    const ok = window.confirm(
      `确认关闭整改单 ${incidentId}（${target.room} · ${target.equipment} · ${target.defectCode}）？\n` +
        "关闭后再报同代码将另开事件，旧事件关闭时间与期限不再变动。"
    );
    if (!ok) return;
    setIncidents((prev) => closeIncident(prev, incidentId));
    showToast({ kind: "create", text: `整改单 ${incidentId} 已关闭` });
  }

  function fillDemo(): void {
    setForm({
      room: "CR-1201",
      equipment: "FFU-A17",
      defectCode: "FN-07",
      occurredAt: nowLocalInputValue(),
      phenomenon: "巡检听到风机异响，风速读数偏低",
    });
  }

  const stats = useMemo(() => computeStats(incidents, now), [incidents, now]);
  const ordered = useMemo(() => sortIncidents(incidents), [incidents]);
  const openEvents = ordered.filter((event) => event.status === "open");
  const closedEvents = ordered.filter((event) => event.status === "closed");
  const selectedRule = form.defectCode ? defectRuleOf(form.defectCode) : undefined;

  return (
    <main className="app-shell">
      <header className="hero">
        <div>
          <p className="eyebrow">异常归并台 · 半导体洁净室巡检</p>
          <h1>同房间 · 同设备 · 同代码，只挂一张整改单</h1>
          <p className="subtitle">
            整改单关闭前，相同三项的续报自动归入同一事件并逐条保留，待整改按事件计数、期限不续报顺延；
            关闭后再报同代码另开事件，旧关闭时间与期限不动。数据仅存本机浏览器，重开仍在。
          </p>
        </div>
        <div className="stack-card">
          <span>归并口径</span>
          <strong>房间 + 设备 + 缺陷代码</strong>
          <span>期限锚定首报发生时刻</span>
        </div>
      </header>

      <section className="metrics-grid" aria-label="统计">
        <article className="metric-card highlight">
          <span>待整改（事件）</span>
          <strong>{stats.pending}</strong>
          <i className="bar bar-primary" />
        </article>
        <article className="metric-card">
          <span>其中已逾期</span>
          <strong>{stats.overdue}</strong>
          <i className="bar bar-danger" />
        </article>
        <article className="metric-card">
          <span>已关闭事件</span>
          <strong>{stats.closed}</strong>
          <i className="bar bar-ok" />
        </article>
        <article className="metric-card">
          <span>累计上报次数</span>
          <strong>{stats.totalReports}</strong>
          <i className="bar bar-muted" />
        </article>
      </section>

      <section className="panel entry-panel">
        <div className="section-heading">
          <div>
            <p>巡检录入</p>
            <h2>异常上报</h2>
          </div>
          <button type="button" className="ghost-action" onClick={fillDemo}>
            填入示例
          </button>
        </div>
        <form onSubmit={submitReport} className="entry-form">
          <label>
            <span>房间编号 *</span>
            <input
              list="room-options"
              value={form.room}
              placeholder="如 CR-1201"
              onChange={(e) => updateField("room", e.target.value)}
            />
            <datalist id="room-options">
              <option value="CR-1201" />
              <option value="CR-2107" />
              <option value="Y-0302" />
              <option value="CR-3305" />
              <option value="G-0110" />
            </datalist>
          </label>
          <label>
            <span>设备 *</span>
            <input
              value={form.equipment}
              placeholder="如 FFU-A17"
              onChange={(e) => updateField("equipment", e.target.value)}
            />
          </label>
          <label>
            <span>缺陷代码 *</span>
            <select
              value={form.defectCode}
              onChange={(e) => updateField("defectCode", e.target.value)}
            >
              <option value="">请选择缺陷代码</option>
              {DEFECT_CODES.map((rule) => (
                <option key={rule.code} value={rule.code}>
                  {rule.code} · {rule.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>发生时刻 *</span>
            <input
              type="datetime-local"
              value={form.occurredAt}
              onChange={(e) => updateField("occurredAt", e.target.value)}
            />
          </label>
          <label className="full-width">
            <span>原始现象 *</span>
            <textarea
              rows={2}
              maxLength={500}
              value={form.phenomenon}
              placeholder="现场看到、听到、读到的原始情况，不做归并判断"
              onChange={(e) => updateField("phenomenon", e.target.value)}
            />
          </label>
          <div className="form-footer full-width">
            <p className="rule-hint">
              {selectedRule
                ? `${selectedRule.code} ${selectedRule.name} · ${SEVERITY_LABEL[selectedRule.severity]} · 整改期限 ${selectedRule.slaHours} 小时（自首报发生时刻起算）`
                : "选择缺陷代码后显示资料规则；相同房间+设备+代码的未关闭整改单会自动归入。"}
            </p>
            <button type="submit" className="primary-action">
              提交上报
            </button>
          </div>
        </form>
      </section>

      <section className="board">
        <section className="panel column">
          <div className="section-heading">
            <div>
              <p>待整改</p>
              <h2>
                待整改事件 <span className="count-badge">{openEvents.length}</span>
              </h2>
            </div>
          </div>
          {openEvents.length === 0 ? (
            <div className="empty-state">暂无待整改事件，提交一条巡检上报开始。</div>
          ) : (
            <div className="event-list">
              {openEvents.map((event) => (
                <EventCard
                  key={event.id}
                  event={event}
                  now={now}
                  expanded={Boolean(expanded[event.id])}
                  onToggle={() =>
                    setExpanded((prev) => ({ ...prev, [event.id]: !prev[event.id] }))
                  }
                  onClose={() => closeOne(event.id)}
                />
              ))}
            </div>
          )}
        </section>

        <section className="panel column">
          <div className="section-heading">
            <div>
              <p>已关闭</p>
              <h2>
                已关闭事件 <span className="count-badge muted-badge">{closedEvents.length}</span>
              </h2>
            </div>
          </div>
          {closedEvents.length === 0 ? (
            <div className="empty-state">尚无已关闭整改单。</div>
          ) : (
            <div className="event-list">
              {closedEvents.map((event) => (
                <EventCard
                  key={event.id}
                  event={event}
                  now={now}
                  expanded={Boolean(expanded[event.id])}
                  onToggle={() =>
                    setExpanded((prev) => ({ ...prev, [event.id]: !prev[event.id] }))
                  }
                />
              ))}
            </div>
          )}
        </section>
      </section>

      {toast && (
        <div className={`toast toast-${toast.kind}`} role="status">
          {toast.text}
        </div>
      )}
    </main>
  );
}

function EventCard({
  event,
  now,
  expanded,
  onToggle,
  onClose,
}: {
  event: Incident;
  now: Date;
  expanded: boolean;
  onToggle: () => void;
  onClose?: () => void;
}) {
  const rule = defectRuleOf(event.defectCode);
  const overdue = isOverdue(event, now);
  const remaining = event.status === "open" ? formatRemaining(event.deadline, now) : null;
  const sortedReports = useMemo(
    () => event.reports.slice().sort((a, b) => a.occurredAt.localeCompare(b.occurredAt)),
    [event.reports]
  );

  return (
    <article
      className={[
        "event-card",
        event.status === "closed" ? "is-closed" : "",
        overdue ? "is-overdue" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <button type="button" className="card-main" onClick={onToggle}>
        <div className="card-title">
          <span className="event-id">{event.id}</span>
          {event.reports.length > 1 && (
            <span className="merge-badge" title="被归并的续报次数">
              {event.reports.length} 次上报
            </span>
          )}
          {rule && <span className={`sev sev-${rule.severity}`}>{SEVERITY_LABEL[rule.severity]}</span>}
          {overdue && <span className="overdue-flag">逾期</span>}
        </div>
        <h3>
          {event.room} · {event.equipment}
        </h3>
        <p className="code-line">
          {event.defectCode}
          {rule ? ` · ${rule.name}` : ""}
        </p>
        <dl className="card-meta">
          <div>
            <dt>首报发生</dt>
            <dd>{formatDateTime(firstReportAt(event))}</dd>
          </div>
          <div>
            <dt>整改期限</dt>
            <dd className={overdue ? "danger-text" : ""}>
              {formatDateTime(event.deadline)}
              {remaining && (
                <span className={remaining.overdue ? "danger-text" : "fine-text"}>
                  （{remaining.text}）
                </span>
              )}
            </dd>
          </div>
          {event.status === "closed" && (
            <div>
              <dt>关闭时间</dt>
              <dd>{formatDateTime(event.closedAt)}</dd>
            </div>
          )}
        </dl>
        <span className="expand-hint">{expanded ? "收起上报明细 ▲" : "展开每次上报 ▼"}</span>
      </button>

      {expanded && (
        <div className="report-detail">
          <ol>
            {sortedReports.map((report, index) => (
              <li key={report.id}>
                <div className="report-head">
                  <span>
                    第 {index + 1} 次 · 发生 {formatDateTime(report.occurredAt)}
                  </span>
                  <span className="fine-text">登记 {formatDateTime(report.recordedAt)}</span>
                </div>
                <p>{report.phenomenon}</p>
              </li>
            ))}
          </ol>
          {onClose && (
            <button type="button" className="close-action" onClick={onClose}>
              关闭整改单（旧期限冻结）
            </button>
          )}
        </div>
      )}
    </article>
  );
}
