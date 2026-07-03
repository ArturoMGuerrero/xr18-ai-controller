#!/usr/bin/env python3
"""
Test OSC connection to Behringer mixer
"""

import sys
import time
from pythonosc import udp_client, dispatcher, osc_server
import threading


def test_mixer_connection(ip: str, port: int = None):
    """Test connection to mixer"""

    # Determine port based on common defaults
    if port is None:
        print("No port specified, trying both common ports...")
        for test_port in [10024, 10023]:
            print(f"\nTrying port {test_port}...")
            if _test_port(ip, test_port):
                return True
        return False
    else:
        return _test_port(ip, port)


def _test_port(ip: str, port: int) -> bool:
    """Test specific port"""

    try:
        print(f"Creating OSC client for {ip}:{port}...")
        client = udp_client.SimpleUDPClient(ip, port)

        # Send connection request
        print("Sending /xremote command...")
        client.send_message("/xremote", None)

        print("Sending /info request...")
        client.send_message("/info", None)

        # Give it time to respond
        time.sleep(1)

        print(f"✅ Successfully sent OSC commands to {ip}:{port}")
        print(f"\nMixer details:")
        print(f"  IP: {ip}")
        print(f"  Port: {port}")

        if port == 10024:
            print(f"  Model: Likely XR18")
        elif port == 10023:
            print(f"  Model: Likely X32/M32")

        print(f"\n✅ You can now connect in the application:")
        print(f"   1. Model: {'XR18' if port == 10024 else 'X32 or M32'}")
        print(f"   2. IP: {ip}")
        print(f"   3. Click 'Connect'")

        return True

    except Exception as e:
        print(f"❌ Error: {e}")
        return False


if __name__ == "__main__":
    print("=" * 50)
    print("Behringer Mixer OSC Connection Test")
    print("=" * 50)
    print()

    if len(sys.argv) < 2:
        ip = input("Enter mixer IP address (e.g., 192.168.1.1): ")
    else:
        ip = sys.argv[1]

    if len(sys.argv) >= 3:
        port = int(sys.argv[2])
    else:
        port = None

    print()
    test_mixer_connection(ip, port)
