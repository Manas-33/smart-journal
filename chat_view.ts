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
  Modal,
  Setting,
  App,
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
               new RenameModal(this.app, conv.title, async (newTitle) => {
                   await this.conversationManager.renameConversation(conv.id, newTitle);
                   await this.renderSidebar();
               }).open();
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

    sendBtn.onClick(async () => {
        const content = inputEl.getValue();
        if (!content.trim()) return;
        inputEl.setValue("");
        await this.processUserMessage(content);
    });

    inputEl.inputEl.addEventListener("keydown", (e: KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        const content = inputEl.getValue();
        if (!content.trim()) return;
        inputEl.setValue("");
        this.processUserMessage(content);
      }
    });
  }

  async processUserMessage(content: string) {
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

      // Generate Title if it's the first message and title is "New Chat"
      if (this.currentConversation!.messages.length === 1 && this.currentConversation!.title === "New Chat") {
          const newTitle = content.substring(0, 30) + (content.length > 30 ? "..." : "");
          this.currentConversation!.title = newTitle;
          await this.conversationManager.saveConversation(this.currentConversation!);
          this.renderSidebar();
      }

      await this.generateAssistantResponse();
  }

  async generateAssistantResponse() {
      const indicator = this.showTypingIndicator();
      try {
        // Prepare context
        const contextMessages = this.currentConversation!.messages.map(m => ({
            role: m.role,
            content: m.content
        }));

        const answer = await this.llmService.completion(contextMessages);
        indicator.remove();

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
        indicator.remove();
        new Notice("Error generating response");
        console.error(error);
        const errorMsg: Message = {
            role: "system",
            content: `Error: ${error.message || "Unknown error"}`,
            timestamp: Date.now()
        };
        this.appendMessage(errorMsg);
      }
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
    header.style.display = "flex";
    header.style.justifyContent = "space-between";
    header.style.alignItems = "center";
    
    const roleSpan = header.createEl("span", { text: message.role === "user" ? "You" : "Journal" });

    // Timestamp
    const date = new Date(message.timestamp);
    const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const timestampSpan = header.createEl("span", { text: timeStr });
    timestampSpan.style.fontSize = "0.9em";
    timestampSpan.style.marginLeft = "10px";
    timestampSpan.style.opacity = "0.8";

    const actionsDiv = header.createEl("div", { cls: "message-actions" });
    actionsDiv.style.display = "flex";
    actionsDiv.style.gap = "5px";

    // Menu Button
    const menuBtn = actionsDiv.createEl("div", { cls: "message-action-btn" });
    setIcon(menuBtn, "more-horizontal");
    menuBtn.style.cursor = "pointer";
    menuBtn.style.opacity = "0.6";
    menuBtn.title = "Message actions";
    
    menuBtn.addEventListener("mouseenter", () => menuBtn.style.opacity = "1");
    menuBtn.addEventListener("mouseleave", () => menuBtn.style.opacity = "0.6");

    menuBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        const menu = new Menu();

        // Copy
        menu.addItem((item) => 
            item
                .setTitle("Copy")
                .setIcon("copy")
                .onClick(async () => {
                    await navigator.clipboard.writeText(message.content);
                    new Notice("Copied to clipboard");
                })
        );

        // Edit (User only)
        if (message.role === "user") {
            menu.addItem((item) => 
                item
                    .setTitle("Edit")
                    .setIcon("pencil")
                    .onClick(() => {
                        this.editMessage(message, msgDiv, content);
                    })
            );
        }

        // Regenerate (Assistant only)
        if (message.role === "assistant") {
            menu.addItem((item) => 
                item
                    .setTitle("Regenerate")
                    .setIcon("refresh-cw")
                    .onClick(async () => {
                        await this.regenerateMessage(message);
                    })
            );
        }

        // Delete
        menu.addItem((item) => 
            item
                .setTitle("Delete")
                .setIcon("trash")
                .setWarning(true)
                .onClick(async () => {
                    await this.deleteMessage(message);
                })
        );

        // Export to Note
        menu.addItem((item) => 
            item
                .setTitle("Export to Note")
                .setIcon("file-plus")
                .onClick(async () => {
                    await this.exportMessageToNote(message);
                })
        );

        menu.showAtMouseEvent(e);
    });

    const content = msgDiv.createEl("div", { cls: "message-content" });
    
    if (message.role === "assistant" || message.role === "system") {
        MarkdownRenderer.renderMarkdown(message.content, content, "", this.component);
    } else {
        content.innerText = message.content;
    }

    this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
  }

  editMessage(message: Message, msgDiv: HTMLElement, contentEl: HTMLElement) {
      contentEl.empty();
      const editArea = new TextAreaComponent(contentEl);
      editArea.setValue(message.content);
      editArea.inputEl.style.width = "100%";
      editArea.inputEl.style.minHeight = "60px";
      
      const btnContainer = contentEl.createEl("div");
      btnContainer.style.display = "flex";
      btnContainer.style.justifyContent = "flex-end";
      btnContainer.style.gap = "5px";
      btnContainer.style.marginTop = "5px";

      const saveBtn = new ButtonComponent(btnContainer);
      saveBtn.setButtonText("Save & Submit");
      saveBtn.setCta();
      
      const cancelBtn = new ButtonComponent(btnContainer);
      cancelBtn.setButtonText("Cancel");

      cancelBtn.onClick(() => {
          contentEl.empty();
          contentEl.innerText = message.content;
      });

      saveBtn.onClick(async () => {
          const newContent = editArea.getValue();
          if (!newContent.trim() || newContent === message.content) {
              contentEl.empty();
              contentEl.innerText = message.content;
              return;
          }

          const index = this.currentConversation!.messages.indexOf(message);
          if (index !== -1) {
              this.currentConversation!.messages = this.currentConversation!.messages.slice(0, index);
              await this.conversationManager.saveConversation(this.currentConversation!);
              
              this.messagesContainer.empty();
              for (const msg of this.currentConversation!.messages) {
                  this.appendMessage(msg);
              }
              
              await this.processUserMessage(newContent);
          }
      });
  }

  async regenerateMessage(message: Message) {
      const index = this.currentConversation!.messages.indexOf(message);
      if (index !== -1) {
          this.currentConversation!.messages.splice(index, 1);
          await this.conversationManager.saveConversation(this.currentConversation!);
          
          this.messagesContainer.empty();
          for (const msg of this.currentConversation!.messages) {
              this.appendMessage(msg);
          }

          await this.generateAssistantResponse();
      }
  }

  async deleteMessage(message: Message) {
      const index = this.currentConversation!.messages.indexOf(message);
      if (index !== -1) {
          this.currentConversation!.messages.splice(index, 1);
          await this.conversationManager.saveConversation(this.currentConversation!);
          
          this.messagesContainer.empty();
          for (const msg of this.currentConversation!.messages) {
              this.appendMessage(msg);
          }
      }
  }

  async exportMessageToNote(message: Message) {
      const defaultName = `Chat Export ${new Date().toISOString().replace(/[:.]/g, "-")}`;
      new ExportModal(this.app, defaultName, async (fileName) => {
          const folderPath = "Smart Journal/Exports";
          if (!await this.app.vault.adapter.exists(folderPath)) {
              await this.app.vault.createFolder(folderPath);
          }
          
          const fullPath = `${folderPath}/${fileName}.md`;
          await this.app.vault.create(fullPath, message.content);
          new Notice(`Exported to ${fullPath}`);
      }).open();
  }

  showTypingIndicator() {
      const indicator = this.messagesContainer.createEl("div", { cls: "typing-indicator" });
      indicator.innerText = "Journal is thinking...";
      indicator.style.opacity = "0.7";
      indicator.style.fontStyle = "italic";
      indicator.style.marginBottom = "10px";
      indicator.style.padding = "10px";
      this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
      return indicator;
  }

  async onClose() {
    this.component.unload();
  }
}

export class RenameModal extends Modal {
  private currentName: string;
  private onSubmit: (newName: string) => void;

  constructor(app: App, currentName: string, onSubmit: (newName: string) => void) {
    super(app);
    this.currentName = currentName;
    this.onSubmit = onSubmit;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.createEl("h2", { text: "Rename Chat" });

    let newName = this.currentName;

    new Setting(contentEl)
      .setName("Name")
      .addText((text) =>
        text
          .setValue(this.currentName)
          .onChange((value) => {
            newName = value;
          })
      );

    new Setting(contentEl).addButton((btn) =>
      btn
        .setButtonText("Save")
        .setCta()
        .onClick(() => {
          this.close();
          this.onSubmit(newName);
        })
    );
    
    // Focus input on open
    const input = contentEl.querySelector("input");
    if (input) {
        input.focus();
        input.select();
        input.addEventListener("keydown", (e) => {
            if (e.key === "Enter") {
                this.close();
                this.onSubmit(newName);
            }
        });
    }
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
}

export class ExportModal extends Modal {
  private defaultName: string;
  private onSubmit: (fileName: string) => void;

  constructor(app: App, defaultName: string, onSubmit: (fileName: string) => void) {
    super(app);
    this.defaultName = defaultName;
    this.onSubmit = onSubmit;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.createEl("h2", { text: "Export to Note" });
    contentEl.createEl("p", { text: "File will be saved in 'Smart Journal/Exports'" });

    let fileName = this.defaultName;

    new Setting(contentEl)
      .setName("Note Name")
      .addText((text) =>
        text
          .setValue(this.defaultName)
          .onChange((value) => {
            fileName = value;
          })
      );

    new Setting(contentEl).addButton((btn) =>
      btn
        .setButtonText("Export")
        .setCta()
        .onClick(() => {
          this.close();
          this.onSubmit(fileName);
        })
    );
    
    // Focus input on open
    const input = contentEl.querySelector("input");
    if (input) {
        input.focus();
        input.select();
        input.addEventListener("keydown", (e) => {
            if (e.key === "Enter") {
                this.close();
                this.onSubmit(fileName);
            }
        });
    }
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
}
