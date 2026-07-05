"""Proactive alert engine for detecting audio issues"""

import time
from typing import List, Dict, Optional, Deque
from dataclasses import dataclass, asdict
from collections import deque
from enum import Enum


class AlertType(str, Enum):
    """Types of alerts"""
    CLIPPING_RISK = "clipping_risk"
    LOW_SIGNAL = "low_signal"
    NOISE_FLOOR = "noise_floor"
    SUDDEN_DROP = "sudden_drop"
    FEEDBACK = "feedback"


class AlertSeverity(str, Enum):
    """Alert severity levels"""
    INFO = "info"
    WARNING = "warning"
    CRITICAL = "critical"


@dataclass
class Alert:
    """Alert information"""
    alert_id: str
    alert_type: AlertType
    severity: AlertSeverity
    channel: int
    message: str
    timestamp: float
    details: Dict
    suggested_action: Optional[str] = None


@dataclass
class AlertConfig:
    """Configuration for alert detection"""
    # Clipping risk
    clipping_threshold_db: float = -3.0
    clipping_consecutive_samples: int = 3

    # Low signal
    low_signal_threshold_db: float = -40.0
    low_signal_duration_sec: float = 10.0

    # Noise floor
    noise_floor_std_dev_threshold: float = 1.0
    noise_floor_duration_sec: float = 30.0

    # Sudden drop
    sudden_drop_threshold_db: float = 12.0
    sudden_drop_time_window_sec: float = 1.0

    # Alert deduplication
    alert_cooldown_sec: float = 30.0


class AlertEngine:
    """
    Proactive alert system for detecting audio issues

    Detects:
    - Clipping risk: Peak > -3dB for 3+ consecutive samples
    - Low signal: Avg < -40dB for 10+ seconds
    - Noise floor: Std dev < 1.0dB for 30+ seconds (dead channel?)
    - Sudden drop: Level drops > 12dB in < 1s (cable unplugged?)
    """

    def __init__(self, config: Optional[AlertConfig] = None, max_history: int = 100):
        self.config = config or AlertConfig()
        self.max_history = max_history

        # Alert history (last 100 alerts)
        self.alert_history: Deque[Alert] = deque(maxlen=max_history)

        # Last alert time per channel/type for deduplication
        self.last_alert_time: Dict[tuple, float] = {}

        # Channel monitoring state
        self.channel_state: Dict[int, Dict] = {}

        # Alert ID counter
        self._alert_counter = 0

    def check_for_alerts(
        self,
        channel: int,
        current_db: float,
        stats: Dict,
        sample_rate_hz: float = 20.0
    ) -> List[Alert]:
        """
        Check for alerts on a channel

        Args:
            channel: Channel number
            current_db: Current dB level
            stats: Channel statistics (avg_db, max_db, std_dev, recent_peak, etc.)
            sample_rate_hz: Sample rate for time calculations (default 20Hz = 50ms)

        Returns:
            List of alerts detected
        """
        alerts = []

        # Initialize channel state if needed
        if channel not in self.channel_state:
            self.channel_state[channel] = {
                'level_history': deque(maxlen=int(sample_rate_hz * 60)),  # 60 sec
                'peak_history': deque(maxlen=10),
                'last_level': current_db,
                'last_update': time.time()
            }

        state = self.channel_state[channel]
        state['level_history'].append(current_db)
        state['last_update'] = time.time()

        # Check for clipping risk
        alert = self._check_clipping_risk(channel, stats)
        if alert:
            alerts.append(alert)

        # Check for low signal
        alert = self._check_low_signal(channel, stats, sample_rate_hz)
        if alert:
            alerts.append(alert)

        # Check for noise floor (dead channel)
        alert = self._check_noise_floor(channel, stats, sample_rate_hz)
        if alert:
            alerts.append(alert)

        # Check for sudden drop
        alert = self._check_sudden_drop(channel, current_db, state)
        if alert:
            alerts.append(alert)

        # Update state
        state['last_level'] = current_db

        return alerts

    def _check_clipping_risk(self, channel: int, stats: Dict) -> Optional[Alert]:
        """Check for clipping risk (peak > -3dB)"""
        recent_peak = stats.get('recent_peak')

        if recent_peak is None:
            return None

        if recent_peak > self.config.clipping_threshold_db:
            # Check if we should alert (deduplication)
            if self._should_alert(channel, AlertType.CLIPPING_RISK):
                alert = Alert(
                    alert_id=self._generate_alert_id(),
                    alert_type=AlertType.CLIPPING_RISK,
                    severity=AlertSeverity.CRITICAL,
                    channel=channel,
                    message=f"Clipping risk on Channel {channel}: Peak at {recent_peak:.1f}dB",
                    timestamp=time.time(),
                    details={
                        "peak_db": recent_peak,
                        "threshold_db": self.config.clipping_threshold_db,
                        "headroom_db": 0.0 - recent_peak
                    },
                    suggested_action=f"Reduce gain on Channel {channel} by at least {abs(recent_peak):.1f}dB"
                )

                self._record_alert(alert)
                return alert

        return None

    def _check_low_signal(
        self,
        channel: int,
        stats: Dict,
        sample_rate_hz: float
    ) -> Optional[Alert]:
        """Check for consistently low signal"""
        avg_db = stats.get('avg_db')
        samples = stats.get('samples', 0)

        if avg_db is None:
            return None

        # Calculate duration
        duration_sec = samples / sample_rate_hz

        if (avg_db < self.config.low_signal_threshold_db and
            avg_db > -60 and  # Not complete silence
            duration_sec >= self.config.low_signal_duration_sec):

            if self._should_alert(channel, AlertType.LOW_SIGNAL):
                alert = Alert(
                    alert_id=self._generate_alert_id(),
                    alert_type=AlertType.LOW_SIGNAL,
                    severity=AlertSeverity.WARNING,
                    channel=channel,
                    message=f"Low signal on Channel {channel}: Avg {avg_db:.1f}dB for {duration_sec:.1f}s",
                    timestamp=time.time(),
                    details={
                        "avg_db": avg_db,
                        "threshold_db": self.config.low_signal_threshold_db,
                        "duration_sec": duration_sec
                    },
                    suggested_action=f"Check input connection or increase gain on Channel {channel}"
                )

                self._record_alert(alert)
                return alert

        return None

    def _check_noise_floor(
        self,
        channel: int,
        stats: Dict,
        sample_rate_hz: float
    ) -> Optional[Alert]:
        """Check for noise floor (very low variance = dead channel?)"""
        std_dev = stats.get('std_dev')
        samples = stats.get('samples', 0)
        avg_db = stats.get('avg_db')

        if std_dev is None or avg_db is None:
            return None

        # Calculate duration
        duration_sec = samples / sample_rate_hz

        # Very low variance for extended time suggests dead channel
        if (std_dev < self.config.noise_floor_std_dev_threshold and
            avg_db < -35 and  # Low level
            duration_sec >= self.config.noise_floor_duration_sec):

            if self._should_alert(channel, AlertType.NOISE_FLOOR):
                alert = Alert(
                    alert_id=self._generate_alert_id(),
                    alert_type=AlertType.NOISE_FLOOR,
                    severity=AlertSeverity.INFO,
                    channel=channel,
                    message=f"Possible dead channel {channel}: Noise floor detected",
                    timestamp=time.time(),
                    details={
                        "std_dev": std_dev,
                        "avg_db": avg_db,
                        "duration_sec": duration_sec
                    },
                    suggested_action=f"Check if Channel {channel} is being used or mute it"
                )

                self._record_alert(alert)
                return alert

        return None

    def _check_sudden_drop(
        self,
        channel: int,
        current_db: float,
        state: Dict
    ) -> Optional[Alert]:
        """Check for sudden level drop (cable unplugged, mute, etc.)"""
        last_level = state.get('last_level')

        if last_level is None or last_level <= -60:
            return None  # Was already silent

        # Calculate drop
        drop_db = last_level - current_db

        if drop_db > self.config.sudden_drop_threshold_db:
            if self._should_alert(channel, AlertType.SUDDEN_DROP):
                alert = Alert(
                    alert_id=self._generate_alert_id(),
                    alert_type=AlertType.SUDDEN_DROP,
                    severity=AlertSeverity.WARNING,
                    channel=channel,
                    message=f"Sudden drop on Channel {channel}: {drop_db:.1f}dB drop detected",
                    timestamp=time.time(),
                    details={
                        "previous_db": last_level,
                        "current_db": current_db,
                        "drop_db": drop_db
                    },
                    suggested_action=f"Check input connection on Channel {channel}"
                )

                self._record_alert(alert)
                return alert

        return None

    def _should_alert(self, channel: int, alert_type: AlertType) -> bool:
        """
        Check if we should alert based on cooldown period

        Args:
            channel: Channel number
            alert_type: Type of alert

        Returns:
            True if cooldown period has passed
        """
        key = (channel, alert_type)
        last_time = self.last_alert_time.get(key, 0.0)
        current_time = time.time()

        if current_time - last_time >= self.config.alert_cooldown_sec:
            self.last_alert_time[key] = current_time
            return True

        return False

    def _record_alert(self, alert: Alert):
        """Record alert in history"""
        self.alert_history.append(alert)

    def _generate_alert_id(self) -> str:
        """Generate unique alert ID"""
        self._alert_counter += 1
        return f"alert_{int(time.time())}_{self._alert_counter}"

    def get_alert_history(self, limit: Optional[int] = None) -> List[Dict]:
        """
        Get alert history

        Args:
            limit: Max number of alerts to return (None = all)

        Returns:
            List of alert dictionaries
        """
        alerts = list(self.alert_history)

        if limit:
            alerts = alerts[-limit:]

        return [asdict(alert) for alert in alerts]

    def get_alerts_by_channel(self, channel: int) -> List[Dict]:
        """Get all alerts for a specific channel"""
        return [
            asdict(alert)
            for alert in self.alert_history
            if alert.channel == channel
        ]

    def get_alerts_by_type(self, alert_type: AlertType) -> List[Dict]:
        """Get all alerts of a specific type"""
        return [
            asdict(alert)
            for alert in self.alert_history
            if alert.alert_type == alert_type
        ]

    def clear_history(self):
        """Clear all alert history"""
        self.alert_history.clear()
        self.last_alert_time.clear()

    def update_config(self, config: AlertConfig):
        """Update alert configuration"""
        self.config = config
