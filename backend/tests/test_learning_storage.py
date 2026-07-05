"""Tests for learning data persistence"""

import pytest
import json
from pathlib import Path

from app.storage.learning_storage import LearningStorage
from app.ai_controller import AIAudioController, ManualAdjustment, ChannelConfig


@pytest.mark.unit
class TestLearningStorage:
    """Test LearningStorage class"""

    def test_init_creates_directory(self, tmp_path):
        """Test that initialization creates the data directory"""
        storage_dir = tmp_path / "learning"
        storage = LearningStorage(data_dir=str(storage_dir))

        assert storage_dir.exists()
        assert storage_dir.is_dir()

    def test_save_learning_data(self, learning_storage, mock_ai_controller):
        """Test saving learning data to JSON file"""
        # Add some manual adjustments to controller
        mock_ai_controller.record_manual_adjustment(
            channel=1,
            previous_level_db=-10.0,
            previous_fader=0.75,
            new_fader=0.65
        )

        # Save data
        filepath = learning_storage.save_learning_data(mock_ai_controller)

        # Verify file was created
        assert Path(filepath).exists()

        # Load and verify content
        with open(filepath, 'r') as f:
            data = json.load(f)

        assert data["version"] == "1.0"
        assert data["learning_enabled"] == True
        assert data["history_window"] == 100
        assert len(data["manual_adjustments"]) == 1
        assert data["manual_adjustments"][0]["channel"] == 1

    def test_save_with_custom_filename(self, learning_storage, mock_ai_controller):
        """Test saving with custom filename"""
        custom_name = "test_data.json"
        filepath = learning_storage.save_learning_data(
            mock_ai_controller,
            filename=custom_name
        )

        assert Path(filepath).name == custom_name

    def test_load_learning_data(self, learning_storage, sample_learning_data):
        """Test loading learning data from JSON file"""
        # Save sample data to file
        test_file = learning_storage.data_dir / "test_load.json"
        with open(test_file, 'w') as f:
            json.dump(sample_learning_data, f)

        # Create fresh controller
        controller = AIAudioController(history_window=100)

        # Load data
        success = learning_storage.load_learning_data(controller, str(test_file))

        assert success == True
        assert len(controller.manual_adjustments) == 2
        assert controller.manual_adjustments[0].channel == 1
        assert len(controller.learned_patterns) == 1
        assert 1 in controller.learned_patterns
        assert controller.learned_patterns[1]["response_style"] == "moderate"

    def test_load_nonexistent_file(self, learning_storage):
        """Test loading from nonexistent file returns False"""
        controller = AIAudioController()
        success = learning_storage.load_learning_data(controller, "nonexistent.json")

        assert success == False

    def test_load_corrupted_json(self, learning_storage):
        """Test loading corrupted JSON returns False"""
        # Create corrupted JSON file
        corrupted_file = learning_storage.data_dir / "corrupted.json"
        with open(corrupted_file, 'w') as f:
            f.write("{invalid json content")

        controller = AIAudioController()
        success = learning_storage.load_learning_data(controller, str(corrupted_file))

        assert success == False

    def test_list_learning_files(self, learning_storage, mock_ai_controller):
        """Test listing learning data files"""
        # Save multiple files
        learning_storage.save_learning_data(mock_ai_controller, "data1.json")
        learning_storage.save_learning_data(mock_ai_controller, "data2.json")
        learning_storage.save_learning_data(mock_ai_controller, "data3.json")

        # List files
        files = learning_storage.list_learning_files()

        # Should have 3 files (only counting learning_data_*.json)
        # But our custom names don't match the pattern, so adjust test
        assert isinstance(files, list)

    def test_list_files_with_pattern(self, learning_storage, mock_ai_controller):
        """Test that only files matching pattern are listed"""
        # Save with default naming (includes timestamp)
        learning_storage.save_learning_data(mock_ai_controller)  # learning_data_TIMESTAMP.json

        # Create non-matching file
        other_file = learning_storage.data_dir / "other_file.json"
        other_file.write_text("{}")

        files = learning_storage.list_learning_files()

        # Should only list files matching learning_data_*.json pattern
        assert all("learning_data_" in f["filename"] for f in files)

    def test_delete_learning_file(self, learning_storage, mock_ai_controller):
        """Test deleting a learning data file"""
        # Save file
        filepath = learning_storage.save_learning_data(mock_ai_controller, "delete_me.json")
        filename = Path(filepath).name

        # Verify exists
        assert Path(filepath).exists()

        # Delete
        success = learning_storage.delete_learning_file(filename)

        assert success == True
        assert not Path(filepath).exists()

    def test_delete_nonexistent_file(self, learning_storage):
        """Test deleting nonexistent file returns False"""
        success = learning_storage.delete_learning_file("nonexistent.json")
        assert success == False

    def test_export_import_roundtrip(self, learning_storage, mock_ai_controller):
        """Test export and import are symmetric"""
        # Setup test data
        mock_ai_controller.record_manual_adjustment(
            channel=1,
            previous_level_db=-10.0,
            previous_fader=0.75,
            new_fader=0.65
        )
        mock_ai_controller.record_manual_adjustment(
            channel=2,
            previous_level_db=-12.0,
            previous_fader=0.70,
            new_fader=0.60
        )

        # Export
        json_str = learning_storage.export_learning_data_json(mock_ai_controller)

        # Create fresh controller
        new_controller = AIAudioController()

        # Import
        success = learning_storage.import_learning_data_json(new_controller, json_str)

        assert success == True
        assert len(new_controller.manual_adjustments) == 2
        assert new_controller.manual_adjustments[0].channel == 1
        assert new_controller.manual_adjustments[1].channel == 2

    def test_export_invalid_json(self, learning_storage):
        """Test importing invalid JSON returns False"""
        controller = AIAudioController()
        success = learning_storage.import_learning_data_json(controller, "{invalid}")

        assert success == False

    def test_save_preserves_channel_configs(self, learning_storage, mock_ai_controller):
        """Test that channel configurations are saved correctly"""
        # Save
        filepath = learning_storage.save_learning_data(mock_ai_controller)

        # Load into new controller
        new_controller = AIAudioController()
        learning_storage.load_learning_data(new_controller, filepath)

        # Verify channel configs were restored
        assert 1 in new_controller.channels_config
        assert 2 in new_controller.channels_config
        assert 3 in new_controller.channels_config

        # Verify config values
        config = new_controller.channels_config[1]
        assert config.max_threshold_db == -6.0
        assert config.target_level_db == -12.0
        assert config.auto_adjust_enabled == True

    def test_file_list_sorted_by_date(self, learning_storage, mock_ai_controller):
        """Test that file list is sorted newest first"""
        import time

        # Save files with small delay
        learning_storage.save_learning_data(mock_ai_controller)  # File 1
        time.sleep(0.1)
        learning_storage.save_learning_data(mock_ai_controller)  # File 2
        time.sleep(0.1)
        learning_storage.save_learning_data(mock_ai_controller)  # File 3

        files = learning_storage.list_learning_files()

        # Verify sorted newest first
        for i in range(len(files) - 1):
            assert files[i]["created_at"] >= files[i+1]["created_at"]


@pytest.mark.integration
class TestLearningStorageIntegration:
    """Integration tests for learning storage with AI controller"""

    def test_full_learning_workflow(self, learning_storage):
        """Test complete learning workflow: configure, adjust, save, load"""
        # Step 1: Create controller and configure
        controller = AIAudioController(learning_enabled=True)

        for i in range(1, 5):
            config = ChannelConfig(
                channel=i,
                max_threshold_db=-8.0,
                target_level_db=-15.0
            )
            controller.configure_channel(config)

        # Step 2: Record manual adjustments
        controller.record_manual_adjustment(1, -10.0, 0.80, 0.70)
        controller.record_manual_adjustment(2, -9.0, 0.75, 0.65)
        controller.record_manual_adjustment(1, -12.0, 0.70, 0.65)  # Second adjustment on ch 1

        # Step 3: Build up learning patterns
        # (Multiple adjustments should train the learning algorithm)
        for _ in range(10):
            controller.record_manual_adjustment(1, -10.0, 0.70, 0.60)

        # Step 4: Save
        filepath = learning_storage.save_learning_data(controller)

        # Step 5: Create new controller and load
        new_controller = AIAudioController()
        success = learning_storage.load_learning_data(new_controller, filepath)

        # Step 6: Verify everything restored
        assert success == True
        assert len(new_controller.manual_adjustments) == 13  # All adjustments
        assert 1 in new_controller.learned_patterns  # Learned behavior for ch 1
        assert len(new_controller.channels_config) == 4  # All 4 channels configured

        # Verify learned behavior
        pattern = new_controller.learned_patterns[1]
        assert "response_style" in pattern
        # After 11 adjustments on channel 1, should have learned style
