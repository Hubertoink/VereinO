VereinO packaging assets

- Icon.ico: Windows app, installer and uninstaller icon.
- icon.png / icon-1024.png: application branding for all platforms.
- installerSidebar.bmp: 164 x 314, 24-bit NSIS welcome/finish sidebar.
- installerHeader.bmp: 150 x 57, 24-bit NSIS page header.
- installer.nsh: assisted installer copy and open-source branding.

To regenerate the bitmaps on Windows:
  powershell -ExecutionPolicy Bypass -File scripts/create-installer-branding.ps1

The generated bitmaps are committed so CI needs no graphics tools.
The canonical MIT license is ../LICENSE; electron-builder displays this same
file in the installer and ships it as LICENSE.txt beside the application.
Keep electron-builder's built-in update/install/uninstall flow. Check both a
fresh guided installation and a silent upgrade when changing installer hooks.
