$ErrorActionPreference = 'Stop'
$vswhere = "${env:ProgramFiles(x86)}\Microsoft Visual Studio\Installer\vswhere.exe"
$installation = & $vswhere -latest -products '*' -property installationPath
if (!$installation) { throw 'Visual Studio redistributable location not found' }
$candidates = Get-ChildItem (Join-Path $installation 'VC\Redist\MSVC') -Recurse -Filter msvcp140.dll |
  Where-Object { $_.FullName -match '\\x64\\Microsoft\.VC\d+\.CRT\\msvcp140.dll$' } |
  Sort-Object FullName -Descending
$crt = $candidates | Where-Object { Test-Path (Join-Path $_.DirectoryName 'msvcp140_codecvt_ids.dll') } | Select-Object -First 1
if (!$crt) { throw 'Required x64 redistributable CRT (including codecvt_ids) not found' }
foreach ($kind in @('cpu','vulkan','llama','llama-vulkan','vc-runtime')) {
  $destination = Join-Path $PSScriptRoot "..\runtimes\$kind"
  New-Item -ItemType Directory -Force -Path $destination | Out-Null
  Get-ChildItem $crt.DirectoryName -Filter '*.dll' | Copy-Item -Destination $destination
}
Get-ChildItem $crt.DirectoryName -Filter '*.dll' | ForEach-Object {
  [PSCustomObject]@{ name=$_.Name; version=$_.VersionInfo.FileVersion; sha256=(Get-FileHash $_.FullName -Algorithm SHA256).Hash }
} | ConvertTo-Json | Set-Content (Join-Path $PSScriptRoot '..\runtimes\VC_RUNTIME_METADATA.json')
Write-Host 'Bundled app-local x64 VC redistributable DLLs from licensed SDK Redist folder.'
