import React from 'react';
import { ChannelInfo } from '../types';
import { MeterBar } from './MeterBar';

interface ChannelStripProps {
  channel: ChannelInfo;
  disabled: boolean;
  onFaderChange: (channel: number, value: number) => void;
  onMuteToggle: (channel: number, mute: boolean) => void;
}

export const ChannelStrip: React.FC<ChannelStripProps> = ({
  channel,
  disabled,
  onFaderChange,
  onMuteToggle,
}) => {
  const handleFaderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseFloat(e.target.value);
    onFaderChange(channel.channel, value);
  };

  const handleMuteClick = () => {
    onMuteToggle(channel.channel, !channel.muted);
  };

  return (
    <div className="flex flex-col items-center bg-mixer-panel p-4 rounded-lg space-y-3 w-20">
      {/* Channel Number */}
      <div className="text-xs font-bold text-gray-300">
        {channel.channel}
      </div>

      {/* Meter Display */}
      <div className="h-48">
        <MeterBar level={channel.level_db} />
      </div>

      {/* Level Display */}
      <div className="text-xs font-mono text-gray-400">
        {channel.level_db > -60 ? `${channel.level_db.toFixed(1)}` : '-∞'}
      </div>

      {/* Fader */}
      <input
        type="range"
        min="0"
        max="1"
        step="0.01"
        value={channel.fader_value}
        disabled={disabled}
        onChange={handleFaderChange}
        className={`
          w-32 h-2 bg-mixer-fader rounded-lg appearance-none cursor-pointer
          transform -rotate-90 origin-center
          disabled:opacity-50 disabled:cursor-not-allowed
          [&::-webkit-slider-thumb]:appearance-none
          [&::-webkit-slider-thumb]:w-3
          [&::-webkit-slider-thumb]:h-6
          [&::-webkit-slider-thumb]:bg-mixer-accent
          [&::-webkit-slider-thumb]:rounded
          [&::-webkit-slider-thumb]:cursor-pointer
          [&::-moz-range-thumb]:w-3
          [&::-moz-range-thumb]:h-6
          [&::-moz-range-thumb]:bg-mixer-accent
          [&::-moz-range-thumb]:rounded
          [&::-moz-range-thumb]:cursor-pointer
          [&::-moz-range-thumb]:border-0
        `}
      />

      {/* Fader Value */}
      <div className="text-xs font-mono text-gray-500">
        {Math.round(channel.fader_value * 100)}
      </div>

      {/* Mute Button */}
      <button
        onClick={handleMuteClick}
        className={`
          w-12 h-8 rounded text-xs font-bold transition-colors
          ${channel.muted
            ? 'bg-mixer-danger text-white'
            : 'bg-gray-600 text-gray-300 hover:bg-gray-500'
          }
        `}
      >
        {channel.muted ? 'MUTE' : 'ON'}
      </button>

      {/* Channel Name */}
      <div className="text-xs text-gray-400 truncate w-full text-center">
        {channel.name}
      </div>

      {/* Stats (if available) */}
      {channel.stats && channel.stats.avg_db !== null && (
        <div className="text-xs text-gray-500 space-y-1">
          <div>Avg: {channel.stats.avg_db.toFixed(1)}</div>
          <div>Peak: {channel.stats.max_db?.toFixed(1) || '-'}</div>
        </div>
      )}
    </div>
  );
};
