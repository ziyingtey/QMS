/** Auth API payload (camelCase from ASP.NET). */
export type LoginResponse = {
  token: string;
  refreshToken?: string;
  userId: string;
  email: string;
  role: string;
  branchId?: string | null;
};

/** Customer register: verify email before tokens are issued. */
export type RegisterPendingResponse = {
  requiresEmailVerification: true;
  message: string;
  emailSent: boolean;
};

export function isRegisterPending(
  r: LoginResponse | RegisterPendingResponse,
): r is RegisterPendingResponse {
  return "requiresEmailVerification" in r && r.requiresEmailVerification === true;
}
