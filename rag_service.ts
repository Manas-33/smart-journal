import { App, TFile, TAbstractFile, Notice } from "obsidian";
import { EmbeddingService, DocumentChunk } from "./embedding_service";
import { VectorStore, VectorDocument, SearchResult } from "./vector_store";

export interface RAGContext {
  query: string;
  retrievedChunks: SearchResult[];
  formattedContext: string;
}

export class RAGService {
  private app: App;
  private embeddingService: EmbeddingService;
  private vectorStore: VectorStore;
  private isInitialized: boolean = false;
  private excludedFolders: string[];
  private autoIndexOnChange: boolean;
  private contentHashesPath: string;
  /** Content hash cache to skip re-indexing unchanged files */
  private contentHashes: Map<string, string> = new Map();
  /** Set of file paths that have been modified but not yet re-indexed */
  private dirtyFiles: Set<string> = new Set();
  /** Debounce timer for saving content hashes */
  private saveHashesTimer: NodeJS.Timeout | null = null;
  private static readonly SAVE_HASHES_DEBOUNCE_MS = 2000;

  constructor(
    app: App,
    embeddingService: EmbeddingService,
    vectorStore: VectorStore,
    contentHashesPath: string,
    excludedFolders: string[] = [],
    autoIndexOnChange: boolean = true
  ) {
    this.app = app;
    this.embeddingService = embeddingService;
    this.vectorStore = vectorStore;
    this.contentHashesPath = contentHashesPath;
    this.excludedFolders = excludedFolders;
    this.autoIndexOnChange = autoIndexOnChange;
  }

  async initialize(): Promise<void> {
    try {
      await this.vectorStore.initialize();
      await this.loadContentHashes();
      this.isInitialized = true;
      console.log("RAG Service initialized");

      // Set up file watchers if auto-indexing is enabled
      if (this.autoIndexOnChange) {
        this.setupFileWatchers();
      }
    } catch (error) {
      console.error("Failed to initialize RAG Service:", error);
      throw error;
    }
  }

  /**
   * Load content hashes from disk
   */
  private async loadContentHashes(): Promise<void> {
    try {
      const adapter = this.app.vault.adapter;
      if (await adapter.exists(this.contentHashesPath)) {
        const data = await adapter.read(this.contentHashesPath);
        const hashes = JSON.parse(data);
        this.contentHashes = new Map(Object.entries(hashes));
        console.log(`Loaded ${this.contentHashes.size} content hashes from disk`);
      }
    } catch (error) {
      console.error("Failed to load content hashes:", error);
      // Continue with empty hashes
    }
  }

  /**
   * Save content hashes to disk (debounced to avoid excessive writes)
   */
  private saveContentHashes(): void {
    if (this.saveHashesTimer) {
      clearTimeout(this.saveHashesTimer);
    }

    this.saveHashesTimer = setTimeout(async () => {
      try {
        const adapter = this.app.vault.adapter;
        const hashes = Object.fromEntries(this.contentHashes);
        await adapter.write(this.contentHashesPath, JSON.stringify(hashes));
        console.log(`Saved ${this.contentHashes.size} content hashes to disk`);
      } catch (error) {
        console.error("Failed to save content hashes:", error);
      }
    }, RAGService.SAVE_HASHES_DEBOUNCE_MS);
  }

  /**
   * Simple fast hash of a string (djb2 algorithm).
   * Not cryptographic — just for content-change detection.
   */
  private hashContent(content: string): string {
    let hash = 5381;
    for (let i = 0; i < content.length; i++) {
      hash = ((hash << 5) + hash + content.charCodeAt(i)) & 0xffffffff;
    }
    return hash.toString(36);
  }

  /**
   * Set up file watchers for auto-indexing
   */
  private setupFileWatchers(): void {
    // Watch for file modifications – just mark as dirty, no API calls yet
    this.app.vault.on("modify", (file: TAbstractFile) => {
      if (file instanceof TFile && file.extension === "md") {
        if (!this.shouldIndexFile(file.path)) {
          return;
        }
        this.dirtyFiles.add(file.path);
      }
    });

    // Re-index dirty files when the user switches away from a note
    this.app.workspace.on("active-leaf-change", async () => {
      await this.flushDirtyFiles();
    });

    // Watch for file creation
    this.app.vault.on("create", async (file) => {
      if (file instanceof TFile && file.extension === "md") {
        if (!this.shouldIndexFile(file.path)) {
          return;
        }
        console.log(`Auto-indexing new file: ${file.path}`);
        await this.indexFile(file);
      }
    });

    // Watch for file deletion
    this.app.vault.on("delete", async (file) => {
      if (file instanceof TFile && file.extension === "md") {
        console.log(`Removing deleted file from index: ${file.path}`);
        this.contentHashes.delete(file.path);
        await this.vectorStore.deleteDocumentsByPath(file.path);
      }
    });

    // Watch for file rename
    this.app.vault.on("rename", async (file, oldPath) => {
      if (file instanceof TFile && file.extension === "md") {
        console.log(`Updating index for renamed file: ${oldPath} -> ${file.path}`);
        // Clean up old entries and hash
        this.contentHashes.delete(oldPath);
        await this.vectorStore.deleteDocumentsByPath(oldPath);
        // Index with new path
        if (this.shouldIndexFile(file.path)) {
          await this.indexFile(file);
        }
      }
    });
  }

  /**
   * Process all dirty (modified but not yet re-indexed) files.
   * Called when the user switches away from a note.
   */
  async flushDirtyFiles(): Promise<void> {
    if (this.dirtyFiles.size === 0) return;

    // Snapshot and clear so new edits during indexing are tracked separately
    const paths = [...this.dirtyFiles];
    this.dirtyFiles.clear();

    for (const filePath of paths) {
      const abstractFile = this.app.vault.getAbstractFileByPath(filePath);
      if (!(abstractFile instanceof TFile)) continue;

      try {
        await this.indexFile(abstractFile);
      } catch (error) {
        console.error(`Auto-index failed for ${filePath}:`, error);
      }
    }
  }

  /**
   * Check if a file should be indexed based on excluded folders
   */
  private shouldIndexFile(filePath: string): boolean {
    for (const excludedFolder of this.excludedFolders) {
      if (filePath.startsWith(excludedFolder)) {
        return false;
      }
    }
    return true;
  }

  /**
   * Index a single file.
   * Uses content hashing to skip unchanged files and atomic swap
   * to prevent data loss if embedding generation fails.
   */
  async indexFile(file: TFile): Promise<void> {
    if (!this.isInitialized) {
      throw new Error("RAG Service not initialized");
    }

    try {
      const content = await this.app.vault.read(file);
      const noteTitle = file.basename;

      // ── Content hash check: skip if unchanged ──────────────────────────
      const contentHash = this.hashContent(content);
      const previousHash = this.contentHashes.get(file.path);

      if (previousHash === contentHash) {
        console.log(`Skipping unchanged file: ${file.path}`);
        return;
      }

      // ── Skip empty or whitespace-only files ────────────────────────────
      if (content.trim().length === 0) {
        console.log(`Skipping empty file: ${file.path}`);
        // Still update hash so we don't retry empty files
        this.contentHashes.set(file.path, contentHash);
        this.saveContentHashes();
        return;
      }

      // ── Generate new embeddings FIRST (before deleting old ones) ──────
      const { chunks, embeddings } = await this.embeddingService.processDocument(
        content,
        file.path,
        noteTitle
      );

      if (chunks.length === 0) {
        console.log(`No content to index for ${file.path}`);
        // Still update hash so we don't retry empty files
        this.contentHashes.set(file.path, contentHash);
        return;
      }

      // Create vector documents
      const vectorDocuments: VectorDocument[] = chunks.map((chunk, index) => ({
        id: `${file.path}::chunk::${chunk.metadata.chunkIndex}`,
        content: chunk.content,
        embedding: embeddings[index],
        metadata: {
          filePath: file.path,
          chunkIndex: chunk.metadata.chunkIndex,
          totalChunks: chunk.metadata.totalChunks,
          noteTitle: chunk.metadata.noteTitle,
          timestamp: file.stat.mtime,
        },
      }));

      // ── Atomic swap: delete old ONLY after new embeddings succeed ─────
      await this.vectorStore.deleteDocumentsByPath(file.path);
      await this.vectorStore.addDocuments(vectorDocuments);

      // Update the content hash now that everything succeeded
      this.contentHashes.set(file.path, contentHash);
      this.saveContentHashes();

      console.log(`Indexed ${chunks.length} chunks for ${file.path}`);
    } catch (error) {
      // Old embeddings are preserved since we only delete after success
      console.error(`Failed to index file ${file.path}:`, error);
      throw error;
    }
  }

  /**
   * Index all markdown files in the vault
   */
  async indexVault(progressCallback?: (current: number, total: number) => void): Promise<void> {
    if (!this.isInitialized) {
      throw new Error("RAG Service not initialized");
    }

    const files = this.app.vault.getMarkdownFiles();
    const filesToIndex = files.filter((file) => this.shouldIndexFile(file.path));

    console.log(`Indexing ${filesToIndex.length} files...`);

    for (let i = 0; i < filesToIndex.length; i++) {
      const file = filesToIndex[i];
      try {
        await this.indexFile(file);
        if (progressCallback) {
          progressCallback(i + 1, filesToIndex.length);
        }
      } catch (error) {
        console.error(`Error indexing ${file.path}:`, error);
        // Continue with other files even if one fails
      }
    }

    console.log("Vault indexing complete");
  }

  /**
   * Retrieve relevant context for a query
   */
  async retrieveContext(
    query: string,
    topK: number = 5,
    similarityThreshold: number = 0.7
  ): Promise<RAGContext> {
    if (!this.isInitialized) {
      throw new Error("RAG Service not initialized");
    }

    try {
      // Generate embedding for the query
      const queryEmbedding = await this.embeddingService.generateEmbedding(query);

      // Search for similar chunks
      const retrievedChunks = await this.vectorStore.search(
        queryEmbedding,
        topK,
        similarityThreshold
      );

      // Format the context for the LLM
      const formattedContext = this.formatContext(retrievedChunks);

      return {
        query,
        retrievedChunks,
        formattedContext,
      };
    } catch (error) {
      console.error("Failed to retrieve context:", error);
      throw error;
    }
  }

  /**
   * Format retrieved chunks into a context string for the LLM
   */
  private formatContext(chunks: SearchResult[]): string {
    if (chunks.length === 0) {
      return "";
    }

    let context = "Here are relevant excerpts from your notes:\n\n";

    // Group chunks by file
    const chunksByFile = new Map<string, SearchResult[]>();
    for (const chunk of chunks) {
      const filePath = chunk.metadata.filePath;
      if (!chunksByFile.has(filePath)) {
        chunksByFile.set(filePath, []);
      }
      chunksByFile.get(filePath)!.push(chunk);
    }

    // Format each file's chunks
    for (const [filePath, fileChunks] of chunksByFile) {
      const noteTitle = fileChunks[0].metadata.noteTitle;
      context += `### From: [[${noteTitle}]]\n`;
      
      // Sort chunks by index
      fileChunks.sort((a, b) => a.metadata.chunkIndex - b.metadata.chunkIndex);
      
      for (const chunk of fileChunks) {
        context += `${chunk.content}\n\n`;
      }
      
      context += "---\n\n";
    }

    return context;
  }

  /**
   * Clear the entire index
   */
  async clearIndex(): Promise<void> {
    if (!this.isInitialized) {
      throw new Error("RAG Service not initialized");
    }

    await this.vectorStore.clearAll();
    console.log("Index cleared");
  }

  /**
   * Get index statistics
   */
  async getIndexStats(): Promise<{ totalDocuments: number }> {
    if (!this.isInitialized) {
      throw new Error("RAG Service not initialized");
    }

    const totalDocuments = await this.vectorStore.getCount();
    return { totalDocuments };
  }

  /**
   * Update settings
   */
  updateSettings(excludedFolders: string[], autoIndexOnChange: boolean): void {
    this.excludedFolders = excludedFolders;
    this.autoIndexOnChange = autoIndexOnChange;
  }
}
