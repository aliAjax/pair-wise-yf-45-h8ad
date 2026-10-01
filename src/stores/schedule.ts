import { computed, ref, watch } from "vue";
import { defineStore } from "pinia";
import dayjs from "dayjs";
import type { Conflict, Equipment, HistoryEntry, Location, OfflineDraft, Receipt, ReceiptType, Role, Scene, SceneStatus, Talent, Version } from "../types";

const STORAGE_KEY = "pair-wise-yf-45/schedule-v1";
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

const seedScenes: Scene[] = [
  { id: "s1", code: "A-012", title: "码头交接", day: "2026-10-08", start: "08:00", end: "11:30", talentIds: ["t1", "t3"], locationId: "l1", equipmentIds: ["e1", "e3"], status: "已确认", locked: false, venueReceiptId: "r1", equipmentReceiptIds: ["r2", "r3"] },
  { id: "s2", code: "A-013", title: "厂房追逐", day: "2026-10-08", start: "10:30", end: "13:00", talentIds: ["t1", "t2"], locationId: "l1", equipmentIds: ["e2", "e4"], status: "草稿", locked: false, equipmentReceiptIds: [] },
  { id: "s3", code: "B-021", title: "候车厅告别", day: "2026-10-09", start: "15:00", end: "18:30", talentIds: ["t2", "t3"], locationId: "l3", equipmentIds: ["e1"], status: "草稿", locked: false, equipmentReceiptIds: [] }
];

const seedReceipts: Receipt[] = [
  { id: "r1", code: "V-20261008-001", type: "场地", resourceId: "l1", sceneId: "s1", validFrom: dayjs("2026-10-08T08:00").toISOString(), validTo: dayjs("2026-10-08T11:30").toISOString(), status: "有效", issuedAt: dayjs("2026-10-07T10:00").toISOString() },
  { id: "r2", code: "E-20261008-001", type: "器材", resourceId: "e1", sceneId: "s1", validFrom: dayjs("2026-10-08T08:00").toISOString(), validTo: dayjs("2026-10-08T11:30").toISOString(), status: "有效", issuedAt: dayjs("2026-10-07T10:05").toISOString() },
  { id: "r3", code: "E-20261008-002", type: "器材", resourceId: "e3", sceneId: "s1", validFrom: dayjs("2026-10-08T08:00").toISOString(), validTo: dayjs("2026-10-08T11:30").toISOString(), status: "有效", issuedAt: dayjs("2026-10-07T10:06").toISOString() }
];

function readScenes(): Scene[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return (parsed.scenes as Scene[]).map((scene) => ({ ...scene, equipmentReceiptIds: scene.equipmentReceiptIds ?? [] }));
    }
    return structuredClone(seedScenes);
  } catch {
    return structuredClone(seedScenes);
  }
}

function readReceipts(): Receipt[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw).receipts as Receipt[]) : structuredClone(seedReceipts);
  } catch {
    return structuredClone(seedReceipts);
  }
}

function readHistory(): HistoryEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw).history as HistoryEntry[] : [];
  } catch {
    return [];
  }
}

function readVersions(): Version[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw).versions as Version[] : [];
  } catch {
    return [];
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

function sceneWindow(scene: Scene) {
  return {
    from: dayjs(`${scene.day}T${scene.start}`),
    to: dayjs(`${scene.day}T${scene.end}`)
  };
}

export const useScheduleStore = defineStore("schedule", () => {
  const scenes = ref<Scene[]>(readScenes());
  const receipts = ref<Receipt[]>(readReceipts());
  const history = ref<HistoryEntry[]>(readHistory());
  const versions = ref<Version[]>(readVersions());
  const role = ref<Role>("制片");
  const exemptions = ref<string[]>([]);
  const online = ref(navigator.onLine);
  const draft = ref<OfflineDraft | null>(null);

  const talentNames = (ids: string[]) => ids.map((id) => talents.find((item) => item.id === id)?.name ?? id);
  const locationName = (id: string) => locations.find((item) => item.id === id)?.name ?? id;
  const equipmentNames = (ids: string[]) => ids.map((id) => equipment.find((item) => item.id === id)?.name ?? id);
  const equipmentName = (id: string) => equipment.find((item) => item.id === id)?.name ?? id;

  const receiptById = (id?: string) => receipts.value.find((item) => item.id === id);
  const venueReceiptOf = (scene: Scene) => receiptById(scene.venueReceiptId);
  const equipmentReceiptOf = (scene: Scene, equipmentId: string) =>
    receipts.value.find((item) => item.type === "器材" && item.sceneId === scene.id && item.resourceId === equipmentId && scene.equipmentReceiptIds.includes(item.id));

  function receiptCoversScene(receipt: Receipt | undefined, scene: Scene, resourceId: string): boolean {
    if (!receipt || receipt.status !== "有效") return false;
    if (receipt.resourceId !== resourceId) return false;
    const { from, to } = sceneWindow(scene);
    const validFrom = dayjs(receipt.validFrom);
    const validTo = dayjs(receipt.validTo);
    return (from.isSame(validFrom) || from.isAfter(validFrom)) && (to.isSame(validTo) || to.isBefore(validTo));
  }

  function sceneReconciled(scene: Scene): boolean {
    if (scene.status === "拍摄中" || scene.status === "已完成") return true;
    const venue = venueReceiptOf(scene);
    if (!receiptCoversScene(venue, scene, scene.locationId)) return false;
    for (const equipmentId of scene.equipmentIds) {
      if (!receiptCoversScene(equipmentReceiptOf(scene, equipmentId), scene, equipmentId)) return false;
    }
    return true;
  }

  function receiptIssues(scene: Scene): string[] {
    const issues: string[] = [];
    const venue = venueReceiptOf(scene);
    if (!receiptCoversScene(venue, scene, scene.locationId)) {
      issues.push(venue ? "场地回执已失效" : "缺场地回执");
    }
    for (const equipmentId of scene.equipmentIds) {
      const receipt = equipmentReceiptOf(scene, equipmentId);
      if (!receiptCoversScene(receipt, scene, equipmentId)) {
        issues.push(`${equipmentName(equipmentId) ?? equipmentId}${receipt ? "回执已失效" : "缺回执"}`);
      }
    }
    return issues;
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
    for (const scene of scenes.value) {
      if (scene.status === "拍摄中" || scene.status === "已完成") continue;
      if (scene.status === "草稿") continue;
      if (sceneReconciled(scene)) continue;
      result.push({
        id: `receipt:${scene.id}`,
        type: "回执异常",
        sceneIds: [scene.id],
        message: `${scene.code} ${receiptIssues(scene).join("、")}`,
        severity: "高"
      });
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

  function addScene(input: Omit<Scene, "id" | "status" | "locked" | "venueReceiptId" | "equipmentReceiptIds">) {
    scenes.value.push({ ...input, id: crypto.randomUUID(), status: "草稿", locked: false, equipmentReceiptIds: [] });
    log("新增场次", `${input.code} ${input.title}`);
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

  function snapshot(name = `版本 ${versions.value.length + 1}`) {
    versions.value.unshift({ id: crypto.randomUUID(), name, time: new Date().toISOString(), scenes: structuredClone(scenes.value) });
    versions.value = versions.value.slice(0, 12);
    log("保存版本", name);
  }

  function restore(id: string) {
    const version = versions.value.find((item) => item.id === id);
    if (!version) return;
    scenes.value = structuredClone(version.scenes);
    reconcileAll();
    log("恢复版本", version.name);
  }

  function saveDraft() {
    const value: OfflineDraft = { scenes: structuredClone(scenes.value), savedAt: new Date().toISOString() };
    draft.value = value;
    localStorage.setItem(DRAFT_KEY, JSON.stringify(value));
    log("保存离线草稿", dayjs(value.savedAt).format("MM-DD HH:mm"));
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
    const count = draft.value.scenes.length;
    scenes.value = structuredClone(draft.value.scenes);
    draft.value = null;
    localStorage.removeItem(DRAFT_KEY);
    log("同步离线草稿", `同步 ${count} 个场次`);
  }

  function exempt(id: string) {
    exemptions.value.push(id);
    log("豁免冲突", id);
  }

  function setOnline(value: boolean) {
    online.value = value;
  }

  function nextReceiptCode(type: ReceiptType): string {
    const prefix = type === "场地" ? "V" : "E";
    const date = dayjs().format("YYYYMMDD");
    const count = receipts.value.filter((item) => item.type === type && dayjs(item.issuedAt).format("YYYYMMDD") === date).length + 1;
    return `${prefix}-${date}-${String(count).padStart(3, "0")}`;
  }

  function voidReceiptsForScene(scene: Scene) {
    for (const receipt of receipts.value) {
      if (receipt.sceneId === scene.id && receipt.status === "有效") {
        receipt.status = "作废";
      }
    }
    scene.venueReceiptId = undefined;
    scene.equipmentReceiptIds = [];
  }

  function issueReceipt(sceneId: string, type: ReceiptType, resourceId?: string) {
    const scene = scenes.value.find((item) => item.id === sceneId);
    if (!scene) return;
    const targetResource = type === "场地" ? scene.locationId : resourceId;
    if (!targetResource) return;
    for (const receipt of receipts.value) {
      if (receipt.sceneId === sceneId && receipt.type === type && receipt.resourceId === targetResource && receipt.status === "有效") {
        receipt.status = "作废";
      }
    }
    const { from, to } = sceneWindow(scene);
    const receipt: Receipt = {
      id: crypto.randomUUID(),
      code: nextReceiptCode(type),
      type,
      resourceId: targetResource,
      sceneId,
      validFrom: from.toISOString(),
      validTo: to.toISOString(),
      status: "有效",
      issuedAt: new Date().toISOString()
    };
    receipts.value.push(receipt);
    if (type === "场地") {
      scene.venueReceiptId = receipt.id;
    } else {
      scene.equipmentReceiptIds.push(receipt.id);
    }
    if (scene.status === "待核对" && sceneReconciled(scene)) {
      scene.status = "已确认";
    }
    const resourceLabel = type === "场地" ? locationName(targetResource) : equipmentName(targetResource);
    log("开具回执", `${scene.code} ${type}回执 ${receipt.code}（${resourceLabel}）`);
  }

  function referencingScenes(receipt: Receipt): Scene[] {
    return scenes.value.filter((scene) =>
      scene.venueReceiptId === receipt.id || scene.equipmentReceiptIds.includes(receipt.id)
    );
  }

  function cancelReceipt(receiptId: string) {
    const receipt = receipts.value.find((item) => item.id === receiptId);
    if (!receipt || receipt.status === "作废") return;
    receipt.status = "作废";
    for (const scene of referencingScenes(receipt)) {
      if (scene.status === "拍摄中" || scene.status === "已完成") continue;
      if (scene.venueReceiptId === receipt.id) scene.venueReceiptId = undefined;
      scene.equipmentReceiptIds = scene.equipmentReceiptIds.filter((id) => id !== receipt.id);
      scene.status = "待核对";
    }
    log("撤档作废", `${receipt.code} 已作废，引用场次退回待核对`);
  }

  function rescheduleReceipt(receiptId: string, validFrom: string, validTo: string) {
    const receipt = receipts.value.find((item) => item.id === receiptId);
    if (!receipt || receipt.status === "作废") return;
    const oldCode = receipt.code;
    receipt.status = "作废";
    const next: Receipt = {
      ...receipt,
      id: crypto.randomUUID(),
      code: nextReceiptCode(receipt.type),
      validFrom: dayjs(validFrom).toISOString(),
      validTo: dayjs(validTo).toISOString(),
      status: "有效",
      issuedAt: new Date().toISOString()
    };
    receipts.value.push(next);
    for (const scene of referencingScenes(receipt)) {
      if (scene.status === "拍摄中" || scene.status === "已完成") continue;
      if (receipt.type === "场地" && scene.venueReceiptId === receipt.id) {
        scene.venueReceiptId = next.id;
      }
      if (receipt.type === "器材" && scene.equipmentReceiptIds.includes(receipt.id)) {
        scene.equipmentReceiptIds = scene.equipmentReceiptIds.map((id) => (id === receipt.id ? next.id : id));
      }
      scene.status = "待核对";
    }
    log("改期换回执", `${oldCode} → ${next.code}，引用场次退回待核对`);
  }

  function updateScene(id: string, input: Pick<Scene, "code" | "title" | "day" | "start" | "end" | "locationId" | "talentIds" | "equipmentIds">) {
    const scene = scenes.value.find((item) => item.id === id);
    if (!scene || scene.locked) return;
    if (scene.status === "拍摄中" || scene.status === "已完成") return;
    const changed = scene.day !== input.day || scene.start !== input.start || scene.end !== input.end || scene.locationId !== input.locationId || scene.equipmentIds.join("|") !== input.equipmentIds.join("|");
    Object.assign(scene, input);
    if (changed) {
      voidReceiptsForScene(scene);
      if (scene.status === "已确认") scene.status = "待核对";
      log("变更场次", `${scene.code} 时间/场地/器材变更，旧回执作废`);
    } else {
      log("更新场次", `${scene.code} ${scene.title}`);
    }
  }

  function reconcileScene(id: string) {
    const scene = scenes.value.find((item) => item.id === id);
    if (!scene) return;
    if (scene.status === "待核对" && sceneReconciled(scene)) {
      scene.status = "已确认";
      log("对账通过", `${scene.code} 回执齐全，恢复已确认`);
    }
  }

  function reconcileAll() {
    let fixed = 0;
    for (const scene of scenes.value) {
      if (scene.status === "拍摄中" || scene.status === "已完成") continue;
      if (scene.status === "草稿") continue;
      const ok = sceneReconciled(scene);
      if (ok && scene.status === "待核对") {
        scene.status = "已确认";
        fixed += 1;
      } else if (!ok && scene.status === "已确认") {
        scene.status = "待核对";
        fixed += 1;
      }
    }
    if (fixed) log("重新对账", `${fixed} 个场次状态已修正`);
  }

  return { scenes, sortedScenes, conflicts, history, versions, role, exemptions, online, draft, talents, locations, equipment, receipts, talentNames, equipmentNames, equipmentName, locationName, sceneReconciled, receiptIssues, receiptById, venueReceiptOf, equipmentReceiptOf, addScene, updateScene, updateStatus, toggleLock, moveScene, snapshot, restore, saveDraft, loadDraft, syncDraft, exempt, setOnline, issueReceipt, cancelReceipt, rescheduleReceipt, reconcileScene, reconcileAll };
});
