import { createRouter, createWebHashHistory } from "vue-router";
import ScheduleView from "../views/ScheduleView.vue";
import ConflictView from "../views/ConflictView.vue";
import HistoryView from "../views/HistoryView.vue";
import ReceiptsView from "../views/ReceiptsView.vue";

export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: "/", name: "schedule", component: ScheduleView },
    { path: "/receipts", name: "receipts", component: ReceiptsView },
    { path: "/conflicts", name: "conflicts", component: ConflictView },
    { path: "/history", name: "history", component: HistoryView }
  ]
});
