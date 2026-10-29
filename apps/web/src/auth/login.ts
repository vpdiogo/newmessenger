import { useFeedback } from "../i18n";
import { ref } from "vue";

import type { Credentials } from "../api/auth";
import { ApiError } from "../api/client";

export function useLoginForm(
  login: (credentials: Credentials) => Promise<void>,
) {
  const email = ref("");
  const password = ref("");
  const { key: errorMessage, message: errorMessageText } = useFeedback();
  const isSubmitting = ref(false);

  async function submit(): Promise<void> {
    if (isSubmitting.value) return;
    const credentials = { email: email.value, password: password.value };
    errorMessage.value = null;
    isSubmitting.value = true;
    try {
      await login(credentials);
    } catch (error) {
      errorMessage.value =
        error instanceof ApiError && error.status === 401
          ? "login.invalid"
          : "login.failed";
    } finally {
      isSubmitting.value = false;
    }
  }

  return {
    email,
    password,
    errorMessage: errorMessageText,
    isSubmitting,
    submit,
  };
}
