# ATUALIZADOR da extensão Automação PCA (Windows) — o host de "native messaging" que o Chrome abre a pedido da extensão.
# REGRA FIRME: ele NUNCA se atualiza nem roda nada do pacote. Só grava, na pasta da extensão, os arquivos da LISTA BRANCA
# (*.js, *.json e *.html da raiz e icone.png), depois de conferir o SHA-256, a MESMA "key" (o mesmo id da extensão) e uma
# versão MAIOR. A pasta "atualizador" nunca é tocada. Instalado UMA vez por instalar-windows.bat.
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression
$pasta = Split-Path -Parent $PSScriptRoot
$entrada = [Console]::OpenStandardInput()
$saida = [Console]::OpenStandardOutput()
$LIMITE = 20MB

function Ler-Bytes([int]$n) {
  $buf = New-Object byte[] $n
  $lidos = 0
  while ($lidos -lt $n) {
    $r = $entrada.Read($buf, $lidos, $n - $lidos)
    if ($r -le 0) { break }
    $lidos += $r
  }
  if ($lidos -lt $n) { throw 'Mensagem incompleta.' }
  return ,$buf
}
function Responder($obj) {
  $b = [Text.Encoding]::UTF8.GetBytes(($obj | ConvertTo-Json -Compress -Depth 4))
  $saida.Write([BitConverter]::GetBytes([int]$b.Length), 0, 4)
  $saida.Write($b, 0, $b.Length)
  $saida.Flush()
}
function Manifesto-Atual {
  return Get-Content -Raw -Encoding UTF8 (Join-Path $pasta 'manifest.json') | ConvertFrom-Json
}
function Nome-Permitido([string]$n) {
  return $n -ceq 'icone.png' -or $n -cmatch '^[a-z0-9][a-z0-9-]*\.(js|json|html)$'
}

function Atualizar($m) {
  $atual = Manifesto-Atual
  $zip = [Convert]::FromBase64String([string]$m.zip)
  $sha = [BitConverter]::ToString([Security.Cryptography.SHA256]::Create().ComputeHash($zip)).Replace('-', '').ToLower()
  if ($sha -ne ([string]$m.sha256).ToLower()) { throw 'O pacote chegou diferente do baixado (SHA-256).' }
  $fluxo = New-Object -TypeName IO.MemoryStream -ArgumentList (,$zip)
  $arquivo = New-Object -TypeName IO.Compression.ZipArchive -ArgumentList $fluxo, ([IO.Compression.ZipArchiveMode]::Read)
  $novos = @{}
  foreach ($e in $arquivo.Entries) {
    $n = $e.FullName
    if ($n -like 'atualizador/*') { continue }
    if ($n.EndsWith('/')) { continue }
    if ($n.Contains('..') -or $n.Contains('\') -or $n.Contains('/') -or -not (Nome-Permitido $n)) { throw "Arquivo fora da lista: $n" }
    $ms = New-Object IO.MemoryStream
    $s = $e.Open(); $s.CopyTo($ms); $s.Close()
    $novos[$n] = $ms.ToArray()
  }
  if (-not $novos.ContainsKey('manifest.json')) { throw 'O pacote não tem o manifest.json.' }
  $novo = [Text.Encoding]::UTF8.GetString($novos['manifest.json']) | ConvertFrom-Json
  if ([string]$novo.key -ne [string]$atual.key) { throw 'O pacote é de outra extensão (key diferente).' }
  if ([version][string]$novo.version -le [version][string]$atual.version) { throw "A versão $($novo.version) não é mais nova que a $($atual.version)." }
  if ([string]$novo.version -ne [string]$m.versao) { throw 'A versão do pacote não confere com a pedida.' }

  # A CÓPIA de segurança: os arquivos de agora, para voltar se algo falhar no meio.
  $anterior = Join-Path $PSScriptRoot 'anterior'
  if (Test-Path $anterior) { Remove-Item -Recurse -Force $anterior }
  New-Item -ItemType Directory -Path $anterior | Out-Null
  Get-ChildItem -File $pasta | Where-Object { Nome-Permitido $_.Name } | Copy-Item -Destination $anterior
  try {
    # O manifest.json por ÚLTIMO: até ele entrar, o Chrome segue vendo a versão de antes.
    foreach ($n in @(@($novos.Keys | Where-Object { $_ -ne 'manifest.json' }) + @('manifest.json'))) {
      $destino = Join-Path $pasta $n
      [IO.File]::WriteAllBytes("$destino.novo", $novos[$n])
      Move-Item -Force "$destino.novo" $destino
    }
  } catch {
    Get-ChildItem -File $anterior | Copy-Item -Destination $pasta -Force
    Get-ChildItem -File $pasta -Filter '*.novo' | Remove-Item -Force
    throw
  }
  return @{ ok = $true; versao = [string]$novo.version }
}

try {
  $tam = [BitConverter]::ToInt32((Ler-Bytes 4), 0)
  if ($tam -le 0 -or $tam -gt $LIMITE) { throw 'Mensagem de tamanho inválido.' }
  $texto = [Text.Encoding]::UTF8.GetString((Ler-Bytes $tam))
  # O .zip (base64) sai ANTES do ConvertFrom-Json: no PowerShell 5.1 ele recusa textos acima de ~2 MB.
  $zip64 = ''
  # (o "/" do base64 pode vir escapado como "\/" no JSON)
  $achado = [regex]::Match($texto, '"zip"\s*:\s*"([A-Za-z0-9+/=\\]*)"')
  if ($achado.Success) {
    $zip64 = $achado.Groups[1].Value.Replace('\/', '/')
    $texto = $texto.Remove($achado.Groups[1].Index, $achado.Groups[1].Length)
  }
  $m = $texto | ConvertFrom-Json
  $m | Add-Member -Force -NotePropertyName zip -NotePropertyValue $zip64
  if ($m.acao -eq 'versao') { Responder @{ ok = $true; versao = [string](Manifesto-Atual).version; pasta = $pasta } }
  elseif ($m.acao -eq 'atualizar') { Responder (Atualizar $m) }
  else { Responder @{ ok = $false; erro = 'Pedido desconhecido.' } }
} catch {
  Responder @{ ok = $false; erro = [string]$_.Exception.Message }
}
