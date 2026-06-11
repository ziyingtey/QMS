import * as SecureStore from "expo-secure-store";

const KEY = "qms_token";
const KEY_REFRESH = "qms_refresh_token";
const KEY_EMAIL = "qms_email";

export async function saveToken(token: string): Promise<void> {
  await SecureStore.setItemAsync(KEY, token);
}

export async function saveRefreshToken(refresh: string): Promise<void> {
  await SecureStore.setItemAsync(KEY_REFRESH, refresh);
}

export async function readRefreshToken(): Promise<string | null> {
  return SecureStore.getItemAsync(KEY_REFRESH);
}

export async function clearRefreshToken(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(KEY_REFRESH);
  } catch {
    /* not present */
  }
}

export async function readToken(): Promise<string | null> {
  return SecureStore.getItemAsync(KEY);
}

export async function clearToken(): Promise<void> {
  await SecureStore.deleteItemAsync(KEY);
}

export async function clearAuthStores(): Promise<void> {
  await clearToken();
  await clearRefreshToken();
  await clearUserEmail();
}

export async function saveUserEmail(email: string): Promise<void> {
  await SecureStore.setItemAsync(KEY_EMAIL, email);
}

export async function readUserEmail(): Promise<string | null> {
  return SecureStore.getItemAsync(KEY_EMAIL);
}

export async function clearUserEmail(): Promise<void> {
  await SecureStore.deleteItemAsync(KEY_EMAIL);
}
