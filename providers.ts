import { requestUrl, RequestUrlParam } from "obsidian";

// ─── Types ────────────────────────────────────────────────────────────────────

export type ProviderType = "local" | "gemini";

export interface LLMProviderConfig {
  endpoint: string;
  model: string;
  apiKey?: string;
}

export interface EmbeddingProviderConfig {
  endpoint: string;
  model: string;
  apiKey?: string;
}

export interface ProviderSettings {
  providerType: ProviderType;
  llmEndpoint: string;
  modelName: string;
  embeddingModel: string;
  geminiApiKey: string;
  geminiModel: string;
  geminiEmbeddingModel: string;
}

// ─── Interfaces ───────────────────────────────────────────────────────────────

export interface ILLMProvider {
  completion(
    messages: { role: string; content: string }[],
    config?: { temperature?: number; max_tokens?: number }
  ): Promise<string>;
  updateConfig(config: LLMProviderConfig): void;
}

export interface IEmbeddingProvider {
  generateEmbedding(text: string): Promise<number[]>;
  updateConfig(config: EmbeddingProviderConfig): void;
}

// ─── Local Providers (OpenAI-Compatible) ──────────────────────────────────────

export class LocalLLMProvider implements ILLMProvider {
  private endpoint: string;
  private model: string;

  constructor(config: LLMProviderConfig) {
    this.endpoint = config.endpoint;
    this.model = config.model;
  }

  async completion(
    messages: { role: string; content: string }[],
    config?: { temperature?: number; max_tokens?: number }
  ): Promise<string> {
    const params: RequestUrlParam = {
      url: `${this.endpoint}/v1/chat/completions`,
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: this.model,
        messages,
        temperature: config?.temperature ?? 0.7,
        max_tokens: config?.max_tokens ?? 2000,
      }),
    };

    const response = await requestUrl(params);
    return response.json.choices[0].message.content;
  }

  updateConfig(config: LLMProviderConfig): void {
    this.endpoint = config.endpoint;
    this.model = config.model;
  }
}

export class LocalEmbeddingProvider implements IEmbeddingProvider {
  private endpoint: string;
  private model: string;

  constructor(config: EmbeddingProviderConfig) {
    this.endpoint = config.endpoint;
    this.model = config.model;
  }

  async generateEmbedding(text: string): Promise<number[]> {
    const params: RequestUrlParam = {
      url: `${this.endpoint}/v1/embeddings`,
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: this.model,
        input: text,
      }),
    };

    const response = await requestUrl(params);
    return response.json.data[0].embedding;
  }

  updateConfig(config: EmbeddingProviderConfig): void {
    this.endpoint = config.endpoint;
    this.model = config.model;
  }
}

// ─── Gemini Providers (OpenAI-Compatible Endpoint) ────────────────────────────

const GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/openai";

export class GeminiLLMProvider implements ILLMProvider {
  private model: string;
  private apiKey: string;

  constructor(config: LLMProviderConfig) {
    this.model = config.model;
    this.apiKey = config.apiKey || "";
  }

  async completion(
    messages: { role: string; content: string }[],
    config?: { temperature?: number; max_tokens?: number }
  ): Promise<string> {
    const params: RequestUrlParam = {
      url: `${GEMINI_BASE_URL}/chat/completions`,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        messages,
        temperature: config?.temperature ?? 0.7,
        max_tokens: config?.max_tokens ?? 2000,
      }),
    };

    const response = await requestUrl(params);
    return response.json.choices[0].message.content;
  }

  updateConfig(config: LLMProviderConfig): void {
    this.model = config.model;
    this.apiKey = config.apiKey || "";
  }
}

export class GeminiEmbeddingProvider implements IEmbeddingProvider {
  private model: string;
  private apiKey: string;

  constructor(config: EmbeddingProviderConfig) {
    this.model = config.model;
    this.apiKey = config.apiKey || "";
  }

  async generateEmbedding(text: string): Promise<number[]> {
    const params: RequestUrlParam = {
      url: `${GEMINI_BASE_URL}/embeddings`,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        input: text,
      }),
    };

    const response = await requestUrl(params);
    return response.json.data[0].embedding;
  }

  updateConfig(config: EmbeddingProviderConfig): void {
    this.model = config.model;
    this.apiKey = config.apiKey || "";
  }
}

// ─── Factory Functions ────────────────────────────────────────────────────────

export function createLLMProvider(settings: ProviderSettings): ILLMProvider {
  switch (settings.providerType) {
    case "gemini":
      return new GeminiLLMProvider({
        endpoint: GEMINI_BASE_URL,
        model: settings.geminiModel,
        apiKey: settings.geminiApiKey,
      });
    case "local":
    default:
      return new LocalLLMProvider({
        endpoint: settings.llmEndpoint,
        model: settings.modelName,
      });
  }
}

export function createEmbeddingProvider(settings: ProviderSettings): IEmbeddingProvider {
  switch (settings.providerType) {
    case "gemini":
      return new GeminiEmbeddingProvider({
        endpoint: GEMINI_BASE_URL,
        model: settings.geminiEmbeddingModel,
        apiKey: settings.geminiApiKey,
      });
    case "local":
    default:
      return new LocalEmbeddingProvider({
        endpoint: settings.llmEndpoint,
        model: settings.embeddingModel,
      });
  }
}
