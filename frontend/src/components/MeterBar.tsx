import React from 'react';

interface MeterBarProps {
  level: number; // dB value
}

export const MeterBar: React.FC<MeterBarProps> = ({ level }) => {
  const dbToPercent = (db: number): number => {
    if (db <= -60) return 0;
    if (db >= 0) return 100;
    return ((db + 60) / 60) * 100;
  };

  const getColor = (db: number): string => {
    if (db > -3) return 'bg-mixer-danger';
    if (db > -6) return 'bg-mixer-warning';
    if (db > -12) return 'bg-mixer-success';
    return 'bg-green-500';
  };

  const percent = dbToPercent(level);
  const color = getColor(level);

  const segments = [
    { threshold: -3, color: 'bg-red-500', label: '0' },
    { threshold: -6, color: 'bg-yellow-500', label: '-6' },
    { threshold: -12, color: 'bg-green-500', label: '-12' },
    { threshold: -20, color: 'bg-green-600', label: '-20' },
    { threshold: -40, color: 'bg-green-700', label: '-40' },
    { threshold: -60, color: 'bg-green-800', label: '-60' },
  ];

  return (
    <div className="relative w-8 h-full bg-gray-800 rounded overflow-hidden border border-gray-700">
      {/* Scale markings */}
      <div className="absolute inset-0 flex flex-col justify-between py-1">
        {segments.map((seg, idx) => (
          <div key={idx} className="flex items-center">
            <div className="w-full h-px bg-gray-600" />
            <span className="absolute right-10 text-xs text-gray-500">
              {seg.label}
            </span>
          </div>
        ))}
      </div>

      {/* Meter fill */}
      <div
        className="absolute bottom-0 w-full transition-all duration-100 ease-out"
        style={{ height: `${percent}%` }}
      >
        {segments.map((seg, idx) => {
          const segPercent = dbToPercent(seg.threshold);
          if (percent >= segPercent) {
            return (
              <div
                key={idx}
                className={`absolute bottom-0 w-full ${seg.color}`}
                style={{
                  height: `${Math.min(
                    (segPercent / percent) * 100,
                    100
                  )}%`,
                  bottom: `${idx > 0 ? dbToPercent(segments[idx - 1].threshold) / percent * 100 : 0}%`,
                }}
              />
            );
          }
          return null;
        })}
      </div>

      {/* Peak indicator */}
      {level > -6 && (
        <div
          className="absolute left-0 w-full h-1 bg-white animate-pulse"
          style={{ bottom: `${percent}%` }}
        />
      )}
    </div>
  );
};
