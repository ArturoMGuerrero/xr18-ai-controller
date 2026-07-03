import React, { useState, useCallback } from 'react';
import { ConnectionPanel } from './components/ConnectionPanel';
import { ModeControl } from './components/ModeControl';
import { ChannelStrip } from './components/ChannelStrip';
import { useWebSocket } from './hooks/useWebSocket';
import { apiService } from './services/api';
import { ConnectionConfig, MixerInfo } from './types';

function App() {
  const [mixerInfo, setMixerInfo] = useState<MixerInfo | null>(null);
  const [mixerConnected, setMixerConnected] = useState(false);
  const [aiEnabled, setAiEnabled] = useState(false);

  const { meterData, connected: wsConnected } = useWebSocket();

  const handleConnect = useCallback(async (config: ConnectionConfig) => {
    const result = await apiService.connectMixer(config);
    setMixerInfo(result.mixer_info);
    setMixerConnected(true);
  }, []);

  const handleDisconnect = useCallback(async () => {
    await apiService.disconnectMixer();
    setMixerInfo(null);
    setMixerConnected(false);
    setAiEnabled(false);
  }, []);

  const handleModeToggle = useCallback(async (enabled: boolean) => {
    await apiService.setAIMode(enabled);
    setAiEnabled(enabled);
  }, []);

  const handleFaderChange = useCallback(async (channel: number, value: number) => {
    try {
      await apiService.setFader(channel, value);
    } catch (error) {
      console.error('Failed to set fader:', error);
    }
  }, []);

  const handleMuteToggle = useCallback(async (channel: number, mute: boolean) => {
    try {
      await apiService.setMute(channel, mute);
    } catch (error) {
      console.error('Failed to toggle mute:', error);
    }
  }, []);

  const channels = meterData?.channels || [];
  const aiDecisions = meterData?.ai_decisions || [];

  return (
    <div className="min-h-screen bg-mixer-bg text-white">
      {/* Header */}
      <header className="bg-mixer-panel border-b border-gray-700 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="text-3xl">🎚️</div>
            <div>
              <h1 className="text-2xl font-bold">XR18 AI Controller</h1>
              <p className="text-sm text-gray-400">
                Intelligent mixer control for Behringer XR18/X32/M32
              </p>
            </div>
          </div>

          {/* Status Indicators */}
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2">
              <div
                className={`w-2 h-2 rounded-full ${
                  wsConnected ? 'bg-green-500 animate-pulse' : 'bg-red-500'
                }`}
              />
              <span className="text-sm text-gray-400">
                WebSocket {wsConnected ? 'Connected' : 'Disconnected'}
              </span>
            </div>
            <div className="flex items-center space-x-2">
              <div
                className={`w-2 h-2 rounded-full ${
                  mixerConnected ? 'bg-green-500 animate-pulse' : 'bg-gray-500'
                }`}
              />
              <span className="text-sm text-gray-400">
                Mixer {mixerConnected ? 'Connected' : 'Disconnected'}
              </span>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="container mx-auto px-6 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 mb-8">
          {/* Connection Panel */}
          <div className="lg:col-span-1">
            <ConnectionPanel
              onConnect={handleConnect}
              onDisconnect={handleDisconnect}
              mixerInfo={mixerInfo}
              connected={mixerConnected}
            />
          </div>

          {/* Mode Control */}
          <div className="lg:col-span-3">
            <ModeControl
              aiEnabled={meterData?.ai_enabled || aiEnabled}
              connected={mixerConnected}
              onModeToggle={handleModeToggle}
              recentDecisions={aiDecisions}
            />
          </div>
        </div>

        {/* Channel Strips */}
        {mixerConnected && channels.length > 0 ? (
          <div className="bg-mixer-panel p-6 rounded-lg">
            <h2 className="text-xl font-bold mb-4">Channels</h2>
            <div className="flex space-x-4 overflow-x-auto pb-4">
              {channels.map((channel) => (
                <ChannelStrip
                  key={channel.channel}
                  channel={channel}
                  disabled={meterData?.ai_enabled || false}
                  onFaderChange={handleFaderChange}
                  onMuteToggle={handleMuteToggle}
                />
              ))}
            </div>
          </div>
        ) : (
          <div className="bg-mixer-panel p-12 rounded-lg text-center">
            <div className="text-6xl mb-4">🎛️</div>
            <h3 className="text-xl font-medium text-gray-400 mb-2">
              No Mixer Connected
            </h3>
            <p className="text-gray-500">
              Connect to your Behringer XR18, X32, or M32 to start controlling levels
            </p>
          </div>
        )}
      </div>

      {/* Footer */}
      <footer className="bg-mixer-panel border-t border-gray-700 px-6 py-4 mt-8">
        <div className="text-center text-sm text-gray-500">
          XR18 AI Controller v1.0.0 | Built with React + FastAPI + OSC
        </div>
      </footer>
    </div>
  );
}

export default App;
