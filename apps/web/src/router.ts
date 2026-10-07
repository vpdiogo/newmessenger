import { createRouter, createWebHistory } from "vue-router";

import HomeView from "./views/HomeView.vue";
import LoginView from "./views/LoginView.vue";

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { component: HomeView, path: "/" },
    { component: LoginView, path: "/login" },
  ],
});
