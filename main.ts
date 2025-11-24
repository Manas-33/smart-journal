import {
  App,
  Editor,
  MarkdownView,
  Notice,
  Plugin,
  PluginSettingTab,
  Setting,
  WorkspaceLeaf,
} from "obsidian";
import { LLMService } from "./llm_service";
import { Processor } from "./processor";
import { ChatView, VIEW_TYPE_CHAT } from "./chat_view";
import { ConversationManager } from "./conversation_manager";

interface SmartJournalSettings {
  llmEndpoint: string;
  modelName: string;
  weeklySummaryPath: string;
  personas: { name: string; prompt: string }[];
  defaultTemperature: number;
  defaultMaxTokens: number;
}

const DEFAULT_SETTINGS: SmartJournalSettings = {
  llmEndpoint: "http://localhost:1234",
  modelName: "llama-3.2-3b-instruct",
  weeklySummaryPath: "Weekly Summaries",
  personas: [
      { name: "Default", prompt: "You are a helpful assistant for a personal journal." },
      { name: "Obsidian Architect", prompt: "You are an expert in Obsidian and Personal Knowledge Management (PKM). Help me organize notes, suggest links using [[WikiLinks]], and recommend tags. Format output in clean Markdown." },
      { name: "Zettelkasten Guide", prompt: "You are a Zettelkasten method expert. Help me break down complex ideas into atomic notes and find connections between them." },
      { name: "Daily Reflector", prompt: "You are a compassionate journaling companion. Help me reflect on my day, identify patterns, and set intentions. Use a warm, supportive tone." },
      { name: "Concise Summarizer", prompt: "You are a precise summarizer. Create concise summaries of the provided text, using bullet points and bold text for key insights." }
  ],
  defaultTemperature: 0.7,
  defaultMaxTokens: 2000,
};
export default class SmartJournalPlugin extends Plugin {
  settings: SmartJournalSettings;
  llmService: LLMService;
  processor: Processor;
  conversationManager: ConversationManager;

  async onload() {
    await this.loadSettings();

    this.llmService = new LLMService(
      this.settings.llmEndpoint,
      this.settings.modelName
    );
    this.processor = new Processor(this.llmService);
    this.conversationManager = new ConversationManager(this.app);
    await this.conversationManager.initialize();

    this.registerView(
      VIEW_TYPE_CHAT,
      (leaf) => new ChatView(leaf, this.llmService, this.conversationManager, this.settings)
    );
    this.addRibbonIcon("message-square", "Chat with Journal", () => {
      this.activateView();
    });

    // Command: Auto Tag Current Note
    this.addCommand({
      id: "auto-tag-note",
      name: "Auto Tag Current Note",
      editorCallback: async (editor: Editor, view: MarkdownView) => {
        const content = editor.getValue();
        new Notice("Generating tags...");
        try {
          const tags = await this.processor.generateTags(content);
          const tagsString = `\n\nTags: ${tags
            .map((t) => `#${t}`)
            .join(" ")}\n\n`;
          editor.replaceRange(tagsString, { line: 0, ch: 0 });
          new Notice("Tags added!");
        } catch (error) {
          new Notice("Error generating tags. Check console.");
          console.error(error);
        }
      },
    });

    // Command: Extract Action Items
    this.addCommand({
      id: "extract-action-items",
      name: "Extract Action Items",
      editorCallback: async (editor: Editor, view: MarkdownView) => {
        const content = editor.getValue();
        new Notice("Extracting action items...");
        try {
          const items = await this.processor.extractActionItems(content);
          if (items.length > 0) {
            const itemsString = `\n\n## Action Items\n${items.join("\n")}`;
            editor.replaceRange(itemsString, {
              line: editor.lineCount(),
              ch: 0,
            });
            new Notice("Action items added!");
          } else {
            new Notice("No action items found.");
          }
        } catch (error) {
          new Notice("Error extracting action items. Check console.");
          console.error(error);
        }
      },
    });

    // Command: Weekly Summary
    this.addCommand({
      id: "weekly-summary",
      name: "Generate Weekly Summary",
      callback: async () => {
        new Notice("Generating Weekly Summary...");
        try {
          const now = new Date();
          const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

          const files = this.app.vault.getMarkdownFiles();
          const recentFiles = files.filter(
            (file) => file.stat.mtime >= oneWeekAgo.getTime()
          );

          if (recentFiles.length === 0) {
            new Notice("No notes found from the last week.");
            return;
          }

          const notesContent = await Promise.all(
            recentFiles.map((file) => this.app.vault.read(file))
          );
          const summary = await this.processor.summarizeWeekly(notesContent);

          // Folder Structure: Weekly Summaries/{Year}
          const year = now.getFullYear().toString();
          const folderPath = `Weekly Summaries/${year}`;

          if (!this.app.vault.getAbstractFileByPath("Weekly Summaries")) {
            await this.app.vault.createFolder("Weekly Summaries");
          }
          if (!this.app.vault.getAbstractFileByPath(folderPath)) {
            await this.app.vault.createFolder(folderPath);
          }

          // Filename: Week-{WeekNum}-{DateRange}
          // Simple date formatting
          const dateStr = now.toISOString().split("T")[0];
          const fileName = `Week-Summary-${dateStr}.md`;
          const filePath = `${folderPath}/${fileName}`;

          // Check if file exists
          if (this.app.vault.getAbstractFileByPath(filePath)) {
            new Notice(`Summary for this week already exists: ${filePath}`);
            return;
          }

          await this.app.vault.create(
            filePath,
            `# Weekly Summary (${dateStr})\n\n${summary}`
          );

          new Notice(`Weekly Summary saved to ${filePath}`);
        } catch (error) {
          new Notice("Error generating summary. Check console.");
          console.error(error);
        }
      },
    });

    // Command: Open Chat
    this.addCommand({
      id: "open-chat",
      name: "Open Chat with Journal",
      callback: () => {
        this.activateView();
      },
    });

    this.addSettingTab(new SmartJournalSettingTab(this.app, this));
  }

  async activateView() {
    const { workspace } = this.app;

    let leaf: WorkspaceLeaf | null = null;
    const leaves = workspace.getLeavesOfType(VIEW_TYPE_CHAT);

    if (leaves.length > 0) {
      // A leaf with our view already exists, use that
      leaf = leaves[0];
    } else {
      // Our view could not be found in the workspace, create a new leaf
      // in the right sidebar for it
      leaf = workspace.getRightLeaf(false);
      if (leaf) {
        await leaf.setViewState({ type: VIEW_TYPE_CHAT, active: true });
      }
    }

    // "Reveal" the leaf in case it is in a collapsed sidebar
    if (leaf) {
      workspace.revealLeaf(leaf);
    }
  }

  onunload() {}

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
    this.llmService.updateSettings(
      this.settings.llmEndpoint,
      this.settings.modelName
    );
  }
}

class SmartJournalSettingTab extends PluginSettingTab {
  plugin: SmartJournalPlugin;

  constructor(app: App, plugin: SmartJournalPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;

    containerEl.empty();

    containerEl.createEl("h2", { text: "Smart Journal Settings" });

    new Setting(containerEl)
      .setName("LLM Endpoint")
      .setDesc("The URL of your local LLM server (e.g., http://localhost:1234)")
      .addText((text) =>
        text
          .setPlaceholder("http://localhost:1234")
          .setValue(this.plugin.settings.llmEndpoint)
          .onChange(async (value) => {
            this.plugin.settings.llmEndpoint = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Model Name")
      .setDesc("The name of the model to use (e.g., qwen/qwen3-vl-4b)")
      .addText((text) =>
        text
          .setPlaceholder("qwen/qwen3-vl-4b")
          .setValue(this.plugin.settings.modelName)
          .onChange(async (value) => {
            this.plugin.settings.modelName = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Weekly Summary Path")
      .setDesc("Folder to save weekly summaries")
      .addText((text) =>
        text
          .setPlaceholder("Weekly Summaries")
          .setValue(this.plugin.settings.weeklySummaryPath)
          .onChange(async (value) => {
            this.plugin.settings.weeklySummaryPath = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
        .setName("Default Temperature")
        .setDesc("Controls randomness (0.0 - 1.0)")
        .addSlider(slider => slider
            .setLimits(0, 1, 0.05)
            .setValue(this.plugin.settings.defaultTemperature)
            .setDynamicTooltip()
            .onChange(async (value) => {
                this.plugin.settings.defaultTemperature = value;
                await this.plugin.saveSettings();
            }));

    new Setting(containerEl)
        .setName("Default Max Tokens")
        .setDesc("Maximum length of response")
        .addText(text => text
            .setValue(String(this.plugin.settings.defaultMaxTokens))
            .onChange(async (value) => {
                const num = parseInt(value);
                if (!isNaN(num)) {
                    this.plugin.settings.defaultMaxTokens = num;
                    await this.plugin.saveSettings();
                }
            }));

    containerEl.createEl("h3", { text: "Personas" });
    
    // Simple JSON editor for personas for now to avoid complex UI
    new Setting(containerEl)
        .setName("Personas JSON")
        .setDesc("Edit personas as JSON array of {name, prompt}")
        .addTextArea(text => text
            .setValue(JSON.stringify(this.plugin.settings.personas, null, 2))
            .setPlaceholder("[]")
            .onChange(async (value) => {
                try {
                    const parsed = JSON.parse(value);
                    if (Array.isArray(parsed)) {
                        this.plugin.settings.personas = parsed;
                        await this.plugin.saveSettings();
                    }
                } catch (e) {
                    // Invalid JSON, ignore
                }
            }));
  }
}
