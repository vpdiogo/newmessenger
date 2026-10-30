import { initializeLanguage } from "./i18n";
import { createApp } from "vue";

import App from "./App.vue";
import { router } from "./router";
import "./style.css";
import { restoreSession } from "./auth/session";

initializeLanguage();
await restoreSession();
createApp(App).use(router).mount("#app");
