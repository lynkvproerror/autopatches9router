Set WshShell = CreateObject("WScript.Shell")
WshShell.Run "powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -File ""C:\Users\Linh\AppData\Roaming\9router\daemon\monitor_task.ps1""", 0, False
