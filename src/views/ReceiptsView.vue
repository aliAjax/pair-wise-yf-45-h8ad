<script setup lang="ts">
import { computed, reactive, ref } from "vue";
import dayjs from "dayjs";
import { useScheduleStore } from "../stores/schedule";
import type { Receipt, Scene } from "../types";

const store = useScheduleStore();
const editable = computed(() => store.role === "制片" || store.role === "导演");

const form = reactive({
  code: "",
  kind: "场地" as Receipt["kind"],
  resourceId: "l1",
  validFrom: "2026-10-08",
  validTo: "2026-10-08"
});
const saving = ref(false);

const rescheduleTarget = ref<Receipt | null>(null);
const rescheduleOpen = ref(false);
const rescheduleForm = reactive({ code: "", validFrom: "2026-10-08", validTo: "2026-10-08" });

const sortedReceipts = computed(() => [...store.receipts].sort((a, b) => `${a.kind}:${a.resourceId}`.localeCompare(`${b.kind}:${b.resourceId}`) || b.createdAt.localeCompare(a.createdAt)));

function resourceOptions(kind: Receipt["kind"]) {
  return kind === "场地" ? store.locations : store.equipment.map((item) => ({ id: item.id, name: item.name }));
}

function changeKind() {
  form.resourceId = form.kind === "场地" ? store.locations[0]?.id ?? "" : store.equipment[0]?.id ?? "";
}

function linkedScenes(receipt: Receipt) {
  return store.scenes.filter((scene) => scene.receipts.some((item) => item.active && item.receiptId === receipt.id));
}

function submit() {
  if (!form.code.trim()) return;
  saving.value = true;
  store.registerReceipt({ ...form, code: form.code.trim() });
  Object.assign(form, { code: "", kind: "场地", resourceId: "l1", validFrom: "2026-10-08", validTo: "2026-10-08" });
  setTimeout(() => { saving.value = false; }, 200);
}

function openReschedule(receipt: Receipt) {
  rescheduleTarget.value = receipt;
  rescheduleOpen.value = true;
  rescheduleForm.code = `${receipt.code}-R`;
  rescheduleForm.validFrom = receipt.validFrom;
  rescheduleForm.validTo = receipt.validTo;
}

function confirmReschedule() {
  if (!rescheduleTarget.value || !rescheduleForm.code.trim()) return;
  store.rescheduleReceipt(rescheduleTarget.value.id, { ...rescheduleForm, code: rescheduleForm.code.trim() });
  rescheduleTarget.value = null;
  rescheduleOpen.value = false;
}
</script>

<template>
  <section class="page">
    <div class="metrics">
      <article class="metric"><span>在册回执</span><strong>{{ store.receipts.length }}</strong></article>
      <article class="metric"><span>有效回执</span><strong>{{ store.receipts.filter((item: Receipt) => item.status === '有效').length }}</strong></article>
      <article class="metric"><span>已撤档 / 已改期</span><strong>{{ store.receipts.filter((item: Receipt) => item.status !== '有效').length }}</strong></article>
      <article class="metric"><span>待核对场次</span><strong>{{ store.scenes.filter((item: Scene) => item.status === '待核对').length }}</strong></article>
    </div>
    <div class="grid-2">
      <section class="panel">
        <div class="panel-head"><h2>登记供应商回执</h2></div>
        <form class="form-grid" @submit.prevent="submit">
          <label class="field"><span>回执编号</span><input v-model="form.code" placeholder="RC-LOC-0810" /></label>
          <label class="field"><span>类型</span><select v-model="form.kind" @change="changeKind"><option value="场地">场地</option><option value="器材">器材</option></select></label>
          <label class="field wide"><span>{{ form.kind === "场地" ? "场地" : "器材" }}资源</span>
            <select v-model="form.resourceId"><option v-for="item in resourceOptions(form.kind)" :key="item.id" :value="item.id">{{ item.name }}</option></select>
          </label>
          <label class="field"><span>有效期起</span><input v-model="form.validFrom" type="date" /></label>
          <label class="field"><span>有效期止</span><input v-model="form.validTo" type="date" /></label>
          <div class="actions wide"><button class="primary" :disabled="saving || !editable">登记回执</button></div>
        </form>
        <p class="muted notice">场地与器材供应商各回一份档期回执。撤档或改期到达后在右侧处理：改期会生成新回执编号，旧编号立即作废，引用旧编号的未开拍场次自动退回「待核对」并进冲突中心。</p>
      </section>
      <section class="panel">
        <div class="panel-head"><div><h2>档期回执台账</h2><small class="muted">按资源核对编号与有效期，已开拍场次不受撤档/改期影响</small></div></div>
        <div class="receipt-list">
          <article v-for="item in sortedReceipts" :key="item.id" class="receipt-item">
            <div class="receipt-main">
              <div class="receipt-head">
                <b>{{ item.code }}</b>
                <span class="status" :class="item.status">{{ item.status }}</span>
                <span class="rc-kind">{{ item.kind }} · {{ store.resourceName(item.kind, item.resourceId) }}</span>
              </div>
              <small class="muted">有效期：{{ item.validFrom }} ~ {{ item.validTo }} · 登记于 {{ dayjs(item.createdAt).format("MM-DD HH:mm") }}</small>
              <small v-if="item.status === '已改期'" class="warn-text">已改期，新回执待场次重新挂接，旧编号不可顶替</small>
              <div class="receipt-links">
                <small class="muted">引用场次：</small>
                <template v-if="linkedScenes(item).length">
                  <span v-for="scene in linkedScenes(item)" :key="scene.id" class="status" :class="scene.status">{{ scene.code }} {{ scene.status }}</span>
                </template>
                <small v-else class="muted">暂无场次引用</small>
              </div>
            </div>
            <div class="actions receipt-ops">
              <button class="secondary" :disabled="!editable || item.status !== '有效'" @click="openReschedule(item)">改期到达</button>
              <button class="danger" :disabled="!editable || item.status !== '有效'" @click="store.withdrawReceipt(item.id)">临时撤档</button>
            </div>
          </article>
        </div>
      </section>
    </div>

    <el-dialog v-model="rescheduleOpen" title="供应商改期回执" width="420px">
      <div v-if="rescheduleTarget" class="form-grid">
        <p class="wide muted">{{ rescheduleTarget.kind }}「{{ store.resourceName(rescheduleTarget.kind, rescheduleTarget.resourceId) }}」旧回执 {{ rescheduleTarget.code }} 将标记为「已改期」，请录入供应商回传的新编号与新有效期。</p>
        <label class="field wide"><span>新回执编号</span><input v-model="rescheduleForm.code" /></label>
        <label class="field"><span>新有效期起</span><input v-model="rescheduleForm.validFrom" type="date" /></label>
        <label class="field"><span>新有效期止</span><input v-model="rescheduleForm.validTo" type="date" /></label>
      </div>
      <template #footer>
        <button class="secondary" @click="rescheduleTarget = null; rescheduleOpen = false">取消</button>
        <button class="primary" @click="confirmReschedule">确认改期并退回场次</button>
      </template>
    </el-dialog>
  </section>
</template>
