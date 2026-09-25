import { useMemo, useState } from "react";
import { DEFAULT_SLA_HOURS, DEFECT_CATALOG } from "../rules/catalog";
import type { ReportInput } from "../rules/types";
import { toLocalInputValue } from "./format";

export interface MergePeek {
  willMerge: boolean;
  eventId?: string;
  reportCount?: number;
}

interface Props {
  /** 返回 null 表示成功，否则为错误信息 */
  onSubmit: (input: ReportInput) => string | null;
  /** 根据当前三项预判会归并还是另开 */
  peekMerge: (room: string, equipment: string, code: string) => MergePeek | null;
}

const CUSTOM = "__custom__";

export function EntryForm({ onSubmit, peekMerge }: Props) {
  const [room, setRoom] = useState("");
  const [equipment, setEquipment] = useState("");
  const [codeSelect, setCodeSelect] = useState("");
  const [customCode, setCustomCode] = useState("");
  const [occurredAt, setOccurredAt] = useState(() => toLocalInputValue(new Date()));
  const [phenomenon, setPhenomenon] = useState("");
  const [error, setError] = useState<string | null>(null);

  const effectiveCode = codeSelect === CUSTOM ? customCode : codeSelect;
  const defect = DEFECT_CATALOG.find((d) => d.code === effectiveCode);
  const slaHours = defect ? defect.slaHours : DEFAULT_SLA_HOURS;

  const peek = useMemo(
    () => peekMerge(room, equipment, effectiveCode),
    [peekMerge, room, equipment, effectiveCode]
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const err = onSubmit({
      room,
      equipment,
      defectCode: effectiveCode,
      occurredAt,
      phenomenon,
    });
    if (err) {
      setError(err);
      return;
    }
    setError(null);
    // 保留房间与设备，方便同点位连续录入；重置代码与现象
    setCodeSelect("");
    setCustomCode("");
    setPhenomenon("");
    setOccurredAt(toLocalInputValue(new Date()));
  };

  return (
    <form className="panel entry-form" onSubmit={handleSubmit}>
      <div className="section-heading">
        <div>
          <p>巡检录入</p>
          <h2>上报异常</h2>
        </div>
      </div>

      <label>
        <span>房间编号</span>
        <input
          value={room}
          onChange={(e) => setRoom(e.target.value)}
          placeholder="如 CR-1201"
        />
      </label>

      <label>
        <span>设备编号</span>
        <input
          value={equipment}
          onChange={(e) => setEquipment(e.target.value)}
          placeholder="如 FFU-A07"
        />
      </label>

      <label>
        <span>缺陷代码</span>
        <select value={codeSelect} onChange={(e) => setCodeSelect(e.target.value)}>
          <option value="">请选择…</option>
          {DEFECT_CATALOG.map((d) => (
            <option key={d.code} value={d.code}>
              {d.code} · {d.name}
            </option>
          ))}
          <option value={CUSTOM}>自定义代码…</option>
        </select>
      </label>

      {codeSelect === CUSTOM && (
        <label>
          <span>自定义代码</span>
          <input
            value={customCode}
            onChange={(e) => setCustomCode(e.target.value)}
            placeholder="如 ALM-09"
          />
        </label>
      )}

      <label>
        <span>发生时刻</span>
        <input
          type="datetime-local"
          value={occurredAt}
          onChange={(e) => setOccurredAt(e.target.value)}
        />
      </label>

      <label>
        <span>原始现象</span>
        <textarea
          rows={3}
          value={phenomenon}
          onChange={(e) => setPhenomenon(e.target.value)}
          placeholder="如实记录读数、位置、现象，不要合并改写"
        />
      </label>

      {effectiveCode && (
        <p className="hint">
          整改期限 {slaHours} 小时，自首例发生时刻起算；续报归入同一事件，期限不顺延。
        </p>
      )}

      {peek && peek.willMerge && (
        <p className="hint hint-merge">
          将并入进行中的 {peek.eventId}（已有 {peek.reportCount} 次上报），本次上报会保留。
        </p>
      )}
      {peek && !peek.willMerge && (
        <p className="hint hint-new">无相同三项的进行中事件，将另开新事件。</p>
      )}

      {error && <p className="form-error">{error}</p>}

      <button type="submit" className="primary-action">
        提交上报
      </button>
    </form>
  );
}
