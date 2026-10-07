import { ref } from "vue";

import {
  type AuthenticatedUser,
  type Credentials,
  getCurrentUser,
  login,
  register,
} from "../api/auth";
import { clearAccessToken, getAccessToken, setAccessToken } from "./token";

const currentUser = ref<AuthenticatedUser | null>(null);
const initialized = ref(false);

export const session = {
  get isAuthenticated(): boolean {
    return currentUser.value !== null;
  },
  get user(): AuthenticatedUser | null {
    return currentUser.value;
  },
};

export async function loginSession(credentials: Credentials): Promise<void> {
  await createSession(await login(credentials));
}

export async function registerSession(credentials: Credentials): Promise<void> {
  await createSession(await register(credentials));
}

export async function restoreSession(): Promise<boolean> {
  if (initialized.value) return currentUser.value !== null;

  initialized.value = true;
  if (!getAccessToken()) return false;

  try {
    currentUser.value = await getCurrentUser();
    return true;
  } catch {
    clearSession();
    return false;
  }
}

export function clearSession(): void {
  clearAccessToken();
  currentUser.value = null;
  initialized.value = true;
}

async function createSession(accessToken: string): Promise<void> {
  setAccessToken(accessToken);
  initialized.value = true;

  try {
    currentUser.value = await getCurrentUser();
  } catch (error) {
    clearSession();
    throw error;
  }
}
