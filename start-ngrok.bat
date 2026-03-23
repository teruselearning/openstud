@echo off
echo Starting ngrok tunnel on port 3000...
echo.
echo Make sure the app is running first (npm run dev in another terminal)
echo.
"C:\Users\olive\AppData\Local\Microsoft\WinGet\Packages\Ngrok.Ngrok_Microsoft.Winget.Source_8wekyb3d8bbwe\ngrok.exe" http 3000
