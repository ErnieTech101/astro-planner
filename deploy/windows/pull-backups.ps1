<#
  Astro Imaging Planner: copy new server backups to this PC.

  Asks the server which nightly backup bundles exist and downloads any this PC
  doesn't have yet. Uses your SSH key login (see the Administrator's Guide, "Backups").
  Keeps a log, pull-log.txt, in the backup folder.

  Run by hand:   powershell -ExecutionPolicy Bypass -File pull-backups.ps1
  Run nightly:   install-pull-task.ps1 sets that up once.
#>
param(
  [string]$Server    = "astro-planner.ernietech.net",
  [string]$User      = "dave",
  [string]$RemoteDir = "/var/backups/astro-planner",
  [string]$LocalDir  = (Join-Path ([Environment]::GetFolderPath("MyDocuments")) "Astro Planner Backups"),
  [int]$KeepDays     = 365
)

New-Item -ItemType Directory -Force -Path $LocalDir | Out-Null
$log = Join-Path $LocalDir "pull-log.txt"
function Log([string]$msg) {
  $line = "{0:yyyy-MM-dd HH:mm:ss}  {1}" -f (Get-Date), $msg
  Add-Content -Path $log -Value $line
  Write-Host $line
}
$opts = @("-o", "BatchMode=yes", "-o", "ConnectTimeout=20")

# 1. Which bundles are on the server?
$remote = & ssh.exe @opts "$User@$Server" "ls -1 $RemoteDir | grep '^planner-.*\.tar\.gz$' || true"
if ($LASTEXITCODE -ne 0) {
  Log "FAILED: could not reach $Server over SSH (exit code $LASTEXITCODE). Is the PC online and the SSH key set up?"
  exit 1
}
$remote = @($remote | Where-Object { $_ -match '^planner-\d{4}-\d{2}-\d{2}\.tar\.gz$' } | Sort-Object)
if ($remote.Count -eq 0) {
  Log "WARNING: the server has no backups in $RemoteDir. Check the nightly backup job."
  exit 1
}

# 2. Download the ones this PC doesn't have.
$copied = 0
foreach ($name in $remote) {
  $target = Join-Path $LocalDir $name
  if (Test-Path $target) { continue }
  $part = "$target.part"
  & scp.exe @opts -q "${User}@${Server}:$RemoteDir/$name" "$part"
  if ($LASTEXITCODE -eq 0 -and (Test-Path $part) -and (Get-Item $part).Length -gt 0) {
    Move-Item -Force $part $target
    $copied++
  } else {
    Remove-Item -ErrorAction SilentlyContinue $part
    Log "FAILED to copy $name (exit code $LASTEXITCODE)"
  }
}

# 3. Remove local copies older than KeepDays (by the date in the file name).
$cutoff = (Get-Date).Date.AddDays(-$KeepDays)
$removed = 0
Get-ChildItem $LocalDir -Filter "planner-*.tar.gz" | ForEach-Object {
  if ($_.Name -match '^planner-(\d{4}-\d{2}-\d{2})\.tar\.gz$') {
    if ([datetime]::ParseExact($Matches[1], "yyyy-MM-dd", $null) -lt $cutoff) { Remove-Item $_.FullName; $removed++ }
  }
}

# 4. Report, and warn if the server's backups have gone stale.
$newest = $remote[-1]
$newestDate = [datetime]::ParseExact($newest.Substring(8, 10), "yyyy-MM-dd", $null)
$age = ((Get-Date).Date - $newestDate).Days
$here = @(Get-ChildItem $LocalDir -Filter "planner-*.tar.gz").Count
Log "OK: copied $copied new, removed $removed old, $here on this PC. Newest: $newest."
if ($age -gt 2) {
  Log "WARNING: the newest server backup is $age days old. The nightly backup may have stopped."
  exit 1
}
exit 0
