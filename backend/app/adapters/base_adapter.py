"""Base adapter interface for all mixer consoles"""

from abc import ABC, abstractmethod
from typing import Dict, List, Optional
from dataclasses import dataclass


@dataclass
class MixerInfo:
    """Information about connected mixer"""
    name: str
    model: str
    ip: str
    port: int
    channels: int
    buses: int
    firmware_version: Optional[str] = None


@dataclass
class ChannelInfo:
    """Channel information"""
    channel: int
    name: str
    level_db: float
    fader_value: float
    muted: bool
    phantom_power: bool = False


class MixerAdapter(ABC):
    """Abstract base class for all mixer adapters"""

    def __init__(self):
        self.connected = False
        self.mixer_info: Optional[MixerInfo] = None

    @abstractmethod
    async def connect(self, ip: str, port: int) -> bool:
        """
        Connect to the mixer

        Args:
            ip: Mixer IP address
            port: Mixer port

        Returns:
            True if connection successful
        """
        pass

    @abstractmethod
    async def disconnect(self) -> bool:
        """Disconnect from the mixer"""
        pass

    @abstractmethod
    async def get_mixer_info(self) -> MixerInfo:
        """Get mixer information"""
        pass

    @abstractmethod
    async def get_channel_level(self, channel: int) -> float:
        """
        Get current channel level in dB

        Args:
            channel: Channel number (1-based)

        Returns:
            Level in dB
        """
        pass

    @abstractmethod
    async def set_channel_fader(self, channel: int, value: float) -> bool:
        """
        Set channel fader value

        Args:
            channel: Channel number (1-based)
            value: Fader value (0.0 - 1.0)

        Returns:
            True if successful
        """
        pass

    @abstractmethod
    async def get_channel_info(self, channel: int) -> ChannelInfo:
        """Get complete channel information"""
        pass

    @abstractmethod
    async def get_all_channels(self) -> List[ChannelInfo]:
        """Get information for all channels"""
        pass

    @abstractmethod
    async def mute_channel(self, channel: int, mute: bool) -> bool:
        """Mute or unmute a channel"""
        pass

    @abstractmethod
    async def subscribe_to_meters(self) -> bool:
        """Subscribe to meter updates"""
        pass

    @abstractmethod
    async def unsubscribe_from_meters(self) -> bool:
        """Unsubscribe from meter updates"""
        pass

    def linear_to_db(self, linear: float) -> float:
        """Convert linear value to dB"""
        if linear <= 0:
            return -float('inf')
        import math
        return 20 * math.log10(linear)

    def db_to_linear(self, db: float) -> float:
        """Convert dB to linear value"""
        if db == -float('inf'):
            return 0.0
        return 10 ** (db / 20)

    def fader_to_db(self, fader: float) -> float:
        """
        Convert fader position (0.0-1.0) to dB
        Uses standard audio taper curve
        """
        if fader <= 0:
            return -float('inf')
        import math
        return 40 * math.log10(fader) - 30

    def db_to_fader(self, db: float) -> float:
        """
        Convert dB to fader position (0.0-1.0)
        Uses standard audio taper curve
        """
        if db == -float('inf'):
            return 0.0
        return 10 ** ((db + 30) / 40)
