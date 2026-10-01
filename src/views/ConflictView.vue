<script setup lang="ts">
import { useScheduleStore } from "../stores/schedule";
const store = useScheduleStore();
function sceneName(id: string) {
  const scene = store.scenes.find((item) => item.id === id);
  return scene ? `${scene.code} ${scene.title}` : id;
}
function sceneStatus(id: string) {
  return store.scenes.find((item) => item.id === id)?.status ?? "";
}
</script>
<template>
  <section class="page">
    <section class="panel">
      <div class="panel-head"><div><h2>资源冲突中心</h2><small class="muted">系统按日期和时间段检查演员、场地、器材与转场间隔；撤档/改期到达后引用旧回执的未开拍场次退回待核对并汇集到这里，拍摄中/已完成的场次保住现场不下发</small></div><span class="status">{{ store.conflicts.length }} 项待处理</span></div>
      <article v-for="item in store.conflicts" :key="item.id" class="conflict" :class="{ receipt: item.type === '场地回执' || item.type === '器材回执' }">
        <span class="seal">{{ item.severity }}</span>
        <div>
          <b>{{ item.type }}</b>
          <p>{{ item.message }}</p>
          <small>
            <template v-for="(id, index) in item.sceneIds" :key="id">
              <span v-if="index > 0"> ↔ </span>
              {{ sceneName(id) }}
              <span class="status" :class="sceneStatus(id)">{{ sceneStatus(id) }}</span>
            </template>
          </small>
        </div>
        <button class="secondary" :disabled="store.role === '场记'" @click="store.exempt(item.id)">负责人豁免</button>
      </article>
      <el-empty v-if="!store.conflicts.length" description="当前没有未处理冲突" />
    </section>
  </section>
</template>
