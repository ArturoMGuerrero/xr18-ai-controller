"""Behringer mixer adapter for XR18, X32, and M32 consoles"""

import asyncio
from typing import Dict, List, Optional, Callable
from pythonosc import udp_client, dispatcher, osc_server
from pythonosc.osc_message import OscMessage
import threading
import time
import logging

from .base_adapter import MixerAdapter, MixerInfo, ChannelInfo
from ..services.osc_validator import (
    validate_meter_data,
    validate_fader_value,
    validate_channel_number,
    validate_mute_state,
    validate_channel_name,
    parse_channel_from_path,
    sanitize_osc_path,
    OSCValidationError
)
from ..services.logger import get_logger


class BehringerAdapter(MixerAdapter):
    """
    Adapter for Behringer XR18, X32, and M32 consoles

    Supports:
    - XR18: 16 input channels, 6 aux buses
    - X32/M32: 32 input channels, 16 buses
    """

    MODELS = {
        "xr18": {
            "name": "Behringer XR18",
            "channels": 16,
            "buses": 6,
            "port": 10024
        },
        "x32": {
            "name": "Behringer X32",
            "channels": 32,
            "buses": 16,
            "port": 10023
        },
        "m32": {
            "name": "Midas M32",
            "channels": 32,
            "buses": 16,
            "port": 10023
        }
    }

    def __init__(self, model: str = "xr18"):
        super().__init__()

        if model not in self.MODELS:
            raise ValueError(f"Unsupported model: {model}. Use: {list(self.MODELS.keys())}")

        self.model = model
        self.model_info = self.MODELS[model]
        self.client: Optional[udp_client.SimpleUDPClient] = None
        self.server: Optional[osc_server.ThreadingOSCUDPServer] = None
        self.server_thread: Optional[threading.Thread] = None

        self.meter_values: Dict[int, float] = {}
        self.fader_values: Dict[int, float] = {}
        self.channel_names: Dict[int, str] = {}
        self.mute_states: Dict[int, bool] = {}

        self.meter_callbacks: List[Callable] = []
        self.keepalive_task: Optional[asyncio.Task] = None
        self.last_keepalive_sent: float = 0.0

        # Logger
        self.logger = get_logger()

    async def connect(self, ip: str, port: Optional[int] = None) -> bool:
        """Connect to Behringer mixer"""
        try:
            if port is None:
                port = self.model_info["port"]

            self.client = udp_client.SimpleUDPClient(ip, port)

            # Start OSC server to receive messages
            disp = dispatcher.Dispatcher()
            disp.map("/meters/*", self._handle_meters)
            disp.map("/ch/*/mix/fader", self._handle_fader)
            disp.map("/ch/*/config/name", self._handle_channel_name)
            disp.map("/ch/*/mix/on", self._handle_mute)
            disp.set_default_handler(self._handle_default)

            # Server listens on a different port for responses
            self.server = osc_server.ThreadingOSCUDPServer(("0.0.0.0", 10111), disp)
            self.server_thread = threading.Thread(target=self.server.serve_forever, daemon=True)
            self.server_thread.start()

            # Send initial connection commands
            self.client.send_message("/xremote", None)
            self.client.send_message("/info", None)

            await asyncio.sleep(0.1)

            # Create mixer info
            self.mixer_info = MixerInfo(
                name=self.model_info["name"],
                model=self.model.upper(),
                ip=ip,
                port=port,
                channels=self.model_info["channels"],
                buses=self.model_info["buses"]
            )

            self.connected = True

            # Start keepalive
            self.keepalive_task = asyncio.create_task(self._keepalive_loop())

            return True

        except Exception as e:
            print(f"Connection error: {e}")
            return False

    async def disconnect(self) -> bool:
        """Disconnect from mixer"""
        try:
            if self.keepalive_task:
                self.keepalive_task.cancel()
                try:
                    await self.keepalive_task
                except asyncio.CancelledError:
                    pass

            if self.client:
                self.client.send_message("/unsubscribe", None)

            if self.server:
                self.server.shutdown()

            self.connected = False
            return True

        except Exception as e:
            print(f"Disconnect error: {e}")
            return False

    async def get_mixer_info(self) -> MixerInfo:
        """Get mixer information"""
        if not self.mixer_info:
            raise Exception("Not connected to mixer")
        return self.mixer_info

    async def get_channel_level(self, channel: int) -> float:
        """Get current channel level in dB"""
        if channel not in self.meter_values:
            return -float('inf')
        return self.meter_values[channel]

    async def set_channel_fader(self, channel: int, value: float) -> bool:
        """Set channel fader value (0.0 - 1.0)"""
        try:
            if not 0.0 <= value <= 1.0:
                raise ValueError("Fader value must be between 0.0 and 1.0")

            osc_path = self._get_channel_path(channel, "mix/fader")
            self.client.send_message(osc_path, value)
            self.fader_values[channel] = value

            return True

        except Exception as e:
            print(f"Error setting fader: {e}")
            return False

    async def get_channel_info(self, channel: int) -> ChannelInfo:
        """Get complete channel information"""
        return ChannelInfo(
            channel=channel,
            name=self.channel_names.get(channel, f"CH {channel:02d}"),
            level_db=self.meter_values.get(channel, -float('inf')),
            fader_value=self.fader_values.get(channel, 0.75),
            muted=self.mute_states.get(channel, False)
        )

    async def get_all_channels(self) -> List[ChannelInfo]:
        """Get information for all channels"""
        channels = []
        for ch in range(1, self.model_info["channels"] + 1):
            channels.append(await self.get_channel_info(ch))
        return channels

    async def mute_channel(self, channel: int, mute: bool) -> bool:
        """Mute or unmute a channel"""
        try:
            osc_path = self._get_channel_path(channel, "mix/on")
            value = 0 if mute else 1
            self.client.send_message(osc_path, value)
            self.mute_states[channel] = mute

            return True

        except Exception as e:
            print(f"Error muting channel: {e}")
            return False

    async def subscribe_to_meters(self) -> bool:
        """Subscribe to meter updates"""
        try:
            self.client.send_message("/meters", "/meters/1")
            self.client.send_message("/xremote", None)
            return True
        except Exception as e:
            print(f"Error subscribing to meters: {e}")
            return False

    async def unsubscribe_from_meters(self) -> bool:
        """Unsubscribe from meter updates"""
        try:
            self.client.send_message("/unsubscribe", None)
            return True
        except Exception as e:
            print(f"Error unsubscribing: {e}")
            return False

    def _get_channel_path(self, channel: int, parameter: str) -> str:
        """Generate OSC path for channel parameter"""
        if self.model == "xr18":
            return f"/ch/{channel:02d}/{parameter}"
        else:  # X32/M32
            return f"/ch/{channel:02d}/{parameter}"

    def _handle_meters(self, address: str, *args):
        """Handle meter messages with validation"""
        try:
            # Sanitize OSC path
            address = sanitize_osc_path(address)

            if args and len(args) > 0:
                meter_data = args[0] if isinstance(args[0], (list, tuple)) else args

                # Validate meter data
                validated_data = validate_meter_data(meter_data)

                # XR18: channels 0-15 in meter array
                # X32/M32: channels 0-31 in meter array
                for idx, value in enumerate(validated_data):
                    if idx < self.model_info["channels"]:
                        channel = idx + 1
                        db_value = self.linear_to_db(value) if value > 0 else -float('inf')
                        self.meter_values[channel] = db_value

                        # Notify callbacks
                        for callback in self.meter_callbacks:
                            callback(channel, db_value)

        except OSCValidationError as e:
            self.logger.warning(f"Invalid meter data: {e}", extra={"context": {"address": address}})
        except Exception as e:
            self.logger.error(f"Error handling meters: {e}", exc_info=True)

    def _handle_fader(self, address: str, *args):
        """Handle fader change messages with validation"""
        try:
            # Parse and validate channel from path
            channel = parse_channel_from_path(address)

            if args:
                # Validate fader value
                fader_value = validate_fader_value(args[0])
                self.fader_values[channel] = fader_value

                self.logger.debug(f"Fader update: Ch{channel} = {fader_value:.3f}")

        except OSCValidationError as e:
            self.logger.warning(f"Invalid fader data: {e}", extra={"context": {"address": address}})
        except Exception as e:
            self.logger.error(f"Error handling fader: {e}", exc_info=True)

    def _handle_channel_name(self, address: str, *args):
        """Handle channel name messages with validation"""
        try:
            # Parse and validate channel from path
            channel = parse_channel_from_path(address)

            if args:
                # Validate and sanitize name
                name = validate_channel_name(args[0])
                self.channel_names[channel] = name

                self.logger.debug(f"Channel name: Ch{channel} = '{name}'")

        except OSCValidationError as e:
            self.logger.warning(f"Invalid channel name: {e}", extra={"context": {"address": address}})
        except Exception as e:
            self.logger.error(f"Error handling channel name: {e}", exc_info=True)

    def _handle_mute(self, address: str, *args):
        """Handle mute state messages with validation"""
        try:
            # Parse and validate channel from path
            channel = parse_channel_from_path(address)

            if args:
                # Validate mute state
                mute = validate_mute_state(args[0])
                # Note: XR18 uses 0=muted, 1=unmuted
                self.mute_states[channel] = (mute == 0)

                self.logger.debug(f"Mute state: Ch{channel} = {self.mute_states[channel]}")

        except OSCValidationError as e:
            self.logger.warning(f"Invalid mute state: {e}", extra={"context": {"address": address}})
        except Exception as e:
            self.logger.error(f"Error handling mute: {e}", exc_info=True)

    def _handle_default(self, address: str, *args):
        """Handle unmatched OSC messages"""
        pass

    async def _keepalive_loop(self):
        """Send periodic keepalive to maintain connection"""
        while self.connected:
            try:
                self.client.send_message("/xremote", None)
                self.last_keepalive_sent = time.time()
                await asyncio.sleep(9)
            except asyncio.CancelledError:
                break
            except Exception as e:
                print(f"Keepalive error: {e}")
                self.connected = False  # Mark as disconnected on error
                break

    def is_healthy(self) -> bool:
        """
        Check if connection is healthy

        Returns:
            True if healthy, False otherwise
        """
        if not self.connected:
            return False

        # Check if keepalive is working
        if hasattr(self, 'last_keepalive_sent'):
            time_since_keepalive = time.time() - self.last_keepalive_sent
            # If no keepalive sent in 15 seconds, consider unhealthy
            if time_since_keepalive > 15.0:
                return False

        return True

    def add_meter_callback(self, callback: Callable):
        """Add callback for meter updates"""
        self.meter_callbacks.append(callback)

    def remove_meter_callback(self, callback: Callable):
        """Remove meter callback"""
        if callback in self.meter_callbacks:
            self.meter_callbacks.remove(callback)
