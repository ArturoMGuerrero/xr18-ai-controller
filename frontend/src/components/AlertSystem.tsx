import React, { useState, useEffect, useCallback } from 'react';
import { ChannelInfo } from '../types';

interface BackendAlert {
  alert_id: string;
  type: string;
  severity: string;
  channel: number;
  message: string;
  suggested_action?: string;
}

interface Alert {
  id: string;
  type: 'clipping' | 'low-level' | 'muted' | 'ai-intervention' | 'clipping_risk' | 'low_signal' | 'noise_floor' | 'sudden_drop';
  channel?: number;
  message: string;
  timestamp: number;
  urgency: 'low' | 'medium' | 'high' | 'critical';
  suggestedAction?: string;
}

interface AlertSystemProps {
  channels: ChannelInfo[];
  backendAlerts?: BackendAlert[];  // Alerts from backend via WebSocket
  soundEnabled?: boolean;
  notificationsEnabled?: boolean;
}

export const AlertSystem: React.FC<AlertSystemProps> = ({
  channels,
  backendAlerts = [],
  soundEnabled = true,
  notificationsEnabled = false,
}) => {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [settings, setSettings] = useState({
    soundEnabled,
    notificationsEnabled,
    clippingThreshold: -3,
    lowLevelThreshold: -40,
    muteDuration: 5000, // Show alert if muted for > 5s
  });

  const playAlertSound = useCallback(
    (urgency: Alert['urgency']) => {
      if (!settings.soundEnabled) return;

      const audioContext = new AudioContext();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);

      // Different frequencies for different urgencies
      const frequencies = {
        low: 400,
        medium: 600,
        high: 800,
        critical: 1000,
      };

      oscillator.frequency.value = frequencies[urgency];
      oscillator.type = 'sine';

      gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);

      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + 0.3);
    },
    [settings.soundEnabled]
  );

  const showNotification = useCallback(
    (alert: Alert) => {
      if (!settings.notificationsEnabled) return;
      if ('Notification' in window && Notification.permission === 'granted') {
        new Notification('XR18 AI Controller Alert', {
          body: alert.message,
          icon: '/icon.png',
          tag: alert.id,
        });
      }
    },
    [settings.notificationsEnabled]
  );

  const addAlert = useCallback(
    (alert: Omit<Alert, 'id' | 'timestamp'>) => {
      const newAlert: Alert = {
        ...alert,
        id: `${Date.now()}-${Math.random()}`,
        timestamp: Date.now(),
      };

      setAlerts((prev) => [newAlert, ...prev].slice(0, 50)); // Keep last 50 alerts

      playAlertSound(alert.urgency);
      showNotification(newAlert);

      // Auto-dismiss low urgency alerts
      if (alert.urgency === 'low') {
        setTimeout(() => {
          setAlerts((prev) => prev.filter((a) => a.id !== newAlert.id));
        }, 5000);
      }
    },
    [playAlertSound, showNotification]
  );

  const dismissAlert = useCallback((id: string) => {
    setAlerts((prev) => prev.filter((a) => a.id !== id));
  }, []);

  const clearAll = useCallback(() => {
    setAlerts([]);
  }, []);

  // Process backend alerts
  useEffect(() => {
    backendAlerts.forEach((backendAlert) => {
      // Check if we already have this alert
      const existingAlert = alerts.find((a) => a.id === backendAlert.alert_id);

      if (!existingAlert) {
        // Map backend severity to urgency
        const urgencyMap: Record<string, Alert['urgency']> = {
          'info': 'low',
          'warning': 'medium',
          'critical': 'critical'
        };

        addAlert({
          type: backendAlert.type as Alert['type'],
          channel: backendAlert.channel,
          message: backendAlert.message,
          urgency: urgencyMap[backendAlert.severity] || 'medium',
          suggestedAction: backendAlert.suggested_action
        });
      }
    });
  }, [backendAlerts, alerts, addAlert]);

  const requestNotificationPermission = useCallback(async () => {
    if ('Notification' in window && Notification.permission === 'default') {
      await Notification.requestPermission();
    }
  }, []);

  const getAlertIcon = (type: Alert['type']) => {
    switch (type) {
      case 'clipping':
      case 'clipping_risk':
        return '🔴';
      case 'low-level':
      case 'low_signal':
        return '🔵';
      case 'muted':
        return '🔇';
      case 'ai-intervention':
        return '🤖';
      case 'noise_floor':
        return '📉';
      case 'sudden_drop':
        return '⚡';
      default:
        return '⚠️';
    }
  };

  const getAlertColor = (urgency: Alert['urgency']) => {
    switch (urgency) {
      case 'critical':
        return 'border-red-500 bg-red-900/20';
      case 'high':
        return 'border-orange-500 bg-orange-900/20';
      case 'medium':
        return 'border-yellow-500 bg-yellow-900/20';
      default:
        return 'border-blue-500 bg-blue-900/20';
    }
  };

  return (
    <div className="space-y-4">
      {/* Alert Settings */}
      <div className="bg-mixer-panel p-4 rounded-lg">
        <h4 className="text-sm font-medium text-white mb-3">Alert Settings</h4>
        <div className="grid grid-cols-2 gap-4">
          <label className="flex items-center space-x-2">
            <input
              type="checkbox"
              checked={settings.soundEnabled}
              onChange={(e) => setSettings((prev) => ({ ...prev, soundEnabled: e.target.checked }))}
              className="rounded"
            />
            <span className="text-sm text-gray-300">Sound Alerts</span>
          </label>

          <label className="flex items-center space-x-2">
            <input
              type="checkbox"
              checked={settings.notificationsEnabled}
              onChange={(e) => {
                setSettings((prev) => ({ ...prev, notificationsEnabled: e.target.checked }));
                if (e.target.checked) requestNotificationPermission();
              }}
              className="rounded"
            />
            <span className="text-sm text-gray-300">System Notifications</span>
          </label>
        </div>
      </div>

      {/* Active Alerts */}
      <div className="bg-mixer-panel p-4 rounded-lg space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-medium text-white">
            Active Alerts ({alerts.length})
          </h4>
          {alerts.length > 0 && (
            <button
              onClick={clearAll}
              className="text-xs text-gray-400 hover:text-white"
            >
              Clear All
            </button>
          )}
        </div>

        {alerts.length > 0 ? (
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {alerts.map((alert) => (
              <div
                key={alert.id}
                className={`border-l-4 ${getAlertColor(alert.urgency)} rounded p-3 flex items-start justify-between`}
              >
                <div className="flex items-start space-x-3">
                  <span className="text-xl">{getAlertIcon(alert.type)}</span>
                  <div className="flex-1">
                    <div className="text-sm text-white">{alert.message}</div>
                    {alert.suggestedAction && (
                      <div className="text-xs text-yellow-400 mt-1">
                        💡 {alert.suggestedAction}
                      </div>
                    )}
                    <div className="text-xs text-gray-400 mt-1">
                      {new Date(alert.timestamp).toLocaleTimeString()}
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => dismissAlert(alert.id)}
                  className="text-gray-400 hover:text-white text-lg leading-none"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center text-gray-500 py-6">
            <div className="text-3xl mb-2">✅</div>
            <div className="text-sm">No active alerts</div>
          </div>
        )}
      </div>
    </div>
  );
};
