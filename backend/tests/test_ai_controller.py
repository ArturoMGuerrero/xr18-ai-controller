"""Tests for AI Controller"""

import pytest
from app.ai_controller import AIAudioController, ChannelConfig


def test_ai_controller_initialization():
    """Test AI controller can be initialized"""
    controller = AIAudioController(history_window=100)
    assert controller.history_window == 100
    assert len(controller.channels_config) == 0


def test_channel_configuration():
    """Test channel can be configured"""
    controller = AIAudioController()

    config = ChannelConfig(
        channel=1,
        max_threshold_db=-6.0,
        target_level_db=-12.0,
        auto_adjust_enabled=True
    )

    controller.configure_channel(config)

    assert 1 in controller.channels_config
    assert controller.channels_config[1].max_threshold_db == -6.0


def test_level_analysis_insufficient_data():
    """Test analysis returns maintain when insufficient data"""
    controller = AIAudioController()

    config = ChannelConfig(channel=1)
    controller.configure_channel(config)

    decision = controller.analyze_level(1, -15.0)

    assert decision.action == 'maintain'
    assert decision.confidence == 0.0


def test_level_analysis_reduce_on_high_peak():
    """Test AI reduces level when peak is too high"""
    controller = AIAudioController()

    config = ChannelConfig(
        channel=1,
        max_threshold_db=-6.0,
        target_level_db=-12.0
    )
    controller.configure_channel(config)

    # Feed enough samples
    for _ in range(20):
        controller.analyze_level(1, -15.0)

    # Feed high level
    decision = controller.analyze_level(1, -4.0)

    assert decision.action == 'reduce'
    assert decision.suggested_fader is not None
    assert decision.suggested_fader < 0.75


def test_level_analysis_critical_clipping():
    """Test AI responds with critical urgency near clipping"""
    controller = AIAudioController()

    config = ChannelConfig(channel=1)
    controller.configure_channel(config)

    # Feed enough samples
    for _ in range(20):
        controller.analyze_level(1, -15.0)

    # Feed level approaching clipping
    decision = controller.analyze_level(1, -2.0)

    assert decision.action == 'reduce'
    assert decision.urgency == 'critical'


def test_channel_stats():
    """Test channel statistics calculation"""
    controller = AIAudioController()

    config = ChannelConfig(channel=1)
    controller.configure_channel(config)

    # Feed samples
    levels = [-20.0, -18.0, -15.0, -22.0, -19.0]
    for level in levels:
        controller.analyze_level(1, level)

    stats = controller.get_channel_stats(1)

    assert stats['samples'] == 5
    assert stats['avg_db'] is not None
    assert stats['max_db'] == -15.0
    assert stats['min_db'] == -22.0


def test_reset_channel():
    """Test channel history can be reset"""
    controller = AIAudioController()

    config = ChannelConfig(channel=1)
    controller.configure_channel(config)

    # Feed samples
    for _ in range(10):
        controller.analyze_level(1, -15.0)

    stats_before = controller.get_channel_stats(1)
    assert stats_before['samples'] == 10

    # Reset
    controller.reset_channel(1)

    stats_after = controller.get_channel_stats(1)
    assert stats_after['samples'] == 0


if __name__ == '__main__':
    pytest.main([__file__, '-v'])
