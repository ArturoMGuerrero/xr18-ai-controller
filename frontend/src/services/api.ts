import { ConnectionConfig, MixerInfo, ChannelConfig } from '../types';

const API_BASE_URL = 'http://localhost:8000';

export class APIService {
  private baseUrl: string;

  constructor(baseUrl: string = API_BASE_URL) {
    this.baseUrl = baseUrl;
  }

  async connectMixer(config: ConnectionConfig): Promise<{ status: string; mixer_info: MixerInfo }> {
    const response = await fetch(`${this.baseUrl}/api/mixer/connect`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config),
    });

    if (!response.ok) {
      throw new Error(`Connection failed: ${response.statusText}`);
    }

    return response.json();
  }

  async disconnectMixer(): Promise<{ status: string }> {
    const response = await fetch(`${this.baseUrl}/api/mixer/disconnect`, {
      method: 'POST',
    });

    if (!response.ok) {
      throw new Error(`Disconnect failed: ${response.statusText}`);
    }

    return response.json();
  }

  async getMixerInfo(): Promise<MixerInfo> {
    const response = await fetch(`${this.baseUrl}/api/mixer/info`);

    if (!response.ok) {
      throw new Error(`Failed to get mixer info: ${response.statusText}`);
    }

    return response.json();
  }

  async setAIMode(enabled: boolean): Promise<{ ai_enabled: boolean; message: string }> {
    const response = await fetch(`${this.baseUrl}/api/mode/set`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ai_enabled: enabled }),
    });

    if (!response.ok) {
      throw new Error(`Failed to set AI mode: ${response.statusText}`);
    }

    return response.json();
  }

  async getModeStatus(): Promise<{ ai_enabled: boolean; connected: boolean }> {
    const response = await fetch(`${this.baseUrl}/api/mode/status`);

    if (!response.ok) {
      throw new Error(`Failed to get mode status: ${response.statusText}`);
    }

    return response.json();
  }

  async configureChannel(config: ChannelConfig): Promise<{ status: string; channel: number }> {
    const response = await fetch(`${this.baseUrl}/api/channel/config`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config),
    });

    if (!response.ok) {
      throw new Error(`Failed to configure channel: ${response.statusText}`);
    }

    return response.json();
  }

  async setFader(channel: number, value: number): Promise<{ status: string }> {
    const response = await fetch(`${this.baseUrl}/api/channel/fader`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ channel, value }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || 'Failed to set fader');
    }

    return response.json();
  }

  async setMute(channel: number, mute: boolean): Promise<{ status: string }> {
    const response = await fetch(`${this.baseUrl}/api/channel/mute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ channel, mute }),
    });

    if (!response.ok) {
      throw new Error(`Failed to mute channel: ${response.statusText}`);
    }

    return response.json();
  }

  createWebSocket(): WebSocket {
    return new WebSocket(`ws://localhost:8000/ws/meters`);
  }
}

export const apiService = new APIService();
