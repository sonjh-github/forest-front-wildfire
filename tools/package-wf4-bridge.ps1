$ErrorActionPreference = 'Stop'
$repoPath = Split-Path -Parent $PSScriptRoot
$bridgePath = Join-Path $PSScriptRoot 'wf4-bridge'
# Keep runtime logs and local files out of the public download.
$entries = @('index.cjs', 'server.cjs', 'package.json', 'README.md', 'start.cmd', 'start.sh', 'lib', 'test')
$sources = foreach ($entry in $entries) { Join-Path $bridgePath $entry }
Compress-Archive -LiteralPath $sources -DestinationPath (Join-Path $repoPath 'public\wf4-bridge.zip') -Force
Write-Output 'Saved public/wf4-bridge.zip'
