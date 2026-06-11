/** Rules: ≥6 chars, upper, lower, digit, symbol (non-letter/digit, not whitespace). */

export type PasswordRuleChecks = {
  minLength: boolean;
  hasUpper: boolean;
  hasLower: boolean;
  hasDigit: boolean;
  hasSymbol: boolean;
};

const SYMBOL_RE = /[^A-Za-z0-9\s]/;

export function getPasswordRuleChecks(password: string): PasswordRuleChecks {
  return {
    minLength: password.length >= 6,
    hasUpper: /[A-Z]/.test(password),
    hasLower: /[a-z]/.test(password),
    hasDigit: /[0-9]/.test(password),
    hasSymbol: SYMBOL_RE.test(password),
  };
}

export function passwordMeetsPolicy(password: string): boolean {
  const c = getPasswordRuleChecks(password);
  return c.minLength && c.hasUpper && c.hasLower && c.hasDigit && c.hasSymbol;
}

/** First rule still failing, for submit-time messages. */
export function describePasswordPolicyFailure(password: string): string | null {
  if (!password.trim()) return "Password is required.";
  const c = getPasswordRuleChecks(password);
  if (!c.minLength) return "Use at least 6 characters.";
  if (!c.hasUpper) return "Add at least one uppercase letter (A–Z).";
  if (!c.hasLower) return "Add at least one lowercase letter (a–z).";
  if (!c.hasDigit) return "Add at least one number (0–9).";
  if (!c.hasSymbol) return "Add at least one symbol (e.g. @, #, $, %).";
  return null;
}
