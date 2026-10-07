"""Command pattern implementation for undo/redo functionality"""

import asyncio
from typing import List, Optional, Protocol
from dataclasses import dataclass
from datetime import datetime


class Command(Protocol):
    """Command interface for undo/redo operations"""

    async def execute(self) -> bool:
        """Execute the command"""
        ...

    async def undo(self) -> bool:
        """Undo the command"""
        ...

    def description(self) -> str:
        """Human-readable description of command"""
        ...


@dataclass
class SetFaderCommand:
    """Command to set channel fader position"""

    mixer_adapter: any  # MixerAdapter instance
    channel: int
    old_value: float
    new_value: float
    timestamp: datetime

    async def execute(self) -> bool:
        """Execute: Set fader to new value"""
        try:
            await self.mixer_adapter.set_channel_fader(self.channel, self.new_value)
            return True
        except Exception as e:
            print(f"Error executing SetFaderCommand: {e}")
            return False

    async def undo(self) -> bool:
        """Undo: Restore fader to old value"""
        try:
            await self.mixer_adapter.set_channel_fader(self.channel, self.old_value)
            return True
        except Exception as e:
            print(f"Error undoing SetFaderCommand: {e}")
            return False

    def description(self) -> str:
        """Get command description"""
        return f"Set CH{self.channel} fader from {self.old_value:.2f} to {self.new_value:.2f}"


@dataclass
class SetMuteCommand:
    """Command to set channel mute state"""

    mixer_adapter: any
    channel: int
    old_muted: bool
    new_muted: bool
    timestamp: datetime

    async def execute(self) -> bool:
        """Execute: Set mute state"""
        try:
            await self.mixer_adapter.set_channel_mute(self.channel, self.new_muted)
            return True
        except Exception as e:
            print(f"Error executing SetMuteCommand: {e}")
            return False

    async def undo(self) -> bool:
        """Undo: Restore mute state"""
        try:
            await self.mixer_adapter.set_channel_mute(self.channel, self.old_muted)
            return True
        except Exception as e:
            print(f"Error undoing SetMuteCommand: {e}")
            return False

    def description(self) -> str:
        """Get command description"""
        action = "muted" if self.new_muted else "unmuted"
        return f"{action.capitalize()} CH{self.channel}"


class CommandHistory:
    """
    Manages undo/redo command history

    Features:
    - Stack-based undo/redo (max 50 commands)
    - Thread-safe with asyncio.Lock
    - Only tracks manual commands (not AI adjustments)
    - Disabled during AI mode for safety
    """

    def __init__(self, max_size: int = 50):
        self.max_size = max_size

        self.undo_stack: List[Command] = []
        self.redo_stack: List[Command] = []

        self.lock = asyncio.Lock()
        self.enabled = True  # Disabled during AI mode

    async def execute(self, command: Command) -> bool:
        """
        Execute a command and add to history

        Args:
            command: Command to execute

        Returns:
            True if successful
        """
        if not self.enabled:
            # AI mode active, don't track
            return await command.execute()

        async with self.lock:
            # Execute command
            success = await command.execute()

            if success:
                # Add to undo stack
                self.undo_stack.append(command)

                # Limit stack size
                if len(self.undo_stack) > self.max_size:
                    self.undo_stack.pop(0)

                # Clear redo stack (new command invalidates redo history)
                self.redo_stack.clear()

            return success

    async def undo(self) -> Optional[str]:
        """
        Undo last command

        Returns:
            Description of undone command, or None if stack empty
        """
        async with self.lock:
            if not self.undo_stack:
                return None

            command = self.undo_stack.pop()
            success = await command.undo()

            if success:
                # Move to redo stack
                self.redo_stack.append(command)

                # Limit redo stack size
                if len(self.redo_stack) > self.max_size:
                    self.redo_stack.pop(0)

                return command.description()
            else:
                # Undo failed, put command back
                self.undo_stack.append(command)
                return None

    async def redo(self) -> Optional[str]:
        """
        Redo last undone command

        Returns:
            Description of redone command, or None if stack empty
        """
        async with self.lock:
            if not self.redo_stack:
                return None

            command = self.redo_stack.pop()
            success = await command.execute()

            if success:
                # Move back to undo stack
                self.undo_stack.append(command)

                # Limit undo stack size
                if len(self.undo_stack) > self.max_size:
                    self.undo_stack.pop(0)

                return command.description()
            else:
                # Redo failed, put command back
                self.redo_stack.append(command)
                return None

    def can_undo(self) -> bool:
        """Check if undo is available"""
        return len(self.undo_stack) > 0 and self.enabled

    def can_redo(self) -> bool:
        """Check if redo is available"""
        return len(self.redo_stack) > 0 and self.enabled

    def get_history(self, limit: int = 10) -> List[dict]:
        """
        Get command history

        Args:
            limit: Max number of commands to return

        Returns:
            List of command descriptions
        """
        # Return most recent commands
        recent_undo = list(reversed(self.undo_stack[-limit:]))

        return [
            {
                "description": cmd.description(),
                "timestamp": cmd.timestamp.isoformat() if hasattr(cmd, 'timestamp') else None,
                "can_undo": True
            }
            for cmd in recent_undo
        ]

    def clear(self):
        """Clear all history"""
        self.undo_stack.clear()
        self.redo_stack.clear()

    def set_enabled(self, enabled: bool):
        """Enable or disable command tracking"""
        self.enabled = enabled

        # Clear history when disabling (entering AI mode)
        if not enabled:
            self.clear()

    def get_stats(self) -> dict:
        """Get statistics about command history"""
        return {
            "undo_stack_size": len(self.undo_stack),
            "redo_stack_size": len(self.redo_stack),
            "can_undo": self.can_undo(),
            "can_redo": self.can_redo(),
            "enabled": self.enabled
        }
