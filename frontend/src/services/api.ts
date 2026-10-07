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

  // ==================== AI Configuration ====================

  async getAIConfig(): Promise<any> {
    const response = await fetch(`${this.baseUrl}/api/ai/config`);

    if (!response.ok) {
      throw new Error(`Failed to get AI config: ${response.statusText}`);
    }

    return response.json();
  }

  async updateAIConfig(config: any): Promise<any> {
    const response = await fetch(`${this.baseUrl}/api/ai/config`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config),
    });

    if (!response.ok) {
      throw new Error(`Failed to update AI config: ${response.statusText}`);
    }

    return response.json();
  }

  // ==================== Learning Mode ====================

  async setLearningMode(enabled: boolean): Promise<any> {
    const response = await fetch(`${this.baseUrl}/api/learning/enable`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled }),
    });

    if (!response.ok) {
      throw new Error(`Failed to set learning mode: ${response.statusText}`);
    }

    return response.json();
  }

  async getLearningStatus(): Promise<any> {
    const response = await fetch(`${this.baseUrl}/api/learning/status`);

    if (!response.ok) {
      throw new Error(`Failed to get learning status: ${response.statusText}`);
    }

    return response.json();
  }

  async getChannelLearningStats(channel: number): Promise<any> {
    const response = await fetch(`${this.baseUrl}/api/learning/stats/${channel}`);

    if (!response.ok) {
      throw new Error(`Failed to get channel learning stats: ${response.statusText}`);
    }

    return response.json();
  }

  // ==================== Presets ====================

  async savePreset(name: string, description: string): Promise<any> {
    const response = await fetch(`${this.baseUrl}/api/presets/save`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, description }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || 'Failed to save preset');
    }

    return response.json();
  }

  async loadPreset(name: string): Promise<any> {
    const response = await fetch(`${this.baseUrl}/api/presets/load`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || 'Failed to load preset');
    }

    return response.json();
  }

  async listPresets(): Promise<any> {
    const response = await fetch(`${this.baseUrl}/api/presets/list`);

    if (!response.ok) {
      throw new Error(`Failed to list presets: ${response.statusText}`);
    }

    return response.json();
  }

  async deletePreset(name: string): Promise<any> {
    const response = await fetch(`${this.baseUrl}/api/presets/${encodeURIComponent(name)}`, {
      method: 'DELETE',
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || 'Failed to delete preset');
    }

    return response.json();
  }

  async exportPreset(name: string): Promise<any> {
    const response = await fetch(`${this.baseUrl}/api/presets/export/${encodeURIComponent(name)}`);

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || 'Failed to export preset');
    }

    return response.json();
  }

  async importPreset(data: any): Promise<any> {
    const response = await fetch(`${this.baseUrl}/api/presets/import`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || 'Failed to import preset');
    }

    return response.json();
  }
}

export const apiService = new APIService();
