import { createContext, useContext, useState, useEffect } from 'react';

const ThemeContext = createContext();

export function ThemeProvider({ children }) {
    const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'system');
    const [systemDark, setSystemDark] = useState(() => window.matchMedia('(prefers-color-scheme: dark)').matches);
    const isDarkMode = theme === 'dark' || (theme === 'system' && systemDark);
    useEffect(() => {
        const media = window.matchMedia('(prefers-color-scheme: dark)');
        const update = event => setSystemDark(event.matches);
        media.addEventListener('change', update);
        return () => media.removeEventListener('change', update);
    }, []);
    useEffect(() => {
        document.documentElement.classList.toggle('dark', isDarkMode);
        localStorage.setItem('theme', theme);
    }, [isDarkMode, theme]);
    return <ThemeContext.Provider value={{ theme, setTheme, isDarkMode, toggleTheme: () => setTheme(isDarkMode ? 'light' : 'dark') }}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
    const context = useContext(ThemeContext);
    if (!context) throw new Error('useTheme must be used within a ThemeProvider');
    return context;
}
