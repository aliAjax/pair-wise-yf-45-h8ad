import { createRouter, createWebHashHistory } from "vue-router";
import ScheduleView from "../views/ScheduleView.vue";
import ConflictView from "../views/ConflictView.vue";
import HistoryView from "../views/HistoryView.vue";
import ReceiptView from "../views/ReceiptView.vue";

export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: "/", name: "schedule", component: ScheduleView },
    { path: "/conflicts", name: "conflicts", component: ConflictView },
    { path: "/receipts", name: "receipts", component: ReceiptView },
    { path: "/history", name: "history", component: HistoryView }
  ]
});
