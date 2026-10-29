import { t, useFeedback, type PlainKey } from "../i18n";
import { computed, ref, watch } from "vue";

import { ApiError } from "../api/client";
import type { Credentials } from "../api/auth";

type Field = "email" | "password";
type FieldErrors = Partial<Record<Field, PlainKey>>;

const messages: Record<string, PlainKey> = {
  invalid_email: "register.invalidEmail",
  email_registered: "register.duplicate",
  password_length: "register.passwordLength",
  password_blank: "register.passwordBlank",
  password_contains_email: "register.passwordEmail",
};

function passwordErrorKey(
  email: string,
  password: string,
): PlainKey | undefined {
  const length = Array.from(password).length;
  if (length < 15 || length > 256) return messages.password_length;
  if (!password.trim()) return messages.password_blank;
  if (email && password.toLowerCase().includes(email.toLowerCase()))
    return messages.password_contains_email;
  return undefined;
}

export function passwordError(
  email: string,
  password: string,
): string | undefined {
  const key = passwordErrorKey(email, password);
  return key ? t(key) : undefined;
}

function recognizedErrors(value: unknown): FieldErrors {
  const result: FieldErrors = {};
  if (typeof value !== "object" || value === null) return result;
  for (const field of ["email", "password"] as const) {
    if (!(field in value)) continue;
    const code = (value as Record<string, unknown>)[field];
    const allowed =
      field === "email"
        ? ["invalid_email", "email_registered"]
        : ["password_length", "password_blank", "password_contains_email"];
    if (typeof code === "string" && allowed.includes(code))
      result[field] = messages[code];
  }
  return result;
}

export function useRegistrationForm(
  register: (credentials: Credentials) => Promise<void>,
) {
  const email = ref("");
  const password = ref("");
  const isSubmitting = ref(false);
  const { key: errorMessage, message: errorMessageText } = useFeedback();
  const serverErrors = ref<FieldErrors>({});
  const attempted = ref(false);
  const emailError = computed(() => {
    const key =
      serverErrors.value.email ??
      (attempted.value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value)
        ? messages.invalid_email
        : undefined);
    return key ? t(key) : undefined;
  });
  const currentPasswordError = computed(() => {
    const key =
      (attempted.value
        ? passwordErrorKey(email.value, password.value)
        : undefined) ?? serverErrors.value.password;
    return key ? t(key) : undefined;
  });

  watch(
    email,
    () => {
      serverErrors.value.email = undefined;
      serverErrors.value.password = undefined;
      errorMessage.value = null;
    },
    { flush: "sync" },
  );
  watch(
    password,
    () => {
      serverErrors.value.password = undefined;
      errorMessage.value = null;
    },
    { flush: "sync" },
  );

  async function submit(): Promise<boolean> {
    if (isSubmitting.value) return false;
    attempted.value = true;
    errorMessage.value = null;
    serverErrors.value = {};
    if (emailError.value || currentPasswordError.value) return false;
    const credentials = { email: email.value, password: password.value };
    isSubmitting.value = true;
    try {
      await register(credentials);
      return true;
    } catch (error) {
      if (error instanceof ApiError && [400, 409].includes(error.status)) {
        const fields = recognizedErrors(error.fieldErrors);
        if (error.status === 409) fields.email = messages.email_registered;
        if (email.value !== credentials.email) {
          delete fields.email;
          delete fields.password;
        } else if (password.value !== credentials.password)
          delete fields.password;
        serverErrors.value = fields;
        if (Object.keys(fields).length) return false;
      }
      errorMessage.value = "register.failed";
      return false;
    } finally {
      isSubmitting.value = false;
    }
  }

  return {
    email,
    password,
    emailError,
    passwordError: currentPasswordError,
    errorMessage: errorMessageText,
    isSubmitting,
    submit,
  };
}
