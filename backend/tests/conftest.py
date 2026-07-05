"""Shared test fixtures for all tests"""

import pytest
import pytest_asyncio
from unittest.mock import Mock, AsyncMock, MagicMock
from fastapi.testclient import TestClient

from app.main import app
from app.ai_controller import AIAudioController, ChannelConfig
from app.adapters.behringer_adapter import BehringerAdapter
from app.storage.learning_storage import LearningStorage


@pytest.fixture
def mock_ai_controller():
    """Fixture providing a fresh AI controller instance"""
    controller = AIAudioController(history_window=100, learning_enabled=True)

    # Pre-configure a few channels for testing
    for channel in [1, 2, 3]:
        config = ChannelConfig(
            channel=channel,
            max_threshold_db=-6.0,
            target_level_db=-12.0,
            min_threshold_db=-40.0,
            auto_adjust_enabled=True
        )
        controller.configure_channel(config)

    return controller


@pytest_asyncio.fixture
async def mock_mixer_adapter():
    """Fixture providing a mocked Behringer adapter"""
    adapter = Mock(spec=BehringerAdapter)
    adapter.connected = False
    adapter.model = "xr18"
    adapter.channels = 16
    adapter.buses = 6

    # Mock async methods
    adapter.connect = AsyncMock(return_value=True)
    adapter.disconnect = AsyncMock(return_value=True)
    adapter.set_channel_fader = AsyncMock(return_value=True)
    adapter.set_channel_mute = AsyncMock(return_value=True)
    adapter.subscribe_to_meters = AsyncMock(return_value=True)

    # Mock sync methods
    adapter.get_mixer_info = Mock(return_value={
        "name": "Behringer XR18",
        "model": "XR18",
        "ip": "192.168.1.1",
        "port": 10024,
        "channels": 16,
        "buses": 6
    })

    adapter.get_channel_meter = Mock(return_value=-15.5)
    adapter.get_channel_fader = Mock(return_value=0.75)
    adapter.get_channel_mute = Mock(return_value=False)
    adapter.get_channel_name = Mock(return_value="Channel 1")

    # Mock get_all_channels to return realistic channel data
    async def mock_get_all_channels():
        from app.adapters.base_adapter import ChannelInfo
        channels = []
        for i in range(1, 17):  # 16 channels
            channels.append(ChannelInfo(
                channel=i,
                name=f"Ch {i}",
                level_db=-15.0 + (i % 5),  # Vary levels
                fader_value=0.75,
                muted=False
            ))
        return channels

    adapter.get_all_channels = AsyncMock(side_effect=mock_get_all_channels)

    return adapter


@pytest.fixture
def test_client():
    """Fixture providing FastAPI test client"""
    client = TestClient(app)
    return client


@pytest.fixture
def learning_storage(tmp_path):
    """Fixture providing LearningStorage with temp directory"""
    storage_dir = tmp_path / "learning"
    storage_dir.mkdir()
    return LearningStorage(data_dir=str(storage_dir))


@pytest.fixture
def sample_learning_data():
    """Fixture providing sample learning data for tests"""
    return {
        "version": "1.0",
        "saved_at": "2026-07-04T10:30:00",
        "learning_enabled": True,
        "history_window": 100,
        "manual_adjustments": [
            {
                "channel": 1,
                "timestamp": 1720084800.0,
                "previous_level_db": -10.5,
                "previous_fader": 0.75,
                "new_fader": 0.65,
                "level_after_db": -13.2
            },
            {
                "channel": 2,
                "timestamp": 1720084820.0,
                "previous_level_db": -8.0,
                "previous_fader": 0.80,
                "new_fader": 0.70,
                "level_after_db": -11.5
            }
        ],
        "learned_patterns": {
            "1": {
                "preferred_level_range": [],
                "typical_adjustments": [
                    {"level_db": -10.5, "fader_change": -0.10, "db_change": -2.0}
                ],
                "response_style": "moderate"
            }
        },
        "channels_config": {
            "1": {
                "channel": 1,
                "max_threshold_db": -6.0,
                "target_level_db": -12.0,
                "min_threshold_db": -40.0,
                "auto_adjust_enabled": True,
                "adjustment_speed": 0.8
            }
        }
    }


@pytest.fixture
def mock_osc_client():
    """Fixture providing mocked OSC client"""
    client = Mock()
    client.send_message = Mock()
    return client


@pytest.fixture
def mock_osc_server():
    """Fixture providing mocked OSC server"""
    server = Mock()
    server.serve_forever = Mock()
    server.shutdown = Mock()
    return server


# Custom pytest markers for test categorization
def pytest_configure(config):
    """Register custom markers"""
    config.addinivalue_line("markers", "unit: Unit tests (fast, isolated)")
    config.addinivalue_line("markers", "integration: Integration tests (slower, with dependencies)")
    config.addinivalue_line("markers", "slow: Slow tests (> 1 second)")
    config.addinivalue_line("markers", "websocket: WebSocket tests")
    config.addinivalue_line("markers", "osc: OSC communication tests")
