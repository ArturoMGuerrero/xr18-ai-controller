"""Smart preset analyzer for context-aware preset matching"""

import numpy as np
from typing import Dict, List, Tuple, Optional
from dataclasses import dataclass


@dataclass
class PresetScore:
    """Preset match score"""
    preset_name: str
    score: float  # 0.0 - 1.0
    reasons: List[str]
    recommended: bool


class PresetAnalyzer:
    """
    Analyzes mixer state and suggests appropriate presets

    Built-in presets optimized for different scenarios:
    - live_music: High dynamic range, loud peaks
    - podcast: Consistent levels, speech-optimized
    - broadcast: Strict level control, professional
    - speech: Similar to podcast, single speaker focus
    - dj: Loud, compressed, club-oriented
    """

    # Built-in preset configurations
    BUILTIN_PRESETS = {
        "live_music": {
            "description": "Live band/concert with dynamic instruments",
            "max_threshold_db": -6.0,
            "target_level_db": -12.0,
            "min_threshold_db": -40.0,
            "adjustment_speed": 0.9,
            "characteristics": {
                "expected_dynamic_range": (15, 40),  # dB
                "expected_avg_level": (-18, -8),
                "expected_peak_level": (-10, -3),
                "silence_tolerance": 0.3  # 30% silence OK
            }
        },
        "podcast": {
            "description": "Podcast recording with 2-4 speakers",
            "max_threshold_db": -9.0,
            "target_level_db": -15.0,
            "min_threshold_db": -35.0,
            "adjustment_speed": 0.6,
            "characteristics": {
                "expected_dynamic_range": (8, 15),
                "expected_avg_level": (-20, -12),
                "expected_peak_level": (-12, -6),
                "silence_tolerance": 0.4
            }
        },
        "broadcast": {
            "description": "Professional broadcast/streaming",
            "max_threshold_db": -12.0,
            "target_level_db": -18.0,
            "min_threshold_db": -30.0,
            "adjustment_speed": 0.5,
            "characteristics": {
                "expected_dynamic_range": (5, 12),
                "expected_avg_level": (-22, -14),
                "expected_peak_level": (-15, -9),
                "silence_tolerance": 0.2
            }
        },
        "speech": {
            "description": "Single speaker presentation/lecture",
            "max_threshold_db": -10.0,
            "target_level_db": -16.0,
            "min_threshold_db": -35.0,
            "adjustment_speed": 0.7,
            "characteristics": {
                "expected_dynamic_range": (6, 12),
                "expected_avg_level": (-22, -14),
                "expected_peak_level": (-14, -8),
                "silence_tolerance": 0.5
            }
        },
        "dj": {
            "description": "DJ mixing/club music",
            "max_threshold_db": -8.0,
            "target_level_db": -14.0,
            "min_threshold_db": -40.0,
            "adjustment_speed": 0.8,
            "characteristics": {
                "expected_dynamic_range": (10, 20),
                "expected_avg_level": (-16, -10),
                "expected_peak_level": (-10, -4),
                "silence_tolerance": 0.1
            }
        }
    }

    def analyze_mixer_state(self, channels: List[Dict]) -> Dict:
        """
        Analyze current mixer state

        Args:
            channels: List of channel data with stats

        Returns:
            Analysis dictionary with metrics
        """
        # Filter active channels (level > -60 dB)
        active_channels = [ch for ch in channels if ch.get('stats', {}).get('avg_db', -60) > -60]

        if not active_channels:
            return {
                "active_channels": 0,
                "avg_level": -60,
                "peak_level": -60,
                "dynamic_range": 0,
                "silence_ratio": 1.0,
                "variance": 0
            }

        # Calculate statistics
        avg_levels = [ch['stats']['avg_db'] for ch in active_channels if ch.get('stats', {}).get('avg_db')]
        max_levels = [ch['stats']['max_db'] for ch in active_channels if ch.get('stats', {}).get('max_db')]
        std_devs = [ch['stats']['std_dev'] for ch in active_channels if ch.get('stats', {}).get('std_dev')]

        if not avg_levels:
            return {
                "active_channels": len(active_channels),
                "avg_level": -60,
                "peak_level": -60,
                "dynamic_range": 0,
                "silence_ratio": 1.0,
                "variance": 0
            }

        overall_avg = np.mean(avg_levels)
        overall_peak = np.max(max_levels) if max_levels else -60
        overall_variance = np.mean(std_devs) if std_devs else 0

        # Dynamic range: difference between peak and average
        dynamic_range = overall_peak - overall_avg

        # Silence ratio: proportion of inactive channels
        silence_ratio = 1 - (len(active_channels) / len(channels))

        return {
            "active_channels": len(active_channels),
            "avg_level": float(overall_avg),
            "peak_level": float(overall_peak),
            "dynamic_range": float(dynamic_range),
            "silence_ratio": float(silence_ratio),
            "variance": float(overall_variance)
        }

    def score_preset(
        self,
        preset_name: str,
        preset_config: Dict,
        mixer_state: Dict
    ) -> PresetScore:
        """
        Score how well a preset matches the current mixer state

        Args:
            preset_name: Name of preset
            preset_config: Preset configuration
            mixer_state: Current mixer state analysis

        Returns:
            PresetScore with match quality
        """
        characteristics = preset_config.get("characteristics", {})
        reasons = []
        scores = []

        # Score dynamic range match
        expected_range = characteristics.get("expected_dynamic_range", (0, 100))
        actual_range = mixer_state["dynamic_range"]

        if expected_range[0] <= actual_range <= expected_range[1]:
            range_score = 1.0
            reasons.append(f"✓ Dynamic range {actual_range:.1f}dB matches {preset_name}")
        else:
            # Calculate how far off we are
            if actual_range < expected_range[0]:
                range_score = actual_range / expected_range[0]
            else:
                range_score = expected_range[1] / actual_range

            range_score = max(0.0, min(1.0, range_score))
            reasons.append(f"⚠ Dynamic range {actual_range:.1f}dB differs from expected")

        scores.append(range_score)

        # Score average level match
        expected_avg = characteristics.get("expected_avg_level", (-60, 0))
        actual_avg = mixer_state["avg_level"]

        if expected_avg[0] <= actual_avg <= expected_avg[1]:
            avg_score = 1.0
            reasons.append(f"✓ Average level {actual_avg:.1f}dB is appropriate")
        else:
            # Distance from nearest boundary
            if actual_avg < expected_avg[0]:
                distance = abs(actual_avg - expected_avg[0])
            else:
                distance = abs(actual_avg - expected_avg[1])

            avg_score = max(0.0, 1.0 - (distance / 20.0))  # 20dB tolerance
            reasons.append(f"⚠ Average level {actual_avg:.1f}dB outside ideal range")

        scores.append(avg_score)

        # Score peak level match
        expected_peak = characteristics.get("expected_peak_level", (-60, 0))
        actual_peak = mixer_state["peak_level"]

        if expected_peak[0] <= actual_peak <= expected_peak[1]:
            peak_score = 1.0
            reasons.append(f"✓ Peak level {actual_peak:.1f}dB is safe")
        else:
            if actual_peak < expected_peak[0]:
                distance = abs(actual_peak - expected_peak[0])
            else:
                distance = abs(actual_peak - expected_peak[1])

            peak_score = max(0.0, 1.0 - (distance / 15.0))
            reasons.append(f"⚠ Peak level {actual_peak:.1f}dB needs adjustment")

        scores.append(peak_score)

        # Score silence tolerance
        silence_tolerance = characteristics.get("silence_tolerance", 0.5)
        actual_silence = mixer_state["silence_ratio"]

        if actual_silence <= silence_tolerance:
            silence_score = 1.0
            reasons.append(f"✓ Channel usage ({(1-actual_silence)*100:.0f}%) is good")
        else:
            silence_score = silence_tolerance / max(actual_silence, 0.01)
            silence_score = max(0.0, min(1.0, silence_score))
            reasons.append(f"⚠ Many inactive channels ({actual_silence*100:.0f}%)")

        scores.append(silence_score * 0.5)  # Lower weight for silence

        # Calculate overall score (weighted average)
        overall_score = np.mean(scores)

        # Determine if recommended (score > 0.7)
        recommended = overall_score > 0.7

        return PresetScore(
            preset_name=preset_name,
            score=float(overall_score),
            reasons=reasons,
            recommended=recommended
        )

    def suggest_presets(
        self,
        channels: List[Dict],
        top_n: int = 3
    ) -> List[PresetScore]:
        """
        Suggest best matching presets for current mixer state

        Args:
            channels: List of channel data
            top_n: Number of top suggestions to return

        Returns:
            List of PresetScore objects, sorted by score
        """
        # Analyze current state
        mixer_state = self.analyze_mixer_state(channels)

        # Score all presets
        scores = []
        for preset_name, preset_config in self.BUILTIN_PRESETS.items():
            score = self.score_preset(preset_name, preset_config, mixer_state)
            scores.append(score)

        # Sort by score (highest first)
        scores.sort(key=lambda x: x.score, reverse=True)

        # Return top N
        return scores[:top_n]

    def get_preset_config(self, preset_name: str) -> Optional[Dict]:
        """Get configuration for a built-in preset"""
        return self.BUILTIN_PRESETS.get(preset_name)

    def apply_preset_with_adjustment(
        self,
        preset_name: str,
        current_levels: Dict[int, float]
    ) -> Dict[int, float]:
        """
        Apply preset with proportional adjustment based on current levels

        Args:
            preset_name: Name of preset to apply
            current_levels: Dict of current average levels by channel

        Returns:
            Dict of adjusted fader values by channel
        """
        preset = self.get_preset_config(preset_name)
        if not preset:
            return {}

        target_level = preset["target_level_db"]
        adjusted_faders = {}

        for channel, current_avg in current_levels.items():
            if current_avg <= -60:
                # Silent channel, leave at current fader
                continue

            # Calculate required adjustment
            adjustment_db = target_level - current_avg

            # Limit adjustment to ±12 dB for safety
            adjustment_db = max(-12, min(12, adjustment_db))

            # Convert dB adjustment to fader multiplier
            # Assuming fader at 0.75 = unity gain
            multiplier = 10 ** (adjustment_db / 20.0)
            new_fader = 0.75 * multiplier

            # Clamp to valid range
            new_fader = max(0.0, min(1.0, new_fader))

            adjusted_faders[channel] = new_fader

        return adjusted_faders
