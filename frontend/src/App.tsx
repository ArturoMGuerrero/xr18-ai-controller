import React, { useState, useCallback } from 'react';
import { ConnectionPanel } from './components/ConnectionPanel';
import { ModeControl } from './components/ModeControl';
import { ChannelStrip } from './components/ChannelStrip';
import { Dashboard } from './components/Dashboard';
import { AISettings } from './components/AISettings';
import { ThemeSelector } from './components/ThemeSelector';
import { HelpModal } from './components/HelpModal';
import { useWebSocket } from './hooks/useWebSocket';
import { useTheme } from './hooks/useTheme';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { apiService } from './services/api';
import { ConnectionConfig, MixerInfo } from './types';

type Tab = 'mixer' | 'dashboard' | 'ai-settings' | 'themes';

function App() {
  const [mixerInfo, setMixerInfo] = useState<MixerInfo | null>(null);
  const [mixerConnected, setMixerConnected] = useState(false);
  const [aiEnabled, setAiEnabled] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>('mixer');
  const [showHelp, setShowHelp] = useState(false);

  const { meterData, connected: wsConnected } = useWebSocket();
  const { currentTheme } = useTheme();

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

  const handleMuteAll = useCallback(async () => {
    const channels = meterData?.channels || [];
    for (const channel of channels) {
      await apiService.setMute(channel.channel, true);
    }
  }, [meterData]);

  const handleUnmuteAll = useCallback(async () => {
    const channels = meterData?.channels || [];
    for (const channel of channels) {
      await apiService.setMute(channel.channel, false);
    }
  }, [meterData]);

  const handleIncreaseChannel = useCallback(async (channelNum: number) => {
    const channel = meterData?.channels?.find((ch) => ch.channel === channelNum);
    if (channel) {
      const newValue = Math.min(channel.fader_value + 0.05, 1.0);
      await handleFaderChange(channelNum, newValue);
    }
  }, [meterData, handleFaderChange]);

  const handleDecreaseChannel = useCallback(async (channelNum: number) => {
    const channel = meterData?.channels?.find((ch) => ch.channel === channelNum);
    if (channel) {
      const newValue = Math.max(channel.fader_value - 0.05, 0.0);
      await handleFaderChange(channelNum, newValue);
    }
  }, [meterData, handleFaderChange]);

  const handleMuteChannel = useCallback(async (channelNum: number) => {
    const channel = meterData?.channels?.find((ch) => ch.channel === channelNum);
    if (channel) {
      await handleMuteToggle(channelNum, !channel.muted);
    }
  }, [meterData, handleMuteToggle]);

  // Keyboard shortcuts
  useKeyboardShortcuts({
    onToggleAI: () => mixerConnected && handleModeToggle(!aiEnabled),
    onConnect: () => !mixerConnected && setActiveTab('mixer'),
    onDisconnect: handleDisconnect,
    onMuteAll: handleMuteAll,
    onUnmuteAll: handleUnmuteAll,
    onToggleSettings: () => setActiveTab('ai-settings'),
    onToggleHelp: () => setShowHelp(!showHelp),
    onIncreaseChannel: handleIncreaseChannel,
    onDecreaseChannel: handleDecreaseChannel,
    onMuteChannel: handleMuteChannel,
  });

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
            <button
              onClick={() => setShowHelp(true)}
              className="text-gray-400 hover:text-white text-sm flex items-center space-x-1"
            >
              <span>❓</span>
              <span>Help</span>
            </button>
          </div>
        </div>
      </header>

      {/* Navigation Tabs */}
      <nav className="bg-mixer-panel border-b border-gray-700">
        <div className="container mx-auto px-6">
          <div className="flex space-x-1">
            {[
              { id: 'mixer' as Tab, label: 'Mixer Control', icon: '🎚️' },
              { id: 'dashboard' as Tab, label: 'Dashboard', icon: '📊' },
              { id: 'ai-settings' as Tab, label: 'AI Settings', icon: '⚙️' },
              { id: 'themes' as Tab, label: 'Themes', icon: '🎨' },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`
                  px-4 py-3 border-b-2 transition-colors flex items-center space-x-2
                  ${
                    activeTab === tab.id
                      ? 'border-mixer-accent text-white'
                      : 'border-transparent text-gray-400 hover:text-gray-300'
                  }
                `}
              >
                <span>{tab.icon}</span>
                <span className="font-medium">{tab.label}</span>
              </button>
            ))}
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <div className="container mx-auto px-6 py-8">
        {/* Mixer Control Tab */}
        {activeTab === 'mixer' && (
          <>
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
          </>
        )}

        {/* Dashboard Tab */}
        {activeTab === 'dashboard' && (
          <Dashboard channels={channels} aiDecisions={aiDecisions} aiEnabled={aiEnabled} />
        )}

        {/* AI Settings Tab */}
        {activeTab === 'ai-settings' && <AISettings />}

        {/* Themes Tab */}
        {activeTab === 'themes' && <ThemeSelector />}
      </div>

      {/* Help Modal */}
      <HelpModal isOpen={showHelp} onClose={() => setShowHelp(false)} />

      {/* Footer */}
      <footer className="bg-mixer-panel border-t border-gray-700 px-6 py-4 mt-8">
        <div className="flex items-center justify-between text-sm text-gray-500">
          <div>XR18 AI Controller v1.1.0 | Built with React + FastAPI + OSC</div>
          <div className="flex items-center space-x-4">
            <span>Theme: {currentTheme}</span>
            <span>Press F1 for keyboard shortcuts</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default App;
