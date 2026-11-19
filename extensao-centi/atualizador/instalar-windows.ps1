# INSTALA o atualizador da extensão Automação PCA neste Windows (só para este usuário, sem administrador). Rode UMA vez,
# pelo instalar-windows.bat, DENTRO da pasta da extensão. Depois a extensão se atualiza sozinha.
$ErrorActionPreference = 'Stop'
try {
  $aqui = $PSScriptRoot
  $pasta = Split-Path -Parent $aqui
  if (-not (Test-Path (Join-Path $pasta 'manifest.json'))) { throw 'Rode este instalador de dentro da pasta da extensão (atualizador\instalar-windows.bat).' }
  Get-ChildItem -Recurse -File $pasta | Unblock-File
  $nome = 'br.gov.governarv.pca_atualizador'
  $host_ = [ordered]@{
    name = $nome
    description = 'Atualizador da extensão Automação PCA'
    path = (Join-Path $aqui 'atualizador.bat')
    type = 'stdio'
    allowed_origins = @('chrome-extension://lhdooglmnecpbocibgfobaefahliicnn/')
  }
  $arquivo = Join-Path $aqui "$nome.json"
  [IO.File]::WriteAllText($arquivo, ($host_ | ConvertTo-Json), (New-Object Text.UTF8Encoding $false))
  # O Chrome (obrigatório) e o Edge (se der — nunca impede o do Chrome).
  function Registrar([string]$chave) {
    if (-not (Test-Path $chave)) { New-Item -Path $chave -Force | Out-Null }
    New-Item -Force -Path "$chave\$nome" -Value $arquivo | Out-Null
  }
  Registrar 'HKCU:\Software\Google\Chrome\NativeMessagingHosts'
  try { Registrar 'HKCU:\Software\Microsoft\Edge\NativeMessagingHosts' } catch {}
  Write-Host ''
  Write-Host 'Pronto! O atualizador da extensão Automação PCA está instalado.' -ForegroundColor Green
  Write-Host 'Volte ao Chrome e abra o ícone da extensão: "Atualização automática" deve aparecer como Ativa.'
  Write-Host 'Não mova nem apague esta pasta (a extensão é carregada dela).'
} catch {
  Write-Host ''
  Write-Host ('Não foi possível instalar: ' + $_.Exception.Message) -ForegroundColor Red
}
