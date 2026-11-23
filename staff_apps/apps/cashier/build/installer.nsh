; Standart electron-builder tekshiruvi (_CHECK_APP_RUNNING) o'rnatish papkasi ichidagi ISTALGAN jarayonni
; "ilova ishlayapti" deb hisoblab, ba'zi kompyuterlarda ("Cannot be closed" oynasi) o'rnatishni bloklaydi.
; Bu yerda faqat ilovaning o'z jarayoni (nomi bo'yicha) yopiladi, boshqa hech narsa tekshirilmaydi.
; Makro o'rnatuvchida ham, deinstalyatorda ham ishlatiladi, shuning uchun faqat umumiy buyruqlar.
!macro customCheckAppRunning
  nsExec::Exec `"$SYSDIR\cmd.exe" /C taskkill /F /IM "${APP_EXECUTABLE_FILENAME}" /FI "USERNAME eq %USERNAME%"`
  Pop $0
  ; fayllar "band" bo'lib qolmasligi uchun jarayon to'liq chiqib ketishiga vaqt beramiz
  Sleep 1000
!macroend

; Kassa kompyuteri uchun tarmoq qo'riqchisi (resources/lan_guard_client_windows.ps1, sababi o'sha faylda:
; repeater rejimidagi kuchaytirgich ARP'ni o'g'irlab, kassani serverdan uzib qo'yadi). Administrator huquqi
; kerak, shuning uchun alohida UAC so'rovi bilan ishga tushadi. Ilova o'rnatilishiga ta'sir qilmaydi: rad
; etilsa yoki huquq bo'lmasa shunchaki o'tkazib yuboriladi. Jim (avto) yangilanishda (/S) va qo'riqchi
; allaqachon o'rnatilgan bo'lsa so'ralmaydi.
!macro customInstall
  IfSilent languard_skip
  ReadEnvStr $R0 "ProgramData"
  IfFileExists "$R0\PosGuard\lan_guard.ps1" languard_skip
  ; Bola server kompyuteri: uning o'z qo'riqchisi bor (advertise_mdns_windows.ps1), behuda UAC so'ralmaydi.
  IfFileExists "$R0\PosBola\*.*" languard_skip
  ExecShellWait "runas" "powershell.exe" '-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "$INSTDIR\resources\lan_guard_client_windows.ps1" -Install' SW_HIDE
  languard_skip:
!macroend
