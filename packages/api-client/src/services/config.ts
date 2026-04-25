import type { HttpClient } from "../lib/client";
import { CONFIG } from "../lib/routes";

export interface AppConfigMap {
  llm_provider: string;
  openai_api_key: string;
  openai_base_url: string;
  llm_model: string;
  llm_utility_model: string;
  llm_utility_api_key: string;
  llm_utility_base_url: string;
  embedding_model: string;
  embedding_api_key: string;
  embedding_base_url: string;
  reranker_api_key: string;
  reranker_model: string;
  reranker_base_url: string;
  tavily_api_key: string;
  perplexity_api_key: string;
  image_gen_api_key: string;
  image_gen_base_url: string;
  image_gen_model: string;
  storage_backend: string;
  storage_region: string;
  storage_s3_endpoint_url: string;
  storage_s3_public_url: string;
  storage_s3_bucket: string;
  storage_s3_access_key: string;
  storage_s3_secret_key: string;
  ai_name: string;
  user_occupation: string;
  user_preferences: string;
  notify_email: string;
  smtp_host: string;
  smtp_port: string;
  smtp_username: string;
  smtp_password: string;
  smtp_from: string;
}

export interface TestLlmResult {
  ok: boolean;
  model: string;
  message: string;
}

export interface TestEmbeddingResult {
  ok: boolean;
  model: string;
  dimensions: number;
  message: string;
}

export interface TestRerankerResult {
  ok: boolean;
  model: string;
  message: string;
}

export interface TestEmailResult {
  ok: boolean;
  message: string;
}

export function createConfigService(http: HttpClient) {
  return {
    getConfig: async (): Promise<Partial<AppConfigMap>> => {
      const res = await http.get<{ data: Partial<AppConfigMap> }>(CONFIG.BASE);
      return res.data;
    },
    updateConfig: (patch: Partial<AppConfigMap>) =>
      http.patch<void>(CONFIG.BASE, { data: patch }),
    testLlmConnection: () => http.post<TestLlmResult>(CONFIG.TEST_LLM),
    testUtilityLlmConnection: () => http.post<TestLlmResult>(CONFIG.TEST_UTILITY_LLM),
    testEmbeddingConnection: () => http.post<TestEmbeddingResult>(CONFIG.TEST_EMBEDDING),
    testRerankerConnection: () => http.post<TestRerankerResult>(CONFIG.TEST_RERANKER),
    testEmailConnection: () => http.post<TestEmailResult>(CONFIG.TEST_EMAIL),
  };
}

export type ConfigService = ReturnType<typeof createConfigService>;
