import { createRouter, createWebHistory } from "vue-router";

import HomeView from "./views/HomeView.vue";
import LoginView from "./views/LoginView.vue";
import RegisterView from "./views/RegisterView.vue";
import DashboardView from "./views/DashboardView.vue";
import { restoreSession } from "./auth/session";

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { component: HomeView, path: "/" },
    { component: LoginView, name: "login", path: "/login" },
    { component: RegisterView, name: "register", path: "/register" },
    {
      component: DashboardView,
      meta: { requiresAuth: true },
      name: "dashboard",
      path: "/app",
    },
  ],
});

router.beforeEach(async (to) => {
  if (to.meta.requiresAuth && !(await restoreSession())) {
    return { name: "login" };
  }
});
