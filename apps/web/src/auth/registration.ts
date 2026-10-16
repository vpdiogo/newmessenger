import { computed, ref, watch } from "vue";

import { ApiError } from "../api/client";
import type { Credentials } from "../api/auth";

type Field = "email" | "password";
type FieldErrors = Partial<Record<Field, string>>;

const messages: Record<string, string> = {
  invalid_email: "Enter a valid email address.",
  email_registered: "This email is already registered.",
  password_length: "Use between 15 and 256 characters.",
  password_blank: "Use a password that is not only whitespace.",
  password_contains_email:
    "Your password must not contain your complete email address.",
};

export function passwordError(
  email: string,
  password: string,
): string | undefined {
  const length = Array.from(password).length;
  if (length < 15 || length > 256) return messages.password_length;
  if (!password.trim()) return messages.password_blank;
  if (email && password.toLowerCase().includes(email.toLowerCase()))
    return messages.password_contains_email;
  return undefined;
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
  const errorMessage = ref<string | null>(null);
  const serverErrors = ref<FieldErrors>({});
  const attempted = ref(false);
  const emailError = computed(
    () =>
      serverErrors.value.email ??
      (attempted.value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value)
        ? messages.invalid_email
        : undefined),
  );
  const currentPasswordError = computed(
    () =>
      (attempted.value
        ? passwordError(email.value, password.value)
        : undefined) ?? serverErrors.value.password,
  );

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
      errorMessage.value = "Unable to create your account. Please try again.";
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
    errorMessage,
    isSubmitting,
    submit,
  };
}
