/**
 * @file 认证与用户管理服务
 * @description 提供登录、登出、初始化向导、用户资料管理、OAuth 解绑等接口。
 */
import { http } from "@/lib/http-client"
import { AUTH, SETUP } from "@/lib/api-routes"
import type { StorageBackend } from "@/lib/constants"

/** 登录请求参数 */
export interface LoginPayload {
  username: string
  password: string
}

/** 登录/初始化成功后返回的 Token */
export interface TokenResponse {
  access_token: string
  token_type: string
}

/**
 * 用户名密码登录
 * @param payload - 登录凭据
 * @returns 认证 Token
 */
export async function login(payload: LoginPayload): Promise<TokenResponse> {
  return http.post<TokenResponse>(AUTH.LOGIN, payload)
}

/**
 * 登出当前用户（服务端会话销毁）
 */
export async function logout(): Promise<void> {
  await http.post(AUTH.LOGOUT)
}

/** 初始化状态检查结果 */
export interface SetupStatusResponse {
  configured: boolean
}

/**
 * 检查系统是否已完成初始化
 * @returns 是否已配置
 */
export async function getSetupStatus(): Promise<SetupStatusResponse> {
  return http.get<SetupStatusResponse>(SETUP.STATUS)
}

/** 初始化向导提交的全部参数 */
export interface SetupInitPayload {
  // Account
  username: string
  password: string
  display_name?: string
  avatar_url?: string
  // AI
  openai_api_key: string
  openai_base_url?: string
  llm_model?: string
  embedding_model?: string
  tavily_api_key?: string
  // Storage
  storage_backend?: StorageBackend
  storage_region?: string
  storage_s3_endpoint_url?: string
  storage_s3_bucket?: string
  storage_s3_access_key?: string
  storage_s3_secret_key?: string
  // Personality
  ai_name?: string
  user_occupation?: string
  user_preferences?: string
  custom_system_prompt?: string
}

/**
 * 提交系统初始化配置（首次部署时调用）
 * @param payload - 账号、AI、存储、个性化等初始化参数
 * @returns 创建成功后的认证 Token
 */
export async function setupInit(payload: SetupInitPayload): Promise<TokenResponse> {
  return http.post<TokenResponse>(SETUP.INIT, payload)
}

/** 用户资料更新参数 */
export interface ProfileUpdatePayload {
  name?: string
  avatar_url?: string
}

/** 用户信息输出结构 */
export interface AuthUserOut {
  id: string
  username: string | null
  name: string | null
  email: string | null
  avatar_url: string | null
  has_google?: boolean
  has_github?: boolean
}

/**
 * 更新当前用户资料
 * @param payload - 需要更新的字段
 * @returns 更新后的用户信息
 */
export async function updateProfile(payload: ProfileUpdatePayload): Promise<AuthUserOut> {
  return http.patch<AuthUserOut>(AUTH.PROFILE, payload)
}

/** 修改密码参数 */
export interface PasswordUpdatePayload {
  old_password: string
  new_password: string
}

/**
 * 修改当前用户密码
 * @param payload - 旧密码和新密码
 */
export async function updatePassword(payload: PasswordUpdatePayload): Promise<void> {
  await http.patch(AUTH.PASSWORD, payload)
}

/**
 * 解绑第三方 OAuth 账号
 * @param provider - 服务商（"google" | "github"）
 */
export async function unbindOAuth(provider: "google" | "github"): Promise<void> {
  await http.delete(AUTH.oauthUnbind(provider))
}

/** 初始化向导中的 LLM 连接测试参数 */
export interface TestLlmPayload {
  api_key: string
  base_url?: string
  model?: string
}

/** LLM 连接测试结果 */
export interface TestLlmResult {
  ok: boolean
  message: string
}

/**
 * 在初始化向导中测试 LLM 连接（使用用户提供的临时凭据）
 * @param payload - 临时 API Key、Base URL 和模型
 * @returns 测试结果
 */
export async function testLlmConnection(payload: TestLlmPayload): Promise<TestLlmResult> {
  return http.post<TestLlmResult>(SETUP.TEST_LLM, payload, { skipToast: true })
}
