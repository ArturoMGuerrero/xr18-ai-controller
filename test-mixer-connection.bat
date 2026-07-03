@echo off
echo ========================================
echo XR18/X32 Mixer Connection Test
echo ========================================
echo.

SET /P MIXER_IP="Enter mixer IP address (e.g., 192.168.1.1): "
echo.

echo Testing connection to %MIXER_IP%...
ping -n 2 %MIXER_IP%

if %errorlevel% equ 0 (
    echo.
    echo [SUCCESS] Mixer is reachable!
    echo.
    echo Now try connecting in the application:
    echo   1. Open http://localhost:5173
    echo   2. Select your mixer model
    echo   3. Enter IP: %MIXER_IP%
    echo   4. Click "Connect"
) else (
    echo.
    echo [FAILED] Cannot reach mixer at %MIXER_IP%
    echo.
    echo Troubleshooting:
    echo   1. Check mixer is powered on
    echo   2. Check network cable is connected
    echo   3. Verify you're on the same network
    echo   4. Try IP 192.168.1.1 if using XR18 WiFi
)

echo.
pause
