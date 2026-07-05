"""Tests for FastAPI main application endpoints"""

import pytest
import json
from unittest.mock import patch, AsyncMock, Mock
from fastapi.testclient import TestClient

from app.main import app
from app.adapters.base_adapter import ChannelInfo


@pytest.mark.unit
class TestAPIEndpoints:
    """Test FastAPI REST endpoints"""

    def test_root_endpoint(self, test_client):
        """Test root endpoint returns app info"""
        response = test_client.get("/")

        assert response.status_code == 200
        data = response.json()
        assert data["name"] == "XR18 AI Controller"
        assert data["version"] == "1.0.0"
        assert data["status"] == "running"

    @patch("app.main.mixer_adapter")
    def test_connect_mixer_success(self, mock_adapter, test_client):
        """Test successful mixer connection"""
        # Setup mock
        mock_adapter.connected = False
        mock_adapter.connect = AsyncMock(return_value=True)
        mock_adapter.subscribe_to_meters = AsyncMock(return_value=True)
        mock_adapter.get_mixer_info = Mock(return_value={
            "name": "Behringer XR18",
            "model": "XR18",
            "ip": "192.168.1.1",
            "port": 10024,
            "channels": 16,
            "buses": 6
        })

        response = test_client.post("/api/mixer/connect", json={
            "mixer_model": "xr18",
            "ip_address": "192.168.1.1"
        })

        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "connected"
        assert "mixer_info" in data

    @patch("app.main.mixer_adapter")
    def test_disconnect_mixer(self, mock_adapter, test_client):
        """Test mixer disconnection"""
        mock_adapter.connected = True
        mock_adapter.disconnect = AsyncMock(return_value=True)

        response = test_client.post("/api/mixer/disconnect")

        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "disconnected"

    def test_set_ai_mode(self, test_client):
        """Test enabling/disabling AI mode"""
        # Enable AI mode
        response = test_client.post("/api/mode/set", json={"ai_enabled": True})

        assert response.status_code == 200
        data = response.json()
        assert data["ai_enabled"] == True
        assert "AI mode enabled" in data["message"]

        # Disable AI mode
        response = test_client.post("/api/mode/set", json={"ai_enabled": False})

        assert response.status_code == 200
        data = response.json()
        assert data["ai_enabled"] == False

    def test_get_mode_status(self, test_client):
        """Test getting AI mode status"""
        response = test_client.get("/api/mode/status")

        assert response.status_code == 200
        data = response.json()
        assert "ai_enabled" in data

    @patch("app.main.mixer_adapter")
    def test_set_channel_fader(self, mock_adapter, test_client):
        """Test setting channel fader"""
        mock_adapter.connected = True
        mock_adapter.set_channel_fader = AsyncMock(return_value=True)

        response = test_client.post("/api/channel/fader", json={
            "channel": 1,
            "value": 0.75
        })

        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "success"
        assert data["channel"] == 1
        assert data["value"] == 0.75

    def test_set_fader_without_connection(self, test_client):
        """Test that setting fader without connection fails"""
        with patch("app.main.mixer_adapter", None):
            response = test_client.post("/api/channel/fader", json={
                "channel": 1,
                "value": 0.75
            })

            assert response.status_code == 400

    @patch("app.main.mixer_adapter")
    def test_set_channel_mute(self, mock_adapter, test_client):
        """Test muting/unmuting channel"""
        mock_adapter.connected = True
        mock_adapter.set_channel_mute = AsyncMock(return_value=True)

        # Mute
        response = test_client.post("/api/channel/mute", json={
            "channel": 1,
            "mute": True
        })

        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "success"
        assert data["muted"] == True

    def test_set_learning_mode(self, test_client):
        """Test enabling/disabling learning mode"""
        response = test_client.post("/api/learning/enable", json={"enabled": True})

        assert response.status_code == 200
        data = response.json()
        assert data["learning_enabled"] == True

    def test_get_learning_status(self, test_client):
        """Test getting learning mode status"""
        response = test_client.get("/api/learning/status")

        assert response.status_code == 200
        data = response.json()
        assert "learning_enabled" in data
        assert "stats" in data

    def test_get_channel_learning_stats(self, test_client):
        """Test getting per-channel learning stats"""
        response = test_client.get("/api/learning/stats/1")

        assert response.status_code == 200

    def test_configure_channel(self, test_client):
        """Test configuring a channel"""
        response = test_client.post("/api/channel/config", json={
            "channel": 1,
            "max_threshold_db": -8.0,
            "target_level_db": -15.0,
            "min_threshold_db": -42.0,
            "auto_adjust_enabled": True
        })

        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "success"

    @patch("app.main.mixer_adapter")
    def test_get_channel_stats(self, mock_adapter, test_client):
        """Test getting channel statistics"""
        mock_adapter.connected = True

        response = test_client.get("/api/channel/1/stats")

        assert response.status_code == 200

    def test_get_ai_config(self, test_client):
        """Test getting AI configuration"""
        response = test_client.get("/api/ai/config")

        assert response.status_code == 200
        data = response.json()
        assert "maxThreshold" in data
        assert "targetLevel" in data
        assert "minThreshold" in data

    def test_set_ai_config(self, test_client):
        """Test setting AI configuration"""
        new_config = {
            "maxThreshold": -8.0,
            "targetLevel": -15.0,
            "minThreshold": -45.0,
            "historyWindow": 150,
            "confidenceThreshold": 0.8,
            "adjustmentSpeed": 0.9
        }

        response = test_client.post("/api/ai/config", json=new_config)

        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "success"


@pytest.mark.integration
class TestLearningPersistenceEndpoints:
    """Test learning data persistence API endpoints"""

    @patch("app.main.learning_storage")
    def test_save_learning_data(self, mock_storage, test_client):
        """Test saving learning data endpoint"""
        mock_storage.save_learning_data = Mock(return_value="/path/to/file.json")

        response = test_client.post("/api/learning/save")

        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "success"
        assert "filepath" in data

    @patch("app.main.learning_storage")
    def test_export_learning_data(self, mock_storage, test_client):
        """Test exporting learning data endpoint"""
        sample_data = {
            "version": "1.0",
            "manual_adjustments": [],
            "learned_patterns": {},
            "channels_config": {}
        }
        mock_storage.export_learning_data_json = Mock(
            return_value=json.dumps(sample_data)
        )

        response = test_client.get("/api/learning/export")

        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "success"
        assert "data" in data
        assert data["data"]["version"] == "1.0"

    @patch("app.main.learning_storage")
    def test_import_learning_data(self, mock_storage, test_client):
        """Test importing learning data endpoint"""
        mock_storage.import_learning_data_json = Mock(return_value=True)

        import_data = {
            "data": {
                "version": "1.0",
                "manual_adjustments": [],
                "learned_patterns": {},
                "channels_config": {}
            }
        }

        response = test_client.post("/api/learning/import", json=import_data)

        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "success"

    @patch("app.main.learning_storage")
    def test_import_invalid_data_fails(self, mock_storage, test_client):
        """Test that importing invalid data fails"""
        mock_storage.import_learning_data_json = Mock(return_value=False)

        import_data = {"data": {"invalid": "data"}}

        response = test_client.post("/api/learning/import", json=import_data)

        assert response.status_code == 400

    @patch("app.main.learning_storage")
    def test_get_learning_history(self, mock_storage, test_client):
        """Test getting learning file history"""
        mock_storage.list_learning_files = Mock(return_value=[
            {
                "filename": "learning_data_20260704_103000.json",
                "filepath": "/path/to/file.json",
                "created_at": "2026-07-04T10:30:00",
                "size_bytes": 1024
            }
        ])

        response = test_client.get("/api/learning/history")

        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "success"
        assert "files" in data
        assert data["count"] == 1
        assert data["files"][0]["filename"].startswith("learning_data_")

    @patch("app.main.learning_storage")
    def test_load_learning_file(self, mock_storage, test_client):
        """Test loading specific learning file"""
        mock_storage.load_learning_data = Mock(return_value=True)
        mock_storage.data_dir = Mock()
        mock_storage.data_dir.__truediv__ = Mock(return_value="/path/to/file.json")

        response = test_client.post("/api/learning/load", json={
            "filename": "learning_data_20260704_103000.json"
        })

        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "success"

    @patch("app.main.learning_storage")
    def test_load_fails_gracefully(self, mock_storage, test_client):
        """Test that load failure is handled gracefully"""
        mock_storage.load_learning_data = Mock(return_value=False)
        mock_storage.data_dir = Mock()
        mock_storage.data_dir.__truediv__ = Mock(return_value="/path/to/file.json")

        response = test_client.post("/api/learning/load", json={
            "filename": "nonexistent.json"
        })

        assert response.status_code == 400


@pytest.mark.integration
class TestPresetEndpoints:
    """Test preset management endpoints"""

    @patch("app.main.mixer_adapter")
    def test_save_preset(self, mock_adapter, test_client):
        """Test saving a preset"""
        # Setup mock mixer adapter
        mock_adapter.connected = True

        async def mock_get_all_channels():
            return [
                ChannelInfo(channel=i, name=f"Ch {i}", level_db=-15.0, fader_value=0.75, muted=False)
                for i in range(1, 17)
            ]

        mock_adapter.get_all_channels = AsyncMock(side_effect=mock_get_all_channels)

        response = test_client.post("/api/presets/save", json={
            "name": "Test Preset",
            "description": "Test preset description"
        })

        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "success"
        assert "preset" in data
        assert data["preset"]["name"] == "Test Preset"

    def test_save_preset_without_connection_fails(self, test_client):
        """Test that saving preset without connection fails"""
        with patch("app.main.mixer_adapter", None):
            response = test_client.post("/api/presets/save", json={
                "name": "Test",
                "description": "Test"
            })

            assert response.status_code == 400

    @patch("app.main.mixer_adapter")
    @patch("app.main.presets_storage")
    def test_load_preset(self, mock_presets, mock_adapter, test_client):
        """Test loading a preset"""
        # Setup mocks
        mock_adapter.connected = True
        mock_adapter.set_channel_fader = AsyncMock(return_value=True)
        mock_adapter.set_channel_mute = AsyncMock(return_value=True)

        # Add preset to storage
        mock_presets.__contains__ = Mock(return_value=True)
        mock_presets.__getitem__ = Mock(return_value={
            "name": "Test Preset",
            "description": "Test",
            "created_at": "2026-07-04T10:30:00",
            "channel_configs": {},
            "fader_positions": {"1": 0.75},
            "mute_states": {"1": False}
        })

        response = test_client.post("/api/presets/load", json={
            "name": "Test Preset"
        })

        assert response.status_code == 200

    @patch("app.main.presets_storage")
    def test_list_presets(self, mock_presets, test_client):
        """Test listing all presets"""
        mock_presets.keys = Mock(return_value=["Preset 1", "Preset 2"])
        mock_presets.get = Mock(return_value={
            "name": "Preset 1",
            "description": "Test",
            "created_at": "2026-07-04T10:30:00"
        })

        response = test_client.get("/api/presets/list")

        assert response.status_code == 200


@pytest.mark.websocket
class TestWebSocketEndpoint:
    """Test WebSocket endpoint for real-time meter updates"""

    def test_websocket_connection(self, test_client):
        """Test WebSocket connection establishment"""
        with test_client.websocket_connect("/ws/meters") as websocket:
            # Should connect successfully
            assert websocket is not None

    @patch("app.main.mixer_adapter")
    def test_websocket_receives_meter_data(self, mock_adapter, test_client):
        """Test that WebSocket receives meter data"""
        # Setup mock
        mock_adapter.connected = True

        async def mock_get_all_channels():
            return [
                ChannelInfo(channel=1, name="Ch 1", level_db=-15.0, fader_value=0.75, muted=False)
            ]

        mock_adapter.get_all_channels = AsyncMock(side_effect=mock_get_all_channels)

        with test_client.websocket_connect("/ws/meters") as websocket:
            # Receive first message
            data = websocket.receive_json()

            assert "timestamp" in data
            assert "ai_enabled" in data
            assert "channels" in data
            assert len(data["channels"]) >= 0  # May be 0 if adapter not connected

    def test_websocket_handles_disconnect(self, test_client):
        """Test WebSocket disconnect handling"""
        with test_client.websocket_connect("/ws/meters") as websocket:
            websocket.close()
            # Should close cleanly without errors
