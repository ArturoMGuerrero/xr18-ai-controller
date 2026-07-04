import React, { useState, useEffect } from 'react';

interface EnhancedMeterBarProps {
  level: number; // dB value
  peakHold?: boolean;
  orientation?: 'vertical' | 'horizontal';
  showScale?: boolean;
}

export const EnhancedMeterBar: React.FC<EnhancedMeterBarProps> = ({
  level,
  peakHold = true,
  orientation = 'vertical',
  showScale = true,
}) => {
  const [peak, setPeak] = useState(-60);
  const [peakTimeout, setPeakTimeout] = useState<number | null>(null);

  useEffect(() => {
    if (level > peak) {
      setPeak(level);

      if (peakTimeout) {
        clearTimeout(peakTimeout);
      }

      const timeout = window.setTimeout(() => {
        setPeak(-60);
      }, 2000);

      setPeakTimeout(timeout);
    }

    return () => {
      if (peakTimeout) {
        clearTimeout(peakTimeout);
      }
    };
  }, [level]);

  const dbToPercent = (db: number): number => {
    if (db <= -60) return 0;
    if (db >= 0) return 100;
    return ((db + 60) / 60) * 100;
  };

  const getSegmentColor = (db: number): string => {
    if (db > -3) return 'bg-red-500';
    if (db > -6) return 'bg-orange-500';
    if (db > -12) return 'bg-yellow-500';
    if (db > -20) return 'bg-green-400';
    return 'bg-green-600';
  };

  const percent = dbToPercent(level);
  const peakPercent = dbToPercent(peak);

  const scaleMarks = [
    { db: 0, label: '0' },
    { db: -3, label: '-3' },
    { db: -6, label: '-6' },
    { db: -12, label: '-12' },
    { db: -20, label: '-20' },
    { db: -30, label: '-30' },
    { db: -40, label: '-40' },
    { db: -60, label: '-60' },
  ];

  if (orientation === 'vertical') {
    return (
      <div className="relative w-10 h-full bg-gray-800 rounded overflow-hidden border border-gray-700">
        {/* Scale markings */}
        {showScale && (
          <div className="absolute inset-0 flex flex-col justify-between py-1 pointer-events-none">
            {scaleMarks.map((mark, idx) => (
              <div key={idx} className="relative flex items-center">
                <div className="w-2 h-px bg-gray-500 ml-1" />
                <span className="absolute left-12 text-xs text-gray-500 whitespace-nowrap">
                  {mark.label}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* LED segments */}
        <div className="absolute bottom-0 w-full h-full flex flex-col-reverse">
          {/* Render 60 LED segments */}
          {Array.from({ length: 60 }).map((_, idx) => {
            const segmentDb = -60 + idx;
            const segmentPercent = (idx / 60) * 100;
            const isLit = segmentPercent < percent;
            const color = getSegmentColor(segmentDb);

            return (
              <div
                key={idx}
                className={`h-[1.5%] w-full border-b border-gray-900 transition-all duration-75 ${
                  isLit ? color : 'bg-gray-800'
                }`}
                style={{
                  opacity: isLit ? 1 : 0.2,
                }}
              />
            );
          })}
        </div>

        {/* Peak hold indicator */}
        {peakHold && peak > -60 && (
          <div
            className="absolute left-0 w-full h-1 bg-white shadow-lg"
            style={{
              bottom: `${peakPercent}%`,
              transition: 'bottom 0.05s ease-out',
            }}
          />
        )}

        {/* Clipping indicator */}
        {level > -1 && (
          <div className="absolute top-0 left-0 right-0 h-2 bg-red-600 animate-pulse" />
        )}
      </div>
    );
  }

  // Horizontal orientation
  return (
    <div className="relative h-10 w-full bg-gray-800 rounded overflow-hidden border border-gray-700">
      {/* Meter fill */}
      <div
        className="absolute left-0 h-full transition-all duration-75"
        style={{ width: `${percent}%` }}
      >
        <div className={`h-full ${getSegmentColor(level)}`} />
      </div>

      {/* Peak hold */}
      {peakHold && peak > -60 && (
        <div
          className="absolute top-0 w-1 h-full bg-white"
          style={{
            left: `${peakPercent}%`,
            transition: 'left 0.05s ease-out',
          }}
        />
      )}

      {/* Scale */}
      {showScale && (
        <div className="absolute inset-0 flex justify-between items-center px-1 pointer-events-none">
          {scaleMarks.map((mark, idx) => (
            <div key={idx} className="text-xs text-gray-500">
              {mark.label}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
