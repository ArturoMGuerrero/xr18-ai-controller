import React from 'react';
import { useTheme, Theme } from '../hooks/useTheme';

export const ThemeSelector: React.FC = () => {
  const { currentTheme, changeTheme, customColors, updateCustomColor } = useTheme();

  const themeOptions: { value: Theme; label: string; icon: string }[] = [
    { value: 'dark', label: 'Dark', icon: '🌙' },
    { value: 'light', label: 'Light', icon: '☀️' },
    { value: 'blue', label: 'Blue Night', icon: '🌊' },
    { value: 'purple', label: 'Purple Haze', icon: '🎵' },
    { value: 'custom', label: 'Custom', icon: '🎨' },
  ];

  return (
    <div className="bg-mixer-panel p-6 rounded-lg space-y-4">
      <h3 className="text-lg font-bold text-white">Theme</h3>

      {/* Theme Selection */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {themeOptions.map((option) => (
          <button
            key={option.value}
            onClick={() => changeTheme(option.value)}
            className={`
              p-4 rounded-lg border-2 transition-all
              ${
                currentTheme === option.value
                  ? 'border-mixer-accent bg-mixer-accent/20'
                  : 'border-gray-600 hover:border-gray-500'
              }
            `}
          >
            <div className="text-3xl mb-2">{option.icon}</div>
            <div className="text-sm text-white font-medium">{option.label}</div>
          </button>
        ))}
      </div>

      {/* Custom Theme Editor */}
      {currentTheme === 'custom' && (
        <div className="mt-6 space-y-4 border-t border-gray-700 pt-4">
          <h4 className="text-sm font-medium text-gray-400">Custom Colors</h4>

          <div className="grid grid-cols-2 gap-4">
            <ColorPicker
              label="Background"
              value={customColors.bg}
              onChange={(value) => updateCustomColor('bg', value)}
            />
            <ColorPicker
              label="Panel"
              value={customColors.panel}
              onChange={(value) => updateCustomColor('panel', value)}
            />
            <ColorPicker
              label="Fader"
              value={customColors.fader}
              onChange={(value) => updateCustomColor('fader', value)}
            />
            <ColorPicker
              label="Accent"
              value={customColors.accent}
              onChange={(value) => updateCustomColor('accent', value)}
            />
            <ColorPicker
              label="Text"
              value={customColors.text}
              onChange={(value) => updateCustomColor('text', value)}
            />
            <ColorPicker
              label="Text Secondary"
              value={customColors.textSecondary}
              onChange={(value) => updateCustomColor('textSecondary', value)}
            />
          </div>
        </div>
      )}
    </div>
  );
};

const ColorPicker: React.FC<{
  label: string;
  value: string;
  onChange: (value: string) => void;
}> = ({ label, value, onChange }) => {
  return (
    <div className="space-y-2">
      <label className="text-sm text-gray-400">{label}</label>
      <div className="flex items-center space-x-2">
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-12 h-12 rounded border border-gray-600 cursor-pointer"
        />
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="flex-1 bg-mixer-fader border border-gray-600 rounded px-3 py-2 text-white text-sm font-mono"
        />
      </div>
    </div>
  );
};
