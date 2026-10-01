export type Role = "制片" | "导演" | "演员统筹" | "场记";
export type SceneStatus = "草稿" | "待核对" | "已确认" | "拍摄中" | "已完成";
export type ConflictType = "演员档期" | "场地占用" | "器材借用" | "转场时间" | "场地回执" | "器材回执";

export interface Talent {
  id: string;
  name: string;
  role: string;
}

export interface Location {
  id: string;
  name: string;
}

export interface Equipment {
  id: string;
  name: string;
}

export type ReceiptKind = "场地" | "器材";
export type ReceiptStatus = "有效" | "已撤档" | "已改期";
export type ReceiptVoidReason = "场次改期" | "场地变更" | "器材变更" | "回执替换";

/** 供应商（场地 / 器材）回传的档期回执 */
export interface Receipt {
  id: string;
  /** 回执编号，撤档或改期后旧编号即作废，不得顶替 */
  code: string;
  kind: ReceiptKind;
  /** kind 为场地时指向 Location.id，器材时指向 Equipment.id */
  resourceId: string;
  /** 有效期，按拍摄日（YYYY-MM-DD）核对覆盖关系 */
  validFrom: string;
  validTo: string;
  status: ReceiptStatus;
  /** 改期时指向新回执，用于对账提示"新编号待重挂" */
  replacedById?: string;
  createdAt: string;
}

/** 场次对某条回执的挂接记录；旧记录作废留痕，不删除 */
export interface ReceiptRef {
  kind: ReceiptKind;
  resourceId: string;
  receiptId: string;
  /** 挂接时的回执编号快照 */
  code: string;
  active: boolean;
  voidReason?: ReceiptVoidReason;
  at: string;
}

export interface Scene {
  id: string;
  code: string;
  title: string;
  day: string;
  start: string;
  end: string;
  talentIds: string[];
  locationId: string;
  equipmentIds: string[];
  /** 场地 1 条 + 每件器材各 1 条的回执对账挂接 */
  receipts: ReceiptRef[];
  status: SceneStatus;
  locked: boolean;
}

export interface Conflict {
  id: string;
  type: ConflictType;
  sceneIds: string[];
  message: string;
  severity: "高" | "中";
}

export interface ReceiptInspection {
  reason: "missing" | "withdrawn" | "rescheduled" | "window" | "ok";
  level: "ok" | "warn" | "bad";
  text: string;
  ref?: ReceiptRef;
  receipt?: Receipt;
  nextCode?: string;
}

export interface HistoryEntry {
  id: string;
  action: string;
  detail: string;
  time: string;
}

export interface Version {
  id: string;
  name: string;
  time: string;
  scenes: Scene[];
}

export interface OfflineDraft {
  scenes: Scene[];
  savedAt: string;
}
