import { useState, useEffect } from 'react';

export type Theme = 'dark' | 'light' | 'blue' | 'purple' | 'custom';

interface ThemeColors {
  bg: string;
  panel: string;
  fader: string;
  accent: string;
  text: string;
  textSecondary: string;
}

const themes: Record<Theme, ThemeColors> = {
  dark: {
    bg: '#1a1a1a',
    panel: '#2a2a2a',
    fader: '#3a3a3a',
    accent: '#4a90e2',
    text: '#ffffff',
    textSecondary: '#9ca3af',
  },
  light: {
    bg: '#f3f4f6',
    panel: '#ffffff',
    fader: '#e5e7eb',
    accent: '#3b82f6',
    text: '#1f2937',
    textSecondary: '#6b7280',
  },
  blue: {
    bg: '#0f172a',
    panel: '#1e293b',
    fader: '#334155',
    accent: '#3b82f6',
    text: '#f1f5f9',
    textSecondary: '#94a3b8',
  },
  purple: {
    bg: '#1e1b2e',
    panel: '#2d2640',
    fader: '#3d3452',
    accent: '#a855f7',
    text: '#f3e8ff',
    textSecondary: '#c4b5fd',
  },
  custom: {
    bg: '#1a1a1a',
    panel: '#2a2a2a',
    fader: '#3a3a3a',
    accent: '#4a90e2',
    text: '#ffffff',
    textSecondary: '#9ca3af',
  },
};

export const useTheme = () => {
  const [currentTheme, setCurrentTheme] = useState<Theme>(() => {
    const saved = localStorage.getItem('mixer-theme');
    return (saved as Theme) || 'dark';
  });

  const [customColors, setCustomColors] = useState<ThemeColors>(() => {
    const saved = localStorage.getItem('mixer-custom-theme');
    return saved ? JSON.parse(saved) : themes.dark;
  });

  useEffect(() => {
    localStorage.setItem('mixer-theme', currentTheme);
  }, [currentTheme]);

  useEffect(() => {
    if (currentTheme === 'custom') {
      localStorage.setItem('mixer-custom-theme', JSON.stringify(customColors));
    }
  }, [customColors, currentTheme]);

  useEffect(() => {
    const colors = currentTheme === 'custom' ? customColors : themes[currentTheme];

    document.documentElement.style.setProperty('--color-bg', colors.bg);
    document.documentElement.style.setProperty('--color-panel', colors.panel);
    document.documentElement.style.setProperty('--color-fader', colors.fader);
    document.documentElement.style.setProperty('--color-accent', colors.accent);
    document.documentElement.style.setProperty('--color-text', colors.text);
    document.documentElement.style.setProperty('--color-text-secondary', colors.textSecondary);
  }, [currentTheme, customColors]);

  const changeTheme = (theme: Theme) => {
    setCurrentTheme(theme);
  };

  const updateCustomColor = (key: keyof ThemeColors, value: string) => {
    setCustomColors((prev) => ({ ...prev, [key]: value }));
  };

  return {
    currentTheme,
    themes,
    customColors,
    changeTheme,
    updateCustomColor,
  };
};
