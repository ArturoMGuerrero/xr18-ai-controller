import React, { useState, useEffect, useCallback } from 'react';
import { LearningStats, ChannelLearningStats } from '../types';
import { apiService } from '../services/api';

export const LearningMode: React.FC = () => {
  const [learningEnabled, setLearningEnabled] = useState(true);
  const [stats, setStats] = useState<LearningStats | null>(null);
  const [selectedChannel, setSelectedChannel] = useState<number | null>(null);
  const [channelStats, setChannelStats] = useState<ChannelLearningStats | null>(null);
  const [loading, setLoading] = useState(false);

  const loadStats = useCallback(async () => {
    try {
      const response = await apiService.getLearningStatus();
      setLearningEnabled(response.learning_enabled);
      setStats(response.stats);
    } catch (error) {
      console.error('Failed to load learning stats:', error);
    }
  }, []);

  const loadChannelStats = useCallback(async (channel: number) => {
    try {
      const channelData = await apiService.getChannelLearningStats(channel);
      setChannelStats(channelData);
    } catch (error) {
      console.error('Failed to load channel stats:', error);
    }
  }, []);

  useEffect(() => {
    loadStats();
    const interval = setInterval(loadStats, 5000); // Refresh every 5 seconds
    return () => clearInterval(interval);
  }, [loadStats]);

  useEffect(() => {
    if (selectedChannel !== null) {
      loadChannelStats(selectedChannel);
    }
  }, [selectedChannel, loadChannelStats]);

  const handleToggleLearning = async () => {
    setLoading(true);
    try {
      const newValue = !learningEnabled;
      await apiService.setLearningMode(newValue);
      setLearningEnabled(newValue);
    } catch (error) {
      console.error('Failed to toggle learning mode:', error);
    } finally {
      setLoading(false);
    }
  };

  const getStyleBadge = (style: string) => {
    const colors = {
      aggressive: 'bg-red-900/30 border-red-500 text-red-400',
      moderate: 'bg-yellow-900/30 border-yellow-500 text-yellow-400',
      conservative: 'bg-blue-900/30 border-blue-500 text-blue-400',
    };
    return colors[style as keyof typeof colors] || colors.moderate;
  };

  const getStyleIcon = (style: string) => {
    const icons = {
      aggressive: '⚡',
      moderate: '⚖️',
      conservative: '🐢',
    };
    return icons[style as keyof typeof icons] || '⚖️';
  };

  const getStyleDescription = (style: string) => {
    const descriptions = {
      aggressive: 'Prefers large, fast adjustments',
      moderate: 'Balanced adjustment approach',
      conservative: 'Prefers small, gradual adjustments',
    };
    return descriptions[style as keyof typeof descriptions] || '';
  };

  return (
    <div className="space-y-6">
      {/* Learning Mode Control */}
      <div className="bg-mixer-panel p-6 rounded-lg">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-bold text-white mb-1">Learning Mode</h3>
            <p className="text-sm text-gray-400">AI learns from your manual adjustments to adapt its behavior</p>
          </div>
          <button
            onClick={handleToggleLearning}
            disabled={loading}
            className={`
              px-6 py-3 rounded-lg font-medium transition-all flex items-center space-x-3
              ${
                learningEnabled
                  ? 'bg-green-600 hover:bg-green-700 text-white'
                  : 'bg-gray-600 hover:bg-gray-700 text-gray-300'
              }
              ${loading ? 'opacity-50 cursor-not-allowed' : ''}
            `}
          >
            <div
              className={`w-3 h-3 rounded-full ${learningEnabled ? 'bg-green-300 animate-pulse' : 'bg-gray-400'}`}
            />
            <span>{learningEnabled ? 'Learning Enabled' : 'Learning Disabled'}</span>
          </button>
        </div>

        {learningEnabled && (
          <div className="mt-4 p-4 bg-green-900/20 border border-green-500 rounded-lg">
            <div className="flex items-start space-x-2">
              <span className="text-lg">💡</span>
              <div className="text-sm text-green-400">
                <p className="font-medium mb-1">Learning is active</p>
                <p className="text-green-300">
                  The AI is observing your manual adjustments and will gradually adapt its behavior to match your mixing
                  style. Make adjustments in manual mode to teach the AI your preferences.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Learning Statistics */}
      {stats && (
        <div className="bg-mixer-panel p-6 rounded-lg">
          <h4 className="text-lg font-bold text-white mb-4">Learning Statistics</h4>

          <div className="grid grid-cols-3 gap-4 mb-6">
            <div className="bg-mixer-fader p-4 rounded-lg">
              <div className="text-3xl font-bold text-mixer-accent">{stats.total_adjustments}</div>
              <div className="text-sm text-gray-400 mt-1">Total Adjustments</div>
            </div>
            <div className="bg-mixer-fader p-4 rounded-lg">
              <div className="text-3xl font-bold text-mixer-accent">{stats.channels_with_learning}</div>
              <div className="text-sm text-gray-400 mt-1">Channels Learning</div>
            </div>
            <div className="bg-mixer-fader p-4 rounded-lg">
              <div className="text-3xl font-bold text-mixer-accent">
                {stats.total_adjustments > 0
                  ? Math.round((stats.channels_with_learning / Object.keys(stats.channels).length) * 100)
                  : 0}
                %
              </div>
              <div className="text-sm text-gray-400 mt-1">Coverage</div>
            </div>
          </div>

          {/* Per-Channel Learning */}
          {Object.keys(stats.channels).length > 0 && (
            <div>
              <h5 className="text-sm font-medium text-gray-400 mb-3">Channel Learning Progress</h5>
              <div className="space-y-2">
                {Object.entries(stats.channels).map(([channel, data]) => (
                  <div
                    key={channel}
                    onClick={() => setSelectedChannel(parseInt(channel))}
                    className="bg-mixer-fader p-3 rounded-lg hover:bg-opacity-80 cursor-pointer transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-3">
                        <div className="text-xl">{getStyleIcon(data.style)}</div>
                        <div>
                          <div className="font-medium text-white">Channel {channel}</div>
                          <div className="text-xs text-gray-400">{data.adjustments} adjustments recorded</div>
                        </div>
                      </div>
                      <div className={`px-3 py-1 rounded-full border text-xs font-medium ${getStyleBadge(data.style)}`}>
                        {data.style.charAt(0).toUpperCase() + data.style.slice(1)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Channel Detail Modal */}
      {selectedChannel !== null && channelStats && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <div className="bg-mixer-panel p-6 rounded-lg w-full max-w-lg space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="text-lg font-bold text-white">Channel {selectedChannel} Learning</h4>
              <button
                onClick={() => setSelectedChannel(null)}
                className="text-gray-400 hover:text-white text-2xl leading-none"
              >
                ×
              </button>
            </div>

            <div className="space-y-4">
              <div className="bg-mixer-fader p-4 rounded-lg">
                <div className="text-sm text-gray-400 mb-1">Adjustments Recorded</div>
                <div className="text-2xl font-bold text-white">{channelStats.adjustments_recorded}</div>
              </div>

              {channelStats.response_style && (
                <div className="bg-mixer-fader p-4 rounded-lg">
                  <div className="text-sm text-gray-400 mb-2">Response Style</div>
                  <div
                    className={`inline-flex items-center space-x-2 px-4 py-2 rounded-full border ${getStyleBadge(
                      channelStats.response_style
                    )}`}
                  >
                    <span className="text-xl">{getStyleIcon(channelStats.response_style)}</span>
                    <span className="font-medium">
                      {channelStats.response_style.charAt(0).toUpperCase() + channelStats.response_style.slice(1)}
                    </span>
                  </div>
                  <div className="text-sm text-gray-400 mt-2">{getStyleDescription(channelStats.response_style)}</div>
                </div>
              )}

              <div className="bg-mixer-fader p-4 rounded-lg">
                <div className="text-sm text-gray-400 mb-1">Learning Status</div>
                <div
                  className={`inline-flex items-center space-x-2 px-3 py-1 rounded ${
                    channelStats.has_learned_behavior ? 'bg-green-900/30 text-green-400' : 'bg-yellow-900/30 text-yellow-400'
                  }`}
                >
                  <span>{channelStats.has_learned_behavior ? '✅' : '⏳'}</span>
                  <span className="text-sm font-medium">
                    {channelStats.has_learned_behavior ? 'Fully Learned' : 'Still Learning'}
                  </span>
                </div>
                {!channelStats.has_learned_behavior && (
                  <div className="text-xs text-gray-500 mt-2">
                    Need {10 - channelStats.adjustments_recorded} more adjustments to complete learning
                  </div>
                )}
              </div>
            </div>

            <div className="pt-2">
              <button
                onClick={() => setSelectedChannel(null)}
                className="w-full bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
