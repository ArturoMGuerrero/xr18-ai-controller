import React, { useState } from 'react';
import { ConnectionConfig, DiscoveredMixer, MixerInfo } from '../types';
import { apiService } from '../services/api';

const modelFromReported = (model: string): 'xr18' | 'x32' | 'm32' =>
  /^M32/i.test(model) ? 'm32' : /^X32/i.test(model) ? 'x32' : 'xr18';

interface ConnectionPanelProps {
  onConnect: (config: ConnectionConfig) => Promise<void>;
  onDisconnect: () => Promise<void>;
  mixerInfo: MixerInfo | null;
  connected: boolean;
}

export const ConnectionPanel: React.FC<ConnectionPanelProps> = ({
  onConnect,
  onDisconnect,
  mixerInfo,
  connected,
}) => {
  const [model, setModel] = useState<'xr18' | 'x32' | 'm32' | 'demo'>('xr18');
  const [ipAddress, setIpAddress] = useState('192.168.1.1');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [found, setFound] = useState<DiscoveredMixer[] | null>(null);

  const handleSearch = async () => {
    setSearching(true);
    setError(null);
    try {
      setFound(await apiService.discoverMixers());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Search failed');
    } finally {
      setSearching(false);
    }
  };

  const handlePick = (mixer: DiscoveredMixer) => {
    setModel(modelFromReported(mixer.model));
    setIpAddress(mixer.ip);
    setFound(null);
  };

  const handleConnect = async () => {
    setLoading(true);
    setError(null);

    try {
      await onConnect({
        mixer_model: model,
        ip_address: model === 'demo' ? 'DEMO' : ipAddress,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Connection failed');
    } finally {
      setLoading(false);
    }
  };

  const handleDemoMode = async () => {
    setModel('demo');
    setIpAddress('DEMO');
    setLoading(true);
    setError(null);

    try {
      await onConnect({
        mixer_model: 'demo',
        ip_address: 'DEMO',
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'DEMO mode failed');
    } finally {
      setLoading(false);
    }
  };

  const handleDisconnect = async () => {
    setLoading(true);
    try {
      await onDisconnect();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Disconnect failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-mixer-panel p-6 rounded-lg space-y-4">
      <h2 className="text-xl font-bold text-white">Mixer Connection</h2>

      {!connected ? (
        <div className="space-y-4">
          {/* Mixer Model Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Mixer Model
            </label>
            <select
              value={model}
              onChange={(e) => setModel(e.target.value as 'xr18' | 'x32' | 'm32' | 'demo')}
              className="w-full bg-mixer-fader border border-gray-600 rounded px-3 py-2 text-white"
            >
              <option value="xr18">Behringer XR18</option>
              <option value="x32">Behringer X32</option>
              <option value="m32">Midas M32</option>
              <option value="demo">🎭 DEMO Mode (Simulated)</option>
            </select>
          </div>

          {/* IP Address (disabled in demo mode) */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              IP Address
            </label>
            <input
              type="text"
              value={model === 'demo' ? 'DEMO' : ipAddress}
              onChange={(e) => setIpAddress(e.target.value)}
              placeholder="192.168.1.1"
              disabled={model === 'demo'}
              className="w-full bg-mixer-fader border border-gray-600 rounded px-3 py-2 text-white disabled:opacity-50 disabled:cursor-not-allowed"
            />
            {model === 'demo' && (
              <p className="text-xs text-yellow-400 mt-1">
                ⚠️ Demo mode generates simulated audio data (no physical mixer required)
              </p>
            )}
            {model !== 'demo' && (
              <button
                onClick={handleSearch}
                disabled={searching || loading}
                className="mt-2 text-sm text-mixer-accent hover:text-blue-400 disabled:text-gray-500"
              >
                {searching ? 'Searching the network…' : '🔍 Find mixers on the network'}
              </button>
            )}
            {found && (
              <div className="mt-2 space-y-1">
                {found.length === 0 ? (
                  <p className="text-xs text-gray-400">
                    No mixers answered. Check that this computer is on the mixer&apos;s network.
                  </p>
                ) : (
                  found.map((mixer) => (
                    <button
                      key={mixer.ip}
                      onClick={() => handlePick(mixer)}
                      className="w-full text-left bg-mixer-fader hover:bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm"
                    >
                      <span className="text-white font-medium">{mixer.name || mixer.model}</span>
                      <span className="text-gray-400"> · {mixer.model} · </span>
                      <span className="text-gray-300 font-mono">{mixer.ip}</span>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>

          {/* Error Message */}
          {error && (
            <div className="bg-mixer-danger/20 border border-mixer-danger rounded px-3 py-2 text-mixer-danger text-sm">
              {error}
            </div>
          )}

          {/* Connect Buttons */}
          <div className="space-y-2">
            <button
              onClick={handleConnect}
              disabled={loading}
              className="w-full bg-mixer-accent hover:bg-blue-600 disabled:bg-gray-600 text-white font-bold py-2 px-4 rounded transition-colors"
            >
              {loading ? 'Connecting...' : model === 'demo' ? '🎭 Start Demo Mode' : 'Connect'}
            </button>

            {model !== 'demo' && (
              <button
                onClick={handleDemoMode}
                disabled={loading}
                className="w-full bg-yellow-600 hover:bg-yellow-700 disabled:bg-gray-600 text-white font-medium py-2 px-4 rounded transition-colors text-sm"
              >
                🎭 Quick Demo (No Mixer Needed)
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Connected Status */}
          <div className="bg-mixer-success/20 border border-mixer-success rounded px-4 py-3">
            <div className="flex items-center space-x-2">
              <div className="w-3 h-3 bg-mixer-success rounded-full animate-pulse" />
              <span className="text-mixer-success font-medium">Connected</span>
            </div>
          </div>

          {/* Mixer Info */}
          {mixerInfo && (
            <div className="bg-mixer-fader rounded px-4 py-3 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-400">Model:</span>
                <span className="text-white font-medium">{mixerInfo.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">IP:</span>
                <span className="text-white font-mono">{mixerInfo.ip}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Port:</span>
                <span className="text-white font-mono">{mixerInfo.port}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Channels:</span>
                <span className="text-white font-medium">{mixerInfo.channels}</span>
              </div>
            </div>
          )}

          {/* Disconnect Button */}
          <button
            onClick={handleDisconnect}
            disabled={loading}
            className="w-full bg-mixer-danger hover:bg-red-600 disabled:bg-gray-600 text-white font-bold py-2 px-4 rounded transition-colors"
          >
            {loading ? 'Disconnecting...' : 'Disconnect'}
          </button>
        </div>
      )}
    </div>
  );
};
