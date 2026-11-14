VereinO packaging assets

- VereinO_Off_icon.png: official blue logo, source for generated branding (256 x 256).
- Icon.ico: matching Windows app, installer and uninstaller icon.
- icon.png / icon-1024.png: generated platform icons. The 1024px variant is
  upscaled from the official source; it does not add image detail.
- installerSidebar.bmp: 164 x 314, 24-bit NSIS welcome/finish sidebar.
- installerHeader.bmp: 150 x 57, 24-bit NSIS page header.
- installerHeaderDark.bmp: matching header for the Windows dark app mode.
- installer.nsh: assisted installer copy and open-source branding.
- installer-theme/: first-party MIT-licensed native theme plugin and tests.

To regenerate the app PNGs and installer bitmaps on Windows:
  powershell -ExecutionPolicy Bypass -File scripts/create-installer-branding.ps1

The generated bitmaps are committed so CI needs no graphics tools.
The canonical MIT license is ../LICENSE; electron-builder displays this same
file in the installer and ships it as LICENSE.txt beside the application.
Keep electron-builder's built-in update/install/uninstall flow. Check both a
fresh guided installation and a silent upgrade when changing installer hooks.

Windows theme integration
-------------------------
The wizard follows the current user's Windows AppsUseLightTheme preference,
including changes while open. High Contrast takes precedence and uses system
colors. The branded green sidebar stays the same in both modes. The license,
page panels, header image, fields, progress list and buttons follow the mode.
Native light controls, keyboard focus, checkbox state and UAC button shields
are preserved. The same hook runs for the uninstaller; silent updates do not
initialize it. No theme preference is written to Windows or VereinO.

npm run package builds the x86 Unicode NSIS plugin from source on Windows using
Visual Studio C++ Build Tools and the Windows SDK (also on the release runner).
Generated DLLs/build files are ignored. For a direct electron-builder API call,
first run: node scripts/build-installer-theme.cjs
Native regression tests: node scripts/build-installer-theme.cjs --test
The tests create hidden fixture windows; they never install the app or change
the user's Windows settings. Still check the actual wizard visually before a
release: welcome, license, install mode, folder, progress and finish; light,
dark, high contrast, 100%/150% scaling, keyboard-only use, uninstall and update.
