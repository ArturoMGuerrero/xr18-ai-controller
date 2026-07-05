"""Learning data persistence using JSON files"""

import json
import os
from pathlib import Path
from datetime import datetime
from typing import Optional, List, Dict
from dataclasses import asdict

# Import will be circular if we import AIAudioController, so use TYPE_CHECKING
from typing import TYPE_CHECKING
if TYPE_CHECKING:
    from ..ai_controller import AIAudioController, ManualAdjustment, ChannelConfig


class LearningStorage:
    """
    Handles persistence of AI learning data to JSON files

    Stores:
    - Manual adjustments history
    - Learned patterns per channel
    - Channel configurations
    """

    def __init__(self, data_dir: str = "backend/data/learning"):
        self.data_dir = Path(data_dir)
        self.data_dir.mkdir(parents=True, exist_ok=True)

    def save_learning_data(
        self,
        ai_controller: 'AIAudioController',
        filename: Optional[str] = None
    ) -> str:
        """
        Save learning data to JSON file

        Args:
            ai_controller: AI controller instance with learning data
            filename: Optional custom filename, otherwise timestamp-based

        Returns:
            Path to saved file
        """
        if filename is None:
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            filename = f"learning_data_{timestamp}.json"

        filepath = self.data_dir / filename

        # Prepare data for serialization
        data = {
            "version": "1.0",
            "saved_at": datetime.now().isoformat(),
            "learning_enabled": ai_controller.learning_enabled,
            "history_window": ai_controller.history_window,
            "manual_adjustments": [
                {
                    "channel": adj.channel,
                    "timestamp": adj.timestamp,
                    "previous_level_db": adj.previous_level_db,
                    "previous_fader": adj.previous_fader,
                    "new_fader": adj.new_fader,
                    "level_after_db": adj.level_after_db
                }
                for adj in ai_controller.manual_adjustments
            ],
            "learned_patterns": {
                str(channel): {
                    "preferred_level_range": patterns.get("preferred_level_range", []),
                    "typical_adjustments": patterns.get("typical_adjustments", []),
                    "response_style": patterns.get("response_style", "moderate")
                }
                for channel, patterns in ai_controller.learned_patterns.items()
            },
            "channels_config": {
                str(channel): {
                    "channel": config.channel,
                    "max_threshold_db": config.max_threshold_db,
                    "target_level_db": config.target_level_db,
                    "min_threshold_db": config.min_threshold_db,
                    "auto_adjust_enabled": config.auto_adjust_enabled,
                    "adjustment_speed": config.adjustment_speed
                }
                for channel, config in ai_controller.channels_config.items()
            }
        }

        # Write to file
        with open(filepath, 'w') as f:
            json.dump(data, f, indent=2)

        return str(filepath)

    def load_learning_data(
        self,
        ai_controller: 'AIAudioController',
        filepath: str
    ) -> bool:
        """
        Load learning data from JSON file

        Args:
            ai_controller: AI controller instance to load data into
            filepath: Path to JSON file

        Returns:
            True if successful, False otherwise
        """
        try:
            filepath = Path(filepath)
            if not filepath.exists():
                raise FileNotFoundError(f"Learning data file not found: {filepath}")

            with open(filepath, 'r') as f:
                data = json.load(f)

            # Validate version
            version = data.get("version", "1.0")
            if version != "1.0":
                raise ValueError(f"Unsupported learning data version: {version}")

            # Import here to avoid circular dependency
            from ..ai_controller import ManualAdjustment, ChannelConfig

            # Load manual adjustments
            ai_controller.manual_adjustments = [
                ManualAdjustment(
                    channel=adj["channel"],
                    timestamp=adj["timestamp"],
                    previous_level_db=adj["previous_level_db"],
                    previous_fader=adj["previous_fader"],
                    new_fader=adj["new_fader"],
                    level_after_db=adj.get("level_after_db")
                )
                for adj in data.get("manual_adjustments", [])
            ]

            # Load learned patterns
            ai_controller.learned_patterns = {
                int(channel): {
                    "preferred_level_range": patterns.get("preferred_level_range", []),
                    "typical_adjustments": patterns.get("typical_adjustments", []),
                    "response_style": patterns.get("response_style", "moderate")
                }
                for channel, patterns in data.get("learned_patterns", {}).items()
            }

            # Load channel configurations
            for channel_str, config_dict in data.get("channels_config", {}).items():
                channel = int(channel_str)
                config = ChannelConfig(
                    channel=config_dict["channel"],
                    max_threshold_db=config_dict.get("max_threshold_db", -6.0),
                    target_level_db=config_dict.get("target_level_db", -12.0),
                    min_threshold_db=config_dict.get("min_threshold_db", -40.0),
                    auto_adjust_enabled=config_dict.get("auto_adjust_enabled", True),
                    adjustment_speed=config_dict.get("adjustment_speed", 0.8)
                )
                ai_controller.configure_channel(config)

            return True

        except Exception as e:
            print(f"Error loading learning data: {e}")
            return False

    def list_learning_files(self) -> List[Dict]:
        """
        List all learning data files

        Returns:
            List of dicts with file info (filename, created_at, size)
        """
        files = []

        for filepath in self.data_dir.glob("learning_data_*.json"):
            try:
                stat = filepath.stat()
                files.append({
                    "filename": filepath.name,
                    "filepath": str(filepath),
                    "created_at": datetime.fromtimestamp(stat.st_ctime).isoformat(),
                    "size_bytes": stat.st_size
                })
            except Exception as e:
                print(f"Error reading file {filepath}: {e}")
                continue

        # Sort by creation time, newest first
        files.sort(key=lambda x: x["created_at"], reverse=True)

        return files

    def delete_learning_file(self, filename: str) -> bool:
        """
        Delete a learning data file

        Args:
            filename: Name of file to delete

        Returns:
            True if deleted, False otherwise
        """
        try:
            filepath = self.data_dir / filename
            if filepath.exists():
                filepath.unlink()
                return True
            return False
        except Exception as e:
            print(f"Error deleting file {filename}: {e}")
            return False

    def export_learning_data_json(
        self,
        ai_controller: 'AIAudioController'
    ) -> str:
        """
        Export learning data as JSON string

        Args:
            ai_controller: AI controller instance

        Returns:
            JSON string
        """
        # Save to temp file and read back
        temp_file = "temp_export.json"
        filepath = self.save_learning_data(ai_controller, temp_file)

        with open(filepath, 'r') as f:
            json_str = f.read()

        # Clean up temp file
        Path(filepath).unlink()

        return json_str

    def import_learning_data_json(
        self,
        ai_controller: 'AIAudioController',
        json_str: str
    ) -> bool:
        """
        Import learning data from JSON string

        Args:
            ai_controller: AI controller instance
            json_str: JSON string with learning data

        Returns:
            True if successful, False otherwise
        """
        try:
            # Write to temp file
            temp_file = self.data_dir / "temp_import.json"
            with open(temp_file, 'w') as f:
                f.write(json_str)

            # Load from temp file
            success = self.load_learning_data(ai_controller, str(temp_file))

            # Clean up temp file
            temp_file.unlink()

            return success

        except Exception as e:
            print(f"Error importing learning data: {e}")
            return False
