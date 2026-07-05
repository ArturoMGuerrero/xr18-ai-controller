"""OSC message validation and sanitization"""

import re
from typing import List, Any, Optional, Union
import math


class OSCValidationError(Exception):
    """Exception raised for OSC validation errors"""
    pass


def validate_meter_data(data: Any) -> List[float]:
    """
    Validate and sanitize meter data array

    Args:
        data: Raw meter data from OSC message

    Returns:
        List of validated float values clipped to [0.0, 1.0]

    Raises:
        OSCValidationError: If data is invalid
    """
    if not isinstance(data, (list, tuple)):
        raise OSCValidationError(f"Meter data must be list or tuple, got {type(data)}")

    validated = []
    for i, value in enumerate(data):
        try:
            # Convert to float
            float_val = float(value)

            # Check for NaN or Inf
            if math.isnan(float_val) or math.isinf(float_val):
                float_val = 0.0

            # Clip to valid range [0.0, 1.0]
            float_val = max(0.0, min(1.0, float_val))

            validated.append(float_val)

        except (ValueError, TypeError) as e:
            raise OSCValidationError(f"Invalid meter value at index {i}: {value} - {e}")

    return validated


def validate_fader_value(value: Any) -> float:
    """
    Validate and sanitize fader value

    Args:
        value: Raw fader value from OSC message

    Returns:
        Validated float value clipped to [0.0, 1.0]

    Raises:
        OSCValidationError: If value is invalid
    """
    try:
        float_val = float(value)

        # Check for NaN or Inf
        if math.isnan(float_val) or math.isinf(float_val):
            raise OSCValidationError(f"Fader value is NaN or Inf: {value}")

        # Clip to valid range
        float_val = max(0.0, min(1.0, float_val))

        return float_val

    except (ValueError, TypeError) as e:
        raise OSCValidationError(f"Invalid fader value: {value} - {e}")


def validate_channel_number(channel: Any, max_channels: int = 32) -> int:
    """
    Validate channel number

    Args:
        channel: Raw channel number
        max_channels: Maximum valid channel number

    Returns:
        Validated integer channel number

    Raises:
        OSCValidationError: If channel is invalid
    """
    try:
        int_val = int(channel)

        if int_val < 1 or int_val > max_channels:
            raise OSCValidationError(
                f"Channel number {int_val} out of range [1, {max_channels}]"
            )

        return int_val

    except (ValueError, TypeError) as e:
        raise OSCValidationError(f"Invalid channel number: {channel} - {e}")


def validate_mute_state(value: Any) -> bool:
    """
    Validate mute state value

    Args:
        value: Raw mute state value (0/1 or bool)

    Returns:
        Boolean mute state

    Raises:
        OSCValidationError: If value is invalid
    """
    if isinstance(value, bool):
        return value

    try:
        int_val = int(value)

        if int_val not in (0, 1):
            raise OSCValidationError(f"Mute state must be 0 or 1, got {int_val}")

        return bool(int_val)

    except (ValueError, TypeError) as e:
        raise OSCValidationError(f"Invalid mute state: {value} - {e}")


def sanitize_osc_path(path: str) -> str:
    """
    Sanitize OSC address path to prevent injection attacks

    Args:
        path: Raw OSC path

    Returns:
        Sanitized OSC path

    Raises:
        OSCValidationError: If path is malformed or dangerous
    """
    if not isinstance(path, str):
        raise OSCValidationError(f"OSC path must be string, got {type(path)}")

    # Remove null bytes
    if '\x00' in path:
        raise OSCValidationError("OSC path contains null bytes")

    # Check for path traversal attempts
    if '..' in path:
        raise OSCValidationError("OSC path contains path traversal sequence '..'")

    # Validate format: Must start with / and contain only valid characters
    # Valid: /ch/01/mix/fader, /meters/0
    # Invalid: ../../../etc/passwd, /ch/01/../../
    if not path.startswith('/'):
        raise OSCValidationError(f"OSC path must start with '/', got: {path}")

    # Only allow alphanumeric, forward slash, hyphen, underscore
    valid_pattern = re.compile(r'^[/a-zA-Z0-9_-]+$')
    if not valid_pattern.match(path):
        raise OSCValidationError(f"OSC path contains invalid characters: {path}")

    # Check for consecutive slashes (// or more)
    if '//' in path:
        raise OSCValidationError(f"OSC path contains consecutive slashes: {path}")

    return path


def validate_db_level(db: Any) -> float:
    """
    Validate dB level value

    Args:
        db: Raw dB level

    Returns:
        Validated dB level clipped to reasonable range [-60.0, 10.0]

    Raises:
        OSCValidationError: If value is invalid
    """
    try:
        float_val = float(db)

        # Check for NaN or Inf
        if math.isnan(float_val) or math.isinf(float_val):
            raise OSCValidationError(f"dB level is NaN or Inf: {db}")

        # Clip to mixer's typical range
        # XR18/X32 range is approximately -oo to +10 dB
        # We clip to -60 for practical silence detection
        float_val = max(-60.0, min(10.0, float_val))

        return float_val

    except (ValueError, TypeError) as e:
        raise OSCValidationError(f"Invalid dB level: {db} - {e}")


def validate_osc_args(
    args: tuple,
    expected_types: List[type],
    strict: bool = False
) -> tuple:
    """
    Validate OSC message arguments against expected types

    Args:
        args: Tuple of OSC arguments
        expected_types: List of expected types for each argument
        strict: If True, raise error on type mismatch. If False, attempt conversion.

    Returns:
        Validated and possibly converted arguments

    Raises:
        OSCValidationError: If arguments don't match expected types
    """
    if len(args) != len(expected_types):
        raise OSCValidationError(
            f"Expected {len(expected_types)} arguments, got {len(args)}"
        )

    validated = []
    for i, (arg, expected_type) in enumerate(zip(args, expected_types)):
        if strict:
            if not isinstance(arg, expected_type):
                raise OSCValidationError(
                    f"Argument {i} has wrong type: expected {expected_type}, got {type(arg)}"
                )
            validated.append(arg)
        else:
            # Attempt conversion
            try:
                converted = expected_type(arg)
                validated.append(converted)
            except (ValueError, TypeError) as e:
                raise OSCValidationError(
                    f"Cannot convert argument {i} to {expected_type}: {arg} - {e}"
                )

    return tuple(validated)


def parse_channel_from_path(osc_path: str) -> int:
    """
    Extract channel number from OSC path

    Args:
        osc_path: OSC path like "/ch/01/mix/fader"

    Returns:
        Channel number as integer

    Raises:
        OSCValidationError: If path format is invalid or channel not found
    """
    # Sanitize path first
    osc_path = sanitize_osc_path(osc_path)

    # Extract channel number from path like /ch/01/mix/fader
    match = re.search(r'/ch/(\d+)/', osc_path)
    if not match:
        raise OSCValidationError(f"Cannot extract channel number from path: {osc_path}")

    channel_str = match.group(1)
    return validate_channel_number(int(channel_str))


def validate_channel_name(name: Any, max_length: int = 12) -> str:
    """
    Validate channel name string

    Args:
        name: Raw channel name
        max_length: Maximum allowed length

    Returns:
        Validated and sanitized channel name

    Raises:
        OSCValidationError: If name is invalid
    """
    if not isinstance(name, str):
        try:
            name = str(name)
        except Exception as e:
            raise OSCValidationError(f"Cannot convert channel name to string: {name} - {e}")

    # Remove null bytes and control characters
    name = ''.join(char for char in name if ord(char) >= 32)

    # Truncate to max length
    if len(name) > max_length:
        name = name[:max_length]

    return name.strip()
