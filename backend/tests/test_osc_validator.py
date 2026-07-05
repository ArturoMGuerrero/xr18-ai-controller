"""Tests for OSC validator"""

import pytest
import math

from app.services.osc_validator import (
    validate_meter_data,
    validate_fader_value,
    validate_channel_number,
    validate_mute_state,
    validate_channel_name,
    sanitize_osc_path,
    validate_db_level,
    parse_channel_from_path,
    OSCValidationError
)


@pytest.mark.unit
class TestMeterDataValidation:
    """Test meter data validation"""

    def test_valid_meter_data(self):
        """Test validation of valid meter data"""
        data = [0.0, 0.5, 1.0, 0.75, 0.25]
        result = validate_meter_data(data)

        assert len(result) == 5
        assert all(0.0 <= v <= 1.0 for v in result)

    def test_meter_data_clipping(self):
        """Test that out-of-range values are clipped"""
        data = [-0.5, 1.5, 2.0]
        result = validate_meter_data(data)

        assert result[0] == 0.0  # Clipped from -0.5
        assert result[1] == 1.0  # Clipped from 1.5
        assert result[2] == 1.0  # Clipped from 2.0

    def test_meter_data_nan_handling(self):
        """Test that NaN values are converted to 0.0"""
        data = [0.5, float('nan'), 0.75]
        result = validate_meter_data(data)

        assert result[0] == 0.5
        assert result[1] == 0.0  # NaN converted to 0.0
        assert result[2] == 0.75

    def test_meter_data_inf_handling(self):
        """Test that Inf values are converted to 0.0"""
        data = [0.5, float('inf'), float('-inf')]
        result = validate_meter_data(data)

        assert result[0] == 0.5
        assert result[1] == 0.0  # Inf converted to 0.0
        assert result[2] == 0.0  # -Inf converted to 0.0

    def test_meter_data_invalid_type(self):
        """Test that non-list data raises error"""
        with pytest.raises(OSCValidationError, match="must be list or tuple"):
            validate_meter_data("not a list")

    def test_meter_data_invalid_element(self):
        """Test that invalid elements raise error"""
        data = [0.5, "invalid", 0.75]

        with pytest.raises(OSCValidationError, match="Invalid meter value"):
            validate_meter_data(data)


@pytest.mark.unit
class TestFaderValueValidation:
    """Test fader value validation"""

    def test_valid_fader_values(self):
        """Test validation of valid fader values"""
        assert validate_fader_value(0.0) == 0.0
        assert validate_fader_value(0.5) == 0.5
        assert validate_fader_value(1.0) == 1.0

    def test_fader_value_clipping(self):
        """Test that out-of-range values are clipped"""
        assert validate_fader_value(-0.5) == 0.0
        assert validate_fader_value(1.5) == 1.0
        assert validate_fader_value(10.0) == 1.0

    def test_fader_value_nan(self):
        """Test that NaN raises error"""
        with pytest.raises(OSCValidationError, match="NaN or Inf"):
            validate_fader_value(float('nan'))

    def test_fader_value_inf(self):
        """Test that Inf raises error"""
        with pytest.raises(OSCValidationError, match="NaN or Inf"):
            validate_fader_value(float('inf'))

    def test_fader_value_string_conversion(self):
        """Test that strings are converted"""
        assert validate_fader_value("0.75") == 0.75

    def test_fader_value_invalid_type(self):
        """Test that invalid types raise error"""
        with pytest.raises(OSCValidationError):
            validate_fader_value("invalid")


@pytest.mark.unit
class TestChannelNumberValidation:
    """Test channel number validation"""

    def test_valid_channel_numbers(self):
        """Test validation of valid channel numbers"""
        assert validate_channel_number(1) == 1
        assert validate_channel_number(16) == 16
        assert validate_channel_number(32, max_channels=32) == 32

    def test_channel_number_out_of_range_low(self):
        """Test that channel 0 raises error"""
        with pytest.raises(OSCValidationError, match="out of range"):
            validate_channel_number(0)

    def test_channel_number_out_of_range_high(self):
        """Test that channel > max raises error"""
        with pytest.raises(OSCValidationError, match="out of range"):
            validate_channel_number(33, max_channels=32)

    def test_channel_number_string_conversion(self):
        """Test that strings are converted"""
        assert validate_channel_number("5") == 5

    def test_channel_number_invalid_type(self):
        """Test that invalid types raise error"""
        with pytest.raises(OSCValidationError):
            validate_channel_number("invalid")


@pytest.mark.unit
class TestMuteStateValidation:
    """Test mute state validation"""

    def test_valid_boolean_values(self):
        """Test validation of boolean values"""
        assert validate_mute_state(True) is True
        assert validate_mute_state(False) is False

    def test_valid_integer_values(self):
        """Test validation of integer values (0/1)"""
        assert validate_mute_state(0) is False
        assert validate_mute_state(1) is True

    def test_invalid_integer_values(self):
        """Test that integers other than 0/1 raise error"""
        with pytest.raises(OSCValidationError, match="must be 0 or 1"):
            validate_mute_state(2)

    def test_string_conversion(self):
        """Test that strings are converted"""
        assert validate_mute_state("0") is False
        assert validate_mute_state("1") is True

    def test_invalid_type(self):
        """Test that invalid types raise error"""
        with pytest.raises(OSCValidationError):
            validate_mute_state("invalid")


@pytest.mark.unit
class TestOSCPathSanitization:
    """Test OSC path sanitization"""

    def test_valid_paths(self):
        """Test validation of valid OSC paths"""
        assert sanitize_osc_path("/ch/01/mix/fader") == "/ch/01/mix/fader"
        assert sanitize_osc_path("/meters/0") == "/meters/0"
        assert sanitize_osc_path("/xremote") == "/xremote"

    def test_path_traversal_attack(self):
        """Test that path traversal is blocked"""
        with pytest.raises(OSCValidationError, match="path traversal"):
            sanitize_osc_path("/ch/../../../etc/passwd")

    def test_null_byte_attack(self):
        """Test that null bytes are blocked"""
        with pytest.raises(OSCValidationError, match="null bytes"):
            sanitize_osc_path("/ch/01\x00/mix")

    def test_path_must_start_with_slash(self):
        """Test that path must start with /"""
        with pytest.raises(OSCValidationError, match="must start with"):
            sanitize_osc_path("ch/01/mix")

    def test_invalid_characters(self):
        """Test that invalid characters are blocked"""
        with pytest.raises(OSCValidationError, match="invalid characters"):
            sanitize_osc_path("/ch/01/mix&fader")

    def test_consecutive_slashes(self):
        """Test that consecutive slashes are blocked"""
        with pytest.raises(OSCValidationError, match="consecutive slashes"):
            sanitize_osc_path("/ch//01/mix")

    def test_non_string_type(self):
        """Test that non-string types raise error"""
        with pytest.raises(OSCValidationError, match="must be string"):
            sanitize_osc_path(123)


@pytest.mark.unit
class TestDBLevelValidation:
    """Test dB level validation"""

    def test_valid_db_levels(self):
        """Test validation of valid dB levels"""
        assert validate_db_level(0.0) == 0.0
        assert validate_db_level(-12.0) == -12.0
        assert validate_db_level(-60.0) == -60.0
        assert validate_db_level(10.0) == 10.0

    def test_db_level_clipping(self):
        """Test that extreme values are clipped"""
        assert validate_db_level(-100.0) == -60.0  # Clipped to min
        assert validate_db_level(50.0) == 10.0     # Clipped to max

    def test_db_level_nan(self):
        """Test that NaN raises error"""
        with pytest.raises(OSCValidationError, match="NaN or Inf"):
            validate_db_level(float('nan'))

    def test_db_level_inf(self):
        """Test that Inf raises error"""
        with pytest.raises(OSCValidationError, match="NaN or Inf"):
            validate_db_level(float('inf'))


@pytest.mark.unit
class TestChannelParsing:
    """Test channel number parsing from OSC path"""

    def test_parse_channel_from_path(self):
        """Test parsing channel from valid paths"""
        assert parse_channel_from_path("/ch/01/mix/fader") == 1
        assert parse_channel_from_path("/ch/16/mix/on") == 16
        assert parse_channel_from_path("/ch/32/config/name") == 32

    def test_parse_channel_invalid_path(self):
        """Test that invalid paths raise error"""
        with pytest.raises(OSCValidationError, match="Cannot extract channel"):
            parse_channel_from_path("/meters/0")

    def test_parse_channel_malformed_path(self):
        """Test that malformed paths raise error"""
        with pytest.raises(OSCValidationError):
            parse_channel_from_path("/ch/invalid/mix")


@pytest.mark.unit
class TestChannelNameValidation:
    """Test channel name validation"""

    def test_valid_channel_names(self):
        """Test validation of valid channel names"""
        assert validate_channel_name("Vocal") == "Vocal"
        assert validate_channel_name("Guitar 1") == "Guitar 1"
        assert validate_channel_name("Kick") == "Kick"

    def test_channel_name_truncation(self):
        """Test that long names are truncated"""
        long_name = "This is a very long channel name"
        result = validate_channel_name(long_name, max_length=12)

        assert len(result) == 12
        assert result == long_name[:12]

    def test_channel_name_control_character_removal(self):
        """Test that control characters are removed"""
        name_with_control = "Vocal\x00\x01Test"
        result = validate_channel_name(name_with_control)

        assert "\x00" not in result
        assert "\x01" not in result

    def test_channel_name_whitespace_stripping(self):
        """Test that leading/trailing whitespace is stripped"""
        assert validate_channel_name("  Vocal  ") == "Vocal"

    def test_channel_name_type_conversion(self):
        """Test that non-strings are converted"""
        assert validate_channel_name(123) == "123"
