import { App, TFile, Notice } from "obsidian";
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

  constructor(
    app: App,
    embeddingService: EmbeddingService,
    vectorStore: VectorStore,
    excludedFolders: string[] = [],
    autoIndexOnChange: boolean = true
  ) {
    this.app = app;
    this.embeddingService = embeddingService;
    this.vectorStore = vectorStore;
    this.excludedFolders = excludedFolders;
    this.autoIndexOnChange = autoIndexOnChange;
  }

  async initialize(): Promise<void> {
    try {
      await this.vectorStore.initialize();
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
   * Set up file watchers for auto-indexing
   */
  private setupFileWatchers(): void {
    // Watch for file modifications
    this.app.vault.on("modify", async (file) => {
      if (file instanceof TFile && file.extension === "md") {
        if (!this.shouldIndexFile(file.path)) {
          return;
        }
        console.log(`Auto-indexing modified file: ${file.path}`);
        await this.indexFile(file);
      }
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
        await this.vectorStore.deleteDocumentsByPath(file.path);
      }
    });

    // Watch for file rename
    this.app.vault.on("rename", async (file, oldPath) => {
      if (file instanceof TFile && file.extension === "md") {
        console.log(`Updating index for renamed file: ${oldPath} -> ${file.path}`);
        // Delete old entries
        await this.vectorStore.deleteDocumentsByPath(oldPath);
        // Index with new path
        if (this.shouldIndexFile(file.path)) {
          await this.indexFile(file);
        }
      }
    });
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
   * Index a single file
   */
  async indexFile(file: TFile): Promise<void> {
    if (!this.isInitialized) {
      throw new Error("RAG Service not initialized");
    }

    try {
      const content = await this.app.vault.read(file);
      const noteTitle = file.basename;

      // Check if file already has embeddings
      const existingIds = await this.vectorStore.getDocumentIdsByPath(file.path);
      
      // Delete existing embeddings for this file
      if (existingIds.length > 0) {
        await this.vectorStore.deleteDocumentsByPath(file.path);
      }

      // Process the document
      const { chunks, embeddings } = await this.embeddingService.processDocument(
        content,
        file.path,
        noteTitle
      );

      if (chunks.length === 0) {
        console.log(`No content to index for ${file.path}`);
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

      // Add to vector store
      await this.vectorStore.addDocuments(vectorDocuments);
      console.log(`Indexed ${chunks.length} chunks for ${file.path}`);
    } catch (error) {
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
