/**
 * @file 认证与初始化向导服务
 */
import type { HttpClient } from "../lib/client";
import { AUTH, SETUP } from "../lib/routes";

export interface LoginPayload {
  username: string;
  password: string;
}

export interface TokenResponse {
  access_token: string;
  token_type: string;
}

export interface SetupStatusResponse {
  configured: boolean;
}

export interface AuthUserOut {
  id: string;
  username: string | null;
  name: string | null;
  email: string | null;
  avatar_url: string | null;
  has_google?: boolean;
  has_github?: boolean;
}

export interface ProfileUpdatePayload {
  username?: string;
  name?: string;
  avatar_url?: string;
}

export interface PasswordUpdatePayload {
  old_password: string;
  new_password: string;
}

export function createAuthService(http: HttpClient) {
  return {
    login: (payload: LoginPayload) => http.post<TokenResponse>(AUTH.LOGIN, payload),

    logout: () => http.post<void>(AUTH.LOGOUT),

    getMe: () => http.get<AuthUserOut>(AUTH.ME),

    updateProfile: (payload: ProfileUpdatePayload) =>
      http.patch<AuthUserOut>(AUTH.PROFILE, payload),

    updatePassword: (payload: PasswordUpdatePayload) =>
      http.patch<void>(AUTH.PASSWORD, payload),

    unbindOAuth: (provider: "google" | "github") =>
      http.delete<void>(AUTH.oauthUnbind(provider)),

    getSetupStatus: () => http.get<SetupStatusResponse>(SETUP.STATUS),
  };
}

export type AuthService = ReturnType<typeof createAuthService>;
