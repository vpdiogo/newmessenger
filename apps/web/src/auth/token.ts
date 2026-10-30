const accessTokenKey = "newmessenger.access-token";

export function clearAccessToken(): void {
  localStorage.removeItem(accessTokenKey);
}

export function getAccessToken(): string | null {
  try {
    return localStorage.getItem(accessTokenKey);
  } catch {
    // Unavailable browser storage cannot supply an authenticated credential.
    return null;
  }
}

export function setAccessToken(accessToken: string): void {
  localStorage.setItem(accessTokenKey, accessToken);
}
