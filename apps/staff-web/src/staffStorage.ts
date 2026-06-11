const TOKEN_KEY = "qms_staff_token";
const REFRESH_KEY = "qms_staff_refresh";
const ROLE_KEY = "qms_staff_role";
const EMAIL_KEY = "qms_staff_email";
const BRANCH_KEY = "qms_staff_branch";

export function getStoredToken(): string | null {
  return sessionStorage.getItem(TOKEN_KEY);
}

export function setStoredToken(token: string): void {
  sessionStorage.setItem(TOKEN_KEY, token);
}

export function getStoredRefreshToken(): string | null {
  return sessionStorage.getItem(REFRESH_KEY);
}

export function setStoredRefreshToken(token: string): void {
  sessionStorage.setItem(REFRESH_KEY, token);
}

export function getStoredRole(): string | null {
  return sessionStorage.getItem(ROLE_KEY);
}

export function setStoredRole(role: string): void {
  sessionStorage.setItem(ROLE_KEY, role);
}

export function setStoredEmail(email: string): void {
  sessionStorage.setItem(EMAIL_KEY, email);
}

export function getStoredEmail(): string | null {
  return sessionStorage.getItem(EMAIL_KEY);
}

export function setStoredBranchId(id: string): void {
  sessionStorage.setItem(BRANCH_KEY, id);
}

export function getStoredBranchId(): string | null {
  return sessionStorage.getItem(BRANCH_KEY);
}

export function clearStoredSession(): void {
  sessionStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(REFRESH_KEY);
  sessionStorage.removeItem(ROLE_KEY);
  sessionStorage.removeItem(EMAIL_KEY);
  sessionStorage.removeItem(BRANCH_KEY);
}
