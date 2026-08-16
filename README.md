<div align="center">

<img src="public/claude-logo.svg" alt="Open Claude Logo" width="96" height="96" />

# Open Claude

### **Next-Generation Open-Source AI Workspace with Multimodal Vision, Live Webcam Capture, Deep Research, CoT Reasoning Stream, and Multi-CDN Resilient Artifacts**

[![GitHub Stars](https://img.shields.io/github/stars/Damienchakma/Open-claude?style=for-the-badge&logo=github&color=d97757)](https://github.com/Damienchakma/Open-claude/stargazers)
[![GitHub Forks](https://img.shields.io/github/forks/Damienchakma/Open-claude?style=for-the-badge&logo=github&color=d97757)](https://github.com/Damienchakma/Open-claude/network/members)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg?style=for-the-badge)](https://opensource.org/licenses/MIT)
[![React](https://img.shields.io/badge/React-18.2-61DAFB?style=for-the-badge&logo=react&logoColor=black)](https://react.dev/)
[![Vite](https://img.shields.io/badge/Vite-5.1-646CFF?style=for-the-badge&logo=vite&logoColor=white)](https://vitejs.dev/)

<p align="center">
  <b>Open Claude</b> is an <b>extensible</b>, <b>feature-rich</b>, and <b>user-friendly</b> AI workspace inspired by Anthropic's Claude chatbot UI. It connects directly to cloud LLM providers (<b>Google Gemini</b>, <b>Groq</b>, <b>OpenAI</b>) and local offline runners (<b>Ollama</b>, <b>LM Studio</b>) with built-in Deep Research, real-time CoT thinking streams, live webcam photo capture, and interactive sandboxed artifacts.
</p>

[✨ Key Features](#-key-features) • [📸 Showcase](#-interface-showcase) • [🤖 Supported Providers](#-supported-providers--models) • [🚀 Quick Start](#-quick-start) • [⚙️ Configuration](#-configuration--api-keys) • [🤝 Contributing](#-contributing)

</div>

---

## 📸 Interface Showcase

<div align="center">

### 🖥️ Main Workspace & Time-Aware Interface
> Dynamic context greetings (*"Burning the midnight oil?"*), integrated suggestion chips, live vision capability badges, web search toggle, and instant camera / file upload.

<img src="screenshots/open_claude_workspace.jpg" alt="Open Claude Main Workspace" width="95%" style="border-radius: 12px; box-shadow: 0 10px 40px rgba(0,0,0,0.5); border: 1px solid #333;" />

<br/><br/>

### 🎮 Interactive Split-Screen Artifacts Sandbox
> Run complete HTML5 games, Canvas applications, interactive React components, and deep research papers side-by-side with real-time code inspection and execution.

<img src="screenshots/open_claude_artifacts_preview.jpg" alt="Interactive Artifacts Runner (Flappy Bird Deluxe Game)" width="95%" style="border-radius: 12px; box-shadow: 0 10px 40px rgba(0,0,0,0.5); border: 1px solid #333;" />

</div>

---

## ✨ Key Features

### 📷 Dynamic Multimodal & Live Camera Capture
- **Live Camera Viewfinder**: Tap the camera icon (📷) to open a built-in webcam capture modal with live viewfinder, front/back camera flipping, and shutter review ("Use Photo" / "Retake").
- **API-Level Dynamic Vision Detection**: No hardcoded lists — Open Claude dynamically inspects provider API manifests and metadata (e.g. Ollama `details.families`, Gemini multimodal descriptions, LM Studio architectures).
- **Intelligent Auto-Switching**: When you capture or upload a picture while on a text-only model (e.g., Groq `llama-3.3-70b-versatile`), Open Claude automatically switches to the provider's top vision model (`llama-3.2-11b-vision-preview` / `gpt-4o`).
- **Clipboard Paste (`Ctrl+V`)**: Paste images or screenshots directly into the prompt box.

---

### 📦 Universal Resilient Artifact Runner
- **Interactive Sandbox**: Automatically renders and runs:
  - **HTML5 & Canvas Games**: Full game loops, Web Audio API procedural sound synthesis, and local storage state (e.g. Flappy Bird Deluxe).
  - **React / JSX Applications**: Transpiled on-the-fly via Babel Standalone with support for React Hooks, Lucide Icons, and Recharts.
  - **SVG Graphics**: Visual vector rendering.
  - **Research Papers**: Formal academic format with one-click PDF download.
- **Multi-CDN Resilience**: Sequential fallback (unpkg $\rightarrow$ Cloudflare CDNJS $\rightarrow$ jsDelivr) prevents white screens or failures if any individual CDN is blocked or rate-limited.
- **Universal Tag Parsing**: Flexibly parses `<antArtifact>` tags and code blocks from Claude, Gemini, Groq, OpenAI, and Ollama in any attribute order or format.

---

### 🧠 Universal CoT Thinking & Reasoning Stream
- **Live Streamed Thoughts**: Real-time token-by-token rendering of `<think>` and `<thinking>` tags alongside native API reasoning fields (`reasoning_content` / `reasoning`).
- **DeepSeek R1 on Groq & Ollama**: Seamlessly view DeepSeek's step-by-step mathematical and logical reasoning.
- **Metrics & Tokens**: Displays total reasoning token count and elapsed thinking duration.
- **Collapsible Design**: Elegant gradient accordion to expand or collapse internal monologue.

---

### 🔬 Deep Research Scientist Mode
- **Autonomous Multi-Step Loop**: Type `deep research: <topic>` to trigger an autonomous research agent that formulates sub-queries, queries real-time web databases, gathers evidence, and writes comprehensive multi-page whitepapers.
- **Formal PDF Export**: Export compiled research reports to PDF with structured abstracts, methodology, analysis, and bibliography.
- **Verifiable Citations**: Automatic source citation links with verified publisher logos and favicons.

---

### 🌐 Intelligent Real-Time Web Search
- **Tavily API Integration**: Search the live web for breaking news, current events, and documentation.
- **Smart Query Reformulation**: Contextually optimizes search keywords and strips unnecessary prefixes.
- **Publisher Logos**: Automatically fetches high-resolution publisher favicons for all referenced sources.

---

## 🤖 Supported Providers & Models

| Provider | Active Available Models | Modality | Speed / Notes |
| :--- | :--- | :---: | :--- |
| **Google Gemini** | `gemini-3.7-flash`, `gemini-3.5-flash`, `gemini-2.5-pro`, `gemini-2.5-flash` | Text + Vision + Audio | Natively multimodal, 2M+ token context |
| **Groq Cloud (LPU)** | `llama-3.3-70b-versatile`, `llama-3.1-8b-instant`, `llama-3.2-11b-vision-preview`, `llama-3.2-90b-vision-preview`, `deepseek-r1-distill-llama-70b`, `mixtral-8x7b-32768` | Text + Vision + Thinking | Ultra-fast throughput (~500–750 tokens/s) |
| **OpenAI** | `gpt-5.6`, `gpt-5.2`, `o3-mini`, `o1`, `gpt-4o`, `gpt-4o-mini` | Text + Vision + CoT Reasoning | Frontier reasoning & function calling |
| **Ollama (Local)** | `llama3.3`, `llama3.2-vision`, `deepseek-r1`, `qwen2.5-vl`, `mistral`, `gemma2` | Text + Vision + Reasoning | 100% private, offline, GPU-accelerated |
| **LM Studio** | Any loaded GGUF model (`qwen2.5-vl`, `minicpm-v`, `llama3.3`) | Text + Vision | Local inference via `localhost:1234` |

---

## 🚀 Quick Start

### 1. Clone & Install

```bash
# Clone the repository
git clone https://github.com/Damienchakma/Open-claude.git
cd Open-claude

# Install dependencies
npm install

# Start the dev server
npm run dev
```

Open **`http://localhost:5173`** in your browser.

---

## ⚙️ Configuration & API Keys

Click the **Settings** icon (⚙️) in the sidebar or top navigation bar to configure keys:

- **Google Gemini**: Get free API key at [Google AI Studio](https://aistudio.google.com/app/apikey)
- **Groq Cloud**: Get free API key at [Groq Console](https://console.groq.com/keys)
- **OpenAI**: Get API key at [OpenAI Platform](https://platform.openai.com/api-keys)
- **Tavily (Web Search)**: Get API key at [Tavily Dashboard](https://tavily.com/)

> [!NOTE]
> **Privacy First**: All API keys and chat histories are stored **100% locally in your browser (`localStorage`)**. Your keys are never sent to any third-party intermediary server.

---

## ⌨️ Keyboard Shortcuts

| Shortcut | Action |
| :--- | :--- |
| `Enter` | Send message |
| `Shift + Enter` | Insert new line in prompt |
| `Ctrl + V` | Paste image or screenshot directly into prompt |
| `Space` / `↑` | Jump / flap in game artifacts (e.g. Flappy Bird) |
| `P` | Pause / resume interactive game artifacts |

---

## 🛠️ Tech Stack

- **Frontend**: React 18, Vite 5, JavaScript (ES2024)
- **Styling**: Tailwind CSS + Custom Humanist Warm Palette
- **Markdown & Code**: `react-markdown`, `remark-gfm`, `rehype-raw`, `react-syntax-highlighter`
- **Icons**: Lucide React
- **PDF Generation**: `jspdf`, `html2canvas`
- **In-Browser Transpiler**: Babel Standalone (`@babel/standalone`)

---

## 🤝 Contributing

Contributions are what make the open-source community such an amazing place to learn, inspire, and create. Any contributions you make are **greatly appreciated**.

1. Fork the Project
2. Create your Feature Branch (`git checkout -b feature/AmazingFeature`)
3. Commit your Changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the Branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

---

## 📝 License

Distributed under the **MIT License**. See [`LICENSE`](LICENSE) for more information.

---

<div align="center">

Made with ❤️ by [Damien Chakma](https://github.com/Damienchakma)

**[⬆ Back to Top](#open-claude)**

</div>
