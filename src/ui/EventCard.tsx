import { useState } from "react";
import { dueState } from "../rules/engine";
import type { DefectEvent } from "../rules/types";
import { fmtDateTime, fmtRemain } from "./format";

interface Props {
  event: DefectEvent;
  nowIso: string;
  expanded: boolean;
  onToggle: () => void;
  /** 返回 null 表示成功，否则为错误信息 */
  onClose: (eventId: string, note: string) => string | null;
}

function statusBadge(e: DefectEvent, nowIso: string) {
  if (e.status === "closed") return { cls: "badge-closed", text: "已关闭" };
  switch (dueState(e, nowIso)) {
    case "overdue":
      return { cls: "badge-overdue", text: "已超期" };
    case "due24h":
      return { cls: "badge-due", text: "24h 内到期" };
    default:
      return { cls: "badge-open", text: "整改中" };
  }
}

export function EventCard({ event: e, nowIso, expanded, onToggle, onClose }: Props) {
  const [note, setNote] = useState("");
  const [closeError, setCloseError] = useState<string | null>(null);
  const badge = statusBadge(e, nowIso);

  const handleClose = () => {
    const err = onClose(e.id, note);
    if (err) {
      setCloseError(err);
    } else {
      setNote("");
      setCloseError(null);
    }
  };

  return (
    <article className={`event-card card-${badge.cls}`}>
      <header className="event-head" onClick={onToggle}>
        <div className="event-title">
          <span className={`badge ${badge.cls}`}>{badge.text}</span>
          <h3>
            {e.room} · {e.equipment}
          </h3>
        </div>
        <button className="expand-btn" type="button">
          {e.reports.length} 次上报 {expanded ? "▲" : "▼"}
        </button>
      </header>

      <div className="event-code">
        <span className="code-chip">{e.defectCode}</span>
        <span>{e.defectName}</span>
        <span className="sla">期限 {e.slaHours}h</span>
      </div>

      <dl className="event-meta">
        <div>
          <dt>首例发生</dt>
          <dd>{fmtDateTime(e.firstOccurredAt)}</dd>
        </div>
        <div>
          <dt>整改期限</dt>
          <dd>
            {fmtDateTime(e.deadline)}
            {e.status === "open" && (
              <em className={dueState(e, nowIso)}>
                （{fmtRemain(e.deadline, nowIso)}）
              </em>
            )}
          </dd>
        </div>
      </dl>

      {expanded && (
        <div className="event-body">
          <ol className="report-timeline">
            {e.reports.map((r, i) => (
              <li key={r.id}>
                <div className="report-dot" />
                <div className="report-item">
                  <p className="report-head">
                    <strong>第 {i + 1} 次上报</strong>
                    <span>{r.id}</span>
                  </p>
                  <p className="report-time">
                    发生 {fmtDateTime(r.occurredAt)} · 录入 {fmtDateTime(r.reportedAt)}
                  </p>
                  <p className="report-text">{r.phenomenon}</p>
                </div>
              </li>
            ))}
          </ol>

          {e.status === "open" ? (
            <div className="close-box">
              <textarea
                rows={2}
                value={note}
                onChange={(ev) => setNote(ev.target.value)}
                placeholder="填写整改说明后关单（关单后同三项再报将另开事件，本单期限不再变动）"
              />
              {closeError && <p className="form-error">{closeError}</p>}
              <button type="button" className="close-btn" onClick={handleClose}>
                关闭整改单
              </button>
            </div>
          ) : (
            <div className="closed-box">
              <p className="report-head">
                <strong>整改单已关闭</strong>
                <span>{fmtDateTime(e.closedAt ?? "")}</span>
              </p>
              <p className="report-text">{e.closeNote}</p>
              <p className="hint">本单关闭时间与期限已冻结；同三项再报已另开事件。</p>
            </div>
          )}
        </div>
      )}
    </article>
  );
}
