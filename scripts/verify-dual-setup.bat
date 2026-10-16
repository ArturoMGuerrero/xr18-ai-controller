@echo off
echo ========================================
echo Verificacion: USB + WiFi (XR18)
echo ========================================
echo.

echo [1] Mostrando adaptadores activos...
echo.
netsh interface show interface
echo.
echo.

echo [2] Mostrando IPs asignadas...
echo.
ipconfig
echo.
echo.

echo [3] Probando Internet (Google DNS)...
ping -n 2 8.8.8.8
echo.

echo [4] Probando Consola XR18 (192.168.1.1)...
ping -n 2 192.168.1.1
echo.

echo ========================================
echo RESULTADOS:
echo ========================================
echo.
echo Si ambos pings funcionan:
echo   [OK] Internet por USB del telefono
echo   [OK] XR18 por WiFi
echo   [OK] Todo listo para usar la app!
echo.
echo Si falla alguno:
echo   - Internet falla: Revisa anclaje USB
echo   - XR18 falla: Revisa conexion WiFi
echo.
pause
