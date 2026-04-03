import { AUTH } from "@/lib/api-routes";
import { http } from "@/lib/http-client";

export interface LoginPayload {
  username: string;
  password: string;
}

export interface TokenResponse {
  access_token: string;
  token_type: string;
}

export interface AuthUser {
  id: string;
  username: string | null;
  name: string | null;
  email: string | null;
  avatar_url: string | null;
}

export function login(payload: LoginPayload) {
  return http.post<TokenResponse>(AUTH.LOGIN, payload);
}

export function logout() {
  return http.post<void>(AUTH.LOGOUT);
}

export function getCurrentUser() {
  return http.get<AuthUser>(AUTH.ME);
}
