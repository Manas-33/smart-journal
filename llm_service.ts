import { requestUrl, RequestUrlParam } from "obsidian";

export class LLMService {
  private endpoint: string;
  private model: string;

  constructor(endpoint: string, model: string) {
    this.endpoint = endpoint;
    this.model = model;
  }

  updateSettings(endpoint: string, model: string) {
    this.endpoint = endpoint;
    this.model = model;
  }

  async completion(messages: { role: string; content: string }[]): Promise<string> {
    const url = `${this.endpoint}/v1/chat/completions`;

    const body = {
      model: this.model,
      messages: [
        {
          role: "system",
          content: "You are a helpful assistant for a personal journal.",
        },
        ...messages,
      ],
      temperature: 0.7,
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
      console.error("LLM Service Error:", error);
      console.error("URL:", url);
      console.error("Request body:", JSON.stringify(body, null, 2));
      if (error.status) console.error("Status:", error.status);
      if (error.body) console.error("Response body:", error.body);
      if (error.message) console.error("Error message:", error.message);
      throw error;
    }
  }
}
