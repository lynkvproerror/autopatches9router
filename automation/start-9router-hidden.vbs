Option Explicit

Dim FileSystem, WshShell, AutomationRoot, ControlScript, MonitorStateFile, LogDir, LogFile
Dim PowerShellPath, MaxAttempts, Attempt, LaunchExit, HealthExit, ErrorCode

Set FileSystem = CreateObject("Scripting.FileSystemObject")
Set WshShell = CreateObject("WScript.Shell")
AutomationRoot = FileSystem.GetParentFolderName(WScript.ScriptFullName)
ControlScript = FileSystem.BuildPath(AutomationRoot, "9router-control.ps1")
MonitorStateFile = FileSystem.BuildPath(FileSystem.BuildPath(AutomationRoot, "state"), "central-monitor.json")
LogDir = FileSystem.BuildPath(AutomationRoot, "logs")
LogFile = FileSystem.BuildPath(LogDir, "startup-launch.log")
PowerShellPath = WshShell.ExpandEnvironmentStrings("%ProgramFiles%") & "\PowerShell\7\pwsh.exe"
If Not FileSystem.FileExists(PowerShellPath) Then PowerShellPath = "pwsh.exe"

MaxAttempts = 60

Sub WriteStartupLog(Message)
    Dim Stream
    On Error Resume Next
    If Not FileSystem.FolderExists(LogDir) Then FileSystem.CreateFolder(LogDir)
    Set Stream = FileSystem.OpenTextFile(LogFile, 8, True, -1)
    If Err.Number = 0 Then
        Stream.WriteLine "[" & Now & "] " & Message
        Stream.Close
    End If
    Err.Clear
    On Error GoTo 0
End Sub

Function ControlCommand(ActionName)
    ControlCommand = """" & PowerShellPath & """ -NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -File """ & ControlScript & """ -Action " & ActionName
End Function

Function MonitorHeartbeatFresh()
    Dim StateFile, AgeSeconds
    MonitorHeartbeatFresh = False
    If Not FileSystem.FileExists(MonitorStateFile) Then Exit Function
    On Error Resume Next
    Set StateFile = FileSystem.GetFile(MonitorStateFile)
    AgeSeconds = DateDiff("s", StateFile.DateLastModified, Now)
    If Err.Number = 0 And AgeSeconds >= 0 And AgeSeconds <= 45 Then MonitorHeartbeatFresh = True
    Err.Clear
    On Error GoTo 0
End Function

For Attempt = 1 To MaxAttempts
    If FileSystem.FileExists(ControlScript) Then
        WriteStartupLog "Attempt " & Attempt & ": launching central monitor."
        On Error Resume Next
        LaunchExit = WshShell.Run(ControlCommand("Monitor"), 0, False)
        ErrorCode = Err.Number
        Err.Clear
        On Error GoTo 0

        If ErrorCode = 0 Then
            WScript.Sleep 5000
            On Error Resume Next
            HealthExit = WshShell.Run(ControlCommand("EnsureRunning"), 0, True)
            ErrorCode = Err.Number
            Err.Clear
            On Error GoTo 0
            If ErrorCode = 0 And HealthExit = 0 And MonitorHeartbeatFresh() Then
                WriteStartupLog "9router API and dashboard are healthy; monitor bootstrap succeeded."
                WScript.Quit 0
            End If
            WriteStartupLog "Attempt " & Attempt & ": API is not healthy yet; retrying."
        Else
            WriteStartupLog "Attempt " & Attempt & ": monitor launch failed with VBScript error " & ErrorCode & "."
            WScript.Sleep 5000
        End If
    Else
        WriteStartupLog "Attempt " & Attempt & ": controller is not available at " & ControlScript & "."
        WScript.Sleep 5000
    End If
Next

WriteStartupLog "Startup failed after " & MaxAttempts & " attempts."
WScript.Quit 1
