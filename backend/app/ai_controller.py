"""AI-powered audio level controller"""

import numpy as np
from typing import Dict, List, Optional
from dataclasses import dataclass
from collections import deque
import asyncio


@dataclass
class ChannelConfig:
    """Configuration for a channel"""
    channel: int
    max_threshold_db: float = -6.0
    target_level_db: float = -12.0
    min_threshold_db: float = -40.0
    auto_adjust_enabled: bool = True
    adjustment_speed: float = 0.8  # 0.0 (slow) to 1.0 (fast)


@dataclass
class AIDecision:
    """AI decision for channel adjustment"""
    channel: int
    action: str  # 'reduce', 'increase', 'maintain'
    current_level_db: float
    suggested_fader: Optional[float]
    confidence: float
    reason: str
    urgency: str  # 'low', 'medium', 'high', 'critical'


class AIAudioController:
    """
    Intelligent audio level controller using statistical analysis
    and pattern recognition to automatically adjust mixer levels
    """

    def __init__(self, history_window: int = 100):
        self.history_window = history_window
        self.level_history: Dict[int, deque] = {}
        self.adjustment_history: Dict[int, deque] = {}
        self.peak_history: Dict[int, deque] = {}

        self.channels_config: Dict[int, ChannelConfig] = {}

    def configure_channel(self, config: ChannelConfig):
        """Configure a channel for AI control"""
        self.channels_config[config.channel] = config

        if config.channel not in self.level_history:
            self.level_history[config.channel] = deque(maxlen=self.history_window)
            self.adjustment_history[config.channel] = deque(maxlen=50)
            self.peak_history[config.channel] = deque(maxlen=20)

    def analyze_level(self, channel: int, current_db: float) -> AIDecision:
        """
        Analyze current level and determine if adjustment is needed

        Args:
            channel: Channel number
            current_db: Current level in dB

        Returns:
            AIDecision with recommended action
        """
        if channel not in self.channels_config:
            config = ChannelConfig(channel=channel)
            self.configure_channel(config)
        else:
            config = self.channels_config[channel]

        if not config.auto_adjust_enabled:
            return AIDecision(
                channel=channel,
                action='maintain',
                current_level_db=current_db,
                suggested_fader=None,
                confidence=1.0,
                reason='Auto-adjust disabled for this channel',
                urgency='low'
            )

        # Add to history
        self.level_history[channel].append(current_db)

        if len(self.level_history[channel]) < 10:
            return AIDecision(
                channel=channel,
                action='maintain',
                current_level_db=current_db,
                suggested_fader=None,
                confidence=0.0,
                reason='Insufficient data for analysis',
                urgency='low'
            )

        # Analyze signal
        history = np.array(list(self.level_history[channel]))
        valid_samples = history[history > -60]

        if len(valid_samples) < 5:
            return AIDecision(
                channel=channel,
                action='maintain',
                current_level_db=current_db,
                suggested_fader=None,
                confidence=0.5,
                reason='Signal too low or silent',
                urgency='low'
            )

        # Calculate statistics
        avg_level = np.mean(valid_samples)
        max_level = np.max(valid_samples)
        std_dev = np.std(valid_samples)
        recent_peak = np.max(history[-10:])

        # Store peak
        self.peak_history[channel].append(max_level)

        # Check for dangerous peaks (>-3dB = risk of clipping)
        if recent_peak > -3.0:
            reduction_db = recent_peak + 6.0
            new_fader = self._calculate_fader_reduction(reduction_db)

            return AIDecision(
                channel=channel,
                action='reduce',
                current_level_db=current_db,
                suggested_fader=new_fader,
                confidence=1.0,
                reason=f'CRITICAL: Peak {recent_peak:.1f}dB approaching clipping',
                urgency='critical'
            )

        # Check if exceeding max threshold
        if max_level > config.max_threshold_db:
            # Calculate required reduction
            reduction_db = max_level - config.target_level_db

            # Consider variability (high std_dev = dynamic signal)
            if std_dev > 6.0:
                reduction_db *= 1.2

            new_fader = self._calculate_fader_reduction(reduction_db)
            confidence = min(1.0, std_dev / 12.0)

            return AIDecision(
                channel=channel,
                action='reduce',
                current_level_db=current_db,
                suggested_fader=new_fader,
                confidence=confidence,
                reason=f'Peak {max_level:.1f}dB exceeds threshold {config.max_threshold_db:.1f}dB',
                urgency='high' if max_level > -3.0 else 'medium'
            )

        # Check if consistently too low
        if avg_level < config.min_threshold_db and avg_level > -60:
            increase_db = config.target_level_db - avg_level

            if increase_db > 12.0:
                increase_db = 12.0

            new_fader = self._calculate_fader_increase(increase_db)
            confidence = 0.6

            return AIDecision(
                channel=channel,
                action='increase',
                current_level_db=current_db,
                suggested_fader=new_fader,
                confidence=confidence,
                reason=f'Avg {avg_level:.1f}dB below minimum {config.min_threshold_db:.1f}dB',
                urgency='low'
            )

        # Check if hovering near threshold (proactive adjustment)
        if config.target_level_db < avg_level < config.max_threshold_db:
            headroom = config.max_threshold_db - avg_level

            if headroom < 3.0 and std_dev > 4.0:
                reduction_db = 3.0
                new_fader = self._calculate_fader_reduction(reduction_db)

                return AIDecision(
                    channel=channel,
                    action='reduce',
                    current_level_db=current_db,
                    suggested_fader=new_fader,
                    confidence=0.7,
                    reason=f'Low headroom ({headroom:.1f}dB) with dynamic signal',
                    urgency='medium'
                )

        # All good
        return AIDecision(
            channel=channel,
            action='maintain',
            current_level_db=current_db,
            suggested_fader=None,
            confidence=1.0,
            reason=f'Levels optimal (avg: {avg_level:.1f}dB, peak: {max_level:.1f}dB)',
            urgency='low'
        )

    def _calculate_fader_reduction(self, reduction_db: float) -> float:
        """
        Calculate new fader position for dB reduction

        Args:
            reduction_db: Amount to reduce in dB (positive value)

        Returns:
            New fader value (0.0 - 1.0)
        """
        if reduction_db <= 0:
            return 0.75

        factor = 10 ** (-reduction_db / 20)
        new_fader = 0.75 * factor

        return max(0.0, min(1.0, new_fader))

    def _calculate_fader_increase(self, increase_db: float) -> float:
        """
        Calculate new fader position for dB increase

        Args:
            increase_db: Amount to increase in dB (positive value)

        Returns:
            New fader value (0.0 - 1.0)
        """
        if increase_db <= 0:
            return 0.75

        factor = 10 ** (increase_db / 20)
        new_fader = 0.75 * factor

        return max(0.0, min(1.0, new_fader))

    def get_channel_stats(self, channel: int) -> Dict:
        """Get statistical analysis of channel"""
        if channel not in self.level_history or len(self.level_history[channel]) < 5:
            return {
                'samples': 0,
                'avg_db': None,
                'max_db': None,
                'min_db': None,
                'std_dev': None
            }

        history = np.array(list(self.level_history[channel]))
        valid_samples = history[history > -60]

        if len(valid_samples) == 0:
            return {
                'samples': len(history),
                'avg_db': None,
                'max_db': None,
                'min_db': None,
                'std_dev': None
            }

        return {
            'samples': len(history),
            'avg_db': float(np.mean(valid_samples)),
            'max_db': float(np.max(valid_samples)),
            'min_db': float(np.min(valid_samples)),
            'std_dev': float(np.std(valid_samples)),
            'recent_peak': float(np.max(history[-10:])) if len(history) >= 10 else None
        }

    def reset_channel(self, channel: int):
        """Reset history for a channel"""
        if channel in self.level_history:
            self.level_history[channel].clear()
            self.adjustment_history[channel].clear()
            self.peak_history[channel].clear()

    def reset_all(self):
        """Reset all channels"""
        self.level_history.clear()
        self.adjustment_history.clear()
        self.peak_history.clear()
