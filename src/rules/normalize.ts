// 归并口径：三项如何算作"相同"

export function normalizeRoom(raw: string): string {
  return raw.trim().replace(/\s+/g, " ").toUpperCase();
}

export function normalizeEquipment(raw: string): string {
  return raw.trim().replace(/\s+/g, " ").toUpperCase();
}

/** 缺陷代码：去空白（含全角空格）、统一大写 */
export function normalizeDefectCode(raw: string): string {
  return raw.trim().replace(/[\s　]+/g, "").toUpperCase();
}

export interface EventKeyParts {
  room: string;
  equipment: string;
  defectCode: string;
}

/** 归并键：房间 | 设备 | 缺陷代码 */
export function eventKey(parts: EventKeyParts): string {
  return [parts.room, parts.equipment, parts.defectCode].join("|");
}
