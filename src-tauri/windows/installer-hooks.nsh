!macro NSIS_HOOK_PREUNINSTALL
  ; Upgrades remove the old install but normally preserve user data.
  ${If} $UpdateMode == 1
    MessageBox MB_YESNO|MB_ICONQUESTION|MB_DEFBUTTON2 \
      "DuplicateFinder is already installed.$\r$\n$\r$\nRemove saved folders, scan results, and application data as well?" \
      IDNO keepDuplicateFinderData
    SetShellVarContext current
    RmDir /r "$APPDATA\${BUNDLEID}"
    RmDir /r "$LOCALAPPDATA\${BUNDLEID}"
    keepDuplicateFinderData:
  ${EndIf}
!macroend
