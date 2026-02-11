# Smart Journal — Obsidian Plugin

An AI-powered journal companion for [Obsidian](https://obsidian.md) that auto-tags notes, summarizes your week, extracts action items, and lets you **chat with your entire vault** using RAG (Retrieval-Augmented Generation). Supports both **local LLMs** (LM Studio / Ollama) and **Google Gemini API**.

---

## ✨ Features

### 💬 Chat with Your Journal
- **Streaming responses** — tokens appear in real-time as the LLM generates them, with automatic fallback to non-streaming if the server doesn't support it.
- **Multiple conversations** — create, rename, and delete chats; sidebar lists them sorted by last activity.
- **Resizable sidebar** — drag the divider or toggle the sidebar open/closed.
- **Message actions** (per-message `⋯` menu):
  - **Copy** any message to clipboard.
  - **Edit & re-submit** a user message (trims history and re-generates).
  - **Regenerate** an assistant response.
  - **Delete** a single message.
  - **Export to Note** — saves a message as a new Markdown file in your vault.
- **Per-conversation settings** — override temperature, max tokens, system prompt, RAG top-K, and similarity threshold on a per-chat basis via the ⚙️ button.
- **Personas** — switch the assistant's personality (e.g., *Zettelkasten Guide*, *Daily Reflector*, *Concise Summarizer*). Fully customisable in settings.
- **PDF export** — right-click a chat in the sidebar → *Export to PDF*. Renders full Markdown with styled headings, code blocks, and lists into an A4 PDF saved to `Smart Journal/PDFs/`.

### 🔎 RAG (Retrieval-Augmented Generation)
- **Intelligent query rewriting** — follow-up questions are automatically rewritten into standalone search queries using the LLM, so context isn't lost across turns.
- **Content-hash indexing** — only re-embeds notes whose content has actually changed; hashes are persisted to disk across reloads, eliminating redundant API calls.
- **Idle-based auto-indexing** — dirty files are queued and re-indexed when you navigate away from a note (not on every keystroke).
- **Optimised vector store**:
  - `Float32Array` embeddings with pre-computed norms for ~2–3× faster cosine similarity.
  - Min-heap top-K search — avoids sorting the entire index.
  - Path index for O(1) document lookups and deletions.
  - Compact JSON serialisation (~40% smaller on disk).
- **Excluded folders** — keep `Templates`, `.obsidian`, or any other folders out of the index.
- **Manual & automatic** — index the full vault on demand, or let the watcher handle it.

### 🏷️ Note Processing Commands
- **Auto Tag Current Note** — LLM suggests 3–5 relevant tags and prepends them.
- **Extract Action Items** — finds TODOs/tasks and appends them as a checklist.
- **Generate Weekly Summary** — summarises all notes modified in the last 7 days and saves the result to `Weekly Summaries/{Year}/`.

### 🔌 Modular AI Provider System
Swap between providers at any time — no restart required:

| | Local (LM Studio / Ollama) | Google Gemini |
|---|---|---|
| **Chat model** | `qwen/qwen3-vl-4b` (default) | `gemini-2.5-flash` (default) |
| **Embedding model** | `text-embedding-nomic-embed-text-v1.5` | `gemini-embedding-001` |
| **Server** | Your local machine | Google Cloud (API key) |

Both providers implement the same `ILLMProvider` / `IEmbeddingProvider` interfaces using OpenAI-compatible endpoints, so any model that speaks that protocol works.

---

## 📋 Prerequisites

Choose **one** of the following:

### Option A — Local LLM Server
1. Install [LM Studio](https://lmstudio.ai) or [Ollama](https://ollama.com).
2. Start the server (LM Studio default: port `1234`, Ollama: port `11434`).
3. Load a chat model and an embedding model.

### Option B — Google Gemini API
1. Get a free API key from [Google AI Studio](https://aistudio.google.com/apikey).
2. No local server needed — everything runs via the API.

---

## 🚀 Installation

```bash
npm install
npm run build
```

1. In your Obsidian vault, navigate to `.obsidian/plugins/`.
2. Create a folder named `smart-journal`.
3. Copy `main.js`, `styles.css` (if any), and `manifest.json` into it.
4. Open **Settings → Community Plugins**, reload, and toggle **Smart Journal** ON.

---

## 🎮 Usage

### Commands
Open the Command Palette (`Cmd/Ctrl + P`) and search for **Smart Journal**:

| Command | Description |
|---------|-------------|
| **Open Chat with Journal** | Opens the chat sidebar |
| **Auto Tag Current Note** | Analyses the note and prepends tags |
| **Extract Action Items** | Finds TODOs and appends a checklist |
| **Generate Weekly Summary** | Summarises the last 7 days of notes |
| **Index Vault for RAG** | Full vault embedding index (with progress) |
| **Clear RAG Index** | Wipes the index for a fresh rebuild |
| **View RAG Index Statistics** | Shows total indexed document chunks |
| **Debug RAG Retrieval** | Select text → retrieves matching chunks (logged to console) |

### Chat Interface
- Click the **💬 ribbon icon** or run the *Open Chat with Journal* command.
- Type a message and press **Enter** (or **Shift+Enter** for a new line).
- Use the **⚙️** button next to Send to adjust per-chat settings.
- Right-click a conversation in the sidebar for rename / export / delete options.

---

## ⚙️ Settings

Go to **Settings → Smart Journal**.

### AI Provider
- **Provider**: Local (LM Studio / Ollama) or Google Gemini.

### Local LLM Settings
- **LLM Endpoint** — URL of your local server (default `http://localhost:1234`).
- **Chat Model** — model identifier for chat completions.
- **Embedding Model** — model identifier for embeddings.

### Google Gemini Settings
- **API Key** — your Gemini API key.
- **Chat Model** — Gemini model (default `gemini-2.5-flash`).
- **Embedding Model** — Gemini embedding model (default `gemini-embedding-001`).

### General
- **Weekly Summary Path** — folder for weekly summaries.
- **Default Temperature** — controls randomness (0.0–1.0).
- **Default Max Tokens** — maximum response length.

### RAG Settings
- **Enable RAG** — toggle retrieval features on/off.
- **Chunk Size** — words per chunk (default 200).
- **Chunk Overlap** — overlapping words between chunks (default 30).
- **Top K Results** — number of chunks to retrieve (default 6).
- **Similarity Threshold** — minimum relevance score (default 0.4).
- **Auto-Index on Change** — re-index notes on create/modify/delete.
- **Excluded Folders** — comma-separated list of folders to skip.

### Personas
- **Personas JSON** — edit the array of `{name, prompt}` objects to customise assistant behaviour.

---

## 🏗️ Architecture

```
main.ts                  → Plugin entry point, settings, commands
├── providers.ts         → LLM & Embedding provider interfaces + Local/Gemini implementations
├── llm_service.ts       → LLM service (completion + streaming)
├── embedding_service.ts → Chunking + batch embedding generation
├── vector_store.ts      → JSON-backed vector store with Float32Array + min-heap search
├── rag_service.ts       → RAG orchestration (indexing, retrieval, query rewriting)
├── processor.ts         → Note processing (tags, action items, weekly summary)
├── conversation_manager.ts → Conversation CRUD (JSON files in .smart-journal/)
└── chat_view.ts         → Chat UI (sidebar, messages, streaming, PDF export)
```

---

## 📄 License

MIT
