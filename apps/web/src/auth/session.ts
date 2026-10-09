import { ref } from "vue";

import { ApiError } from "../api/client";
import {
  type AuthenticatedUser,
  type Credentials,
  getCurrentUser,
  login,
  register,
} from "../api/auth";
import { clearAccessToken, getAccessToken, setAccessToken } from "./token";

export type SessionStatus =
  | "unauthenticated"
  | "verifying"
  | "authenticated"
  | "verification-unavailable";

const currentUser = ref<AuthenticatedUser | null>(null);
const status = ref<SessionStatus>("unauthenticated");
let verificationPromise: Promise<SessionStatus> | null = null;
let sessionVersion = 0;

export const session = {
  get isAuthenticated(): boolean {
    return status.value === "authenticated";
  },
  get user(): AuthenticatedUser | null {
    return currentUser.value;
  },
  get status(): SessionStatus {
    return status.value;
  },
};

export async function loginSession(credentials: Credentials): Promise<void> {
  await createSession(await login(credentials));
}

export async function registerSession(credentials: Credentials): Promise<void> {
  await createSession(await register(credentials));
}

export function restoreSession(): Promise<SessionStatus> {
  if (!getAccessToken()) {
    currentUser.value = null;
    status.value = "unauthenticated";
    return Promise.resolve(status.value);
  }
  if (
    status.value === "authenticated" ||
    status.value === "verification-unavailable"
  )
    return Promise.resolve(status.value);
  return verifyCurrentSession();
}

export function retrySession(): Promise<SessionStatus> {
  if (!getAccessToken()) return Promise.resolve("unauthenticated");
  if (status.value === "authenticated") return Promise.resolve(status.value);
  return verifyCurrentSession();
}

export function clearSession(): void {
  sessionVersion += 1;
  verificationPromise = null;
  clearAccessToken();
  currentUser.value = null;
  status.value = "unauthenticated";
}

async function createSession(accessToken: string): Promise<void> {
  invalidateVerification();
  setAccessToken(accessToken);
  const result = await verifyCurrentSession();
  if (result !== "authenticated") {
    clearSession();
    throw new Error("Unable to verify the new session");
  }
}

function invalidateVerification(): void {
  sessionVersion += 1;
  verificationPromise = null;
  currentUser.value = null;
  status.value = "unauthenticated";
}

function verifyCurrentSession(): Promise<SessionStatus> {
  if (verificationPromise) return verificationPromise;

  const version = sessionVersion;
  status.value = "verifying";
  const verification = getCurrentUser()
    .then((user) => {
      if (version !== sessionVersion) return status.value;
      currentUser.value = user;
      status.value = "authenticated";
      return status.value;
    })
    .catch((error: unknown) => {
      if (version !== sessionVersion) return status.value;
      currentUser.value = null;
      if (error instanceof ApiError && error.status === 401) {
        clearSession();
      } else {
        status.value = "verification-unavailable";
      }
      return status.value;
    });
  verificationPromise = verification;
  void verification.finally(() => {
    if (verificationPromise === verification) verificationPromise = null;
  });
  return verification;
}
