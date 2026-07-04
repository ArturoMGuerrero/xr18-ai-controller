import React from 'react';
import { shortcuts } from '../hooks/useKeyboardShortcuts';

interface HelpModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const HelpModal: React.FC<HelpModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  const shortcutGroups = [
    {
      title: 'General',
      shortcuts: [
        { keys: shortcuts.toggleAI, description: 'Toggle AI Mode on/off' },
        { keys: shortcuts.connect, description: 'Connect to mixer' },
        { keys: shortcuts.disconnect, description: 'Disconnect from mixer' },
        { keys: shortcuts.settings, description: 'Open settings panel' },
        { keys: shortcuts.help, description: 'Show this help menu' },
      ],
    },
    {
      title: 'Channel Control',
      shortcuts: [
        { keys: shortcuts.increaseChannel, description: 'Increase channel level' },
        { keys: shortcuts.decreaseChannel, description: 'Decrease channel level' },
        { keys: shortcuts.muteChannel, description: 'Toggle channel mute' },
        { keys: shortcuts.muteAll, description: 'Mute all channels' },
        { keys: shortcuts.unmuteAll, description: 'Unmute all channels' },
        { keys: shortcuts.resetLevels, description: 'Reset all levels to default' },
      ],
    },
  ];

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
      <div className="bg-mixer-panel rounded-lg max-w-2xl w-full mx-4 max-h-[80vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-700">
          <h2 className="text-2xl font-bold text-white">Keyboard Shortcuts</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white text-2xl leading-none"
          >
            ×
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {shortcutGroups.map((group, idx) => (
            <div key={idx} className="space-y-3">
              <h3 className="text-lg font-semibold text-mixer-accent">{group.title}</h3>
              <div className="space-y-2">
                {group.shortcuts.map((shortcut, sIdx) => (
                  <div
                    key={sIdx}
                    className="flex items-center justify-between py-2 px-3 bg-mixer-fader rounded"
                  >
                    <span className="text-gray-300">{shortcut.description}</span>
                    <kbd className="bg-gray-700 text-white px-3 py-1 rounded text-sm font-mono border border-gray-600">
                      {shortcut.keys}
                    </kbd>
                  </div>
                ))}
              </div>
            </div>
          ))}

          {/* Tips */}
          <div className="bg-blue-900/20 border border-blue-500/50 rounded-lg p-4">
            <h4 className="text-blue-400 font-semibold mb-2">💡 Pro Tips</h4>
            <ul className="space-y-1 text-sm text-gray-300">
              <li>• Shortcuts work globally, even when not focused on inputs</li>
              <li>• Channel numbers (1-9) correspond to first 9 channels</li>
              <li>• Hold Ctrl/Shift/Alt for different actions on the same key</li>
              <li>• Press ESC to close dialogs and cancel operations</li>
            </ul>
          </div>
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-gray-700 flex justify-end">
          <button
            onClick={onClose}
            className="bg-mixer-accent hover:bg-blue-600 text-white px-6 py-2 rounded font-medium"
          >
            Got it!
          </button>
        </div>
      </div>
    </div>
  );
};
