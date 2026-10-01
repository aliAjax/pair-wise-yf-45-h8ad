<script setup lang="ts">
import { computed, onMounted, reactive, ref } from "vue";
import dayjs from "dayjs";
import { toTypedSchema } from "@vee-validate/zod";
import { useForm } from "vee-validate";
import { z } from "zod";
import { useScheduleStore } from "../stores/schedule";
import type { ReceiptKind, Scene, SceneStatus } from "../types";

const store = useScheduleStore();
const saving = ref(false);
const dragging = ref<number | null>(null);
const form = reactive({ code: "", title: "", day: "2026-10-08", start: "08:00", end: "10:00", locationId: "l1", talentIds: [] as string[], equipmentIds: [] as string[] });
const schema = toTypedSchema(z.object({
  code: z.string().min(2, "请输入场次编号"),
  title: z.string().min(2, "请输入场次名称"),
  day: z.string().min(1),
  start: z.string().min(1),
  end: z.string().min(1),
  locationId: z.string().min(1)
}));
const { errors, validate } = useForm({ validationSchema: schema });
const editable = computed(() => store.role === "制片" || store.role === "导演");
const currentStatus = (status: string) => status as SceneStatus;
const pendingCount = computed(() => store.scenes.filter((item: Scene) => item.status === "待核对").length);

onMounted(() => store.loadDraft());

async function submit() {
  const result = await validate({ values: form } as any);
  if (!result.valid) return;
  saving.value = true;
  store.addScene({ code: form.code, title: form.title, day: form.day, start: form.start, end: form.end, locationId: form.locationId, talentIds: [...form.talentIds], equipmentIds: [...form.equipmentIds] });
  Object.assign(form, { code: "", title: "", day: "2026-10-08", start: "08:00", end: "10:00", locationId: "l1", talentIds: [], equipmentIds: [] });
  setTimeout(() => { saving.value = false; }, 240);
}

function drop(index: number) {
  if (dragging.value !== null && editable.value) store.moveScene(dragging.value, index);
  dragging.value = null;
}

function nextStatus(status: SceneStatus): SceneStatus {
  if (status === "草稿" || status === "待核对") return "已确认";
  if (status === "已确认") return "拍摄中";
  return "已完成";
}

interface SlotRow {
  kind: ReceiptKind;
  resourceId: string;
  label: string;
  check: ReturnType<typeof store.inspectRef>;
  options: ReturnType<typeof store.eligibleReceipts>;
}

function slotRows(scene: Scene): SlotRow[] {
  return store.sceneSlots(scene).map((slot) => ({
    ...slot,
    label: slot.kind === "场地" ? store.locationName(slot.resourceId) : store.equipmentName(slot.resourceId),
    check: store.inspectRef(scene, slot.kind, slot.resourceId),
    options: store.eligibleReceipts(slot.kind, slot.resourceId, scene.day)
  }));
}

function slotKey(scene: Scene, row: SlotRow) {
  return `${scene.id}:${row.kind}:${row.resourceId}`;
}

const picked = reactive<Record<string, string>>({});
function attach(scene: Scene, row: SlotRow) {
  const value = picked[slotKey(scene, row)];
  if (!value) return;
  store.attachReceipt(scene.id, row.kind, row.resourceId, value);
  picked[slotKey(scene, row)] = "";
}

// 场次调整对话框
const editOpen = ref(false);
const editTarget = ref<Scene | null>(null);
const editForm = reactive({ title: "", day: "", start: "", end: "", locationId: "", talentIds: [] as string[], equipmentIds: [] as string[] });

function openEdit(scene: Scene) {
  editTarget.value = scene;
  Object.assign(editForm, { title: scene.title, day: scene.day, start: scene.start, end: scene.end, locationId: scene.locationId, talentIds: [...scene.talentIds], equipmentIds: [...scene.equipmentIds] });
  editOpen.value = true;
}

function confirmEdit() {
  if (!editTarget.value) return;
  store.editScene(editTarget.value.id, {
    title: editForm.title,
    day: editForm.day,
    start: editForm.start,
    end: editForm.end,
    locationId: editForm.locationId,
    equipmentIds: [...editForm.equipmentIds],
    talentIds: [...editForm.talentIds]
  });
  editOpen.value = false;
  editTarget.value = null;
}
</script>

<template>
  <section class="page">
    <div class="metrics">
      <article class="metric"><span>通告场次</span><strong>{{ store.scenes.length }}</strong></article>
      <article class="metric"><span>回执待核对</span><strong>{{ pendingCount }}</strong></article>
      <article class="metric"><span>待处理冲突</span><strong>{{ store.conflicts.length }}</strong></article>
      <article class="metric"><span>版本快照</span><strong>{{ store.versions.length }}</strong></article>
    </div>
    <div v-if="store.draft" class="draft-banner">
      <span>发现 {{ dayjs(store.draft.savedAt).format("MM-DD HH:mm") }} 的离线草稿，共 {{ store.draft.scenes.length }} 个场次。</span>
      <div class="actions"><button class="secondary" @click="store.syncDraft">同步到正式通告</button></div>
    </div>
    <div class="grid-2">
      <section class="panel">
        <div class="panel-head"><h2>新增场次</h2><button class="secondary" @click="store.saveDraft">保存离线草稿</button></div>
        <form class="form-grid" @submit.prevent="submit">
          <label class="field"><span>场次编号</span><input v-model="form.code" placeholder="C-018" /><small>{{ errors.code }}</small></label>
          <label class="field"><span>场次名称</span><input v-model="form.title" placeholder="例如：雨夜追踪" /><small>{{ errors.title }}</small></label>
          <label class="field"><span>拍摄日</span><input v-model="form.day" type="date" /></label>
          <label class="field"><span>场地</span><select v-model="form.locationId"><option v-for="item in store.locations" :key="item.id" :value="item.id">{{ item.name }}</option></select></label>
          <label class="field"><span>开始</span><input v-model="form.start" type="time" /></label>
          <label class="field"><span>结束</span><input v-model="form.end" type="time" /></label>
          <label class="field wide"><span>演员档期</span><select v-model="form.talentIds" multiple><option v-for="item in store.talents" :key="item.id" :value="item.id">{{ item.name }} · {{ item.role }}</option></select></label>
          <label class="field wide"><span>器材借用</span><select v-model="form.equipmentIds" multiple><option v-for="item in store.equipment" :key="item.id" :value="item.id">{{ item.name }}</option></select></label>
          <div class="actions wide"><button class="primary" :disabled="saving || !editable">保存为草稿</button><RouterLink class="secondary" to="/conflicts">检查冲突</RouterLink></div>
        </form>
        <p class="muted notice">新场次保存后需在下方按场地、器材逐条挂接供应商回执，挂齐并核对有效期后才可确认。</p>
      </section>
      <section class="panel">
        <div class="panel-head"><div><h2>当日通告顺序</h2><small class="muted">拖拽调整拍摄顺序；撤档/改期到达时未开拍场次自动退回待核对，拍摄中的场次保住现场</small></div><button class="primary" :disabled="!editable" @click="store.snapshot()">保存版本</button></div>
        <div class="scene-list">
          <article v-for="(scene,index) in store.sortedScenes" :key="scene.id" class="scene" :class="{ locked: scene.locked, dragging: dragging === index }" draggable="true" @dragstart="dragging=index" @dragover.prevent @drop="drop(index)">
            <b>{{ index + 1 }}</b>
            <div class="scene-code">{{ scene.code }}</div>
            <div class="scene-title"><b>{{ scene.title }}</b><small>{{ scene.start }}–{{ scene.end }} · {{ store.locationName(scene.locationId) }}</small></div>
            <span class="status" :class="scene.status">{{ scene.status }}</span>
            <div class="actions">
              <button class="secondary" :disabled="!editable || scene.locked" @click="store.updateStatus(scene.id, currentStatus(nextStatus(scene.status)))">推进</button>
              <button class="secondary" :disabled="!editable || scene.locked || store.isProtected(scene)" :title="store.isProtected(scene) ? '已开拍，保住现场，不可改动' : '调整时间/场地/器材'" @click="openEdit(scene)">调整</button>
              <button class="secondary" :disabled="!editable" @click="store.toggleLock(scene.id)">{{ scene.locked ? "解锁" : "锁定" }}</button>
            </div>
            <div class="scene-meta wide">
              <small>演员：{{ store.talentNames(scene.talentIds).join("、") || "待定" }}</small>
            </div>
            <div class="reconcile wide">
              <div v-for="row in slotRows(scene)" :key="slotKey(scene, row)" class="rc-row" :class="row.check.level">
                <span class="rc-tag">{{ row.kind === "场地" ? "场地" : "器材" }}</span>
                <span class="rc-resource">{{ row.label }}</span>
                <template v-if="row.check.level === 'ok'">
                  <span class="rc-chip ok">✓ {{ row.check.text }}</span>
                </template>
                <template v-else>
                  <span class="rc-chip bad">✕ {{ row.check.text }}<template v-if="row.check.nextCode"> → 新编号 {{ row.check.nextCode }}</template></span>
                  <span v-if="store.isProtected(scene)" class="muted">已开拍，保住现场</span>
                  <span v-else-if="!row.options.length" class="muted">无有效回执，<RouterLink to="/receipts">先去登记</RouterLink></span>
                  <span v-else class="rc-attach">
                    <select v-model="picked[slotKey(scene, row)]">
                      <option value="" disabled>选择覆盖 {{ scene.day }} 的有效回执</option>
                      <option v-for="opt in row.options" :key="opt.id" :value="opt.id">{{ opt.code }}（{{ opt.validFrom }} ~ {{ opt.validTo }}）</option>
                    </select>
                    <button class="secondary" :disabled="!editable" @click="attach(scene, row)">挂接</button>
                  </span>
                </template>
              </div>
            </div>
          </article>
        </div>
      </section>
    </div>

    <el-dialog v-model="editOpen" title="调整场次（时间/场地/器材变更将作废旧回执）" width="460px">
      <div v-if="editTarget" class="form-grid">
        <p class="wide muted">场次 {{ editTarget.code }} · 当前状态 {{ editTarget.status }}。时间、场地或器材一变，对应旧回执立即作废留痕，场次退回「待核对」，需重新挂接有效回执。</p>
        <label class="field wide"><span>场次名称</span><input v-model="editForm.title" /></label>
        <label class="field"><span>拍摄日</span><input v-model="editForm.day" type="date" /></label>
        <label class="field"><span>场地</span><select v-model="editForm.locationId"><option v-for="item in store.locations" :key="item.id" :value="item.id">{{ item.name }}</option></select></label>
        <label class="field"><span>开始</span><input v-model="editForm.start" type="time" /></label>
        <label class="field"><span>结束</span><input v-model="editForm.end" type="time" /></label>
        <label class="field wide"><span>演员档期</span><select v-model="editForm.talentIds" multiple><option v-for="item in store.talents" :key="item.id" :value="item.id">{{ item.name }} · {{ item.role }}</option></select></label>
        <label class="field wide"><span>器材借用</span><select v-model="editForm.equipmentIds" multiple><option v-for="item in store.equipment" :key="item.id" :value="item.id">{{ item.name }}</option></select></label>
      </div>
      <template #footer>
        <button class="secondary" @click="editOpen = false">取消</button>
        <button class="primary" @click="confirmEdit">保存并重新对账</button>
      </template>
    </el-dialog>
  </section>
</template>
