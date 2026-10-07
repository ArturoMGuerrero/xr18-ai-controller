"""Demo/Mock adapter for testing without physical mixer"""

import asyncio
import random
import math
import time
from typing import List, Optional, Dict
from .base_adapter import MixerAdapter, MixerInfo, ChannelInfo


class DemoAdapter(MixerAdapter):
    """
    Simulated mixer adapter for demo/testing

    Generates realistic audio levels without requiring physical hardware
    """

    def __init__(self, model: str = "xr18"):
        super().__init__()

        self.models = {
            "xr18": {"name": "Behringer XR18 (DEMO)", "channels": 16, "buses": 6},
            "x32": {"name": "Behringer X32 (DEMO)", "channels": 32, "buses": 16},
            "m32": {"name": "Midas M32 (DEMO)", "channels": 32, "buses": 16}
        }

        if model not in self.models:
            model = "xr18"

        self.model = model
        self.model_info = self.models[model]

        # Simulated state
        self.meter_values: Dict[int, float] = {}
        self.fader_values: Dict[int, float] = {i: 0.75 for i in range(1, self.model_info["channels"] + 1)}
        self.channel_names: Dict[int, str] = {
            1: "Kick",
            2: "Snare",
            3: "HiHat",
            4: "Tom 1",
            5: "Tom 2",
            6: "Overhead L",
            7: "Overhead R",
            8: "Bass DI",
            9: "Guitar 1",
            10: "Guitar 2",
            11: "Keys L",
            12: "Keys R",
            13: "Vocal 1",
            14: "Vocal 2",
            15: "Vocal 3",
            16: "FX Return"
        }
        self.mute_states: Dict[int, bool] = {i: False for i in range(1, self.model_info["channels"] + 1)}

        # Simulation parameters
        self.simulation_task: Optional[asyncio.Task] = None
        self.start_time = time.time()

        # Per-channel simulation state
        self.channel_patterns = {}
        for ch in range(1, self.model_info["channels"] + 1):
            self.channel_patterns[ch] = {
                'type': random.choice(['dynamic', 'steady', 'rhythmic', 'silent']),
                'base_level': random.uniform(-30, -10),
                'variance': random.uniform(3, 15),
                'frequency': random.uniform(0.5, 3.0),  # Hz for rhythmic patterns
                'offset': random.uniform(0, 6.28)  # Phase offset
            }

    async def connect(self, ip: str, port: Optional[int] = None) -> bool:
        """Simulate connection to mixer"""
        print(f"[DEMO] Connecting in DEMO mode...")
        self.connected = True

        # Start simulation loop
        self.simulation_task = asyncio.create_task(self._simulation_loop())

        print(f"[DEMO] Connected! Simulating {self.model_info['channels']} channels")
        return True

    async def disconnect(self) -> bool:
        """Simulate disconnection"""
        self.connected = False

        if self.simulation_task:
            self.simulation_task.cancel()
            try:
                await self.simulation_task
            except asyncio.CancelledError:
                pass

        return True

    async def _simulation_loop(self):
        """Generate simulated meter values"""
        try:
            while self.connected:
                elapsed = time.time() - self.start_time

                for ch in range(1, self.model_info["channels"] + 1):
                    if self.mute_states[ch]:
                        self.meter_values[ch] = -60  # Muted = silence
                        continue

                    pattern = self.channel_patterns[ch]

                    if pattern['type'] == 'silent':
                        # Silent channel (10% of channels)
                        level_db = random.uniform(-70, -60)

                    elif pattern['type'] == 'steady':
                        # Steady level with small variations (speech-like)
                        level_db = pattern['base_level'] + random.gauss(0, 2)

                    elif pattern['type'] == 'rhythmic':
                        # Rhythmic pattern (drums, percussion)
                        phase = elapsed * pattern['frequency'] * 2 * math.pi + pattern['offset']
                        beat_value = abs(math.sin(phase))

                        if beat_value > 0.7:  # Hit
                            level_db = pattern['base_level'] + random.uniform(0, pattern['variance'])
                        else:  # Decay
                            level_db = pattern['base_level'] - random.uniform(10, 20)

                    else:  # dynamic
                        # Dynamic content (music, complex signals)
                        # Multiple frequencies combined
                        phase1 = elapsed * pattern['frequency'] * 2 * math.pi + pattern['offset']
                        phase2 = elapsed * (pattern['frequency'] * 1.5) * 2 * math.pi

                        wave = (math.sin(phase1) + 0.5 * math.sin(phase2)) / 1.5
                        level_db = pattern['base_level'] + wave * pattern['variance']

                    # Add small random noise
                    level_db += random.gauss(0, 1)

                    # Apply fader (attenuation)
                    # Fader at 0.75 = unity, below = attenuation
                    fader_gain_db = 20 * math.log10(max(0.01, self.fader_values[ch] / 0.75))
                    level_db += fader_gain_db

                    # Clamp to realistic range
                    level_db = max(-70, min(3, level_db))

                    self.meter_values[ch] = level_db

                await asyncio.sleep(0.05)  # 20Hz update rate

        except asyncio.CancelledError:
            pass

    async def get_mixer_info(self) -> MixerInfo:
        """Get mixer information"""
        return MixerInfo(
            name=self.model_info["name"],
            model=self.model.upper(),
            ip="DEMO MODE",
            port=0,
            channels=self.model_info["channels"],
            buses=self.model_info["buses"]
        )

    async def set_channel_fader(self, channel: int, value: float) -> bool:
        """Set channel fader"""
        if 1 <= channel <= self.model_info["channels"]:
            self.fader_values[channel] = max(0.0, min(1.0, value))
            return True
        return False

    async def set_channel_fader_batch(self, fader_updates: Dict[int, float]) -> bool:
        """Set multiple faders (batch)"""
        for channel, value in fader_updates.items():
            await self.set_channel_fader(channel, value)
        return True

    async def get_channel_info(self, channel: int) -> ChannelInfo:
        """Get channel information"""
        return ChannelInfo(
            channel=channel,
            name=self.channel_names.get(channel, f"CH {channel:02d}"),
            level_db=self.meter_values.get(channel, -60.0),
            fader_value=self.fader_values.get(channel, 0.75),
            muted=self.mute_states.get(channel, False)
        )

    async def get_all_channels(self) -> List[ChannelInfo]:
        """Get all channels information"""
        channels = []
        for ch in range(1, self.model_info["channels"] + 1):
            channels.append(await self.get_channel_info(ch))
        return channels

    async def mute_channel(self, channel: int, mute: bool) -> bool:
        """Mute/unmute channel"""
        if 1 <= channel <= self.model_info["channels"]:
            self.mute_states[channel] = mute
            return True
        return False

    async def is_healthy(self) -> bool:
        """Check if connection is healthy"""
        return self.connected and self.simulation_task is not None and not self.simulation_task.done()

    async def get_channel_level(self, channel: int) -> float:
        """Get current channel level in dB"""
        return self.meter_values.get(channel, -60.0)

    async def subscribe_to_meters(self) -> bool:
        """Subscribe to meter updates (no-op for demo)"""
        return True

    async def unsubscribe_from_meters(self) -> bool:
        """Unsubscribe from meter updates (no-op for demo)"""
        return True
