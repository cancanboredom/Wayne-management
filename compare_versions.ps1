$dir1 = "/Users/cancaneus_/Desktop/Wayne-management-main/Oat_version_21_12/Wayne-management-main"
$dir2 = "/Users/cancaneus_/Desktop/Wayne-management-main"

$ignoreList = @('node_modules', '.git', 'dist', 'Oat_version_21_12', 'Oat version 18.33', 'logic from claude', '.idea', '.vscode', 'wayne_duty.db', '.gemini', 'package-lock.json')

function Get-Files {
    param($dir, $relativePath = "")
    $results = @()
    if (!(Test-Path $dir)) { return $results }
    $items = Get-ChildItem -Path $dir -Force
    foreach ($item in $items) {
        if ($ignoreList -contains $item.Name -or $item.Name.EndsWith('.zip') -or $item.Name -eq 'compare_versions.ps1' -or $item.Name -eq 'compare_versions.js' -or $item.Name -eq 'comparison_report.md') {
            continue
        }
        $fullPath = $item.FullName
        if ($relativePath -eq "") {
            $relPath = $item.Name
        } else {
            $relPath = Join-Path $relativePath $item.Name
        }
        if ($item.PSIsContainer) {
            $results += Get-Files $fullPath $relPath
        } else {
            $results += $relPath
        }
    }
    return $results
}

$files1 = Get-Files $dir1
$files2 = Get-Files $dir2

$allFiles = $files1 + $files2 | Select-Object -Unique

$differences = @()

foreach ($file in $allFiles) {
    if ($file -match 'compare_versions' -or $file -match 'comparison_report') { continue }

    $path1 = Join-Path $dir1 $file
    $path2 = Join-Path $dir2 $file

    $exists1 = Test-Path $path1
    $exists2 = Test-Path $path2

    if ($exists1 -and -not $exists2) {
        $differences += [PSCustomObject]@{ File = $file; Status = 'Only in Oat 21.12 (Deleted in Mine)' }
    } elseif (-not $exists1 -and $exists2) {
        $differences += [PSCustomObject]@{ File = $file; Status = 'Only in Mine (New)' }
    } else {
        $hash1 = (Get-FileHash $path1 -Algorithm SHA256).Hash
        $hash2 = (Get-FileHash $path2 -Algorithm SHA256).Hash
        if ($hash1 -ne $hash2) {
            $differences += [PSCustomObject]@{ File = $file; Status = 'Modified' }
        }
    }
}

Write-Host "| File | Status |"
Write-Host "|---|---|"
foreach ($diff in $differences) {
    $fileFormatted = $diff.File -replace '\\', '/'
    Write-Host "| $fileFormatted | $($diff.Status) |"
}
