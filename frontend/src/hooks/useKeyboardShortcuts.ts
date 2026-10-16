import { useEffect } from 'react';

interface ShortcutHandlers {
  onToggleAI?: () => void;
  onConnect?: () => void;
  onDisconnect?: () => void;
  onMuteAll?: () => void;
  onUnmuteAll?: () => void;
  onResetLevels?: () => void;
  onToggleSettings?: () => void;
  onToggleHelp?: () => void;
  onIncreaseChannel?: (channel: number) => void;
  onDecreaseChannel?: (channel: number) => void;
  onMuteChannel?: (channel: number) => void;
  onUndo?: () => void;
  onRedo?: () => void;
}

export const useKeyboardShortcuts = (handlers: ShortcutHandlers) => {
  useEffect(() => {
    const handleKeyPress = (event: KeyboardEvent) => {
      // Ignore if typing in input field
      if (
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLTextAreaElement
      ) {
        return;
      }

      const { key, ctrlKey, shiftKey, altKey } = event;

      // Ctrl + Shift + A: Toggle AI
      if (ctrlKey && shiftKey && key.toLowerCase() === 'a') {
        event.preventDefault();
        handlers.onToggleAI?.();
      }

      // Ctrl + Shift + C: Connect
      if (ctrlKey && shiftKey && key.toLowerCase() === 'c') {
        event.preventDefault();
        handlers.onConnect?.();
      }

      // Ctrl + Shift + D: Disconnect
      if (ctrlKey && shiftKey && key.toLowerCase() === 'd') {
        event.preventDefault();
        handlers.onDisconnect?.();
      }

      // Ctrl + Shift + M: Mute All
      if (ctrlKey && shiftKey && key.toLowerCase() === 'm') {
        event.preventDefault();
        handlers.onMuteAll?.();
      }

      // Ctrl + Shift + U: Unmute All
      if (ctrlKey && shiftKey && key.toLowerCase() === 'u') {
        event.preventDefault();
        handlers.onUnmuteAll?.();
      }

      // Ctrl + Shift + R: Reset Levels
      if (ctrlKey && shiftKey && key.toLowerCase() === 'r') {
        event.preventDefault();
        handlers.onResetLevels?.();
      }

      // Ctrl + ,: Open Settings
      if (ctrlKey && key === ',') {
        event.preventDefault();
        handlers.onToggleSettings?.();
      }

      // F1 or ?: Show Help
      if (key === 'F1' || (shiftKey && key === '?')) {
        event.preventDefault();
        handlers.onToggleHelp?.();
      }

      // Ctrl + Z: Undo, Ctrl + Y / Ctrl + Shift + Z: Redo
      if (ctrlKey && !altKey && key.toLowerCase() === 'z') {
        event.preventDefault();
        if (shiftKey) handlers.onRedo?.();
        else handlers.onUndo?.();
      }
      if (ctrlKey && !shiftKey && key.toLowerCase() === 'y') {
        event.preventDefault();
        handlers.onRedo?.();
      }

      // Number keys 1-9 with modifiers for channel control. Uses the physical key, because
      // with Shift held `key` is the symbol ("!", "@"...) rather than the digit.
      const digit = /^Digit([1-9])$/.exec(event.code);
      const channelNum = digit ? Number(digit[1]) : NaN;
      if (!isNaN(channelNum)) {
        // Ctrl + Number: Increase channel level
        if (ctrlKey && !shiftKey) {
          event.preventDefault();
          handlers.onIncreaseChannel?.(channelNum);
        }

        // Shift + Number: Decrease channel level
        if (shiftKey && !ctrlKey) {
          event.preventDefault();
          handlers.onDecreaseChannel?.(channelNum);
        }

        // Alt + Number: Mute/Unmute channel
        if (altKey) {
          event.preventDefault();
          handlers.onMuteChannel?.(channelNum);
        }
      }
    };

    window.addEventListener('keydown', handleKeyPress);

    return () => {
      window.removeEventListener('keydown', handleKeyPress);
    };
  }, [handlers]);
};

export const shortcuts = {
  toggleAI: 'Ctrl + Shift + A',
  connect: 'Ctrl + Shift + C',
  disconnect: 'Ctrl + Shift + D',
  muteAll: 'Ctrl + Shift + M',
  unmuteAll: 'Ctrl + Shift + U',
  resetLevels: 'Ctrl + Shift + R',
  settings: 'Ctrl + ,',
  help: 'F1 or ?',
  increaseChannel: 'Ctrl + [1-9]',
  decreaseChannel: 'Shift + [1-9]',
  muteChannel: 'Alt + [1-9]',
  undo: 'Ctrl + Z',
  redo: 'Ctrl + Y',
};
