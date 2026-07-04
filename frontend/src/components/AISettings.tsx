import React, { useState } from 'react';

interface AIConfig {
  maxThreshold: number;
  targetLevel: number;
  minThreshold: number;
  historyWindow: number;
  confidenceThreshold: number;
  adjustmentSpeed: number;
}

export const AISettings: React.FC = () => {
  const [config, setConfig] = useState<AIConfig>({
    maxThreshold: -6.0,
    targetLevel: -12.0,
    minThreshold: -40.0,
    historyWindow: 100,
    confidenceThreshold: 0.7,
    adjustmentSpeed: 0.8,
  });

  const [selectedPreset, setSelectedPreset] = useState<string>('custom');

  const presets: Record<string, Partial<AIConfig>> = {
    'live-music': {
      maxThreshold: -8.0,
      targetLevel: -15.0,
      minThreshold: -45.0,
      adjustmentSpeed: 0.7,
    },
    podcast: {
      maxThreshold: -4.0,
      targetLevel: -10.0,
      minThreshold: -35.0,
      adjustmentSpeed: 0.9,
    },
    broadcast: {
      maxThreshold: -10.0,
      targetLevel: -18.0,
      minThreshold: -50.0,
      adjustmentSpeed: 0.6,
    },
    speech: {
      maxThreshold: -6.0,
      targetLevel: -12.0,
      minThreshold: -40.0,
      adjustmentSpeed: 0.8,
    },
    dj: {
      maxThreshold: -3.0,
      targetLevel: -8.0,
      minThreshold: -30.0,
      adjustmentSpeed: 1.0,
    },
  };

  const handlePresetChange = (preset: string) => {
    setSelectedPreset(preset);
    if (preset !== 'custom' && presets[preset]) {
      setConfig((prev) => ({ ...prev, ...presets[preset] }));
    }
  };

  const handleConfigChange = (key: keyof AIConfig, value: number) => {
    setConfig((prev) => ({ ...prev, [key]: value }));
    setSelectedPreset('custom');
  };

  const handleSave = async () => {
    try {
      const response = await fetch('http://localhost:8000/api/ai/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });

      if (response.ok) {
        alert('AI configuration saved successfully!');
      }
    } catch (error) {
      console.error('Failed to save AI config:', error);
      alert('Failed to save configuration');
    }
  };

  return (
    <div className="bg-mixer-panel p-6 rounded-lg space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-bold text-white">AI Configuration</h3>
        <button
          onClick={handleSave}
          className="bg-mixer-accent hover:bg-blue-600 text-white px-4 py-2 rounded font-medium"
        >
          Save Changes
        </button>
      </div>

      {/* Presets */}
      <div className="space-y-2">
        <label className="text-sm font-medium text-gray-400">Quick Presets</label>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
          {Object.keys({ custom: {}, ...presets }).map((preset) => (
            <button
              key={preset}
              onClick={() => handlePresetChange(preset)}
              className={`
                px-4 py-2 rounded border-2 transition-all text-sm font-medium
                ${
                  selectedPreset === preset
                    ? 'border-mixer-accent bg-mixer-accent/20 text-white'
                    : 'border-gray-600 text-gray-400 hover:border-gray-500'
                }
              `}
            >
              {preset.replace(/-/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase())}
            </button>
          ))}
        </div>
      </div>

      {/* Level Thresholds */}
      <div className="space-y-4">
        <h4 className="text-sm font-medium text-gray-400">Level Thresholds (dB)</h4>

        <Slider
          label="Max Threshold"
          value={config.maxThreshold}
          onChange={(value) => handleConfigChange('maxThreshold', value)}
          min={-12}
          max={0}
          step={0.5}
          description="AI starts reducing when levels exceed this"
        />

        <Slider
          label="Target Level"
          value={config.targetLevel}
          onChange={(value) => handleConfigChange('targetLevel', value)}
          min={-30}
          max={-3}
          step={0.5}
          description="Ideal signal level to maintain"
        />

        <Slider
          label="Min Threshold"
          value={config.minThreshold}
          onChange={(value) => handleConfigChange('minThreshold', value)}
          min={-60}
          max={-20}
          step={1}
          description="AI increases levels when below this"
        />
      </div>

      {/* AI Behavior */}
      <div className="space-y-4 border-t border-gray-700 pt-4">
        <h4 className="text-sm font-medium text-gray-400">AI Behavior</h4>

        <Slider
          label="History Window"
          value={config.historyWindow}
          onChange={(value) => handleConfigChange('historyWindow', value)}
          min={20}
          max={200}
          step={10}
          description="Number of samples to analyze (higher = smoother)"
        />

        <Slider
          label="Confidence Threshold"
          value={config.confidenceThreshold}
          onChange={(value) => handleConfigChange('confidenceThreshold', value)}
          min={0.3}
          max={1.0}
          step={0.05}
          description="Minimum confidence required to take action"
          showPercentage
        />

        <Slider
          label="Adjustment Speed"
          value={config.adjustmentSpeed}
          onChange={(value) => handleConfigChange('adjustmentSpeed', value)}
          min={0.1}
          max={1.0}
          step={0.1}
          description="How quickly AI adjusts levels (higher = faster)"
          showPercentage
        />
      </div>

      {/* Visual Preview */}
      <div className="bg-mixer-fader rounded-lg p-4 border border-gray-700">
        <h5 className="text-xs font-medium text-gray-400 mb-3">Threshold Preview</h5>
        <div className="relative h-24 bg-gray-800 rounded overflow-hidden">
          {/* Zone indicators */}
          <div className="absolute inset-0 flex">
            {/* Below min */}
            <div
              className="bg-blue-900/30 border-r border-gray-600"
              style={{
                width: `${((config.minThreshold + 60) / 60) * 100}%`,
              }}
            >
              <span className="text-xs text-blue-400 p-1">Too Low</span>
            </div>

            {/* Target zone */}
            <div
              className="bg-green-900/30 border-r border-gray-600"
              style={{
                width: `${((config.targetLevel - config.minThreshold) / 60) * 100}%`,
              }}
            >
              <span className="text-xs text-green-400 p-1">Target</span>
            </div>

            {/* Warning zone */}
            <div
              className="bg-yellow-900/30 border-r border-gray-600"
              style={{
                width: `${((config.maxThreshold - config.targetLevel) / 60) * 100}%`,
              }}
            >
              <span className="text-xs text-yellow-400 p-1">Warning</span>
            </div>

            {/* Danger zone */}
            <div className="bg-red-900/30 flex-1">
              <span className="text-xs text-red-400 p-1">Danger</span>
            </div>
          </div>

          {/* Threshold markers */}
          <ThresholdMarker
            label="Min"
            position={((config.minThreshold + 60) / 60) * 100}
            color="blue"
          />
          <ThresholdMarker
            label="Target"
            position={((config.targetLevel + 60) / 60) * 100}
            color="green"
          />
          <ThresholdMarker
            label="Max"
            position={((config.maxThreshold + 60) / 60) * 100}
            color="red"
          />
        </div>
      </div>
    </div>
  );
};

const Slider: React.FC<{
  label: string;
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  step: number;
  description?: string;
  showPercentage?: boolean;
}> = ({ label, value, onChange, min, max, step, description, showPercentage = false }) => {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-sm text-white">{label}</label>
        <span className="text-sm font-mono text-mixer-accent">
          {showPercentage ? `${(value * 100).toFixed(0)}%` : value.toFixed(1)}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full h-2 bg-mixer-fader rounded-lg appearance-none cursor-pointer
          [&::-webkit-slider-thumb]:appearance-none
          [&::-webkit-slider-thumb]:w-4
          [&::-webkit-slider-thumb]:h-4
          [&::-webkit-slider-thumb]:bg-mixer-accent
          [&::-webkit-slider-thumb]:rounded-full
          [&::-webkit-slider-thumb]:cursor-pointer
          [&::-moz-range-thumb]:w-4
          [&::-moz-range-thumb]:h-4
          [&::-moz-range-thumb]:bg-mixer-accent
          [&::-moz-range-thumb]:rounded-full
          [&::-moz-range-thumb]:cursor-pointer
          [&::-moz-range-thumb]:border-0"
      />
      {description && <p className="text-xs text-gray-500">{description}</p>}
    </div>
  );
};

const ThresholdMarker: React.FC<{
  label: string;
  position: number;
  color: 'blue' | 'green' | 'red';
}> = ({ label, position, color }) => {
  const colors = {
    blue: 'bg-blue-500',
    green: 'bg-green-500',
    red: 'bg-red-500',
  };

  return (
    <div
      className="absolute top-0 bottom-0 w-px"
      style={{ left: `${position}%` }}
    >
      <div className={`${colors[color]} w-full h-full opacity-50`} />
      <div
        className={`absolute -top-6 left-1/2 -translate-x-1/2 ${colors[color]} text-white text-xs px-2 py-1 rounded whitespace-nowrap`}
      >
        {label}
      </div>
    </div>
  );
};
