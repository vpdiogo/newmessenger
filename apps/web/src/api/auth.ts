import { requestJson } from "./client";

export type Credentials = { email: string; password: string };
export type AuthenticatedUser = { email: string; sub: string };

export async function login(credentials: Credentials): Promise<string> {
  return requestAccessToken("/auth/login", credentials);
}

export async function register(credentials: Credentials): Promise<string> {
  return requestAccessToken("/auth/register", credentials);
}

export async function getCurrentUser(): Promise<AuthenticatedUser> {
  return parseAuthenticatedUser(await requestJson("/auth/me"));
}

async function requestAccessToken(
  path: string,
  credentials: Credentials,
): Promise<string> {
  const data = await requestJson(path, {
    body: JSON.stringify(credentials),
    method: "POST",
  });

  if (
    typeof data !== "object" ||
    data === null ||
    !("accessToken" in data) ||
    typeof data.accessToken !== "string"
  ) {
    throw new Error("The API authentication response is invalid");
  }

  return data.accessToken;
}

function parseAuthenticatedUser(data: unknown): AuthenticatedUser {
  if (
    typeof data !== "object" ||
    data === null ||
    !("email" in data) ||
    !("sub" in data) ||
    typeof data.email !== "string" ||
    typeof data.sub !== "string"
  ) {
    throw new Error("The API user response is invalid");
  }

  return { email: data.email, sub: data.sub };
}
