# 🤖 Open Claude

<div align="center">

**A modern, feature-rich chat interface supporting multiple AI providers with advanced reasoning capabilities**

[![React](https://img.shields.io/badge/React-18.2-blue.svg)](https://reactjs.org/)
[![Vite](https://img.shields.io/badge/Vite-5.1-646CFF.svg)](https://vitejs.dev/)
[![License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

[Features](#-features) • [Quick Start](#-quick-start) • [Usage](#-usage) • [Development](#-development) • [Contributing](#-contributing)

</div>

---

## 📖 Overview

Open Claude is a powerful, open-source chat interface inspired by Anthropic's Claude. It provides a clean, intuitive UI for interacting with multiple Large Language Models (LLMs) including OpenAI GPT models, Google Gemini, Groq, and local models via Ollama or LM Studio.

### 🌟 Highlights

- **🧠 Advanced Thinking UI**: Unique collapsible thinking/reasoning display showing AI's thought process
- **🎨 Premium Design**: Modern, responsive interface with dark/light mode
- **🔄 Multi-Provider**: Switch between OpenAI, Groq, Gemini, Ollama, and LM Studio
- **🔍 Web Search**: Integrated Tavily search for real-time information
- **📦 Artifacts**: Preview HTML, React, and SVG code in a dedicated panel
- **💬 Chat History**: Multiple conversations with persistent storage
- **🎭 Markdown Support**: Full GitHub-flavored markdown with syntax highlighting

---

## ✨ Features

### 🧠 Thinking/Reasoning Mode

A groundbreaking feature that displays the AI's internal reasoning process:

- **Collapsible Sections**: View or hide the model's thought process
- **Token Tracking**: See how many tokens were used for thinking
- **Duration Display**: Track how long the model spent reasoning
- **Streaming Support**: Watch the AI think in real-time
- **Premium Design**: Beautiful gradient UI with smooth animations

### 🤖 Multi-Provider Support

| Provider | Models Supported | Authentication |
|----------|-----------------|----------------|
| **OpenAI** | GPT-4, GPT-4o, GPT-3.5, o1 series | API Key |
| **Google Gemini** | Gemini 2.0, Gemini 1.5 Pro/Flash | API Key |
| **Groq** | Llama 3.3, Mixtral, others | API Key |
| **Ollama** | Any local model | No auth (local) |
| **LM Studio** | Any loaded model | No auth (local) |

### 🎨 User Interface

- **Clean Design**: Inspired by Claude's minimalist aesthetic
- **Dark/Light Mode**: Automatic theme switching based on system preferences
- **Responsive**: Works seamlessly on desktop and mobile
- **Syntax Highlighting**: Beautiful code blocks with react-syntax-highlighter
- **Artifact Panel**: Side-by-side code preview for HTML, React, and SVG

### 🔍 Web Search Integration

- Powered by Tavily API
- Real-time web search results
- Context-aware responses with up-to-date information

---

## 🚀 Quick Start

### Prerequisites

Before you begin, ensure you have:

- **Node.js** 18.0 or higher ([Download](https://nodejs.org/))
- **npm** (comes with Node.js) or **yarn**
- **Git** ([Download](https://git-scm.com/))

### Installation

1. **Clone the repository**

```bash
git clone https://github.com/Damienchakma/Open-claude.git
cd Open-claude
```

2. **Install dependencies**

```bash
npm install
```

3. **Start the development server**

```bash
npm run dev
```

4. **Open in your browser**

Navigate to `http://localhost:5173`

That's it! 🎉 The application is now running.

---

## ⚙️ Configuration

### Getting API Keys

Open Claude requires API keys for cloud providers. Here's how to get them:

#### OpenAI API Key
1. Visit [OpenAI Platform](https://platform.openai.com/)
2. Sign up or log in
3. Go to **API Keys** section
4. Click **Create new secret key**
5. Copy and save the key (you won't see it again!)

#### Google Gemini API Key
1. Visit [Google AI Studio](https://makersuite.google.com/app/apikey)
2. Sign in with your Google account
3. Click **Create API Key**
4. Copy the generated key

#### Groq API Key
1. Visit [Groq Console](https://console.groq.com/)
2. Create an account or log in
3. Navigate to **API Keys**
4. Generate a new API key

#### Tavily API Key (Optional - for web search)
1. Visit [Tavily](https://tavily.com/)
2. Sign up for an account
3. Get your API key from the dashboard

### Setting Up API Keys in the App

1. Click the **Settings** icon (gear) in the sidebar
2. Enter your API keys in the respective fields
3. Click **Save**
4. Your keys are stored **locally in your browser** (never sent to any server)

### Using Local Models (No API Key Required)

#### Ollama Setup
1. Install Ollama from [ollama.ai](https://ollama.ai/)
2. Pull a model: `ollama pull llama2`
3. Ollama runs on `localhost:11434` by default
4. Select Ollama in the model dropdown

#### LM Studio Setup
1. Install [LM Studio](https://lmstudio.ai/)
2. Download and load a model
3. Start the local server (port 1234)
4. Select LM Studio in the model dropdown

---

## 🎯 Usage

### Basic Chat

1. Select a provider and model from the dropdown
2. Type your message in the input field
3. Press **Enter** or click **Send**
4. View the AI's response

### Using Web Search

1. Click the **Globe** icon to enable web search
2. Your queries will include real-time web results
3. The AI will provide context-aware answers with current information

### Viewing Artifacts

When the AI generates code (HTML, React, SVG):
1. An artifact card appears in the chat
2. Click the card to open the preview panel
3. Toggle between **Preview** and **Code** views
4. Copy code with the copy button

### Managing Chats

- **New Chat**: Click the **+** icon in the sidebar
- **Switch Chats**: Click on any chat in the history
- **Delete Chat**: Hover over a chat and click the trash icon

### Viewing AI Thinking Process

For models that support reasoning (like OpenAI o1):
1. The thinking section appears above the response
2. Click to expand/collapse
3. View token count and duration
4. See the AI's step-by-step reasoning

---

## 🛠️ Development

### Project Structure

```
Open-claude/
├── src/
│   ├── components/          # React components
│   │   ├── ArtifactPanel.jsx      # Code preview panel
│   │   ├── ChatMessage.jsx        # Individual message display
│   │   ├── SettingsModal.jsx      # Settings dialog
│   │   └── ThinkingDisplay.jsx    # Reasoning UI
│   ├── context/
│   │   └── ChatContext.jsx        # Global state management
│   ├── lib/
│   │   ├── llm/
│   │   │   ├── clients.js         # LLM client implementations
│   │   │   └── ModelService.js    # Model discovery
│   │   └── tavily.js              # Web search client
│   ├── App.jsx                    # Main app component
│   ├── main.jsx                   # Entry point
│   └── index.css                  # Global styles
├── public/
│   └── claude-logo.svg            # Logo asset
├── index.html                     # HTML template
├── package.json                   # Dependencies
├── vite.config.js                 # Vite configuration
└── tailwind.config.js             # Tailwind config
```

### Tech Stack

- **Frontend Framework**: React 18.2
- **Build Tool**: Vite 5.1
- **Styling**: Tailwind CSS + Custom CSS Variables
- **Markdown**: react-markdown + remark-gfm
- **Syntax Highlighting**: react-syntax-highlighter
- **Icons**: Lucide React
- **Animations**: Framer Motion

### Available Scripts

```bash
# Start development server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview

# Lint code
npm run lint
```

### Building for Production

```bash
npm run build
```

This creates an optimized production build in the `dist/` folder.

### Environment Variables

The app doesn't use `.env` files. All settings are stored in browser localStorage for security.

---

## 🎨 Customization

### Changing Theme Colors

Edit `src/index.css` to customize the color scheme:

```css
:root {
  --accent: #d97757;        /* Primary accent color */
  --bg-primary: #FFFFFF;    /* Main background */
  --text-primary: #2F2F2F;  /* Main text color */
  /* ... more variables */
}
```

### Adding New LLM Providers

1. Create a new client class in `src/lib/llm/clients.js`
2. Extend `BaseClient` and implement `streamChat()`
3. Add to `LLMFactory.getClient()` switch case
4. Update `ModelService.js` to fetch available models
5. Add UI elements in `SettingsModal.jsx`

---

## 🤝 Contributing

Contributions are welcome! Here's how you can help:

### Reporting Bugs

1. Check if the bug has already been reported in [Issues](https://github.com/Damienchakma/Open-claude/issues)
2. Create a new issue with:
   - Clear title and description
   - Steps to reproduce
   - Expected vs actual behavior
   - Screenshots if applicable

### Suggesting Features

1. Open an issue with the `enhancement` label
2. Describe the feature and why it would be useful
3. Provide examples or mockups if possible

### Pull Requests

1. Fork the repository
2. Create a new branch: `git checkout -b feature/your-feature-name`
3. Make your changes
4. Test thoroughly
5. Commit: `git commit -m "Add: your feature description"`
6. Push: `git push origin feature/your-feature-name`
7. Open a Pull Request

---

## 📝 License

This project is licensed under the **MIT License** - see the [LICENSE](LICENSE) file for details.

---

## 🙏 Acknowledgments

- Inspired by [Anthropic's Claude](https://www.anthropic.com/claude) interface
- Built with modern web technologies
- Community-driven development

---

## 📞 Support

- **Issues**: [GitHub Issues](https://github.com/Damienchakma/Open-claude/issues)
- **Discussions**: [GitHub Discussions](https://github.com/Damienchakma/Open-claude/discussions)

---

## ⭐ Star History

If you find this project useful, please consider giving it a star! ⭐

---

<div align="center">

Made with ❤️ by [Damien Chakma](https://github.com/Damienchakma)

**[⬆ back to top](#-open-claude)**

</div>
