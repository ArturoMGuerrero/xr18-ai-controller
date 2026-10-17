import React, { useState, useEffect, useCallback } from 'react';
import { MixerPreset } from '../types';
import { apiService } from '../services/api';

export const PresetManager: React.FC = () => {
  const [presets, setPresets] = useState<MixerPreset[]>([]);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [newPresetName, setNewPresetName] = useState('');
  const [newPresetDescription, setNewPresetDescription] = useState('');
  const [importJson, setImportJson] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const loadPresets = useCallback(async () => {
    try {
      const response = await apiService.listPresets();
      setPresets(response.presets);
    } catch (error) {
      console.error('Failed to load presets:', error);
    }
  }, []);

  useEffect(() => {
    loadPresets();
  }, [loadPresets]);

  const handleSavePreset = async () => {
    if (!newPresetName.trim()) {
      showMessage('error', 'Please enter a preset name');
      return;
    }

    setLoading(true);
    try {
      await apiService.savePreset(newPresetName, newPresetDescription);
      showMessage('success', `Preset "${newPresetName}" saved successfully`);
      setNewPresetName('');
      setNewPresetDescription('');
      setShowSaveDialog(false);
      await loadPresets();
    } catch (error) {
      showMessage('error', (error instanceof Error && error.message) || 'Failed to save preset');
    } finally {
      setLoading(false);
    }
  };

  const handleLoadPreset = async (name: string) => {
    setLoading(true);
    try {
      await apiService.loadPreset(name);
      showMessage('success', `Preset "${name}" loaded successfully`);
    } catch (error) {
      showMessage('error', (error instanceof Error && error.message) || 'Failed to load preset');
    } finally {
      setLoading(false);
    }
  };

  const handleDeletePreset = async (name: string) => {
    if (!confirm(`Delete preset "${name}"?`)) return;

    setLoading(true);
    try {
      await apiService.deletePreset(name);
      showMessage('success', `Preset "${name}" deleted`);
      await loadPresets();
    } catch (error) {
      showMessage('error', (error instanceof Error && error.message) || 'Failed to delete preset');
    } finally {
      setLoading(false);
    }
  };

  const handleExportPreset = async (name: string) => {
    try {
      const data = await apiService.exportPreset(name);
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${name.replace(/[^a-z0-9]/gi, '_')}_preset.json`;
      a.click();
      URL.revokeObjectURL(url);
      showMessage('success', `Preset "${name}" exported`);
    } catch (error) {
      showMessage('error', (error instanceof Error && error.message) || 'Failed to export preset');
    }
  };

  const handleImportPreset = async () => {
    if (!importJson.trim()) {
      showMessage('error', 'Please paste JSON data');
      return;
    }

    setLoading(true);
    try {
      const data = JSON.parse(importJson);
      await apiService.importPreset(data);
      showMessage('success', `Preset "${data.name}" imported successfully`);
      setImportJson('');
      setShowImportDialog(false);
      await loadPresets();
    } catch (error) {
      showMessage('error', (error instanceof Error && error.message) || 'Invalid JSON or import failed');
    } finally {
      setLoading(false);
    }
  };

  const showMessage = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 5000);
  };

  return (
    <div className="bg-mixer-panel p-6 rounded-lg space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-bold text-white">Mixer Presets</h3>
          <p className="text-sm text-gray-400">Save and load complete mixer configurations</p>
        </div>
        <div className="flex items-center space-x-3">
          <button
            onClick={() => setShowImportDialog(true)}
            className="bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded font-medium flex items-center space-x-2"
          >
            <span>📥</span>
            <span>Import</span>
          </button>
          <button
            onClick={() => setShowSaveDialog(true)}
            className="bg-mixer-accent hover:bg-purple-600 text-white px-4 py-2 rounded font-medium flex items-center space-x-2"
          >
            <span>💾</span>
            <span>Save Current</span>
          </button>
        </div>
      </div>

      {/* Message Banner */}
      {message && (
        <div
          className={`p-4 rounded-lg ${
            message.type === 'success' ? 'bg-green-900/30 border border-green-500' : 'bg-red-900/30 border border-red-500'
          }`}
        >
          <p className={message.type === 'success' ? 'text-green-400' : 'text-red-400'}>{message.text}</p>
        </div>
      )}

      {/* Presets List */}
      {presets.length > 0 ? (
        <div className="space-y-3">
          {presets.map((preset) => (
            <div key={preset.name} className="bg-mixer-fader rounded-lg p-4 flex items-center justify-between">
              <div className="flex-1">
                <div className="flex items-center space-x-3">
                  <div className="text-2xl">🎛️</div>
                  <div>
                    <div className="font-medium text-white">{preset.name}</div>
                    <div className="text-sm text-gray-400">{preset.description}</div>
                    <div className="text-xs text-gray-500 mt-1">
                      {preset.channels} channels • Created {new Date(preset.created_at).toLocaleDateString()}
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex items-center space-x-2">
                <button
                  onClick={() => handleLoadPreset(preset.name)}
                  disabled={loading}
                  className="bg-green-500 hover:bg-green-600 disabled:bg-gray-600 text-white px-3 py-1 rounded text-sm font-medium"
                >
                  Load
                </button>
                <button
                  onClick={() => handleExportPreset(preset.name)}
                  disabled={loading}
                  className="bg-blue-500 hover:bg-blue-600 disabled:bg-gray-600 text-white px-3 py-1 rounded text-sm"
                >
                  Export
                </button>
                <button
                  onClick={() => handleDeletePreset(preset.name)}
                  disabled={loading}
                  className="bg-red-500 hover:bg-red-600 disabled:bg-gray-600 text-white px-3 py-1 rounded text-sm"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center text-gray-500 py-12">
          <div className="text-5xl mb-3">🎛️</div>
          <div className="text-lg font-medium">No presets saved</div>
          <div className="text-sm">Click &quot;Save Current&quot; to create your first preset</div>
        </div>
      )}

      {/* Save Preset Dialog */}
      {showSaveDialog && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <div className="bg-mixer-panel p-6 rounded-lg w-full max-w-md space-y-4">
            <h4 className="text-lg font-bold text-white">Save Preset</h4>

            <div>
              <label className="block text-sm text-gray-400 mb-2">Preset Name *</label>
              <input
                type="text"
                value={newPresetName}
                onChange={(e) => setNewPresetName(e.target.value)}
                placeholder="e.g., Live Show A, Podcast Setup"
                className="w-full bg-mixer-fader text-white px-3 py-2 rounded border border-gray-600 focus:border-mixer-accent outline-none"
              />
            </div>

            <div>
              <label className="block text-sm text-gray-400 mb-2">Description</label>
              <textarea
                value={newPresetDescription}
                onChange={(e) => setNewPresetDescription(e.target.value)}
                placeholder="Optional description..."
                rows={3}
                className="w-full bg-mixer-fader text-white px-3 py-2 rounded border border-gray-600 focus:border-mixer-accent outline-none resize-none"
              />
            </div>

            <div className="flex items-center space-x-3 pt-2">
              <button
                onClick={handleSavePreset}
                disabled={loading || !newPresetName.trim()}
                className="flex-1 bg-mixer-accent hover:bg-purple-600 disabled:bg-gray-600 text-white px-4 py-2 rounded font-medium"
              >
                {loading ? 'Saving...' : 'Save'}
              </button>
              <button
                onClick={() => {
                  setShowSaveDialog(false);
                  setNewPresetName('');
                  setNewPresetDescription('');
                }}
                disabled={loading}
                className="flex-1 bg-gray-600 hover:bg-gray-700 disabled:bg-gray-700 text-white px-4 py-2 rounded"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Import Preset Dialog */}
      {showImportDialog && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <div className="bg-mixer-panel p-6 rounded-lg w-full max-w-2xl space-y-4">
            <h4 className="text-lg font-bold text-white">Import Preset</h4>

            <div>
              <label className="block text-sm text-gray-400 mb-2">Paste JSON Data</label>
              <textarea
                value={importJson}
                onChange={(e) => setImportJson(e.target.value)}
                placeholder='{"name": "...", "description": "...", ...}'
                rows={10}
                className="w-full bg-mixer-fader text-white px-3 py-2 rounded border border-gray-600 focus:border-mixer-accent outline-none resize-none font-mono text-xs"
              />
            </div>

            <div className="flex items-center space-x-3 pt-2">
              <button
                onClick={handleImportPreset}
                disabled={loading || !importJson.trim()}
                className="flex-1 bg-mixer-accent hover:bg-purple-600 disabled:bg-gray-600 text-white px-4 py-2 rounded font-medium"
              >
                {loading ? 'Importing...' : 'Import'}
              </button>
              <button
                onClick={() => {
                  setShowImportDialog(false);
                  setImportJson('');
                }}
                disabled={loading}
                className="flex-1 bg-gray-600 hover:bg-gray-700 disabled:bg-gray-700 text-white px-4 py-2 rounded"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
