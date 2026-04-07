import type { AuthUser } from './auth';

const TOKEN_KEY = 'token';
const USER_KEY = 'user';

export function getSessionToken(): string {
  return sessionStorage.getItem(TOKEN_KEY) || '';
}

export function setSessionToken(token: string): void {
  sessionStorage.setItem(TOKEN_KEY, token);
}

export function clearSessionToken(): void {
  sessionStorage.removeItem(TOKEN_KEY);
}

export function getSessionUser(): AuthUser | null {
  const raw = sessionStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AuthUser;
  } catch {
    return null;
  }
}

export function setSessionUser(user: AuthUser): void {
  sessionStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function clearSessionUser(): void {
  sessionStorage.removeItem(USER_KEY);
}
