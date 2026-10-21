param(
    [string]$Server,
    [string]$CredentialsPath = 'C:\CRENDENCIALES-SERVIDORES\CREDENCIALES.txt',
    [string]$IdentityFile = 'C:\CRENDENCIALES-SERVIDORES\CLAVE.pem',
    [ValidatePattern('^[a-zA-Z0-9_-]+$')]
    [string]$ServiceName = 'sigcompro-sigcompro-jej3vi',
    [ValidatePattern('^[a-zA-Z0-9_./-]+$')]
    [string]$Branch = 'main',
    [switch]$Push,
    [switch]$LabelsOnly,
    [ValidateRange(60, 7200)]
    [int]$TimeoutSeconds = 1800
)

$ErrorActionPreference = 'Stop'

if ($Push -and $LabelsOnly) {
    throw 'No combine -Push con -LabelsOnly.'
}
if (-not $Server) {
    $credentials = Get-Content -Raw -LiteralPath $CredentialsPath
    $connection = $credentials -split '\r?\n' | Where-Object { $_ -match '^\s*CONEXION POR SSH\s*:' } | Select-Object -First 1
    if ($connection -notmatch '([a-zA-Z0-9_.-]+@[a-zA-Z0-9_.-]+)') {
        throw 'No se encontro el destino SSH. Use -Server usuario@host.'
    }
    $Server = $Matches[1]
    $credentials = $null
}
if ($Server -notmatch '^[a-zA-Z0-9_.-]+@[a-zA-Z0-9_.-]+$') {
    throw 'Destino SSH invalido.'
}
if (-not (Test-Path -LiteralPath $IdentityFile -PathType Leaf)) {
    throw 'No se encontro la llave SSH. Use -IdentityFile.'
}

function Invoke-RemoteScript([string]$Script) {
    $encoded = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($Script.Replace("`r", '')))
    & ssh -i $IdentityFile -o BatchMode=yes -o ConnectTimeout=15 $Server "echo $encoded | base64 -d | bash"
    if ($LASTEXITCODE -ne 0) {
        throw "El comando remoto fallo (SSH: $LASTEXITCODE)."
    }
}

& git -C $PSScriptRoot diff --quiet
if ($LASTEXITCODE -ne 0 -and -not $LabelsOnly) {
    throw 'Hay cambios sin commit. Confirme los cambios que desea desplegar antes de ejecutar el script.'
}
if (-not $LabelsOnly) {
    $untracked = & git -C $PSScriptRoot ls-files --others --exclude-standard
    if ($LASTEXITCODE -ne 0 -or $untracked) {
        throw 'Hay archivos sin seguimiento. Revise y confirme los archivos antes de desplegar.'
    }
    & git -C $PSScriptRoot diff --cached --quiet
    if ($LASTEXITCODE -ne 0) { throw 'Hay cambios preparados sin commit.' }
    $currentBranch = & git -C $PSScriptRoot branch --show-current
    if ($LASTEXITCODE -ne 0 -or $currentBranch -ne $Branch) {
        throw "El repositorio local debe estar en la rama $Branch."
    }
    $revision = & git -C $PSScriptRoot rev-parse HEAD
    if ($LASTEXITCODE -ne 0) { throw 'No se pudo obtener el commit local.' }
    if ($Push) {
        & git -C $PSScriptRoot push origin $Branch
        if ($LASTEXITCODE -ne 0) { throw 'Fallo git push. No se desplegara.' }
    }
    $remoteRevision = & git -C $PSScriptRoot ls-remote --exit-code origin "refs/heads/$Branch"
    if ($LASTEXITCODE -ne 0 -or ($remoteRevision -split '\s+')[0] -ne $revision) {
        throw 'El commit local no coincide con Git remoto. Use -Push para publicarlo.'
    }

    $deployRemote = @'
set -euo pipefail
docker exec -i dokploy node <<'NODE'
const postgres = require('postgres');
const sql = postgres(process.env.DATABASE_URL, { max: 1 });
const serviceName = '__SERVICE__';
const revision = '__REVISION__';
const branch = '__BRANCH__';
const deadline = Date.now() + __TIMEOUT__ * 1000;
const { setTimeout: delay } = require('node:timers/promises');
async function main() {
    const [app] = await sql`SELECT "applicationId", "refreshToken", "owner", "repository", "branch", "sourceType", "autoDeploy", "buildType" FROM application WHERE "appName" = ${serviceName}`;
    if (!app || app.sourceType !== 'github' || app.owner !== 'Oscarhernandez2006' || app.repository !== 'SIGCOMPRO' || app.branch !== branch || app.buildType !== 'dockerfile' || !app.autoDeploy) {
        throw new Error('La aplicacion de Dokploy no coincide con el repositorio, rama o Dockerfile esperado.');
    }
    const active = await sql`SELECT "deploymentId" FROM deployment WHERE "applicationId" = ${app.applicationId} AND status::text IN ('running', 'queued')`;
    if (active.length) throw new Error('Ya existe un despliegue activo. Espere a que termine antes de reintentar.');
    const previous = await sql`SELECT "deploymentId" FROM deployment WHERE "applicationId" = ${app.applicationId}`;
    const known = new Set(previous.map(item => item.deploymentId));
    const response = await fetch('http://127.0.0.1:3000/api/deploy/' + encodeURIComponent(app.refreshToken), {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-github-event': 'push' },
        redirect: 'error',
        signal: AbortSignal.timeout(30000),
        body: JSON.stringify({ ref: 'refs/heads/' + branch, after: revision, head_commit: { id: revision, message: 'Deploy SIGCOMPRO ' + revision }, commits: [] })
    });
    if (!response.ok) throw new Error('Dokploy rechazo el despliegue: HTTP ' + response.status);
    console.log('Despliegue solicitado en Dokploy: ' + revision);
    let deploymentId;
    let lastStatus;
    while (Date.now() < deadline) {
        const rows = await sql`SELECT "deploymentId", status FROM deployment WHERE "applicationId" = ${app.applicationId} ORDER BY "createdAt" DESC LIMIT 1`;
        const current = rows[0];
        if (current && !known.has(current.deploymentId)) {
            if (deploymentId && current.deploymentId !== deploymentId) throw new Error('Otro despliegue reemplazo al solicitado. Revise Dokploy.');
            deploymentId = current.deploymentId;
            if (current.status !== lastStatus) console.log('Dokploy: ' + current.status + ' (' + deploymentId + ')');
            lastStatus = current.status;
            if (current.status === 'done') return;
            if (['error', 'cancelled', 'canceled'].includes(current.status)) throw new Error('El despliegue fallo. Revise el registro en Dokploy: ' + deploymentId);
        }
        await delay(5000);
    }
    throw new Error('Tiempo agotado esperando Dokploy. El despliegue puede seguir activo; revise el panel.');
}
main().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(() => sql.end());
NODE
'@
    $deployRemote = $deployRemote.Replace('__SERVICE__', $ServiceName).Replace('__REVISION__', $revision).Replace('__BRANCH__', $Branch).Replace('__TIMEOUT__', [string]$TimeoutSeconds)
    Invoke-RemoteScript $deployRemote
}

Write-Host "Aplicando labels a $ServiceName..."
$labels = Get-Content -Raw -LiteralPath (Join-Path $PSScriptRoot 'deploy.sh')
Invoke-RemoteScript "set -euo pipefail`nSERVICE_NAME='$ServiceName'`n$($labels.Replace('SERVICE_NAME="${1:-sigcompro-sigcompro-jej3vi}"', 'SERVICE_NAME="${SERVICE_NAME:?}"'))"
Invoke-RemoteScript @'
set -euo pipefail
curl --fail --silent --show-error --retry 12 --retry-delay 5 --retry-all-errors --max-time 20 --output /dev/null https://sigcompro.grupo-santacruz.com/
curl --fail --silent --show-error --retry 12 --retry-delay 5 --retry-all-errors --max-time 20 https://sigcompro.grupo-santacruz.com/api/health
printf '\nSIGCOMPRO disponible: https://sigcompro.grupo-santacruz.com\n'
'@