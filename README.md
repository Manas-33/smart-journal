# Smart Journal Obsidian Plugin

A "Smart" Journal plugin for Obsidian that uses local LLMs to automatically tag notes, summarize your week, and extract action items.

## Prerequisites

1.  **Local LLM Server**: You need a local LLM running.
    *   **LM Studio**: Start the server (usually port `1234`).
    *   **Ollama**: Start the server (usually port `11434`).
    *   *Note*: The default model is configured as `qwen/qwen3-vl-4b`, but you can change this in settings.

## Installation

1.  **Build the Plugin**:
    ```bash
    npm install
    npm run build
    ```
2.  **Install into Obsidian**:
    *   Locate your Obsidian Vault's `.obsidian/plugins` folder.
    *   Create a folder named `smart-journal`.
    *   Copy `main.js` and `manifest.json` from this project into that folder.
3.  **Enable**:
    *   Open Obsidian Settings > Community Plugins.
    *   Reload plugins and toggle "Smart Journal" ON.

## Usage

### Commands
Open the Command Palette (Cmd/Ctrl + P) and search for "Smart Journal":

*   **Auto Tag Current Note**: Analyzes the note and adds tags.
*   **Extract Action Items**: Finds TODOs and adds them to the bottom.
*   **Generate Weekly Summary**: Summarizes notes from the last 7 days.

### Settings
Go to **Settings > Smart Journal** to configure:
*   **LLM Endpoint**: URL of your local LLM (default: `http://localhost:1234`)
*   **Model Name**: Model identifier (default: `qwen/qwen3-vl-4b`)
