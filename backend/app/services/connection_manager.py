"""Connection manager with auto-reconnect logic"""

import asyncio
import random
import time
from typing import Optional, Callable, Awaitable
from enum import Enum

from ..adapters.base_adapter import MixerAdapter


class ConnectionState(str, Enum):
    """Connection state machine states"""
    DISCONNECTED = "disconnected"
    CONNECTING = "connecting"
    CONNECTED = "connected"
    RECONNECTING = "reconnecting"
    FAILED = "failed"


class ConnectionManager:
    """
    Manages mixer connection with automatic reconnection

    Features:
    - Exponential backoff: 1s, 2s, 4s, 8s, 16s, max 60s
    - Jitter to prevent thundering herd
    - Health monitoring via keepalive
    - Connection state callbacks
    - Max retry limit (10 attempts)
    """

    def __init__(
        self,
        adapter: MixerAdapter,
        max_retries: int = 10,
        min_backoff: float = 1.0,
        max_backoff: float = 60.0,
        jitter: bool = True
    ):
        self.adapter = adapter
        self.max_retries = max_retries
        self.min_backoff = min_backoff
        self.max_backoff = max_backoff
        self.jitter = jitter

        self.state = ConnectionState.DISCONNECTED
        self.retry_count = 0
        self.last_connect_attempt = 0.0
        self.last_successful_connect = 0.0

        # Connection parameters (saved for reconnection)
        self.ip_address: Optional[str] = None
        self.port: Optional[int] = None

        # Callbacks
        self.on_connect_callbacks: list[Callable[[], Awaitable[None]]] = []
        self.on_disconnect_callbacks: list[Callable[[], Awaitable[None]]] = []
        self.on_reconnecting_callbacks: list[Callable[[int], Awaitable[None]]] = []
        self.on_failed_callbacks: list[Callable[[], Awaitable[None]]] = []

        # Reconnection task
        self._reconnect_task: Optional[asyncio.Task] = None
        self._health_check_task: Optional[asyncio.Task] = None

    async def connect(self, ip_address: str, port: Optional[int] = None) -> bool:
        """
        Connect to mixer with reconnection support

        Args:
            ip_address: Mixer IP address
            port: Mixer port (optional)

        Returns:
            True if connected successfully
        """
        self.ip_address = ip_address
        self.port = port
        self.retry_count = 0

        return await self._attempt_connect()

    async def _attempt_connect(self) -> bool:
        """Attempt to connect to mixer"""
        self.state = ConnectionState.CONNECTING if self.retry_count == 0 else ConnectionState.RECONNECTING
        self.last_connect_attempt = time.time()

        try:
            # Attempt connection
            success = await self.adapter.connect(self.ip_address, self.port)

            if success:
                # Connection successful
                self.state = ConnectionState.CONNECTED
                self.last_successful_connect = time.time()
                self.retry_count = 0

                # Start health monitoring
                await self._start_health_monitoring()

                # Notify callbacks
                await self._notify_on_connect()

                return True
            else:
                # Connection failed
                raise ConnectionError("Failed to connect to mixer")

        except Exception as e:
            print(f"Connection attempt failed: {e}")

            # Check if should retry
            if self.retry_count < self.max_retries:
                # Start reconnection
                await self._start_reconnection()
                return False
            else:
                # Max retries exceeded
                self.state = ConnectionState.FAILED
                await self._notify_on_failed()
                return False

    async def disconnect(self):
        """Disconnect from mixer"""
        # Cancel tasks
        if self._reconnect_task and not self._reconnect_task.done():
            self._reconnect_task.cancel()
            try:
                await self._reconnect_task
            except asyncio.CancelledError:
                pass

        if self._health_check_task and not self._health_check_task.done():
            self._health_check_task.cancel()
            try:
                await self._health_check_task
            except asyncio.CancelledError:
                pass

        # Disconnect adapter
        if self.adapter.connected:
            await self.adapter.disconnect()

        self.state = ConnectionState.DISCONNECTED
        await self._notify_on_disconnect()

    async def _start_reconnection(self):
        """Start reconnection with exponential backoff"""
        if self._reconnect_task and not self._reconnect_task.done():
            return  # Already reconnecting

        self.state = ConnectionState.RECONNECTING
        self._reconnect_task = asyncio.create_task(self._reconnect_loop())

    async def _reconnect_loop(self):
        """Reconnection loop with exponential backoff"""
        while self.retry_count < self.max_retries:
            self.retry_count += 1

            # Calculate backoff
            backoff = self._calculate_backoff()

            print(f"Reconnecting in {backoff:.1f}s (attempt {self.retry_count}/{self.max_retries})")

            # Notify callbacks
            await self._notify_on_reconnecting(self.retry_count)

            # Wait for backoff period
            await asyncio.sleep(backoff)

            # Attempt reconnection
            success = await self._attempt_connect()

            if success:
                return  # Reconnection successful

        # Max retries exceeded
        self.state = ConnectionState.FAILED
        await self._notify_on_failed()

    def _calculate_backoff(self) -> float:
        """
        Calculate exponential backoff with jitter

        Returns:
            Backoff time in seconds
        """
        # Exponential: 2^(retry_count - 1) * min_backoff
        backoff = self.min_backoff * (2 ** (self.retry_count - 1))

        # Clamp to max
        backoff = min(backoff, self.max_backoff)

        # Add jitter (±20%)
        if self.jitter:
            jitter_amount = backoff * 0.2
            backoff += random.uniform(-jitter_amount, jitter_amount)

        return max(backoff, self.min_backoff)

    async def _start_health_monitoring(self):
        """Start health check monitoring"""
        if self._health_check_task and not self._health_check_task.done():
            return  # Already monitoring

        self._health_check_task = asyncio.create_task(self._health_check_loop())

    async def _health_check_loop(self):
        """Periodic health check loop"""
        while self.state == ConnectionState.CONNECTED:
            await asyncio.sleep(5.0)  # Check every 5 seconds

            # Check if adapter is healthy
            if hasattr(self.adapter, 'is_healthy'):
                if not self.adapter.is_healthy():
                    print("Health check failed - starting reconnection")
                    self.state = ConnectionState.DISCONNECTED
                    await self._start_reconnection()
                    break

    # Callback management
    def on_connect(self, callback: Callable[[], Awaitable[None]]):
        """Register callback for connection events"""
        self.on_connect_callbacks.append(callback)

    def on_disconnect(self, callback: Callable[[], Awaitable[None]]):
        """Register callback for disconnection events"""
        self.on_disconnect_callbacks.append(callback)

    def on_reconnecting(self, callback: Callable[[int], Awaitable[None]]):
        """Register callback for reconnection attempts"""
        self.on_reconnecting_callbacks.append(callback)

    def on_failed(self, callback: Callable[[], Awaitable[None]]):
        """Register callback for connection failure (max retries)"""
        self.on_failed_callbacks.append(callback)

    async def _notify_on_connect(self):
        """Notify all connect callbacks"""
        for callback in self.on_connect_callbacks:
            try:
                await callback()
            except Exception as e:
                print(f"Error in on_connect callback: {e}")

    async def _notify_on_disconnect(self):
        """Notify all disconnect callbacks"""
        for callback in self.on_disconnect_callbacks:
            try:
                await callback()
            except Exception as e:
                print(f"Error in on_disconnect callback: {e}")

    async def _notify_on_reconnecting(self, attempt: int):
        """Notify all reconnecting callbacks"""
        for callback in self.on_reconnecting_callbacks:
            try:
                await callback(attempt)
            except Exception as e:
                print(f"Error in on_reconnecting callback: {e}")

    async def _notify_on_failed(self):
        """Notify all failed callbacks"""
        for callback in self.on_failed_callbacks:
            try:
                await callback()
            except Exception as e:
                print(f"Error in on_failed callback: {e}")

    @property
    def is_connected(self) -> bool:
        """Check if currently connected"""
        return self.state == ConnectionState.CONNECTED and self.adapter.connected

    @property
    def is_reconnecting(self) -> bool:
        """Check if currently reconnecting"""
        return self.state == ConnectionState.RECONNECTING

    @property
    def connection_info(self) -> dict:
        """Get connection information"""
        return {
            "state": self.state.value,
            "retry_count": self.retry_count,
            "max_retries": self.max_retries,
            "last_connect_attempt": self.last_connect_attempt,
            "last_successful_connect": self.last_successful_connect,
            "ip_address": self.ip_address,
            "port": self.port
        }
