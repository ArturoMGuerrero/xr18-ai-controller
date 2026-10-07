import React, { useRef, useEffect, useState } from 'react';
import { ChannelInfo } from '../types';

interface SpectrumAnalyzerProps {
  channels: ChannelInfo[];
  selectedChannel?: number; // 0 = master mix, 1-N = individual channel
  height?: number;
  showGrid?: boolean;
  showPeaks?: boolean;
  scaleType?: 'linear' | 'log';
}

export const SpectrumAnalyzer: React.FC<SpectrumAnalyzerProps> = ({
  channels,
  selectedChannel = 0,
  height = 200,
  showGrid = true,
  showPeaks = true,
  scaleType = 'linear',
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationFrameRef = useRef<number>();

  // Store level history (last 250 samples = 5 seconds @ 50Hz)
  const historyRef = useRef<number[]>([]);
  const maxHistory = 250;

  const [displayMode, setDisplayMode] = useState<'waveform' | 'bars'>('waveform');

  useEffect(() => {
    // Extract level for selected channel
    let currentLevel = -60; // Default silence

    if (selectedChannel === 0) {
      // Master mix: average of all active channels
      const activeLevels = channels
        .filter((ch) => ch.level_db > -60)
        .map((ch) => ch.level_db);

      if (activeLevels.length > 0) {
        currentLevel = activeLevels.reduce((a, b) => a + b, 0) / activeLevels.length;
      }
    } else {
      // Individual channel
      const channel = channels.find((ch) => ch.channel === selectedChannel);
      if (channel) {
        currentLevel = channel.level_db;
      }
    }

    // Add to history
    historyRef.current.push(currentLevel);

    // Trim history
    if (historyRef.current.length > maxHistory) {
      historyRef.current.shift();
    }

    // Request render
    if (!animationFrameRef.current) {
      animationFrameRef.current = requestAnimationFrame(render);
    }
  }, [channels, selectedChannel]);

  const render = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { width, height: canvasHeight } = canvas;

    // Clear canvas
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(0, 0, width, canvasHeight);

    // Draw grid
    if (showGrid) {
      drawGrid(ctx, width, canvasHeight);
    }

    // Draw waveform or bars
    if (displayMode === 'waveform') {
      drawWaveform(ctx, width, canvasHeight);
    } else {
      drawBars(ctx, width, canvasHeight);
    }

    // Draw peaks if enabled
    if (showPeaks) {
      drawPeakMarkers(ctx, width, canvasHeight);
    }

    // Clear animation frame
    animationFrameRef.current = undefined;
  };

  const drawGrid = (ctx: CanvasRenderingContext2D, width: number, height: number) => {
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 1;

    // Horizontal grid lines (dB levels)
    const dbLevels = [-60, -48, -36, -24, -12, -6, -3, 0];
    dbLevels.forEach((db) => {
      const y = dbToY(db, height);

      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();

      // Label
      ctx.fillStyle = '#666';
      ctx.font = '10px monospace';
      ctx.fillText(`${db}dB`, 5, y - 2);
    });

    // Vertical grid lines (time)
    const timeIntervals = 5; // 5 lines
    for (let i = 0; i <= timeIntervals; i++) {
      const x = (width / timeIntervals) * i;

      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();

      // Label (seconds ago)
      const secondsAgo = ((maxHistory - (maxHistory / timeIntervals) * i) / 20).toFixed(1);
      ctx.fillStyle = '#666';
      ctx.font = '10px monospace';
      ctx.fillText(`-${secondsAgo}s`, x + 2, height - 5);
    }
  };

  const drawWaveform = (ctx: CanvasRenderingContext2D, width: number, height: number) => {
    const history = historyRef.current;

    if (history.length < 2) return;

    ctx.strokeStyle = '#4a90e2';
    ctx.lineWidth = 2;
    ctx.beginPath();

    history.forEach((db, index) => {
      const x = (width / maxHistory) * index;
      const y = dbToY(db, height);

      if (index === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    });

    ctx.stroke();

    // Fill under waveform
    ctx.lineTo(width, height);
    ctx.lineTo(0, height);
    ctx.closePath();

    const gradient = ctx.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, 'rgba(74, 144, 226, 0.3)');
    gradient.addColorStop(1, 'rgba(74, 144, 226, 0.0)');

    ctx.fillStyle = gradient;
    ctx.fill();
  };

  const drawBars = (ctx: CanvasRenderingContext2D, width: number, height: number) => {
    const history = historyRef.current;

    if (history.length === 0) return;

    const barWidth = width / maxHistory;

    history.forEach((db, index) => {
      const x = barWidth * index;
      const y = dbToY(db, height);
      const barHeight = height - y;

      // Color based on level
      let color = '#4a90e2'; // Blue (safe)
      if (db > -6) color = '#f59e0b'; // Orange (warning)
      if (db > -3) color = '#ef4444'; // Red (danger)

      ctx.fillStyle = color;
      ctx.fillRect(x, y, barWidth - 1, barHeight);
    });
  };

  const drawPeakMarkers = (ctx: CanvasRenderingContext2D, width: number, height: number) => {
    const history = historyRef.current;

    if (history.length === 0) return;

    // Find peak in history
    const peak = Math.max(...history);

    if (peak > -60) {
      const y = dbToY(peak, height);

      // Draw horizontal line
      ctx.strokeStyle = '#ef4444';
      ctx.lineWidth = 1;
      ctx.setLineDash([5, 5]);
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
      ctx.setLineDash([]);

      // Label
      ctx.fillStyle = '#ef4444';
      ctx.font = '12px monospace';
      ctx.fillText(`Peak: ${peak.toFixed(1)}dB`, width - 120, y - 5);
    }
  };

  const dbToY = (db: number, height: number): number => {
    // Map -60dB to 0dB → height to 0
    const minDb = -60;
    const maxDb = 0;

    if (scaleType === 'linear') {
      const normalized = (db - minDb) / (maxDb - minDb);
      return height - normalized * height;
    } else {
      // Logarithmic scale
      const logMin = Math.log10(Math.abs(minDb) + 1);
      const logMax = Math.log10(Math.abs(maxDb) + 1);
      const logVal = Math.log10(Math.abs(db) + 1);

      const normalized = (logVal - logMin) / (logMax - logMin);
      return height - normalized * height;
    }
  };

  return (
    <div className="bg-mixer-panel p-4 rounded-lg space-y-3">
      {/* Controls */}
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium text-white">
          Level History {selectedChannel === 0 ? '(Master Mix)' : `(CH${selectedChannel})`}
        </h4>

        <div className="flex space-x-2">
          {/* Display Mode */}
          <select
            value={displayMode}
            onChange={(e) => setDisplayMode(e.target.value as 'waveform' | 'bars')}
            className="bg-mixer-fader text-white text-xs rounded px-2 py-1"
          >
            <option value="waveform">Waveform</option>
            <option value="bars">Bars</option>
          </select>

          {/* Scale Type */}
          <select
            value={scaleType}
            onChange={(e) => setScaleType(e.target.value as 'linear' | 'log')}
            className="bg-mixer-fader text-white text-xs rounded px-2 py-1"
          >
            <option value="linear">Linear</option>
            <option value="log">Logarithmic</option>
          </select>

          {/* Grid Toggle */}
          <label className="flex items-center space-x-1">
            <input
              type="checkbox"
              checked={showGrid}
              onChange={(e) => setShowGrid(e.target.checked)}
              className="rounded"
            />
            <span className="text-xs text-gray-300">Grid</span>
          </label>

          {/* Peaks Toggle */}
          <label className="flex items-center space-x-1">
            <input
              type="checkbox"
              checked={showPeaks}
              onChange={(e) => setShowPeaks(e.target.checked)}
              className="rounded"
            />
            <span className="text-xs text-gray-300">Peaks</span>
          </label>
        </div>
      </div>

      {/* Canvas */}
      <canvas
        ref={canvasRef}
        width={800}
        height={height}
        className="w-full bg-black rounded"
        style={{ imageRendering: 'crisp-edges' }}
      />

      {/* Info */}
      <div className="text-xs text-gray-400">
        {historyRef.current.length > 0 && (
          <div className="flex justify-between">
            <span>
              Current: {historyRef.current[historyRef.current.length - 1].toFixed(1)}dB
            </span>
            <span>
              Peak: {Math.max(...historyRef.current).toFixed(1)}dB
            </span>
            <span>
              Avg: {(
                historyRef.current.reduce((a, b) => a + b, 0) / historyRef.current.length
              ).toFixed(1)}
              dB
            </span>
            <span>History: {(historyRef.current.length / 20).toFixed(1)}s</span>
          </div>
        )}
      </div>
    </div>
  );
};
