import { useMode, MODES } from './context/ModeContext';
import ChatMode from './components/ChatMode';
import CodeMode from './components/CodeMode';
import BuildMode from './components/BuildMode';
import { BuildModeProvider } from './context/BuildModeContext';
import { BuildProvider } from './context/BuildContext';
import { ChatProvider } from './context/ChatContext';

function AppContent() {
    const { currentMode } = useMode();

    return (
        <div className="app h-screen flex flex-col bg-[var(--bg-primary)]">
            {/* Mode-Specific UI — ChatMode has its own header */}
            <main className="app-main flex-1 overflow-hidden relative">
                {currentMode === MODES.CHAT && <ChatMode />}
                {currentMode === MODES.CODE && <CodeMode />}
                {currentMode === MODES.BUILD && <BuildMode />}
            </main>
        </div>
    );
}

import { ThemeProvider } from './context/ThemeContext';

export default function App() {
    return (
        <ComposeProviders>
            <AppContent />
        </ComposeProviders>
    );
}

function ComposeProviders({ children }) {
    return (
        <ThemeProvider>
            <BuildModeProvider>
                <BuildProvider>
                    <ChatProvider>
                        {children}
                    </ChatProvider>
                </BuildProvider>
            </BuildModeProvider>
        </ThemeProvider>
    );
}
