<script setup lang="ts">
import { session } from "../auth/session";
import DashboardView from "./DashboardView.vue";
import SessionVerificationView from "./SessionVerificationView.vue";
</script>

<template>
  <DashboardView v-if="session.isAuthenticated" />
  <SessionVerificationView v-else />
</template>
