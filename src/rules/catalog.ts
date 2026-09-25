// 资料规则：缺陷代码字典与整改期限（SLA）
// 纯资料，无副作用；页面与归并引擎都从这里取数。

export interface DefectDef {
  code: string;
  name: string;
  /** 整改期限（小时），自首例发生时刻起算 */
  slaHours: number;
}

/** 字典外的自定义代码统一适用的默认期限 */
export const DEFAULT_SLA_HOURS = 72;

export const DEFECT_CATALOG: DefectDef[] = [
  { code: "PRT-01", name: "悬浮粒子超限", slaHours: 24 },
  { code: "DPD-01", name: "静压差偏离", slaHours: 24 },
  { code: "TH-01", name: "温湿度偏移", slaHours: 48 },
  { code: "HEPA-01", name: "高效过滤器泄漏", slaHours: 72 },
  { code: "CLN-01", name: "表面清洁不达标", slaHours: 24 },
  { code: "EQP-01", name: "设备跑冒滴漏", slaHours: 48 },
];

export function lookupDefect(normalizedCode: string): DefectDef {
  const found = DEFECT_CATALOG.find((d) => d.code === normalizedCode);
  return found ?? { code: normalizedCode, name: "自定义缺陷", slaHours: DEFAULT_SLA_HOURS };
}
