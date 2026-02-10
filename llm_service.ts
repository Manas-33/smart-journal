import { ILLMProvider } from "./providers";

export class LLMService {
  private provider: ILLMProvider;

  constructor(provider: ILLMProvider) {
    this.provider = provider;
  }

  updateProvider(provider: ILLMProvider) {
    this.provider = provider;
  }

  async completion(
    messages: { role: string; content: string }[],
    config?: { temperature?: number; max_tokens?: number }
  ): Promise<string> {
    return this.provider.completion(messages, config);
  }
}
