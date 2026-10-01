<script setup lang="ts">
import { computed, reactive, ref } from "vue";
import dayjs from "dayjs";
import { useScheduleStore } from "../stores/schedule";
import type { Receipt, ReceiptType, Scene } from "../types";

const store = useScheduleStore();

const issueForm = reactive({ sceneId: "", type: "场地" as ReceiptType, equipmentId: "" });
const rescheduleTarget = ref<Receipt | null>(null);
const rescheduleForm = reactive({ validFrom: "", validTo: "" });

const issueableScenes = computed(() => store.scenes.filter((scene) => scene.status !== "拍摄中" && scene.status !== "已完成"));

const sceneEquipment = computed(() => {
  const scene = store.scenes.find((item) => item.id === issueForm.sceneId);
  return scene ? scene.equipmentIds : [];
});

function issue() {
  if (!issueForm.sceneId) return;
  if (issueForm.type === "器材" && !issueForm.equipmentId) return;
  store.issueReceipt(issueForm.sceneId, issueForm.type, issueForm.type === "器材" ? issueForm.equipmentId : undefined);
  issueForm.equipmentId = "";
}

function sceneName(id: string) {
  const scene = store.scenes.find((item) => item.id === id);
  return scene ? `${scene.code} ${scene.title}` : id;
}

function resourceName(receipt: Receipt) {
  return receipt.type === "场地" ? store.locationName(receipt.resourceId) : store.equipmentName(receipt.resourceId);
}

function validity(receipt: Receipt) {
  return `${dayjs(receipt.validFrom).format("MM-DD HH:mm")} ~ ${dayjs(receipt.validTo).format("MM-DD HH:mm")}`;
}

function receiptOf(scene: Scene, type: ReceiptType, resourceId: string) {
  const linked = store.receipts.find((item) => item.type === type && item.sceneId === scene.id && item.resourceId === resourceId && (type === "场地" ? scene.venueReceiptId === item.id : scene.equipmentReceiptIds.includes(item.id)));
  if (linked) return linked;
  const all = store.receipts.filter((item) => item.type === type && item.sceneId === scene.id && item.resourceId === resourceId);
  return all.length ? all[all.length - 1] : undefined;
}

function openReschedule(receipt: Receipt) {
  rescheduleTarget.value = receipt;
  rescheduleForm.validFrom = dayjs(receipt.validFrom).format("YYYY-MM-DDTHH:mm");
  rescheduleForm.validTo = dayjs(receipt.validTo).format("YYYY-MM-DDTHH:mm");
}

function confirmReschedule() {
  if (!rescheduleTarget.value || !rescheduleForm.validFrom || !rescheduleForm.validTo) return;
  store.rescheduleReceipt(rescheduleTarget.value.id, rescheduleForm.validFrom, rescheduleForm.validTo);
  rescheduleTarget.value = null;
}

const activeReceipts = computed(() => store.receipts.filter((receipt) => receipt.status === "有效"));
const voidReceipts = computed(() => store.receipts.filter((receipt) => receipt.status === "作废"));
</script>

<template>
  <section class="page">
    <div class="metrics">
      <article class="metric"><span>有效回执</span><strong>{{ activeReceipts.length }}</strong></article>
      <article class="metric"><span>已作废</span><strong>{{ voidReceipts.length }}</strong></article>
      <article class="metric"><span>待核对场次</span><strong>{{ store.scenes.filter((item) => item.status === '待核对').length }}</strong></article>
      <article class="metric"><span>已对账场次</span><strong>{{ store.scenes.filter((item) => item.status === '已确认').length }}</strong></article>
    </div>

    <section class="panel">
      <div class="panel-head">
        <div><h2>开具回执</h2><small class="muted">通告排好后向场地、器材供应商索取档期回执，编号与有效期随场次绑定</small></div>
        <button class="secondary" @click="store.reconcileAll">重新对账</button>
      </div>
      <div class="form-grid">
        <label class="field"><span>场次</span>
          <select v-model="issueForm.sceneId">
            <option value="" disabled>选择场次</option>
            <option v-for="scene in issueableScenes" :key="scene.id" :value="scene.id">{{ scene.code }} {{ scene.title }}</option>
          </select>
        </label>
        <label class="field"><span>回执类型</span>
          <select v-model="issueForm.type">
            <option value="场地">场地回执</option>
            <option value="器材">器材回执</option>
          </select>
        </label>
        <label v-if="issueForm.type === '器材'" class="field"><span>器材</span>
          <select v-model="issueForm.equipmentId">
            <option value="" disabled>选择器材</option>
            <option v-for="id in sceneEquipment" :key="id" :value="id">{{ store.equipmentName(id) }}</option>
          </select>
        </label>
        <div class="actions wide"><button class="primary" :disabled="!issueForm.sceneId || (issueForm.type === '器材' && !issueForm.equipmentId)" @click="issue">开具回执</button></div>
      </div>
    </section>

    <section class="panel">
      <div class="panel-head"><div><h2>场次对账</h2><small class="muted">每场记下场地、器材的回执编号与有效期；撤档或改期后引用场次退回待核对</small></div></div>
      <div class="recon-list">
        <article v-for="scene in store.scenes" :key="scene.id" class="recon" :class="{ 'is-pending': scene.status === '待核对', 'is-protected': scene.status === '拍摄中' || scene.status === '已完成' }">
          <div class="recon-head">
            <b>{{ scene.code }} {{ scene.title }}</b>
            <span class="status" :class="scene.status">{{ scene.status }}</span>
          </div>
          <small class="muted">{{ scene.day }} {{ scene.start }}–{{ scene.end }} · {{ store.locationName(scene.locationId) }}</small>
          <div class="rechips">
            <span class="chip" :class="{ ok: receiptOf(scene, '场地', scene.locationId)?.status === '有效', bad: !receiptOf(scene, '场地', scene.locationId) || receiptOf(scene, '场地', scene.locationId)?.status === '作废' }">
              场地 · {{ receiptOf(scene, '场地', scene.locationId)?.code ?? '未开具' }}
            </span>
            <span v-for="id in scene.equipmentIds" :key="id" class="chip" :class="{ ok: receiptOf(scene, '器材', id)?.status === '有效', bad: !receiptOf(scene, '器材', id) || receiptOf(scene, '器材', id)?.status === '作废' }">
              {{ store.equipmentName(id) }} · {{ receiptOf(scene, '器材', id)?.code ?? '未开具' }}
            </span>
          </div>
          <div v-if="scene.status === '待核对'" class="actions">
            <button class="primary" @click="store.reconcileScene(scene.id)">对账通过</button>
          </div>
        </article>
      </div>
    </section>

    <section class="panel">
      <div class="panel-head"><div><h2>回执台账</h2><small class="muted">供应商撤档作废，改期换发新回执；旧编号不得顶替</small></div></div>
      <el-empty v-if="!store.receipts.length" description="暂无回执" />
      <div class="ledger">
        <article v-for="receipt in store.receipts" :key="receipt.id" class="ledger-row" :class="{ void: receipt.status === '作废' }">
          <div class="ledger-main">
            <b>{{ receipt.code }}</b>
            <span class="tag" :class="receipt.type">{{ receipt.type }}</span>
            <span class="status" :class="receipt.status">{{ receipt.status }}</span>
          </div>
          <small class="muted">{{ resourceName(receipt) }} · {{ sceneName(receipt.sceneId) }} · {{ validity(receipt) }}</small>
          <div class="actions">
            <button class="secondary" :disabled="receipt.status === '作废'" @click="openReschedule(receipt)">改期</button>
            <button class="danger" :disabled="receipt.status === '作废'" @click="store.cancelReceipt(receipt.id)">撤档作废</button>
          </div>
        </article>
      </div>
    </section>

    <div v-if="rescheduleTarget" class="modal-mask" @click.self="rescheduleTarget = null">
      <div class="modal">
        <h3>回执改期 · {{ rescheduleTarget.code }}</h3>
        <p class="muted">改期后旧回执作废并换发新编号，引用场次退回待核对。</p>
        <label class="field"><span>新有效期开始</span><input v-model="rescheduleForm.validFrom" type="datetime-local" /></label>
        <label class="field"><span>新有效期结束</span><input v-model="rescheduleForm.validTo" type="datetime-local" /></label>
        <div class="actions">
          <button class="primary" @click="confirmReschedule">确认改期</button>
          <button class="secondary" @click="rescheduleTarget = null">取消</button>
        </div>
      </div>
    </div>
  </section>
</template>
