import React, { useState, useCallback } from 'react';
import { ChannelInfo, AIDecision } from '../types';

interface SessionRecord {
  timestamp: number;
  channels: ChannelInfo[];
  aiDecisions: AIDecision[];
}

export const SessionRecorder: React.FC = () => {
  const [isRecording, setIsRecording] = useState(false);
  const [sessions, setSessions] = useState<{ name: string; data: SessionRecord[] }[]>([]);
  const [currentSession, setCurrentSession] = useState<SessionRecord[]>([]);
  const [sessionName, setSessionName] = useState('');

  const startRecording = useCallback(() => {
    setIsRecording(true);
    setCurrentSession([]);
    setSessionName(`Session ${new Date().toLocaleString()}`);
  }, []);

  const stopRecording = useCallback(() => {
    setIsRecording(false);
    if (currentSession.length > 0) {
      setSessions((prev) => [...prev, { name: sessionName, data: currentSession }]);
    }
  }, [currentSession, sessionName]);

  const recordFrame = useCallback(
    (channels: ChannelInfo[], aiDecisions: AIDecision[]) => {
      if (isRecording) {
        setCurrentSession((prev) => [
          ...prev,
          {
            timestamp: Date.now(),
            channels,
            aiDecisions,
          },
        ]);
      }
    },
    [isRecording]
  );

  const exportSession = useCallback((session: { name: string; data: SessionRecord[] }) => {
    const blob = new Blob([JSON.stringify(session, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${session.name.replace(/[^a-z0-9]/gi, '_')}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, []);

  const exportCSV = useCallback((session: { name: string; data: SessionRecord[] }) => {
    const headers = ['Timestamp', 'Channel', 'Level (dB)', 'Fader', 'Muted', 'AI Decision', 'Urgency'];
    const rows = session.data.flatMap((record) =>
      record.channels.map((ch) => {
        const decision = record.aiDecisions.find((d) => d.channel === ch.channel);
        return [
          new Date(record.timestamp).toISOString(),
          ch.channel,
          ch.level_db.toFixed(2),
          ch.fader_value.toFixed(3),
          ch.muted ? 'Yes' : 'No',
          decision?.action || 'none',
          decision?.urgency || 'none',
        ].join(',');
      })
    );

    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${session.name.replace(/[^a-z0-9]/gi, '_')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, []);

  const deleteSession = useCallback((index: number) => {
    setSessions((prev) => prev.filter((_, i) => i !== index));
  }, []);

  return (
    <div className="bg-mixer-panel p-6 rounded-lg space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-bold text-white">Session Recording</h3>
        <div className="flex items-center space-x-3">
          {isRecording && (
            <div className="flex items-center space-x-2">
              <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse" />
              <span className="text-sm text-red-400">Recording... ({currentSession.length} frames)</span>
            </div>
          )}
          {!isRecording ? (
            <button
              onClick={startRecording}
              className="bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded font-medium flex items-center space-x-2"
            >
              <span>●</span>
              <span>Start Recording</span>
            </button>
          ) : (
            <button
              onClick={stopRecording}
              className="bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded font-medium flex items-center space-x-2"
            >
              <span>■</span>
              <span>Stop Recording</span>
            </button>
          )}
        </div>
      </div>

      {/* Sessions List */}
      {sessions.length > 0 ? (
        <div className="space-y-3">
          <h4 className="text-sm font-medium text-gray-400">Recorded Sessions</h4>
          {sessions.map((session, idx) => (
            <div key={idx} className="bg-mixer-fader rounded-lg p-4 flex items-center justify-between">
              <div>
                <div className="font-medium text-white">{session.name}</div>
                <div className="text-sm text-gray-400">
                  {session.data.length} frames • {((session.data.length * 50) / 1000).toFixed(1)}s duration
                </div>
              </div>
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => exportSession(session)}
                  className="bg-blue-500 hover:bg-blue-600 text-white px-3 py-1 rounded text-sm"
                >
                  Export JSON
                </button>
                <button
                  onClick={() => exportCSV(session)}
                  className="bg-green-500 hover:bg-green-600 text-white px-3 py-1 rounded text-sm"
                >
                  Export CSV
                </button>
                <button
                  onClick={() => deleteSession(idx)}
                  className="bg-red-500 hover:bg-red-600 text-white px-3 py-1 rounded text-sm"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center text-gray-500 py-8">
          <div className="text-4xl mb-2">📹</div>
          <div>No sessions recorded yet</div>
          <div className="text-sm">Click "Start Recording" to begin</div>
        </div>
      )}
    </div>
  );
};
