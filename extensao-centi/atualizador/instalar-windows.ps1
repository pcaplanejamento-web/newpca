# INSTALADOR da extensão Automação PCA (Windows) — UM duplo clique em instalar-windows.bat, só para este usuário, sem
# administrador. Faz tudo o que o Chrome permite fazer por fora:
#   1. copia a extensão para uma pasta FIXA (%LOCALAPPDATA%\Automacao PCA\extensao) — limpar Downloads não a apaga;
#   2. instala o ATUALIZADOR (a extensão passa a se atualizar sozinha);
#   3. copia o caminho da pasta e abre a página de extensões do Chrome.
# O "Carregar sem compactação" é do próprio Chrome (nenhum programa pode fazer por você) — uma vez por computador.
$ErrorActionPreference = 'Stop'
$ID = 'lhdooglmnecpbocibgfobaefahliicnn'
function Passo([string]$t) { Write-Host "  $t" }
try {
  Write-Host ''
  Write-Host '  Automação PCA — instalando a extensão' -ForegroundColor Cyan
  Write-Host ''
  $origem = Split-Path -Parent $PSScriptRoot
  if (-not (Test-Path (Join-Path $origem 'manifest.json'))) { throw 'Rode este instalador de dentro da pasta extraída da extensão (atualizador\instalar-windows.bat).' }

  # 1. A PASTA FIXA (rodando dela mesma = só atualiza o registro).
  $pasta = Join-Path $env:LOCALAPPDATA 'Automacao PCA\extensao'
  if ((Resolve-Path $origem).Path.TrimEnd('\') -ne $pasta.TrimEnd('\')) {
    New-Item -ItemType Directory -Force -Path $pasta | Out-Null
    Copy-Item -Path (Join-Path $origem '*') -Destination $pasta -Recurse -Force
  }
  Get-ChildItem -Recurse -File $pasta | Unblock-File
  Passo "[ok] Extensão em: $pasta"

  # 2. O ATUALIZADOR: o manifesto do host + o registro (Chrome; o Edge se der).
  $aqui = Join-Path $pasta 'atualizador'
  $nome = 'br.gov.governarv.pca_atualizador'
  $host_ = [ordered]@{
    name = $nome
    description = 'Atualizador da extensão Automação PCA'
    path = (Join-Path $aqui 'atualizador.bat')
    type = 'stdio'
    allowed_origins = @("chrome-extension://$ID/")
  }
  $arquivo = Join-Path $aqui "$nome.json"
  [IO.File]::WriteAllText($arquivo, ($host_ | ConvertTo-Json), (New-Object Text.UTF8Encoding $false))
  function Registrar([string]$chave) {
    if (-not (Test-Path $chave)) { New-Item -Path $chave -Force | Out-Null }
    New-Item -Force -Path "$chave\$nome" -Value $arquivo | Out-Null
  }
  Registrar 'HKCU:\Software\Google\Chrome\NativeMessagingHosts'
  try { Registrar 'HKCU:\Software\Microsoft\Edge\NativeMessagingHosts' } catch {}
  Passo '[ok] Atualização automática instalada'

  # 3. O CHROME: a extensão já está nele? (o id fica nas preferências de algum perfil)
  $perfis = Join-Path $env:LOCALAPPDATA 'Google\Chrome\User Data'
  $jaTem = $false
  if (Test-Path $perfis) {
    $jaTem = [bool](Get-ChildItem -Path $perfis -Filter 'Secure Preferences' -Recurse -Depth 1 -ErrorAction SilentlyContinue |
      Select-String -SimpleMatch $ID -List -ErrorAction SilentlyContinue)
  }
  try { Set-Clipboard -Value $pasta } catch {}
  $chrome = @(
    (Get-ItemProperty 'HKCU:\Software\Microsoft\Windows\CurrentVersion\App Paths\chrome.exe' -ErrorAction SilentlyContinue).'(default)',
    (Get-ItemProperty 'HKLM:\Software\Microsoft\Windows\CurrentVersion\App Paths\chrome.exe' -ErrorAction SilentlyContinue).'(default)',
    "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
    "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
    "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe"
  ) | Where-Object { $_ -and (Test-Path $_) } | Select-Object -First 1
  $abriu = $false
  if ($chrome) { try { Start-Process -FilePath $chrome -ArgumentList 'chrome://extensions/'; $abriu = $true } catch {} }

  Write-Host ''
  Write-Host '  Falta só no Chrome (uma vez):' -ForegroundColor Green
  if (-not $abriu) { Passo '- Abra o Chrome e digite na barra de endereço: chrome://extensions' }
  Passo '1. Ligue o "Modo do desenvolvedor" (canto superior direito).'
  Passo '2. Toque em "Carregar sem compactação".'
  Passo '3. Na janela, clique na barra de endereço, aperte Ctrl+V (o caminho já foi copiado) e Enter; depois "Selecionar pasta".'
  if ($jaTem) {
    Write-Host ''
    Passo 'A extensão já estava no Chrome: carregar a pasta acima a substitui. Se a antiga continuar na lista, remova-a.'
  }
  Write-Host ''
  Passo "Caminho: $pasta"
  Passo 'Pronto! Depois disso a extensão se atualiza sozinha. Não apague essa pasta.'
} catch {
  Write-Host ''
  Write-Host ('  Não foi possível instalar: ' + $_.Exception.Message) -ForegroundColor Red
}
