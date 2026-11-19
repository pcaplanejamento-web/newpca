#!/bin/sh
# INSTALADOR da extensão Automação PCA (Mac) — UM duplo clique, só para este usuário. Faz tudo o que o Chrome permite por
# fora: copia a extensão para uma pasta FIXA (~/Library/Application Support/Automacao PCA/extensao — limpar Downloads não a
# apaga), instala o ATUALIZADOR (a extensão passa a se atualizar sozinha), copia o caminho e abre a página de extensões.
# Bloqueado pelo Mac: Ajustes do Sistema → Privacidade e Segurança → Abrir Mesmo Assim (ou no Terminal: sh <este arquivo>).
# O "Carregar sem compactação" é do próprio Chrome (nenhum programa pode fazer por você) — uma vez por computador.
ID="lhdooglmnecpbocibgfobaefahliicnn"
ORIGEM="$(cd "$(dirname "$0")/.." && pwd)"
echo ""
echo "  Automação PCA — instalando a extensão"
echo ""
if [ ! -f "$ORIGEM/manifest.json" ]; then
  echo "  Não foi possível instalar: abra este instalador de dentro da pasta extraída da extensão (atualizador/instalar-mac.command)."
  exit 1
fi

# 1. A PASTA FIXA (rodando dela mesma = só atualiza o registro).
PASTA="$HOME/Library/Application Support/Automacao PCA/extensao"
mkdir -p "$PASTA"
if [ "$ORIGEM" != "$(cd "$PASTA" && pwd)" ]; then
  cp -R "$ORIGEM/." "$PASTA/" || { echo "  Não foi possível copiar a extensão para $PASTA."; exit 1; }
fi
xattr -dr com.apple.quarantine "$PASTA" 2>/dev/null
chmod +x "$PASTA/atualizador/atualizador.jxa" "$PASTA/atualizador/instalar-mac.command"
echo "  [ok] Extensão em: $PASTA"

# 2. O ATUALIZADOR: o manifesto do host (Chrome; o Edge também).
NOME="br.gov.governarv.pca_atualizador"
CAMINHO=$(printf '%s' "$PASTA/atualizador/atualizador.jxa" | sed 's/\\/\\\\/g; s/"/\\"/g')
for D in "$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts" \
         "$HOME/Library/Application Support/Microsoft Edge/NativeMessagingHosts"; do
  mkdir -p "$D" 2>/dev/null || continue
  cat > "$D/$NOME.json" <<JSON
{
  "name": "$NOME",
  "description": "Atualizador da extensão Automação PCA",
  "path": "$CAMINHO",
  "type": "stdio",
  "allowed_origins": ["chrome-extension://$ID/"]
}
JSON
done
echo "  [ok] Atualização automática instalada"

# 3. O CHROME: a extensão já está nele? (o id fica nas preferências de algum perfil)
JA_TEM=""
grep -qs "$ID" "$HOME/Library/Application Support/Google/Chrome/"*/"Secure Preferences" && JA_TEM=1
printf '%s' "$PASTA" | pbcopy 2>/dev/null
ABRIU=""
open -a "Google Chrome" "chrome://extensions/" 2>/dev/null && ABRIU=1

echo ""
echo "  Falta só no Chrome (uma vez):"
[ -z "$ABRIU" ] && echo "  - Abra o Chrome e digite na barra de endereço: chrome://extensions"
echo "  1. Ligue o \"Modo do desenvolvedor\" (canto superior direito)."
echo "  2. Toque em \"Carregar sem compactação\"."
echo "  3. Na janela, aperte Cmd+Shift+G, depois Cmd+V (o caminho já foi copiado) e Enter; depois \"Selecionar\"."
if [ -n "$JA_TEM" ]; then
  echo ""
  echo "  A extensão já estava no Chrome: carregar a pasta acima a substitui. Se a antiga continuar na lista, remova-a."
fi
echo ""
echo "  Caminho: $PASTA"
echo "  Pronto! Depois disso a extensão se atualiza sozinha. Não apague essa pasta."
