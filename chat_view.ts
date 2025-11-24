import {
  ItemView,
  WorkspaceLeaf,
  Notice,
  ButtonComponent,
  TextAreaComponent,
  MarkdownRenderer,
  Component,
} from "obsidian";
import { LLMService } from "./llm_service";

export const VIEW_TYPE_CHAT = "smart-journal-chat-view";

export class ChatView extends ItemView {
  private llmService: LLMService;
  private component: Component;

  constructor(leaf: WorkspaceLeaf, llmService: LLMService) {
    super(leaf);
    this.llmService = llmService;
    this.component = new Component();
  }

  getViewType() {
    return VIEW_TYPE_CHAT;
  }

  getDisplayText() {
    return "Chat with Journal";
  }

  async onOpen() {
    const container = this.containerEl.children[1];
    container.empty();
    container.addClass("smart-journal-chat-container");

    // Chat History Area
    const historyEl = container.createEl("div", { cls: "chat-history" });
    historyEl.style.height = "calc(100% - 100px)";
    historyEl.style.overflowY = "auto";
    historyEl.style.padding = "10px";
    historyEl.style.marginBottom = "10px";
    historyEl.style.userSelect = "text";
    (historyEl as HTMLElement).style.setProperty("-webkit-user-select", "text");
    (historyEl as HTMLElement).style.setProperty("-moz-user-select", "text");
    (historyEl as HTMLElement).style.setProperty("-ms-user-select", "text");

    // Input Area
    const inputContainer = container.createEl("div", {
      cls: "chat-input-container",
    });
    inputContainer.style.display = "flex";
    inputContainer.style.flexDirection = "column";

    const inputEl = new TextAreaComponent(inputContainer);
    inputEl.setPlaceholder("Ask your journal a question...");
    inputEl.inputEl.style.width = "100%";
    inputEl.inputEl.style.minHeight = "60px";

    const buttonEl = new ButtonComponent(inputContainer);
    buttonEl.setButtonText("Send");
    buttonEl.setCta();
    buttonEl.buttonEl.style.marginTop = "10px";
    buttonEl.onClick(async () => {
      const question = inputEl.getValue();
      if (!question.trim()) return;

      // Display User Message
      this.addMessage(historyEl, "User", question);
      inputEl.setValue("");

      try {
        new Notice("Thinking...");
        const answer = await this.llmService.completion(question);

        // Display Assistant Message
        this.addMessage(historyEl, "Journal", answer);
      } catch (error: any) {
        const errorMsg = error?.message || error?.body || String(error);
        new Notice(`Error: ${errorMsg.substring(0, 50)}`);
        console.error("Chat error:", error);
        if (error.status) console.error("Status:", error.status);
        if (error.body) console.error("Response body:", error.body);
        this.addMessage(
          historyEl,
          "System",
          `Error: Could not retrieve answer. ${errorMsg.substring(0, 100)}`
        );
      }
    });
  }

  addMessage(container: Element, sender: string, text: string) {
    const msgDiv = container.createEl("div", { cls: "chat-message" });
    msgDiv.style.marginBottom = "15px";
    msgDiv.style.borderBottom = "1px solid var(--background-modifier-border)";
    msgDiv.style.paddingBottom = "10px";
    // Ensure text is selectable in the message container
    msgDiv.style.userSelect = "text";
    (msgDiv as HTMLElement).style.setProperty("-webkit-user-select", "text");
    (msgDiv as HTMLElement).style.setProperty("-moz-user-select", "text");
    (msgDiv as HTMLElement).style.setProperty("-ms-user-select", "text");

    const senderEl = msgDiv.createEl("strong", { text: sender + ": " });
    senderEl.style.color =
      sender === "User" ? "var(--text-accent)" : "var(--text-normal)";

    // Create a container for markdown content
    const contentEl = msgDiv.createEl("div", { cls: "chat-message-content" });
    contentEl.style.marginTop = "5px";
    // Ensure text is selectable
    contentEl.style.userSelect = "text";
    (contentEl as HTMLElement).style.setProperty("-webkit-user-select", "text");
    (contentEl as HTMLElement).style.setProperty("-moz-user-select", "text");
    (contentEl as HTMLElement).style.setProperty("-ms-user-select", "text");

    // Render markdown for assistant messages, plain text for user messages
    if (sender === "Journal" || sender === "System") {
      MarkdownRenderer.renderMarkdown(
        text,
        contentEl,
        "", // sourcePath - empty for chat messages
        this.component
      );
    } else {
      // For user messages, show as plain text (or you can render markdown here too)
      contentEl.createEl("span", { text: text });
    }

    // Auto-scroll to bottom
    container.scrollTop = container.scrollHeight;
  }

  async onClose() {
    this.component.unload();
  }
}
