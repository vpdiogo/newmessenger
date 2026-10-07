const accessTokenKey = "newmessenger.access-token";

export function clearAccessToken(): void {
  localStorage.removeItem(accessTokenKey);
}

export function getAccessToken(): string | null {
  return localStorage.getItem(accessTokenKey);
}

export function setAccessToken(accessToken: string): void {
  localStorage.setItem(accessTokenKey, accessToken);
}
