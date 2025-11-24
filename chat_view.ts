import {
  ItemView,
  WorkspaceLeaf,
  Notice,
  ButtonComponent,
  TextAreaComponent,
  MarkdownRenderer,
  Component,
  setIcon,
  Menu,
} from "obsidian";
import { LLMService } from "./llm_service";
import { ConversationManager, Conversation, Message } from "./conversation_manager";

export const VIEW_TYPE_CHAT = "smart-journal-chat-view";

export class ChatView extends ItemView {
  private llmService: LLMService;
  private conversationManager: ConversationManager;
  private component: Component;
  private currentConversation: Conversation | null = null;
  private messagesContainer: HTMLElement;
  private sidebarContainer: HTMLElement;

  constructor(
    leaf: WorkspaceLeaf,
    llmService: LLMService,
    conversationManager: ConversationManager
  ) {
    super(leaf);
    this.llmService = llmService;
    this.conversationManager = conversationManager;
    this.component = new Component();
  }

  getViewType() {
    return VIEW_TYPE_CHAT;
  }

  getDisplayText() {
    return "Chat with Journal";
  }

  async onOpen() {
    this.containerEl.empty();
    this.containerEl.addClass("smart-journal-chat-view");

    // Main Layout: Sidebar + Chat Area
    const mainLayout = this.containerEl.createEl("div", {
      cls: "smart-journal-main-layout",
    });
    mainLayout.style.display = "flex";
    mainLayout.style.height = "100%";

    // Sidebar
    this.sidebarContainer = mainLayout.createEl("div", {
      cls: "smart-journal-sidebar",
    });
    this.sidebarContainer.style.width = "250px";
    this.sidebarContainer.style.minWidth = "150px";
    this.sidebarContainer.style.maxWidth = "500px";
    this.sidebarContainer.style.borderRight = "1px solid var(--background-modifier-border)";
    this.sidebarContainer.style.display = "flex";
    this.sidebarContainer.style.flexDirection = "column";
    this.sidebarContainer.style.backgroundColor = "var(--background-secondary)";
    this.sidebarContainer.style.transition = "width 0.3s ease, min-width 0.3s ease, padding 0.3s ease, opacity 0.3s ease";
    this.sidebarContainer.style.overflow = "hidden";

    // Resizer
    const resizer = mainLayout.createEl("div", { cls: "smart-journal-resizer" });
    resizer.style.width = "5px";
    resizer.style.cursor = "col-resize";
    resizer.style.backgroundColor = "transparent";
    resizer.style.height = "100%";
    resizer.style.flexShrink = "0";
    resizer.style.transition = "background-color 0.2s ease";
    
    resizer.addEventListener("mouseenter", () => {
        resizer.style.backgroundColor = "var(--interactive-accent)";
    });
    resizer.addEventListener("mouseleave", () => {
        if (!isResizing) resizer.style.backgroundColor = "transparent";
    });

    let isResizing = false;

    resizer.addEventListener("mousedown", (e) => {
      isResizing = true;
      document.body.style.cursor = "col-resize";
      resizer.style.backgroundColor = "var(--interactive-accent)";
    });

    document.addEventListener("mousemove", (e) => {
      if (!isResizing) return;
      const newWidth = e.clientX - this.containerEl.getBoundingClientRect().left;
      if (newWidth > 150 && newWidth < 500) {
        this.sidebarContainer.style.width = `${newWidth}px`;
      }
    });

    document.addEventListener("mouseup", () => {
      if (isResizing) {
        isResizing = false;
        document.body.style.cursor = "default";
        resizer.style.backgroundColor = "transparent";
      }
    });

    // Chat Area
    const chatArea = mainLayout.createEl("div", {
      cls: "smart-journal-chat-area",
    });
    chatArea.style.flex = "1";
    chatArea.style.display = "flex";
    chatArea.style.flexDirection = "column";
    chatArea.style.height = "100%";
    chatArea.style.position = "relative"; // For absolute positioning of toggle button

    // Toggle Button (Floating)
    const toggleBtn = chatArea.createEl("button", { cls: "sidebar-toggle-btn" });
    setIcon(toggleBtn, "panel-left");
    toggleBtn.style.position = "absolute";
    toggleBtn.style.top = "10px";
    toggleBtn.style.left = "10px";
    toggleBtn.style.zIndex = "10";
    toggleBtn.style.background = "var(--background-primary)";
    toggleBtn.style.border = "1px solid var(--background-modifier-border)";
    toggleBtn.style.borderRadius = "4px";
    toggleBtn.style.padding = "4px";
    toggleBtn.style.cursor = "pointer";
    toggleBtn.style.opacity = "0.6";
    
    toggleBtn.addEventListener("mouseenter", () => {
        toggleBtn.style.opacity = "1";
    });
    toggleBtn.addEventListener("mouseleave", () => {
        toggleBtn.style.opacity = "0.6";
    });

    let isCollapsed = false;
    let lastWidth = "250px";

    toggleBtn.onClickEvent(() => {
        isCollapsed = !isCollapsed;
        if (isCollapsed) {
            lastWidth = this.sidebarContainer.style.width;
            this.sidebarContainer.style.width = "0px";
            this.sidebarContainer.style.minWidth = "0px";
            this.sidebarContainer.style.padding = "0px";
            this.sidebarContainer.style.opacity = "0";
            resizer.style.display = "none";
        } else {
            this.sidebarContainer.style.width = lastWidth;
            this.sidebarContainer.style.minWidth = "150px";
            this.sidebarContainer.style.padding = ""; // reset
            this.sidebarContainer.style.opacity = "1";
            resizer.style.display = "block";
        }
    });

    await this.renderSidebar();
    this.renderChatArea(chatArea);

    // Load most recent conversation or create new one
    const conversations = await this.conversationManager.getConversations();
    if (conversations.length > 0) {
      await this.loadConversation(conversations[0].id);
    } else {
      await this.createNewConversation();
    }
  }

  async renderSidebar() {
    this.sidebarContainer.empty();

    // Header with New Chat button
    const header = this.sidebarContainer.createEl("div", {
      cls: "sidebar-header",
    });
    header.style.padding = "10px";
    header.style.borderBottom = "1px solid var(--background-modifier-border)";
    header.style.display = "flex";
    header.style.justifyContent = "space-between";
    header.style.alignItems = "center";

    const title = header.createEl("h3", { text: "Chats" });
    title.style.margin = "0";

    const newChatBtn = new ButtonComponent(header);
    newChatBtn.setIcon("plus");
    newChatBtn.setTooltip("New Chat");
    newChatBtn.onClick(async () => {
      await this.createNewConversation();
    });

    // Conversation List
    const listContainer = this.sidebarContainer.createEl("div", {
      cls: "conversation-list",
    });
    listContainer.style.flex = "1";
    listContainer.style.overflowY = "auto";
    listContainer.style.padding = "10px";

    const conversations = await this.conversationManager.getConversations();

    for (const conv of conversations) {
      const item = listContainer.createEl("div", {
        cls: "conversation-item",
      });
      item.style.padding = "8px";
      item.style.borderRadius = "4px";
      item.style.cursor = "pointer";
      item.style.marginBottom = "5px";
      item.style.display = "flex";
      item.style.justifyContent = "space-between";
      item.style.alignItems = "center";

      if (this.currentConversation && this.currentConversation.id === conv.id) {
        item.style.backgroundColor = "var(--background-modifier-active-hover)";
      } else {
        item.addEventListener("mouseenter", () => {
          item.style.backgroundColor = "var(--background-modifier-hover)";
        });
        item.addEventListener("mouseleave", () => {
          if (!this.currentConversation || this.currentConversation.id !== conv.id) {
            item.style.backgroundColor = "transparent";
          }
        });
      }

      const titleSpan = item.createEl("span", { text: conv.title });
      titleSpan.style.whiteSpace = "nowrap";
      titleSpan.style.overflow = "hidden";
      titleSpan.style.textOverflow = "ellipsis";
      titleSpan.style.flex = "1";
      titleSpan.style.marginRight = "5px";

      titleSpan.addEventListener("click", async () => {
        await this.loadConversation(conv.id);
      });

      // Context Menu for Rename/Delete
      const menuBtn = item.createEl("div", { cls: "conversation-menu-btn" });
      setIcon(menuBtn, "more-vertical");
      menuBtn.style.opacity = "0.5";
      menuBtn.style.fontSize = "12px";
      
      menuBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        const menu = new Menu();
        
        menu.addItem((item) =>
          item
            .setTitle("Rename")
            .setIcon("pencil")
            .onClick(async () => {
               // Simple prompt for renaming (could be improved with a modal)
               // For now, we'll just use a browser prompt as a quick solution, 
               // or we could replace the text with an input.
               // Let's use a simple input replacement.
               const newTitle = prompt("Enter new chat name:", conv.title);
               if (newTitle && newTitle !== conv.title) {
                   await this.conversationManager.renameConversation(conv.id, newTitle);
                   await this.renderSidebar();
               }
            })
        );

        menu.addItem((item) =>
          item
            .setTitle("Delete")
            .setIcon("trash")
            .setWarning(true)
            .onClick(async () => {
               if (confirm("Are you sure you want to delete this chat?")) {
                   await this.conversationManager.deleteConversation(conv.id);
                   if (this.currentConversation?.id === conv.id) {
                       this.currentConversation = null;
                       this.messagesContainer.empty();
                       // Try to load another one
                       const remaining = await this.conversationManager.getConversations();
                       if (remaining.length > 0) {
                           await this.loadConversation(remaining[0].id);
                       } else {
                           await this.createNewConversation();
                       }
                   } else {
                       await this.renderSidebar();
                   }
               }
            })
        );

        menu.showAtMouseEvent(e);
      });
    }
  }

  renderChatArea(container: HTMLElement) {
    // Messages Area
    this.messagesContainer = container.createEl("div", { cls: "chat-messages" });
    this.messagesContainer.style.flex = "1";
    this.messagesContainer.style.overflowY = "auto";
    this.messagesContainer.style.padding = "20px";

    // Input Area
    const inputContainer = container.createEl("div", {
      cls: "chat-input-container",
    });
    inputContainer.style.padding = "20px";
    inputContainer.style.borderTop = "1px solid var(--background-modifier-border)";
    inputContainer.style.display = "flex";
    inputContainer.style.flexDirection = "column";

    const inputEl = new TextAreaComponent(inputContainer);
    inputEl.setPlaceholder("Ask your journal a question...");
    inputEl.inputEl.style.width = "100%";
    inputEl.inputEl.style.minHeight = "60px";
    inputEl.inputEl.style.resize = "vertical";

    const buttonContainer = inputContainer.createEl("div");
    buttonContainer.style.display = "flex";
    buttonContainer.style.justifyContent = "flex-end";
    buttonContainer.style.marginTop = "10px";

    const sendBtn = new ButtonComponent(buttonContainer);
    sendBtn.setButtonText("Send");
    sendBtn.setCta();

    const sendMessage = async () => {
      const content = inputEl.getValue();
      if (!content.trim()) return;

      if (!this.currentConversation) {
        await this.createNewConversation();
      }

      // Add User Message
      const userMsg: Message = {
        role: "user",
        content: content,
        timestamp: Date.now(),
      };
      this.currentConversation!.messages.push(userMsg);
      await this.conversationManager.saveConversation(this.currentConversation!);
      this.appendMessage(userMsg);
      
      inputEl.setValue("");

      // Generate Title if it's the first message and title is "New Chat"
      if (this.currentConversation!.messages.length === 1 && this.currentConversation!.title === "New Chat") {
          const newTitle = content.substring(0, 30) + (content.length > 30 ? "..." : "");
          this.currentConversation!.title = newTitle;
          await this.conversationManager.saveConversation(this.currentConversation!);
          this.renderSidebar();
      }

      try {
        new Notice("Thinking...");
        // Prepare context
        const contextMessages = this.currentConversation!.messages.map(m => ({
            role: m.role,
            content: m.content
        }));

        const answer = await this.llmService.completion(contextMessages);

        // Add Assistant Message
        const assistantMsg: Message = {
          role: "assistant",
          content: answer,
          timestamp: Date.now(),
        };
        this.currentConversation!.messages.push(assistantMsg);
        await this.conversationManager.saveConversation(this.currentConversation!);
        this.appendMessage(assistantMsg);
        
        // Refresh sidebar to update timestamp sorting
        this.renderSidebar();

      } catch (error: any) {
        new Notice("Error generating response");
        console.error(error);
        const errorMsg: Message = {
            role: "system",
            content: `Error: ${error.message || "Unknown error"}`,
            timestamp: Date.now()
        };
        this.appendMessage(errorMsg);
      }
    };

    sendBtn.onClick(sendMessage);

    inputEl.inputEl.addEventListener("keydown", (e: KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    });
  }

  async createNewConversation() {
    this.currentConversation = await this.conversationManager.createConversation();
    this.messagesContainer.empty();
    await this.renderSidebar();
  }

  async loadConversation(id: string) {
    const conversation = await this.conversationManager.loadConversation(id);
    if (conversation) {
      this.currentConversation = conversation;
      this.messagesContainer.empty();
      for (const msg of conversation.messages) {
        this.appendMessage(msg);
      }
      await this.renderSidebar(); // Update active state
    }
  }

  appendMessage(message: Message) {
    const msgDiv = this.messagesContainer.createEl("div", { cls: "chat-message" });
    msgDiv.addClass(`message-${message.role}`);
    msgDiv.style.marginBottom = "15px";
    msgDiv.style.padding = "10px";
    msgDiv.style.borderRadius = "8px";
    if (message.role === "user") {
        msgDiv.style.maxWidth = "85%";
        msgDiv.style.alignSelf = "flex-end";
        msgDiv.style.backgroundColor = "var(--interactive-accent)";
        msgDiv.style.color = "var(--text-on-accent)";
        msgDiv.style.marginLeft = "auto";
    } else {
        msgDiv.style.maxWidth = "100%";
        msgDiv.style.alignSelf = "flex-start";
        msgDiv.style.backgroundColor = "var(--background-secondary)";
        msgDiv.style.marginRight = "auto";
    }

    const header = msgDiv.createEl("div", { cls: "message-header" });
    header.style.fontSize = "0.8em";
    header.style.opacity = "0.7";
    header.style.marginBottom = "5px";
    header.innerText = message.role === "user" ? "You" : "Journal";

    const content = msgDiv.createEl("div", { cls: "message-content" });
    
    if (message.role === "assistant" || message.role === "system") {
        MarkdownRenderer.renderMarkdown(message.content, content, "", this.component);
    } else {
        content.innerText = message.content;
    }

    this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
  }

  async onClose() {
    this.component.unload();
  }
}
