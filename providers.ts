import { requestUrl, RequestUrlParam } from "obsidian";

// ─── Interfaces ────────────────────────────────────────────────────────────────

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

// ─── Local Provider (LM Studio / Ollama) ───────────────────────────────────────

export class LocalLLMProvider implements ILLMProvider {
  private endpoint: string;
  private model: string;

  constructor(config: LLMProviderConfig) {
    this.endpoint = config.endpoint;
    this.model = config.model;
  }

  updateConfig(config: LLMProviderConfig): void {
    this.endpoint = config.endpoint;
    this.model = config.model;
  }

  async completion(
    messages: { role: string; content: string }[],
    config?: { temperature?: number; max_tokens?: number }
  ): Promise<string> {
    const url = `${this.endpoint}/v1/chat/completions`;

    const body = {
      model: this.model,
      messages: messages,
      temperature: config?.temperature ?? 0.7,
      max_tokens: config?.max_tokens ?? -1,
    };

    const params: RequestUrlParam = {
      url: url,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    };

    try {
      const response = await requestUrl(params);
      const data = response.json;
      if (data.choices && data.choices.length > 0) {
        return data.choices[0].message.content;
      } else {
        throw new Error(
          "No choices returned from LLM: " + JSON.stringify(data)
        );
      }
    } catch (error: any) {
      console.error("Local LLM Provider Error:", error);
      console.error("URL:", url);
      if (error.status) console.error("Status:", error.status);
      if (error.message) console.error("Error message:", error.message);
      throw error;
    }
  }
}

export class LocalEmbeddingProvider implements IEmbeddingProvider {
  private endpoint: string;
  private model: string;

  constructor(config: EmbeddingProviderConfig) {
    this.endpoint = config.endpoint;
    this.model = config.model;
  }

  updateConfig(config: EmbeddingProviderConfig): void {
    this.endpoint = config.endpoint;
    this.model = config.model;
  }

  async generateEmbedding(text: string): Promise<number[]> {
    const url = `${this.endpoint}/v1/embeddings`;

    const body = {
      model: this.model,
      input: text,
    };

    const params: RequestUrlParam = {
      url: url,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    };

    try {
      const response = await requestUrl(params);
      const data = response.json;

      if (data.data && data.data.length > 0) {
        return data.data[0].embedding;
      } else {
        throw new Error(
          "No embedding returned from API: " + JSON.stringify(data)
        );
      }
    } catch (error: any) {
      console.error("Local Embedding Provider Error:", error);
      console.error("URL:", url);
      if (error.status) console.error("Status:", error.status);
      if (error.message) console.error("Error message:", error.message);
      throw error;
    }
  }
}

// ─── Gemini Provider ───────────────────────────────────────────────────────────

const GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/openai";

export class GeminiLLMProvider implements ILLMProvider {
  private model: string;
  private apiKey: string;

  constructor(config: LLMProviderConfig) {
    this.model = config.model;
    this.apiKey = config.apiKey || "";
  }

  updateConfig(config: LLMProviderConfig): void {
    this.model = config.model;
    this.apiKey = config.apiKey || "";
  }

  async completion(
    messages: { role: string; content: string }[],
    config?: { temperature?: number; max_tokens?: number }
  ): Promise<string> {
    const url = `${GEMINI_BASE_URL}/chat/completions`;

    const body: any = {
      model: this.model,
      messages: messages,
      temperature: config?.temperature ?? 0.7,
    };

    // Gemini uses max_completion_tokens instead of max_tokens
    if (config?.max_tokens && config.max_tokens > 0) {
      body.max_completion_tokens = config.max_tokens;
    }

    const params: RequestUrlParam = {
      url: url,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
    };

    try {
      const response = await requestUrl(params);
      const data = response.json;
      if (data.choices && data.choices.length > 0) {
        return data.choices[0].message.content;
      } else {
        throw new Error(
          "No choices returned from Gemini: " + JSON.stringify(data)
        );
      }
    } catch (error: any) {
      console.error("Gemini LLM Provider Error:", error);
      if (error.status === 401 || error.status === 403) {
        throw new Error("Invalid Gemini API key. Please check your API key in Settings.");
      }
      if (error.status) console.error("Status:", error.status);
      if (error.message) console.error("Error message:", error.message);
      throw error;
    }
  }
}

export class GeminiEmbeddingProvider implements IEmbeddingProvider {
  private model: string;
  private apiKey: string;

  constructor(config: EmbeddingProviderConfig) {
    this.model = config.model;
    this.apiKey = config.apiKey || "";
  }

  updateConfig(config: EmbeddingProviderConfig): void {
    this.model = config.model;
    this.apiKey = config.apiKey || "";
  }

  async generateEmbedding(text: string): Promise<number[]> {
    const url = `${GEMINI_BASE_URL}/embeddings`;

    const body = {
      model: this.model,
      input: text,
    };

    const params: RequestUrlParam = {
      url: url,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
    };

    try {
      const response = await requestUrl(params);
      const data = response.json;

      if (data.data && data.data.length > 0) {
        return data.data[0].embedding;
      } else {
        throw new Error(
          "No embedding returned from Gemini: " + JSON.stringify(data)
        );
      }
    } catch (error: any) {
      console.error("Gemini Embedding Provider Error:", error);
      if (error.status === 401 || error.status === 403) {
        throw new Error("Invalid Gemini API key. Please check your API key in Settings.");
      }
      if (error.status) console.error("Status:", error.status);
      if (error.message) console.error("Error message:", error.message);
      throw error;
    }
  }
}

// ─── Factory Functions ─────────────────────────────────────────────────────────

export type ProviderType = "local" | "gemini";

export interface ProviderSettings {
  providerType: ProviderType;
  // Local settings
  llmEndpoint: string;
  modelName: string;
  embeddingModel: string;
  // Gemini settings
  geminiApiKey: string;
  geminiModel: string;
  geminiEmbeddingModel: string;
}

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
