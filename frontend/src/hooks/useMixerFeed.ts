import { useEffect, useState } from 'react';
import type { AIDecision, MeterData } from '../types';
import { apiService } from '../services/api';

const MAX_RECENT_DECISIONS = 10;

/**
 * Latest meter frame pushed by the mixer engine (about 20 per second while connected),
 * plus the AI's most recent moves. Frames only carry the moves made in that tick, so
 * they are accumulated here to stay visible.
 */
export const useMixerFeed = () => {
  const [meterData, setMeterData] = useState<MeterData | null>(null);
  const [recentDecisions, setRecentDecisions] = useState<AIDecision[]>([]);

  useEffect(
    () =>
      apiService.onFrame((frame) => {
        setMeterData(frame);
        if (frame.ai_decisions.length > 0) {
          setRecentDecisions((prev) => [...frame.ai_decisions, ...prev].slice(0, MAX_RECENT_DECISIONS));
        }
      }),
    [],
  );

  return {
    meterData,
    recentDecisions,
    clearDecisions: () => setRecentDecisions([]),
    link: meterData?.link ?? 'disconnected',
  };
};
