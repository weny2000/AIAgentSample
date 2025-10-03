# Make deployment scripts executable on Windows
Write-Host "Making deployment scripts executable..."

$scripts = @(
    "scripts/deploy-infrastructure.sh",
    "scripts/deploy-backend.sh", 
    "scripts/deploy-frontend.sh",
    "scripts/rollback.sh"
)

foreach ($script in $scripts) {
    if (Test-Path $script) {
        Write-Host "Setting executable permissions for $script"
        # On Windows, we'll ensure the files have proper line endings and are marked as executable
        $content = Get-Content $script -Raw
        $content = $content -replace "`r`n", "`n"  # Convert to Unix line endings
        Set-Content $script -Value $content -NoNewline
        
        # Create a .cmd wrapper for Windows
        $cmdFile = $script -replace "\.sh$", ".cmd"
        $bashCommand = "bash `"$script`" %*"
        Set-Content $cmdFile -Value $bashCommand
        Write-Host "Created Windows wrapper: $cmdFile"
    }
}

Write-Host "Deployment scripts are now executable!"