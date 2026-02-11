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
// @ts-ignore
import html2pdf from "html2pdf.js";

export const VIEW_TYPE_CHAT = "memex-chat-view";

export class ChatView extends ItemView {
  private llmService: LLMService;
  private conversationManager: ConversationManager;
  private component: Component;
  private currentConversation: Conversation | null = null;
  private messagesContainer: HTMLElement;
  private sidebarContainer: HTMLElement;
  private ragService?: any; // RAGService type (using any to avoid circular dependency)

  constructor(
    leaf: WorkspaceLeaf,
    llmService: LLMService,
    conversationManager: ConversationManager,
    private settings: any, // Using any to avoid circular dependency or need to export settings interface
    ragService?: any
  ) {
    super(leaf);
    this.llmService = llmService;
    this.conversationManager = conversationManager;
    this.component = new Component();
    this.ragService = ragService;
  }

  getViewType() {
    return VIEW_TYPE_CHAT;
  }

  getDisplayText() {
    return "Chat with Journal";
  }

  async onOpen() {
    this.containerEl.empty();
    this.containerEl.addClass("memex-chat-view");

    // Main Layout: Sidebar + Chat Area
    const mainLayout = this.containerEl.createEl("div", {
      cls: "memex-main-layout",
    });
    mainLayout.style.display = "flex";
    mainLayout.style.height = "100%";

    // Sidebar
    this.sidebarContainer = mainLayout.createEl("div", {
      cls: "memex-sidebar",
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
    const resizer = mainLayout.createEl("div", { cls: "memex-resizer" });
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
      cls: "memex-chat-area",
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
              .setTitle("Export to PDF")
              .setIcon("file-text")
              .onClick(async () => {
                  await this.exportConversationToPDF(conv);
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

  async exportConversationToPDF(conversation: Conversation) {
      new Notice("Generating PDF...");
      
      // Create a temporary container for rendering
      // We use a visible overlay to ensure html2canvas captures it correctly.
      // This also acts as a "loading" indicator of sorts.
      const tempContainer = document.body.createEl("div");
      tempContainer.style.position = "fixed";
      tempContainer.style.left = "0";
      tempContainer.style.top = "0";
      tempContainer.style.width = "100%";
      tempContainer.style.height = "100%";
      tempContainer.style.zIndex = "9999";
      tempContainer.style.backgroundColor = "white";
      tempContainer.style.overflowY = "auto"; // Allow scrolling if needed for debugging, though html2canvas captures full height
      tempContainer.style.padding = "40px";
      
      // Content Container (centered A4-ish look)
      const contentContainer = tempContainer.createEl("div");
      contentContainer.style.width = "700px"; // Reduced from 800px to prevent overflow
      contentContainer.style.maxWidth = "100%";
      contentContainer.style.margin = "0 auto";
      contentContainer.style.color = "black";
      contentContainer.style.backgroundColor = "white";
      contentContainer.style.fontFamily = "Arial, sans-serif";
      contentContainer.style.fontSize = "14px";
      contentContainer.style.lineHeight = "1.6";
      contentContainer.style.padding = "20px";
      contentContainer.style.boxSizing = "border-box";
      contentContainer.style.wordWrap = "break-word";
      contentContainer.style.overflowWrap = "break-word";
      
      // Header
      const h1 = contentContainer.createEl("h1", { text: conversation.title });
      h1.style.fontSize = "24px";
      h1.style.marginBottom = "10px";
      h1.style.color = "black";
      h1.style.fontWeight = "bold";
      
      const exportDate = contentContainer.createEl("p", { text: `Exported on ${new Date().toLocaleDateString()}` });
      exportDate.style.fontSize = "12px";
      exportDate.style.color = "#666";
      exportDate.style.marginBottom = "20px";
      
      const hr = contentContainer.createEl("hr");
      hr.style.border = "none";
      hr.style.borderTop = "2px solid #ddd";
      hr.style.marginBottom = "20px";

      // Messages
      for (const msg of conversation.messages) {
          const msgDiv = contentContainer.createEl("div");
          msgDiv.style.marginBottom = "25px";
          msgDiv.style.paddingBottom = "15px";
          msgDiv.style.borderBottom = "1px solid #e0e0e0";
          msgDiv.style.pageBreakInside = "avoid"; // Try to keep messages together

          const role = msg.role === "user" ? "You" : "Journal";
          const time = new Date(msg.timestamp).toLocaleTimeString();
          
          const header = msgDiv.createEl("div");
          header.style.fontWeight = "bold";
          header.style.marginBottom = "8px";
          header.style.fontSize = "13px";
          header.style.color = msg.role === "user" ? "#2e86de" : "#10ac84";
          header.innerText = `${role} (${time})`;

          const content = msgDiv.createEl("div");
          content.style.color = "black";
          content.style.fontSize = "14px";
          content.style.lineHeight = "1.6";
          
          // Use MarkdownRenderer
          await MarkdownRenderer.renderMarkdown(msg.content, content, "", this.component);
          
          // Apply comprehensive styling to all rendered elements
          const allElements = content.querySelectorAll("*");
          allElements.forEach((el: HTMLElement) => {
              el.style.color = "black";
              el.style.fontFamily = "Arial, sans-serif";
              
              // Style specific elements
              if (el.tagName === "P") {
                  el.style.marginBottom = "10px";
                  el.style.marginTop = "0";
                  el.style.pageBreakInside = "avoid";
              } else if (el.tagName === "H1") {
                  el.style.fontSize = "20px";
                  el.style.marginTop = "15px";
                  el.style.marginBottom = "10px";
                  el.style.fontWeight = "bold";
                  el.style.pageBreakInside = "avoid";
                  el.style.pageBreakAfter = "avoid";
              } else if (el.tagName === "H2") {
                  el.style.fontSize = "18px";
                  el.style.marginTop = "12px";
                  el.style.marginBottom = "8px";
                  el.style.fontWeight = "bold";
                  el.style.pageBreakInside = "avoid";
                  el.style.pageBreakAfter = "avoid";
              } else if (el.tagName === "H3") {
                  el.style.fontSize = "16px";
                  el.style.marginTop = "10px";
                  el.style.marginBottom = "6px";
                  el.style.fontWeight = "bold";
                  el.style.pageBreakInside = "avoid";
                  el.style.pageBreakAfter = "avoid";
              } else if (el.tagName === "UL" || el.tagName === "OL") {
                  el.style.marginLeft = "20px";
                  el.style.marginBottom = "10px";
                  el.style.pageBreakInside = "avoid";
              } else if (el.tagName === "LI") {
                  el.style.marginBottom = "5px";
                  el.style.pageBreakInside = "avoid";
              } else if (el.tagName === "CODE") {
                  el.style.backgroundColor = "#f5f5f5";
                  el.style.padding = "2px 4px";
                  el.style.borderRadius = "3px";
                  el.style.fontFamily = "Consolas, Monaco, monospace";
                  el.style.fontSize = "13px";
                  el.style.wordWrap = "break-word";
                  el.style.overflowWrap = "break-word";
              } else if (el.tagName === "PRE") {
                  el.style.backgroundColor = "#f5f5f5";
                  el.style.padding = "10px";
                  el.style.borderRadius = "5px";
                  el.style.overflow = "hidden";
                  el.style.marginBottom = "10px";
                  el.style.whiteSpace = "pre-wrap";
                  el.style.wordWrap = "break-word";
                  el.style.maxWidth = "100%";
                  el.style.pageBreakInside = "avoid";
              } else if (el.tagName === "BLOCKQUOTE") {
                  el.style.borderLeft = "4px solid #ddd";
                  el.style.paddingLeft = "15px";
                  el.style.marginLeft = "0";
                  el.style.color = "#666";
                  el.style.pageBreakInside = "avoid";
              } else if (el.tagName === "A") {
                  el.style.color = "#2e86de";
                  el.style.textDecoration = "underline";
              } else if (el.tagName === "IMG") {
                  el.style.maxWidth = "100%";
                  el.style.height = "auto";
                  el.style.pageBreakInside = "avoid";
              }
          });
      }

    // Wait a moment for images/rendering to settle
    await new Promise(resolve => setTimeout(resolve, 1000)); // Increased timeout

    console.log("PDF Container Content Length:", contentContainer.innerHTML.length);
      try {
          const opt = {
            margin: 10,
            filename: `${conversation.title}.pdf`,
            image: { type: 'jpeg', quality: 0.98 },
            html2canvas: { 
                scale: 2,
                useCORS: true,
                logging: true,
                windowWidth: 1200 // Force a desktop width
            },
            jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
          };

          // Capture the contentContainer, not the full overlay
          const pdfData = await html2pdf().from(contentContainer).set(opt as any).output('arraybuffer');
          
          const folderPath = "Memex/PDFs";
          if (!await this.app.vault.adapter.exists(folderPath)) {
              await this.app.vault.createFolder(folderPath);
          }

          const fileName = `${conversation.title.replace(/[^a-z0-9]/gi, '_')}.pdf`;
          const filePath = `${folderPath}/${fileName}`;
          
          // Check if exists
          if (await this.app.vault.adapter.exists(filePath)) {
              // Append timestamp
              const newName = `${conversation.title.replace(/[^a-z0-9]/gi, '_')}_${Date.now()}.pdf`;
              await this.app.vault.createBinary(`${folderPath}/${newName}`, pdfData);
              new Notice(`PDF saved to ${folderPath}/${newName}`);
          } else {
              await this.app.vault.createBinary(filePath, pdfData);
              new Notice(`PDF saved to ${filePath}`);
          }

      } catch (e) {
          console.error("PDF Export Error", e);
          new Notice("Failed to generate PDF");
      } finally {
          tempContainer.remove();
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
    buttonContainer.style.justifyContent = "space-between"; // Changed to space-between
    buttonContainer.style.marginTop = "10px";

    // Settings Button
    const settingsBtn = new ButtonComponent(buttonContainer);
    settingsBtn.setIcon("settings");
    settingsBtn.setTooltip("Chat Settings");
    settingsBtn.onClick(() => {
        if (this.currentConversation) {
            new ConversationSettingsModal(
                this.app, 
                this.currentConversation, 
                this.settings,
                async (newConfig) => {
                    this.currentConversation!.config = newConfig;
                    await this.conversationManager.saveConversation(this.currentConversation!);
                }
            ).open();
        }
    });

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
        const systemPrompt = this.currentConversation!.config?.systemPrompt || 
                             this.settings.personas[0]?.prompt || 
                             "You are a helpful assistant for a personal journal.";
                             
        let contextMessages = [
            { role: "system", content: systemPrompt }
        ];

        // Add RAG context if enabled and available
        if (this.ragService && this.settings.ragEnabled) {
          try {
            const lastUserMessage = this.currentConversation!.messages
              .filter(m => m.role === "user")
              .slice(-1)[0];
            
            if (lastUserMessage) {
              let ragQuery = lastUserMessage.content;

              // Rewrite follow-up queries using LLM when there's conversation history
              const allMessages = this.currentConversation!.messages;
              if (allMessages.length > 1) {
                try {
                  // Take the last 3 turns (up to 6 messages) for context, excluding the current user message
                  const recentHistory = allMessages.slice(0, -1).slice(-6);
                  const historyText = recentHistory
                    .map(m => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`)
                    .join("\n");

                  const rewriteMessages = [
                    {
                      role: "system",
                      content: "You are a query rewriter. Given a conversation history and a follow-up question, rewrite the follow-up into a standalone search query that captures the full intent. Output ONLY the rewritten query, nothing else. Keep it concise."
                    },
                    {
                      role: "user",
                      content: `Conversation history:\n${historyText}\n\nFollow-up question: ${lastUserMessage.content}\n\nRewrite as a standalone search query:`
                    }
                  ];

                  ragQuery = await this.llmService.completion(rewriteMessages, {
                    temperature: 0,
                    max_tokens: 150
                  });
                  ragQuery = ragQuery.trim();
                  console.log(`RAG: Rewrote query: "${lastUserMessage.content}" → "${ragQuery}"`);
                } catch (rewriteError) {
                  console.error("Query rewrite failed, using original query:", rewriteError);
                  // Fall back to original query
                }
              }

              const topK = this.currentConversation!.config?.topK ?? this.settings.topK;
              const similarityThreshold = this.currentConversation!.config?.similarityThreshold ?? this.settings.similarityThreshold;
              
              const ragContext = await this.ragService.retrieveContext(
                ragQuery,
                topK,
                similarityThreshold
              );

              if (ragContext.formattedContext) {
                contextMessages.push({
                  role: "system",
                  content: ragContext.formattedContext
                });
                console.log(`RAG: Retrieved ${ragContext.retrievedChunks.length} relevant chunks`);
              }
            }
          } catch (error) {
            console.error("RAG retrieval error:", error);
            // Continue without RAG context if there's an error
          }
        }

        // Add conversation history
        contextMessages.push(...this.currentConversation!.messages.map(m => ({
            role: m.role,
            content: m.content
        })));

        const config = {
            temperature: this.currentConversation!.config?.temperature ?? this.settings.defaultTemperature,
            max_tokens: this.currentConversation!.config?.maxTokens ?? this.settings.defaultMaxTokens
        };

        // Create the assistant message bubble immediately for streaming
        indicator.remove();
        const assistantMsg: Message = {
          role: "assistant",
          content: "",
          timestamp: Date.now(),
        };
        this.currentConversation!.messages.push(assistantMsg);
        this.appendMessage(assistantMsg);

        // Get the content element of the last appended message for live updates
        const allMsgDivs = this.messagesContainer.querySelectorAll(".chat-message");
        const lastMsgDiv = allMsgDivs[allMsgDivs.length - 1];
        const contentEl = lastMsgDiv?.querySelector(".message-content") as HTMLElement;

        let fullContent = "";
        let tokenCount = 0;

        try {
          for await (const token of this.llmService.streamCompletion(contextMessages, config)) {
            fullContent += token;
            tokenCount++;

            // Throttle DOM updates: re-render every 3 tokens
            if (tokenCount % 3 === 0 && contentEl) {
              contentEl.empty();
              await MarkdownRenderer.renderMarkdown(fullContent, contentEl, "", this.component);
              this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
            }
          }

          // Final render with complete content
          if (contentEl) {
            contentEl.empty();
            await MarkdownRenderer.renderMarkdown(fullContent, contentEl, "", this.component);
            this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
          }
        } catch (streamError: any) {
          // If streaming fails partway, keep whatever we got
          console.error("Streaming error:", streamError);
          if (!fullContent) {
            // If we got nothing, fall back to non-streaming
            fullContent = await this.llmService.completion(contextMessages, config);
            if (contentEl) {
              contentEl.empty();
              await MarkdownRenderer.renderMarkdown(fullContent, contentEl, "", this.component);
            }
          }
        }

        // Save the completed message
        assistantMsg.content = fullContent;
        await this.conversationManager.saveConversation(this.currentConversation!);
        
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
          const folderPath = "Memex/Exports";
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
    contentEl.createEl("p", { text: "File will be saved in 'Memex/Exports'" });

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

export class ConversationSettingsModal extends Modal {
  private conversation: Conversation;
  private settings: any;
  private onSave: (config: any) => void;
  private tempConfig: any;

  constructor(app: App, conversation: Conversation, settings: any, onSave: (config: any) => void) {
    super(app);
    this.conversation = conversation;
    this.settings = settings;
    this.onSave = onSave;
    
    // Initialize temp config with existing values or defaults
    this.tempConfig = {
        systemPrompt: conversation.config?.systemPrompt || settings.personas[0]?.prompt || "",
        temperature: conversation.config?.temperature ?? settings.defaultTemperature,
        maxTokens: conversation.config?.maxTokens ?? settings.defaultMaxTokens
    };
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.createEl("h2", { text: "Chat Settings" });

    // Persona Selector
    new Setting(contentEl)
        .setName("Persona")
        .setDesc("Select a preset persona")
        .addDropdown(dropdown => {
            this.settings.personas.forEach((p: any) => {
                dropdown.addOption(p.name, p.name);
            });
            dropdown.setValue("Custom"); // Default to showing current prompt
            dropdown.onChange((value) => {
                const persona = this.settings.personas.find((p: any) => p.name === value);
                if (persona) {
                    this.tempConfig.systemPrompt = persona.prompt;
                    // Update the text area below
                    const textArea = contentEl.querySelector("textarea");
                    if (textArea) textArea.value = persona.prompt;
                }
            });
        });

    // System Prompt
    new Setting(contentEl)
        .setName("System Prompt")
        .setDesc("Customize the behavior of the assistant")
        .addTextArea(text => text
            .setValue(this.tempConfig.systemPrompt)
            .setPlaceholder("You are a helpful assistant...")
            .onChange((value) => {
                this.tempConfig.systemPrompt = value;
            }));

    // Temperature
    new Setting(contentEl)
        .setName("Temperature")
        .setDesc("Controls randomness (0.0 - 1.0)")
        .addSlider(slider => slider
            .setLimits(0, 1, 0.05)
            .setValue(this.tempConfig.temperature)
            .setDynamicTooltip()
            .onChange((value) => {
                this.tempConfig.temperature = value;
            }));

    // Max Tokens
    new Setting(contentEl)
        .setName("Max Tokens")
        .setDesc("Maximum length of response")
        .addText(text => text
            .setValue(String(this.tempConfig.maxTokens))
            .onChange((value) => {
                const num = parseInt(value);
                if (!isNaN(num)) {
                    this.tempConfig.maxTokens = num;
                }
            }));

    new Setting(contentEl).addButton((btn) =>
      btn
        .setButtonText("Save")
        .setCta()
        .onClick(() => {
          this.onSave(this.tempConfig);
          this.close();
        })
    );
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
}
