"""AI-powered audio level controller with learning capabilities"""

import numpy as np
from typing import Dict, List, Optional, Tuple
from dataclasses import dataclass, asdict
from collections import deque
import asyncio
import json
from datetime import datetime


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
class ManualAdjustment:
    """Record of manual user adjustment for learning"""
    channel: int
    timestamp: float
    previous_level_db: float
    previous_fader: float
    new_fader: float
    level_after_db: Optional[float] = None


@dataclass
class MixerPreset:
    """Saved mixer configuration preset"""
    name: str
    description: str
    created_at: str
    channel_configs: Dict[int, ChannelConfig]
    fader_positions: Dict[int, float]
    mute_states: Dict[int, bool]


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
    and pattern recognition with learning capabilities
    """

    def __init__(self, history_window: int = 100, learning_enabled: bool = True):
        self.history_window = history_window
        self.learning_enabled = learning_enabled

        self.level_history: Dict[int, deque] = {}
        self.adjustment_history: Dict[int, deque] = {}
        self.peak_history: Dict[int, deque] = {}
        self.manual_adjustments: List[ManualAdjustment] = []

        self.channels_config: Dict[int, ChannelConfig] = {}
        self.learned_patterns: Dict[int, Dict] = {}  # Channel-specific learned behavior

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

    # ==================== Learning Mode ====================

    def record_manual_adjustment(
        self,
        channel: int,
        previous_level_db: float,
        previous_fader: float,
        new_fader: float
    ):
        """
        Record a manual adjustment for learning purposes

        Args:
            channel: Channel number
            previous_level_db: Level before adjustment
            previous_fader: Fader position before adjustment
            new_fader: New fader position after adjustment
        """
        if not self.learning_enabled:
            return

        adjustment = ManualAdjustment(
            channel=channel,
            timestamp=datetime.now().timestamp(),
            previous_level_db=previous_level_db,
            previous_fader=previous_fader,
            new_fader=new_fader
        )

        self.manual_adjustments.append(adjustment)

        # Keep only last 500 adjustments
        if len(self.manual_adjustments) > 500:
            self.manual_adjustments = self.manual_adjustments[-500:]

        # Learn from adjustment
        self._learn_from_adjustment(adjustment)

    def _learn_from_adjustment(self, adjustment: ManualAdjustment):
        """
        Analyze manual adjustment and update learned patterns

        Args:
            adjustment: Manual adjustment record
        """
        channel = adjustment.channel

        if channel not in self.learned_patterns:
            self.learned_patterns[channel] = {
                'preferred_level_range': [],
                'typical_adjustments': [],
                'response_style': 'moderate'  # aggressive, moderate, conservative
            }

        # Calculate adjustment magnitude
        fader_change = adjustment.new_fader - adjustment.previous_fader
        db_equivalent = 20 * np.log10(adjustment.new_fader / max(adjustment.previous_fader, 0.01))

        self.learned_patterns[channel]['typical_adjustments'].append({
            'level_db': adjustment.previous_level_db,
            'fader_change': fader_change,
            'db_change': db_equivalent
        })

        # Keep only last 100 adjustments per channel
        if len(self.learned_patterns[channel]['typical_adjustments']) > 100:
            self.learned_patterns[channel]['typical_adjustments'] = \
                self.learned_patterns[channel]['typical_adjustments'][-100:]

        # Determine user's response style
        if len(self.learned_patterns[channel]['typical_adjustments']) >= 10:
            recent_changes = [
                abs(a['fader_change'])
                for a in self.learned_patterns[channel]['typical_adjustments'][-10:]
            ]
            avg_change = np.mean(recent_changes)

            if avg_change > 0.15:
                self.learned_patterns[channel]['response_style'] = 'aggressive'
            elif avg_change < 0.05:
                self.learned_patterns[channel]['response_style'] = 'conservative'
            else:
                self.learned_patterns[channel]['response_style'] = 'moderate'

    def apply_learned_behavior(self, channel: int, decision: AIDecision) -> AIDecision:
        """
        Modify AI decision based on learned user preferences

        Args:
            channel: Channel number
            decision: Original AI decision

        Returns:
            Modified decision incorporating learned behavior
        """
        if not self.learning_enabled or channel not in self.learned_patterns:
            return decision

        patterns = self.learned_patterns[channel]
        response_style = patterns['response_style']

        # Adjust decision based on learned style
        if decision.suggested_fader is not None:
            if response_style == 'aggressive':
                # User prefers larger adjustments - amplify the change
                if decision.action == 'reduce':
                    decision.suggested_fader *= 0.95  # Reduce more
                elif decision.action == 'increase':
                    decision.suggested_fader *= 1.05  # Increase more

            elif response_style == 'conservative':
                # User prefers smaller adjustments - dampen the change
                if decision.action == 'reduce':
                    decision.suggested_fader = (decision.suggested_fader + 1.0) / 2  # Less reduction
                elif decision.action == 'increase':
                    decision.suggested_fader = (decision.suggested_fader + 0.75) / 2  # Less increase

        # Adjust urgency based on user behavior
        if response_style == 'conservative' and decision.urgency == 'high':
            decision.urgency = 'medium'
        elif response_style == 'aggressive' and decision.urgency == 'medium':
            decision.urgency = 'high'

        return decision

    def get_learning_stats(self, channel: Optional[int] = None) -> Dict:
        """
        Get learning statistics

        Args:
            channel: Specific channel or None for all channels

        Returns:
            Dictionary with learning statistics
        """
        if channel is not None:
            if channel in self.learned_patterns:
                return {
                    'channel': channel,
                    'adjustments_recorded': len(self.learned_patterns[channel]['typical_adjustments']),
                    'response_style': self.learned_patterns[channel]['response_style'],
                    'has_learned_behavior': len(self.learned_patterns[channel]['typical_adjustments']) >= 10
                }
            else:
                return {'channel': channel, 'adjustments_recorded': 0, 'has_learned_behavior': False}

        # All channels
        return {
            'total_adjustments': len(self.manual_adjustments),
            'channels_with_learning': len(self.learned_patterns),
            'channels': {
                ch: {
                    'adjustments': len(patterns['typical_adjustments']),
                    'style': patterns['response_style']
                }
                for ch, patterns in self.learned_patterns.items()
            }
        }

    # ==================== Preset Management ====================

    def create_preset(
        self,
        name: str,
        description: str,
        fader_positions: Dict[int, float],
        mute_states: Dict[int, bool]
    ) -> MixerPreset:
        """
        Create a mixer preset with current configuration

        Args:
            name: Preset name
            description: Preset description
            fader_positions: Current fader positions
            mute_states: Current mute states

        Returns:
            Created preset
        """
        preset = MixerPreset(
            name=name,
            description=description,
            created_at=datetime.now().isoformat(),
            channel_configs={
                ch: config for ch, config in self.channels_config.items()
            },
            fader_positions=fader_positions.copy(),
            mute_states=mute_states.copy()
        )

        return preset

    def load_preset(self, preset: MixerPreset):
        """
        Load a mixer preset

        Args:
            preset: Preset to load
        """
        # Load channel configurations
        for channel, config in preset.channel_configs.items():
            self.configure_channel(config)

    def export_preset_json(self, preset: MixerPreset) -> str:
        """
        Export preset to JSON string

        Args:
            preset: Preset to export

        Returns:
            JSON string
        """
        preset_dict = {
            'name': preset.name,
            'description': preset.description,
            'created_at': preset.created_at,
            'channel_configs': {
                str(ch): asdict(config) for ch, config in preset.channel_configs.items()
            },
            'fader_positions': {str(ch): pos for ch, pos in preset.fader_positions.items()},
            'mute_states': {str(ch): muted for ch, muted in preset.mute_states.items()}
        }

        return json.dumps(preset_dict, indent=2)

    def import_preset_json(self, json_str: str) -> MixerPreset:
        """
        Import preset from JSON string

        Args:
            json_str: JSON string

        Returns:
            Imported preset
        """
        data = json.loads(json_str)

        channel_configs = {}
        for ch_str, config_dict in data['channel_configs'].items():
            channel = int(ch_str)
            channel_configs[channel] = ChannelConfig(**config_dict)

        fader_positions = {int(ch): pos for ch, pos in data['fader_positions'].items()}
        mute_states = {int(ch): muted for ch, muted in data['mute_states'].items()}

        preset = MixerPreset(
            name=data['name'],
            description=data['description'],
            created_at=data['created_at'],
            channel_configs=channel_configs,
            fader_positions=fader_positions,
            mute_states=mute_states
        )

        return preset
