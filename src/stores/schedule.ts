import { computed, ref, watch } from "vue";
import { defineStore } from "pinia";
import dayjs from "dayjs";
import type {
  Conflict,
  Equipment,
  HistoryEntry,
  Location,
  OfflineDraft,
  Receipt,
  ReceiptInspection,
  ReceiptKind,
  ReceiptRef,
  ReceiptVoidReason,
  Role,
  Scene,
  SceneStatus,
  Talent,
  Version
} from "../types";

const STORAGE_KEY = "pair-wise-yf-45/schedule-v2";
const DRAFT_KEY = "pair-wise-yf-45/offline-draft";

const talents: Talent[] = [
  { id: "t1", name: "林川", role: "男主" },
  { id: "t2", name: "周禾", role: "女主" },
  { id: "t3", name: "顾言", role: "配角" },
  { id: "t4", name: "孙宁", role: "群演领队" }
];

const locations: Location[] = [
  { id: "l1", name: "老码头" },
  { id: "l2", name: "玻璃厂房" },
  { id: "l3", name: "南站候车厅" }
];

const equipment: Equipment[] = [
  { id: "e1", name: "ARRI A机" },
  { id: "e2", name: "移动伸缩炮" },
  { id: "e3", name: "LED灯组" },
  { id: "e4", name: "跟拍车" }
];

const now = "2026-10-01T09:00:00.000Z";

const seedReceipts: Receipt[] = [
  { id: "r1", code: "RC-LOC-0801", kind: "场地", resourceId: "l1", validFrom: "2026-10-08", validTo: "2026-10-08", status: "有效", createdAt: now },
  { id: "r2", code: "RC-LOC-0903", kind: "场地", resourceId: "l3", validFrom: "2026-10-09", validTo: "2026-10-09", status: "有效", createdAt: now },
  { id: "r3", code: "RC-EQP-1008", kind: "器材", resourceId: "e1", validFrom: "2026-10-08", validTo: "2026-10-09", status: "有效", createdAt: now },
  { id: "r4", code: "RC-EQP-2008", kind: "器材", resourceId: "e2", validFrom: "2026-10-08", validTo: "2026-10-08", status: "有效", createdAt: now },
  { id: "r5", code: "RC-EQP-3008", kind: "器材", resourceId: "e3", validFrom: "2026-10-08", validTo: "2026-10-08", status: "有效", createdAt: now },
  { id: "r6", code: "RC-EQP-4008", kind: "器材", resourceId: "e4", validFrom: "2026-10-08", validTo: "2026-10-08", status: "有效", createdAt: now }
];

function refOf(kind: ReceiptKind, resourceId: string, receiptId: string, code: string, at = now): ReceiptRef {
  return { kind, resourceId, receiptId, code, active: true, at };
}

const seedScenes: Scene[] = [
  {
    id: "s1", code: "A-012", title: "码头交接", day: "2026-10-08", start: "08:00", end: "11:30",
    talentIds: ["t1", "t3"], locationId: "l1", equipmentIds: ["e1", "e3"], status: "已确认", locked: false,
    receipts: [refOf("场地", "l1", "r1", "RC-LOC-0801"), refOf("器材", "e1", "r3", "RC-EQP-1008"), refOf("器材", "e3", "r5", "RC-EQP-3008")]
  },
  {
    id: "s2", code: "A-013", title: "厂房追逐", day: "2026-10-08", start: "10:30", end: "13:00",
    talentIds: ["t1", "t2"], locationId: "l1", equipmentIds: ["e2", "e4"], status: "草稿", locked: false,
    receipts: [refOf("场地", "l1", "r1", "RC-LOC-0801"), refOf("器材", "e2", "r4", "RC-EQP-2008"), refOf("器材", "e4", "r6", "RC-EQP-4008")]
  },
  {
    id: "s3", code: "B-021", title: "候车厅告别", day: "2026-10-09", start: "15:00", end: "18:30",
    talentIds: ["t2", "t3"], locationId: "l3", equipmentIds: ["e1"], status: "草稿", locked: false,
    receipts: [refOf("场地", "l3", "r2", "RC-LOC-0903"), refOf("器材", "e1", "r3", "RC-EQP-1008")]
  }
];

interface PersistedState {
  scenes: Scene[];
  history: HistoryEntry[];
  versions: Version[];
  receipts: Receipt[];
}

function readState(): PersistedState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { scenes: structuredClone(seedScenes), history: [], versions: [], receipts: structuredClone(seedReceipts) };
    const parsed = JSON.parse(raw) as Partial<PersistedState>;
    return {
      scenes: (parsed.scenes ?? []).map((scene) => ({ ...scene, receipts: scene.receipts ?? [] })),
      history: parsed.history ?? [],
      versions: parsed.versions ?? [],
      receipts: parsed.receipts ?? structuredClone(seedReceipts)
    };
  } catch {
    return { scenes: structuredClone(seedScenes), history: [], versions: [], receipts: structuredClone(seedReceipts) };
  }
}

function minutes(value: string) {
  const [hour, minute] = value.split(":").map(Number);
  return hour * 60 + minute;
}

function overlaps(a: Scene, b: Scene) {
  return a.day === b.day && minutes(a.start) < minutes(b.end) && minutes(b.start) < minutes(a.end);
}

function shared(a: string[], b: string[]) {
  return a.some((value) => b.includes(value));
}

/** 已经开拍的场次保住现场，撤档/改期不影响 */
function isProtected(scene: Scene) {
  return scene.status === "拍摄中" || scene.status === "已完成";
}

export const useScheduleStore = defineStore("schedule", () => {
  const initial = readState();
  const scenes = ref<Scene[]>(initial.scenes);
  const history = ref<HistoryEntry[]>(initial.history);
  const versions = ref<Version[]>(initial.versions);
  const receipts = ref<Receipt[]>(initial.receipts);
  const role = ref<Role>("制片");
  const exemptions = ref<string[]>([]);
  const online = ref(navigator.onLine);
  const draft = ref<OfflineDraft | null>(null);

  const talentNames = (ids: string[]) => ids.map((id) => talents.find((item) => item.id === id)?.name ?? id);
  const locationName = (id: string) => locations.find((item) => item.id === id)?.name ?? id;
  const equipmentName = (id: string) => equipment.find((item) => item.id === id)?.name ?? id;
  const equipmentNames = (ids: string[]) => ids.map(equipmentName);
  const resourceName = (kind: ReceiptKind, resourceId: string) =>
    kind === "场地" ? locationName(resourceId) : equipmentName(resourceId);

  function inspectRef(scene: Scene, kind: ReceiptKind, resourceId: string): ReceiptInspection {
    const activeRef = scene.receipts.find((item) => item.active && item.kind === kind && item.resourceId === resourceId);
    const label = `${kind === "场地" ? "场地" : "器材"}「${resourceName(kind, resourceId)}」`;
    if (!activeRef) return { reason: "missing", level: "bad", text: `${label} 缺少档期回执，待挂接对账` };
    const receipt = receipts.value.find((item) => item.id === activeRef.receiptId);
    if (!receipt) return { reason: "missing", level: "bad", text: `${label} 的回执 ${activeRef.code} 已找不到记录`, ref: activeRef };
    if (receipt.status === "已撤档") return { reason: "withdrawn", level: "bad", text: `${label} 的回执 ${receipt.code} 已被供应商撤档`, ref: activeRef, receipt };
    if (receipt.status === "已改期") {
      const next = receipt.replacedById ? receipts.value.find((item) => item.id === receipt.replacedById) : undefined;
      return {
        reason: "rescheduled", level: "bad",
        text: `${label} 的回执 ${receipt.code} 已改期作废，需改挂新回执`,
        ref: activeRef, receipt, nextCode: next?.code
      };
    }
    if (scene.day < receipt.validFrom || scene.day > receipt.validTo) {
      return { reason: "window", level: "bad", text: `${label} 的回执 ${receipt.code} 有效期 ${receipt.validFrom} ~ ${receipt.validTo}，不覆盖拍摄日 ${scene.day}`, ref: activeRef, receipt };
    }
    return { reason: "ok", level: "ok", text: `${receipt.code}（有效期至 ${receipt.validTo}）`, ref: activeRef, receipt };
  }

  /** 场次当前需要对账的全部槽位：场地 1 个 + 每件器材各 1 个 */
  function sceneSlots(scene: Scene) {
    return [
      { kind: "场地" as ReceiptKind, resourceId: scene.locationId },
      ...scene.equipmentIds.map((resourceId) => ({ kind: "器材" as ReceiptKind, resourceId }))
    ];
  }

  const conflicts = computed<Conflict[]>(() => {
    const result: Conflict[] = [];
    for (let i = 0; i < scenes.value.length; i += 1) {
      for (let j = i + 1; j < scenes.value.length; j += 1) {
        const a = scenes.value[i];
        const b = scenes.value[j];
        if (!overlaps(a, b)) continue;
        const id = `${a.id}:${b.id}`;
        if (exemptions.value.includes(id)) continue;
        if (shared(a.talentIds, b.talentIds)) result.push({ id: `${id}:talent`, type: "演员档期", sceneIds: [a.id, b.id], message: `${talentNames(a.talentIds.filter((item) => b.talentIds.includes(item))).join("、")} 在两场戏中档期重叠`, severity: "高" });
        if (a.locationId === b.locationId) result.push({ id: `${id}:location`, type: "场地占用", sceneIds: [a.id, b.id], message: `${locationName(a.locationId)} 被同时占用`, severity: "高" });
        if (shared(a.equipmentIds, b.equipmentIds)) result.push({ id: `${id}:equipment`, type: "器材借用", sceneIds: [a.id, b.id], message: `${equipmentNames(a.equipmentIds.filter((item) => b.equipmentIds.includes(item))).join("、")} 发生借用重叠`, severity: "中" });
        if (a.locationId !== b.locationId && minutes(b.start) - minutes(a.end) < 30) result.push({ id: `${id}:transfer`, type: "转场时间", sceneIds: [a.id, b.id], message: "两个场地之间转场时间不足30分钟", severity: "中" });
      }
    }
    // 回执对账冲突：已开拍 / 已完成的场次保住现场，不进冲突中心
    for (const scene of scenes.value) {
      if (isProtected(scene)) continue;
      for (const slot of sceneSlots(scene)) {
        const check = inspectRef(scene, slot.kind, slot.resourceId);
        if (check.level === "ok") continue;
        const conflictId = `${scene.id}:receipt:${slot.kind}:${slot.resourceId}`;
        if (exemptions.value.includes(conflictId)) continue;
        const type = slot.kind === "场地" ? "场地回执" as const : "器材回执" as const;
        const suffix = check.reason === "missing" ? "请登记并挂接有效回执"
          : check.reason === "rescheduled" && check.nextCode ? `新回执 ${check.nextCode} 已到，请重新挂接`
          : check.reason === "withdrawn" ? "演员与车辆请勿照旧前往，先核对再拍"
          : "请重新核对档期";
        result.push({
          id: conflictId,
          type,
          sceneIds: [scene.id],
          message: `${scene.code} ${check.text}；${suffix}`,
          severity: slot.kind === "场地" ? "高" : "中"
        });
      }
    }
    return result;
  });

  const sortedScenes = computed(() => [...scenes.value].sort((a, b) => `${a.day} ${a.start}`.localeCompare(`${b.day} ${b.start}`)));

  function log(action: string, detail: string) {
    history.value.unshift({ id: crypto.randomUUID(), action, detail, time: new Date().toISOString() });
    history.value = history.value.slice(0, 80);
  }

  function persist() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ scenes: scenes.value, history: history.value, versions: versions.value, receipts: receipts.value }));
  }

  watch([scenes, history, versions, receipts], persist, { deep: true });

  function addScene(input: Omit<Scene, "id" | "status" | "locked" | "receipts">) {
    scenes.value.push({ ...input, id: crypto.randomUUID(), status: "草稿", locked: false, receipts: [] });
    log("新增场次", `${input.code} ${input.title}，回执待挂接对账`);
  }

  function updateStatus(id: string, status: SceneStatus) {
    const scene = scenes.value.find((item) => item.id === id);
    if (!scene || scene.locked) return;
    scene.status = status;
    log("流转状态", `${scene.code} → ${status}`);
  }

  function toggleLock(id: string) {
    const scene = scenes.value.find((item) => item.id === id);
    if (!scene) return;
    scene.locked = !scene.locked;
    log(scene.locked ? "锁定场次" : "解锁场次", scene.code);
  }

  function moveScene(from: number, to: number) {
    if (from === to || to < 0 || to >= scenes.value.length) return;
    const [item] = scenes.value.splice(from, 1);
    scenes.value.splice(to, 0, item);
    log("调整顺序", `${item.code} 移至第 ${to + 1} 位`);
  }

  /** 可挂接到某槽位的回执：资源一致、状态有效、有效期覆盖拍摄日 */
  function eligibleReceipts(kind: ReceiptKind, resourceId: string, day: string) {
    return receipts.value.filter(
      (item) => item.kind === kind && item.resourceId === resourceId && item.status === "有效" && day >= item.validFrom && day <= item.validTo
    );
  }

  function attachReceipt(sceneId: string, kind: ReceiptKind, resourceId: string, receiptId: string) {
    const scene = scenes.value.find((item) => item.id === sceneId);
    const receipt = receipts.value.find((item) => item.id === receiptId);
    if (!scene || !receipt) return;
    if (receipt.kind !== kind || receipt.resourceId !== resourceId || receipt.status !== "有效") return;
    if (scene.day < receipt.validFrom || scene.day > receipt.validTo) return;
    const current = scene.receipts.find((item) => item.active && item.kind === kind && item.resourceId === resourceId);
    if (current) {
      if (current.receiptId === receiptId) return;
      current.active = false;
      current.voidReason = "回执替换";
    }
    scene.receipts.push({ kind, resourceId, receiptId, code: receipt.code, active: true, at: new Date().toISOString() });
    log("挂接回执", `${scene.code} ${kind}「${resourceName(kind, resourceId)}」→ ${receipt.code}（有效期 ${receipt.validFrom} ~ ${receipt.validTo}）`);
  }

  function registerReceipt(input: Omit<Receipt, "id" | "status" | "createdAt">) {
    const receipt: Receipt = { ...input, id: crypto.randomUUID(), status: "有效", createdAt: new Date().toISOString() };
    receipts.value.unshift(receipt);
    log("登记回执", `${input.code} ${input.kind}「${resourceName(input.kind, input.resourceId)}」有效期 ${input.validFrom} ~ ${input.validTo}`);
  }

  /** 撤档到达：未开拍场次退回待核对并进冲突中心；已开拍的保住现场 */
  function withdrawReceipt(receiptId: string) {
    const receipt = receipts.value.find((item) => item.id === receiptId);
    if (!receipt || receipt.status !== "有效") return;
    receipt.status = "已撤档";
    const affected = scenes.value.filter((scene) => scene.receipts.some((item) => item.active && item.receiptId === receiptId));
    const bounced: string[] = [];
    const held: string[] = [];
    for (const scene of affected) {
      if (isProtected(scene)) {
        held.push(scene.code);
      } else {
        scene.status = "待核对";
        bounced.push(scene.code);
      }
    }
    log(
      "供应商撤档",
      `${receipt.kind}「${resourceName(receipt.kind, receipt.resourceId)}」回执 ${receipt.code} 作废；` +
        `退回待核对：${bounced.join("、") || "无"}；已开拍保住现场：${held.join("、") || "无"}`
    );
  }

  /**
   * 改期到达：旧回执标记"已改期"并生成新编号，不自动顶替。
   * 引用旧回执的未开拍场次退回待核对、进冲突中心，需手动挂接新回执。
   */
  function rescheduleReceipt(receiptId: string, patch: Pick<Receipt, "validFrom" | "validTo"> & { code: string }) {
    const old = receipts.value.find((item) => item.id === receiptId);
    if (!old || old.status !== "有效") return;
    const next: Receipt = {
      id: crypto.randomUUID(),
      code: patch.code,
      kind: old.kind,
      resourceId: old.resourceId,
      validFrom: patch.validFrom,
      validTo: patch.validTo,
      status: "有效",
      createdAt: new Date().toISOString()
    };
    receipts.value.unshift(next);
    old.status = "已改期";
    old.replacedById = next.id;
    const affected = scenes.value.filter((scene) => scene.receipts.some((item) => item.active && item.receiptId === old.id));
    const bounced: string[] = [];
    const held: string[] = [];
    for (const scene of affected) {
      if (isProtected(scene)) held.push(scene.code);
      else {
        scene.status = "待核对";
        bounced.push(scene.code);
      }
    }
    log(
      "供应商改期",
      `${old.kind}「${resourceName(old.kind, old.resourceId)}」回执 ${old.code} → 新编号 ${next.code}（${next.validFrom} ~ ${next.validTo}）；` +
        `退回待核对：${bounced.join("、") || "无"}；已开拍保住现场：${held.join("、") || "无"}；旧编号不得顶替`
    );
  }

  /**
   * 场次改动：时间一变，场地与全部器材回执作废；场地变只作废场地回执；
   * 器材增减只作废对应器材回执。旧记录留痕，不能拿旧编号顶替。
   */
  function editScene(id: string, patch: Partial<Pick<Scene, "day" | "start" | "end" | "locationId" | "equipmentIds" | "talentIds" | "title">>) {
    const scene = scenes.value.find((item) => item.id === id);
    if (!scene || scene.locked || isProtected(scene)) return;
    const voided: ReceiptVoidReason[] = [];
    const timeChanged =
      (patch.day !== undefined && patch.day !== scene.day) ||
      (patch.start !== undefined && patch.start !== scene.start) ||
      (patch.end !== undefined && patch.end !== scene.end);
    const locationChanged = patch.locationId !== undefined && patch.locationId !== scene.locationId;
    const equipmentChanged = patch.equipmentIds !== undefined;
    const removedEquip = equipmentChanged ? scene.equipmentIds.filter((resourceId) => !patch.equipmentIds!.includes(resourceId)) : [];

    function voidRefs(match: (item: ReceiptRef) => boolean, reason: ReceiptVoidReason) {
      const refs = scene!.receipts;
      for (const ref of refs) {
        if (ref.active && match(ref)) {
          ref.active = false;
          ref.voidReason = reason;
          if (!voided.includes(reason)) voided.push(reason);
        }
      }
    }

    if (timeChanged) voidRefs(() => true, "场次改期");
    if (locationChanged || timeChanged) voidRefs((item) => item.kind === "场地", timeChanged ? "场次改期" : "场地变更");
    if (equipmentChanged || timeChanged) {
      voidRefs(
        (item) =>
          item.kind === "器材" &&
          (timeChanged || !patch.equipmentIds!.includes(item.resourceId)),
        timeChanged ? "场次改期" : "器材变更"
      );
    }

    Object.assign(scene, patch);
    if (voided.length && scene.status !== "草稿") scene.status = "待核对";
    const reasonText = voided.includes("场次改期") ? "时间变动，全部旧回执作废"
      : locationChanged ? "场地变更，场地旧回执作废"
      : equipmentChanged ? `器材调整（移除：${removedEquip.map(equipmentName).join("、") || "无"}），对应旧回执作废`
      : voided.join("、");
    log("调整场次", `${scene.code}：${reasonText || "信息更新"}${voided.length ? "，旧编号不得顶替" : ""}`);
  }

  function snapshot(name = `版本 ${versions.value.length + 1}`) {
    versions.value.unshift({ id: crypto.randomUUID(), name, time: new Date().toISOString(), scenes: structuredClone(scenes.value) });
    versions.value = versions.value.slice(0, 12);
    log("保存版本", name);
  }

  function restore(id: string) {
    const version = versions.value.find((item) => item.id === id);
    if (!version) return;
    scenes.value = structuredClone(version.scenes);
    log("恢复版本", version.name);
  }

  function saveDraft() {
    draft.value = { scenes: structuredClone(scenes.value), savedAt: new Date().toISOString() };
    localStorage.setItem(DRAFT_KEY, JSON.stringify(draft.value));
    log("保存离线草稿", dayjs(draft.value.savedAt).format("MM-DD HH:mm"));
  }

  function loadDraft() {
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      draft.value = raw ? JSON.parse(raw) as OfflineDraft : null;
    } catch {
      draft.value = null;
    }
  }

  function syncDraft() {
    if (!draft.value) return;
    scenes.value = structuredClone(draft.value.scenes);
    log("同步离线草稿", `同步 ${draft.value.scenes.length} 个场次`);
    draft.value = null;
    localStorage.removeItem(DRAFT_KEY);
  }

  function exempt(id: string) {
    exemptions.value.push(id);
    log("豁免冲突", id);
  }

  function setOnline(value: boolean) {
    online.value = value;
  }

  return {
    scenes, sortedScenes, conflicts, history, versions, receipts, role, exemptions, online, draft,
    talents, locations, equipment,
    talentNames, equipmentNames, equipmentName, locationName, resourceName,
    sceneSlots, inspectRef, eligibleReceipts, isProtected,
    addScene, updateStatus, toggleLock, moveScene, editScene,
    attachReceipt, registerReceipt, withdrawReceipt, rescheduleReceipt,
    snapshot, restore, saveDraft, loadDraft, syncDraft, exempt, setOnline
  };
});
