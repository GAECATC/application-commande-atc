$ErrorActionPreference = "Stop"

$root = Resolve-Path "$PSScriptRoot\.."
$outDir = Join-Path $root "deploy"
$stage = Join-Path $outDir "application-commande-atc"
$zip = Join-Path $outDir "application-commande-atc-infomaniak.zip"

if (Test-Path $stage) {
  Remove-Item -LiteralPath $stage -Recurse -Force
}
New-Item -ItemType Directory -Path $stage | Out-Null
New-Item -ItemType Directory -Path $outDir -Force | Out-Null

$items = @(
  ".env.example",
  "eslint.config.mjs",
  "jsconfig.json",
  "lib",
  "next.config.js",
  "package-lock.json",
  "package.json",
  "pages",
  "public",
  "styles",
  "supabase",
  "data\seed.json",
  "README.md"
)

foreach ($item in $items) {
  $source = Join-Path $root $item
  if (!(Test-Path $source)) {
    continue
  }
  $destination = Join-Path $stage $item
  $destinationParent = Split-Path $destination -Parent
  New-Item -ItemType Directory -Path $destinationParent -Force | Out-Null
  Copy-Item -LiteralPath $source -Destination $destination -Recurse -Force
}

if (Test-Path $zip) {
  Remove-Item -LiteralPath $zip -Force
}

Compress-Archive -Path (Join-Path $stage "*") -DestinationPath $zip -Force
Write-Host "Archive creee: $zip"
