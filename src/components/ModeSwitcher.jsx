import { useMode, MODES } from '../context/ModeContext';
import { MessageSquare, Code, Rocket } from 'lucide-react';

export default function ModeSwitcher() {
    const { currentMode, setCurrentMode } = useMode();

    const modes = [
        { id: MODES.CHAT, icon: MessageSquare, label: 'Chat' },
        // { id: MODES.CODE, icon: Code, label: 'Code' },   // removed — not implemented
        // { id: MODES.BUILD, icon: Rocket, label: 'Build' } // Hidden for now until implemented
    ];

    return (
        <div className="mode-switcher flex gap-1 p-1 bg-[var(--bg-secondary)] rounded-lg border border-[var(--border)]">
            {modes.map(mode => (
                <button
                    key={mode.id}
                    onClick={() => setCurrentMode(mode.id)}
                    className={`
                        flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium
                        transition-all duration-200
                        ${currentMode === mode.id
                            ? 'bg-[var(--bg-primary)] text-[var(--accent)] shadow-sm'
                            : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]'
                        }
                    `}
                >
                    <mode.icon className="w-4 h-4" />
                    {mode.label}
                </button>
            ))}
        </div>
    );
}
