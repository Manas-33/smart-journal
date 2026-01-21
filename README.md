# Smart Journal Obsidian Plugin

A "Smart" Journal plugin for Obsidian that uses local LLMs to automatically tag notes, summarize your week, extract action items, and chat with your notes using RAG (Retrieval-Augmented Generation).

## Prerequisites

1.  **Local LLM Server**: You need a local LLM running.
    *   **LM Studio**: Start the server (usually port `1234`).
    *   **Ollama**: Start the server (usually port `11434`).
    *   *Note*: The default chat model is configured as `qwen/qwen3-vl-4b`.
    *   *Note*: For RAG, you need an embedding model (default: `text-embedding-nomic-embed-text-v1.5`). Ensure this model is pulled/available in your LLM server.

## Installation

1.  **Build the Plugin**:
    ```bash
    npm install
    npm run build
    ```
2.  **Install into Obsidian**:
    *   Locate your Obsidian Vault's `.obsidian/plugins` folder.
    *   Create a folder named `smart-journal`.
    *   Copy `main.js`, `styles.css` (if any), and `manifest.json` from this project into that folder.
3.  **Enable**:
    *   Open Obsidian Settings > Community Plugins.
    *   Reload plugins and toggle "Smart Journal" ON.

## Usage

### Chat with Journal
Interact with your journal using the dedicated Chat Interface.
*   **Open Chat**: Click the "message-square" icon in the Ribbon or use the command "Open Chat with Journal".
*   **Features**:
    *   **Conversations**: Create multiple chats, rename them, and delete old ones.
    *   **Context Aware**: The chat can use RAG to answer questions based on your notes.
    *   **PDF Export**: Export your conversation history to a PDF file (right-click a chat in the sidebar).
    *   **Personas**: Switch between different assistant personas (e.g., Zettelkasten Guide, Daily Reflector).

### RAG (Retrieval-Augmented Generation)
Your journal can "read" your notes to provide better answers.
*   **Index Vault**: Run the command "Index Vault for RAG" to scan and vector-embed your notes. This allows the AI to search your valid notes for context.
*   **Automatic Indexing**: By default, modified notes are automatically re-indexed.
*   **Clear Index**: Use "Clear RAG Index" if you want to rebuild from scratch.
*   **Stats**: View "View RAG Index Statistics" to see how many document chunks are indexed.

### Commands
Open the Command Palette (Cmd/Ctrl + P) and search for "Smart Journal":

*   **Open Chat with Journal**: Opens the chat sidebar.
*   **Auto Tag Current Note**: Analyzes the note and adds tags.
*   **Extract Action Items**: Finds TODOs and adds them to the bottom.
*   **Generate Weekly Summary**: Summarizes notes from the last 7 days.
*   **Index Vault for RAG**: Manually triggers a full vault index.
*   **View RAG Index Statistics**: Shows current index count.

### Settings
Go to **Settings > Smart Journal** to configure:

#### General
*   **LLM Endpoint**: URL of your local LLM (default: `http://localhost:1234`).
*   **Model Name**: Chat model identifier (default: `qwen/qwen3-vl-4b`).
*   **Weekly Summary Path**: Folder to save weekly summaries.
*   **Default Temperature**: Controls randomness of responses.
*   **Default Max Tokens**: Maximum length of response.

#### RAG Settings
*   **Enable RAG**: Toggle retrieval features on/off.
*   **Embedding Model**: Model used for vectorizing notes (default: `text-embedding-nomic-embed-text-v1.5`).
*   **Chunk Size & Overlap**: Fine-tune how notes are split for indexing.
*   **Top K Results**: Number of relevant note chunks to send to the LLM.
*   **Similarity Threshold**: Minimum relevance score for chunks.
*   **Excluded Folders**: Prevent specific folders (e.g., "Templates") from being indexed.

#### Personas
*   **Personas JSON**: Edit the list of available assistant personas (Name and System Prompt).
    *   Use this to customize the AI's personality and expertise (e.g., creating a "Code Reviewer" or "Creative Writer" persona).
