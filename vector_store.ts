import { App } from "obsidian";

export interface VectorDocument {
  id: string;
  content: string;
  embedding: number[];
  metadata: {
    filePath: string;
    chunkIndex: number;
    totalChunks: number;
    noteTitle: string;
    timestamp: number;
  };
}

export interface SearchResult {
  id: string;
  content: string;
  metadata: {
    filePath: string;
    chunkIndex: number;
    totalChunks: number;
    noteTitle: string;
    timestamp: number;
  };
  similarity: number;
}

interface VectorStoreData {
  documents: VectorDocument[];
  version: string;
}

export class VectorStore {
  private documents: Map<string, VectorDocument> = new Map();
  private dbPath: string;
  private app: App;
  private saveTimeout: NodeJS.Timeout | null = null;

  constructor(app: App, dbPath: string) {
    this.app = app;
    this.dbPath = dbPath;
  }

  /**
   * Initialize vector store and load from disk
   */
  async initialize(): Promise<void> {
    try {
      // Ensure directory exists
      const dirPath = this.dbPath.substring(0, this.dbPath.lastIndexOf("/"));
      if (!(await this.app.vault.adapter.exists(dirPath))) {
        await this.app.vault.adapter.mkdir(dirPath);
      }

      // Load existing data if available
      if (await this.app.vault.adapter.exists(this.dbPath)) {
        const data = await this.app.vault.adapter.read(this.dbPath);
        const storeData: VectorStoreData = JSON.parse(data);
        
        // Rebuild the map from loaded documents
        this.documents.clear();
        for (const doc of storeData.documents) {
          this.documents.set(doc.id, doc);
        }
        
        console.log(`Vector Store: Loaded ${this.documents.size} documents from disk`);
      } else {
        console.log("Vector Store: Initialized empty store");
      }
    } catch (error) {
      console.error("Failed to initialize Vector Store:", error);
      throw error;
    }
  }

  /**
   * Save the vector store to disk (debounced)
   */
  private async saveToDisk(): Promise<void> {
    // Debounce saves to avoid excessive writes
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
    }

    this.saveTimeout = setTimeout(async () => {
      try {
        const storeData: VectorStoreData = {
          documents: Array.from(this.documents.values()),
          version: "1.0",
        };

        const data = JSON.stringify(storeData, null, 2);
        await this.app.vault.adapter.write(this.dbPath, data);
        console.log(`Vector Store: Saved ${this.documents.size} documents to disk`);
      } catch (error) {
        console.error("Failed to save Vector Store:", error);
      }
    }, 1000); // Wait 1 second before saving
  }

  /**
   * Calculate cosine similarity between two vectors
   */
  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) {
      throw new Error("Vectors must have the same length");
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    normA = Math.sqrt(normA);
    normB = Math.sqrt(normB);

    if (normA === 0 || normB === 0) {
      return 0;
    }

    return dotProduct / (normA * normB);
  }

  /**
   * Add documents to the vector store
   */
  async addDocuments(documents: VectorDocument[]): Promise<void> {
    if (documents.length === 0) {
      return;
    }

    for (const doc of documents) {
      this.documents.set(doc.id, doc);
    }

    await this.saveToDisk();
    console.log(`Vector Store: Added ${documents.length} documents`);
  }

  /**
   * Update existing documents
   */
  async updateDocuments(documents: VectorDocument[]): Promise<void> {
    if (documents.length === 0) {
      return;
    }

    for (const doc of documents) {
      this.documents.set(doc.id, doc);
    }

    await this.saveToDisk();
    console.log(`Vector Store: Updated ${documents.length} documents`);
  }

  /**
   * Delete documents by file path
   */
  async deleteDocumentsByPath(filePath: string): Promise<void> {
    const idsToDelete: string[] = [];
    
    for (const [id, doc] of this.documents.entries()) {
      if (doc.metadata.filePath === filePath) {
        idsToDelete.push(id);
      }
    }

    for (const id of idsToDelete) {
      this.documents.delete(id);
    }

    if (idsToDelete.length > 0) {
      await this.saveToDisk();
      console.log(`Vector Store: Deleted ${idsToDelete.length} documents for ${filePath}`);
    }
  }

  /**
   * Search for similar documents
   */
  async search(
    queryEmbedding: number[],
    topK: number = 5,
    similarityThreshold: number = 0.7
  ): Promise<SearchResult[]> {
    const results: Array<{ doc: VectorDocument; similarity: number }> = [];

    // Calculate similarity for all documents
    for (const doc of this.documents.values()) {
      const similarity = this.cosineSimilarity(queryEmbedding, doc.embedding);
      
      if (similarity >= similarityThreshold) {
        results.push({ doc, similarity });
      }
    }

    // Sort by similarity (descending) and take top K
    results.sort((a, b) => b.similarity - a.similarity);
    const topResults = results.slice(0, topK);

    // Convert to SearchResult format
    const searchResults: SearchResult[] = topResults.map(({ doc, similarity }) => ({
      id: doc.id,
      content: doc.content,
      metadata: doc.metadata,
      similarity,
    }));

    return searchResults;
  }

  /**
   * Get all document IDs for a specific file
   */
  async getDocumentIdsByPath(filePath: string): Promise<string[]> {
    const ids: string[] = [];
    
    for (const [id, doc] of this.documents.entries()) {
      if (doc.metadata.filePath === filePath) {
        ids.push(id);
      }
    }

    return ids;
  }

  /**
   * Clear all documents from the collection
   */
  async clearAll(): Promise<void> {
    this.documents.clear();
    await this.saveToDisk();
    console.log("Vector Store: Cleared all documents");
  }

  /**
   * Get total count of documents in the collection
   */
  async getCount(): Promise<number> {
    return this.documents.size;
  }
}
