@echo off
echo ========================================
echo Test de Conexion Dual (WiFi + USB)
echo ========================================
echo.

echo [1] Verificando adaptadores de red...
echo.
netsh interface show interface
echo.

echo [2] Probando conexion a consola (192.168.1.1)...
ping -n 2 192.168.1.1
echo.

echo [3] Probando conexion a Internet (Google)...
ping -n 2 8.8.8.8
echo.

echo [4] Mostrando IPs actuales...
ipconfig | findstr "IPv4 Gateway"
echo.

echo ========================================
echo Si ambos pings funcionan, estas listo!
echo ========================================
echo.
pause
