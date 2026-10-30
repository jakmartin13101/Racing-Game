; Gravel Riot Windows installer. Build after `electron-builder --win dir` with:
;   makensis -DSRC=release/win-unpacked -DOUT=release/GravelRiot-Setup.exe electron/installer.nsi
Unicode true
!include "MUI2.nsh"
!define APP "Gravel Riot"
!define VER "1.0.0"
!define REG "Software\Microsoft\Windows\CurrentVersion\Uninstall\GravelRiot"
Name "${APP}"
OutFile "${OUT}"
InstallDir "$LOCALAPPDATA\Programs\Gravel Riot"
InstallDirRegKey HKCU "Software\GravelRiot" "InstallDir"
RequestExecutionLevel user
SetCompressor /SOLID lzma
!define MUI_ICON "icon.ico"
!define MUI_UNICON "icon.ico"
!define MUI_FINISHPAGE_RUN "$INSTDIR\Gravel Riot.exe"
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "English"

Section "Install"
  SetOutPath "$INSTDIR"
  File /r "${SRC}\*.*"
  File "icon.ico"
  WriteUninstaller "$INSTDIR\Uninstall.exe"
  CreateShortCut "$DESKTOP\${APP}.lnk" "$INSTDIR\Gravel Riot.exe" "" "$INSTDIR\icon.ico"
  CreateDirectory "$SMPROGRAMS\${APP}"
  CreateShortCut "$SMPROGRAMS\${APP}\${APP}.lnk" "$INSTDIR\Gravel Riot.exe" "" "$INSTDIR\icon.ico"
  CreateShortCut "$SMPROGRAMS\${APP}\Uninstall.lnk" "$INSTDIR\Uninstall.exe"
  WriteRegStr HKCU "Software\GravelRiot" "InstallDir" "$INSTDIR"
  WriteRegStr HKCU "${REG}" "DisplayName" "${APP}"
  WriteRegStr HKCU "${REG}" "DisplayVersion" "${VER}"
  WriteRegStr HKCU "${REG}" "DisplayIcon" "$INSTDIR\icon.ico"
  WriteRegStr HKCU "${REG}" "UninstallString" '"$INSTDIR\Uninstall.exe"'
  WriteRegDWORD HKCU "${REG}" "NoModify" 1
SectionEnd

Section "Uninstall"
  RMDir /r "$INSTDIR"
  Delete "$DESKTOP\${APP}.lnk"
  RMDir /r "$SMPROGRAMS\${APP}"
  DeleteRegKey HKCU "${REG}"
  DeleteRegKey HKCU "Software\GravelRiot"
SectionEnd
