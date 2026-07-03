import React from 'react';
import { AIDecision } from '../types';

interface ModeControlProps {
  aiEnabled: boolean;
  connected: boolean;
  onModeToggle: (enabled: boolean) => Promise<void>;
  recentDecisions: AIDecision[];
}

export const ModeControl: React.FC<ModeControlProps> = ({
  aiEnabled,
  connected,
  onModeToggle,
  recentDecisions,
}) => {
  const handleToggle = async () => {
    await onModeToggle(!aiEnabled);
  };

  const getUrgencyColor = (urgency: string) => {
    switch (urgency) {
      case 'critical':
        return 'text-red-500';
      case 'high':
        return 'text-orange-500';
      case 'medium':
        return 'text-yellow-500';
      default:
        return 'text-green-500';
    }
  };

  return (
    <div className="bg-mixer-panel p-6 rounded-lg space-y-4">
      <h2 className="text-xl font-bold text-white">Control Mode</h2>

      {/* Mode Toggle */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className={`text-2xl ${aiEnabled ? '' : 'opacity-30'}`}>🤖</div>
          <div>
            <div className="font-medium text-white">
              {aiEnabled ? 'AI Mode Active' : 'Manual Mode'}
            </div>
            <div className="text-sm text-gray-400">
              {aiEnabled
                ? 'AI is automatically adjusting levels'
                : 'You have full manual control'}
            </div>
          </div>
        </div>

        <button
          onClick={handleToggle}
          disabled={!connected}
          className={`
            relative inline-flex h-8 w-14 items-center rounded-full transition-colors
            ${aiEnabled ? 'bg-mixer-ai' : 'bg-gray-600'}
            ${!connected ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
          `}
        >
          <span
            className={`
              inline-block h-6 w-6 transform rounded-full bg-white transition-transform
              ${aiEnabled ? 'translate-x-7' : 'translate-x-1'}
            `}
          />
        </button>
      </div>

      {/* AI Status */}
      {aiEnabled && connected && (
        <div className="bg-mixer-ai/20 border border-mixer-ai rounded px-4 py-3">
          <div className="flex items-center space-x-2 mb-2">
            <div className="w-2 h-2 bg-mixer-ai rounded-full animate-pulse" />
            <span className="text-mixer-ai font-medium text-sm">
              AI Monitoring {recentDecisions.length > 0 ? `(${recentDecisions.length} active)` : ''}
            </span>
          </div>

          {/* Recent Decisions */}
          {recentDecisions.length > 0 && (
            <div className="mt-3 space-y-2 max-h-40 overflow-y-auto">
              {recentDecisions.slice(0, 5).map((decision, idx) => (
                <div
                  key={idx}
                  className="bg-mixer-fader rounded px-3 py-2 text-xs space-y-1"
                >
                  <div className="flex justify-between items-center">
                    <span className="font-medium text-white">
                      CH {decision.channel}
                    </span>
                    <span className={`font-bold ${getUrgencyColor(decision.urgency)}`}>
                      {decision.urgency.toUpperCase()}
                    </span>
                  </div>
                  <div className="text-gray-300">{decision.reason}</div>
                  <div className="flex justify-between text-gray-500">
                    <span>Action: {decision.action}</span>
                    <span>Confidence: {(decision.confidence * 100).toFixed(0)}%</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Warning when AI disabled */}
      {!aiEnabled && connected && (
        <div className="bg-yellow-500/20 border border-yellow-500 rounded px-4 py-3">
          <div className="flex items-center space-x-2">
            <span className="text-yellow-500 text-xl">⚠️</span>
            <div className="text-sm text-yellow-200">
              Manual mode active. AI protection disabled.
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
