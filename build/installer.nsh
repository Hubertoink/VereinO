; Keep electron-builder's installation, upgrade and uninstall implementation.
; Only the presentation of its assisted installer is customized here.

!addplugindir /x86-unicode "${BUILD_RESOURCES_DIR}\installer-theme"
!ifdef BUILD_UNINSTALLER
  !define MUI_CUSTOMFUNCTION_UNGUIINIT un.VereinOThemeInit
  Function un.VereinOThemeInit
    VereinOTheme::Init /NOUNLOAD
  FunctionEnd
!else
  !define MUI_CUSTOMFUNCTION_GUIINIT VereinOThemeInit
  Function VereinOThemeInit
    VereinOTheme::Init /NOUNLOAD
  FunctionEnd
!endif

!macro customWelcomePage
  !insertmacro skipPageIfUpdated
  !define MUI_WELCOMEPAGE_TITLE "Willkommen bei VereinO"
  !define MUI_WELCOMEPAGE_TEXT "Deine Vereinsbuchhaltung. Auf deinem Rechner.$\r$\n$\r$\nDieser Assistent installiert VereinO ${VERSION} und hilft dir bei der Auswahl des Installationsordners.$\r$\n$\r$\nVereinO ist Open Source und steht unter der MIT-Lizenz. Den vollständigen Lizenztext findest du auf der nächsten Seite.$\r$\n$\r$\nKlicke auf Weiter, um fortzufahren."
  !insertmacro MUI_PAGE_WELCOME
!macroend

!define MUI_LICENSEPAGE_TEXT_TOP "VereinO ist Open Source · MIT-Lizenz"
!define MUI_LICENSEPAGE_TEXT_BOTTOM "Es gelten die Bedingungen des obenstehenden Lizenztextes. Klicke auf Weiter, um fortzufahren."
!define MUI_LICENSEPAGE_BUTTON "Weiter >"
!define MUI_FINISHPAGE_TITLE "VereinO ist bereit"
!define MUI_FINISHPAGE_TEXT "VereinO wurde installiert. Beim ersten Start richtest du deine Organisation ein.$\r$\n$\r$\nOpen Source · MIT-Lizenz$\r$\nDer Quellcode und weitere Informationen sind auf GitHub verfügbar."
!define MUI_FINISHPAGE_LINK "VereinO auf GitHub · Quellcode und MIT-Lizenz"
!define MUI_FINISHPAGE_LINK_LOCATION "https://github.com/Hubertoink/VereinO"

!macro customHeader
  BrandingText "VereinO · Open Source · MIT-Lizenz"
!macroend
