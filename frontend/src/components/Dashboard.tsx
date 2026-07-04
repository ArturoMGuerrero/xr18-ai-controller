import React from 'react';
import { ChannelInfo, AIDecision } from '../types';

interface DashboardProps {
  channels: ChannelInfo[];
  aiDecisions: AIDecision[];
  aiEnabled: boolean;
}

export const Dashboard: React.FC<DashboardProps> = ({
  channels,
  aiDecisions,
  aiEnabled,
}) => {
  const calculateStats = () => {
    const activeChannels = channels.filter((ch) => ch.level_db > -60);
    const avgLevel =
      activeChannels.reduce((sum, ch) => sum + ch.level_db, 0) / activeChannels.length || -60;
    const maxLevel = Math.max(...channels.map((ch) => ch.level_db), -60);
    const clippingChannels = channels.filter((ch) => ch.level_db > -3).length;
    const mutedChannels = channels.filter((ch) => ch.muted).length;

    return {
      totalChannels: channels.length,
      activeChannels: activeChannels.length,
      avgLevel: avgLevel.toFixed(1),
      maxLevel: maxLevel.toFixed(1),
      clippingChannels,
      mutedChannels,
    };
  };

  const stats = calculateStats();

  const getAIActivityLevel = () => {
    const critical = aiDecisions.filter((d) => d.urgency === 'critical').length;
    const high = aiDecisions.filter((d) => d.urgency === 'high').length;
    const medium = aiDecisions.filter((d) => d.urgency === 'medium').length;

    return { critical, high, medium };
  };

  const aiActivity = getAIActivityLevel();

  return (
    <div className="bg-mixer-panel p-6 rounded-lg space-y-6">
      <h2 className="text-xl font-bold text-white">Dashboard</h2>

      {/* Overall Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          label="Active Channels"
          value={`${stats.activeChannels}/${stats.totalChannels}`}
          color="blue"
        />
        <StatCard
          label="Average Level"
          value={`${stats.avgLevel} dB`}
          color={parseFloat(stats.avgLevel) > -6 ? 'orange' : 'green'}
        />
        <StatCard
          label="Peak Level"
          value={`${stats.maxLevel} dB`}
          color={parseFloat(stats.maxLevel) > -3 ? 'red' : 'green'}
        />
        <StatCard
          label="Muted"
          value={stats.mutedChannels.toString()}
          color="gray"
        />
      </div>

      {/* Warnings */}
      {stats.clippingChannels > 0 && (
        <div className="bg-red-500/20 border border-red-500 rounded-lg p-4">
          <div className="flex items-center space-x-3">
            <span className="text-2xl">⚠️</span>
            <div>
              <div className="font-bold text-red-400">CLIPPING ALERT!</div>
              <div className="text-sm text-red-300">
                {stats.clippingChannels} channel(s) approaching clipping (&gt;-3dB)
              </div>
            </div>
          </div>
        </div>
      )}

      {/* AI Activity */}
      {aiEnabled && (
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-gray-400">AI Activity</h3>
          <div className="grid grid-cols-3 gap-3">
            <ActivityIndicator
              label="Critical"
              count={aiActivity.critical}
              color="red"
            />
            <ActivityIndicator label="High" count={aiActivity.high} color="orange" />
            <ActivityIndicator
              label="Medium"
              count={aiActivity.medium}
              color="yellow"
            />
          </div>
        </div>
      )}

      {/* Level Distribution */}
      <div className="space-y-3">
        <h3 className="text-sm font-medium text-gray-400">Level Distribution</h3>
        <LevelDistribution channels={channels} />
      </div>
    </div>
  );
};

const StatCard: React.FC<{
  label: string;
  value: string;
  color: 'blue' | 'green' | 'orange' | 'red' | 'gray';
}> = ({ label, value, color }) => {
  const colors = {
    blue: 'border-blue-500 text-blue-400',
    green: 'border-green-500 text-green-400',
    orange: 'border-orange-500 text-orange-400',
    red: 'border-red-500 text-red-400',
    gray: 'border-gray-500 text-gray-400',
  };

  return (
    <div className={`bg-mixer-fader border ${colors[color]} rounded-lg p-4`}>
      <div className="text-xs text-gray-400 mb-1">{label}</div>
      <div className={`text-2xl font-bold ${colors[color]}`}>{value}</div>
    </div>
  );
};

const ActivityIndicator: React.FC<{
  label: string;
  count: number;
  color: 'red' | 'orange' | 'yellow';
}> = ({ label, count, color }) => {
  const colors = {
    red: 'bg-red-500',
    orange: 'bg-orange-500',
    yellow: 'bg-yellow-500',
  };

  return (
    <div className="bg-mixer-fader rounded-lg p-3 text-center">
      <div className={`w-3 h-3 ${colors[color]} rounded-full mx-auto mb-2`} />
      <div className="text-sm text-gray-400">{label}</div>
      <div className="text-xl font-bold text-white">{count}</div>
    </div>
  );
};

const LevelDistribution: React.FC<{ channels: ChannelInfo[] }> = ({ channels }) => {
  const getRangeCount = (min: number, max: number) => {
    return channels.filter((ch) => ch.level_db > min && ch.level_db <= max).length;
  };

  const ranges = [
    { label: '> -3dB', count: getRangeCount(-3, 0), color: 'bg-red-500' },
    { label: '-3 to -6dB', count: getRangeCount(-6, -3), color: 'bg-orange-500' },
    { label: '-6 to -12dB', count: getRangeCount(-12, -6), color: 'bg-yellow-500' },
    { label: '-12 to -20dB', count: getRangeCount(-20, -12), color: 'bg-green-400' },
    { label: '-20 to -40dB', count: getRangeCount(-40, -20), color: 'bg-green-600' },
    { label: '< -40dB', count: getRangeCount(-60, -40), color: 'bg-gray-600' },
  ];

  const maxCount = Math.max(...ranges.map((r) => r.count), 1);

  return (
    <div className="space-y-2">
      {ranges.map((range, idx) => (
        <div key={idx} className="flex items-center space-x-3">
          <div className="w-24 text-xs text-gray-400">{range.label}</div>
          <div className="flex-1 bg-gray-800 rounded-full h-6 overflow-hidden">
            <div
              className={`${range.color} h-full transition-all duration-300 flex items-center justify-end pr-2`}
              style={{ width: `${(range.count / maxCount) * 100}%` }}
            >
              {range.count > 0 && (
                <span className="text-xs font-bold text-white">{range.count}</span>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};
