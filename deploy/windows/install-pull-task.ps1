<#
  Astro Imaging Planner: set up the nightly backup pull on this PC (run once).

  Creates a Windows scheduled task, "Astro Planner Backup Pull", that runs
  pull-backups.ps1 every day. If the PC is off or asleep at that time, it runs
  as soon as the PC is next on.

  Keep this folder where it is: the task runs pull-backups.ps1 from here.

  Run:     powershell -ExecutionPolicy Bypass -File install-pull-task.ps1
  Remove:  Unregister-ScheduledTask -TaskName "Astro Planner Backup Pull"
#>
param([string]$At = "7:30AM")

$script = Join-Path $PSScriptRoot "pull-backups.ps1"
if (-not (Test-Path $script)) { Write-Error "pull-backups.ps1 must be in the same folder as this script."; exit 1 }

$action   = New-ScheduledTaskAction -Execute "powershell.exe" `
              -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$script`""
$trigger  = New-ScheduledTaskTrigger -Daily -At $At
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -RunOnlyIfNetworkAvailable `
              -ExecutionTimeLimit (New-TimeSpan -Minutes 30)
Register-ScheduledTask -TaskName "Astro Planner Backup Pull" -Action $action -Trigger $trigger `
  -Settings $settings -Description "Copies new Astro Imaging Planner backups from the server." -Force | Out-Null

Write-Host "Scheduled: 'Astro Planner Backup Pull' runs daily at $At (or at next start-up if missed)."
Write-Host "Test it now:  Start-ScheduledTask -TaskName 'Astro Planner Backup Pull'"
