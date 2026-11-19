#!/bin/sh
# INSTALA o atualizador da extensão Automação PCA neste Mac (só para este usuário). Abra UMA vez com dois cliques (ou botão
# direito → Abrir), DENTRO da pasta da extensão. Depois a extensão se atualiza sozinha.
AQUI="$(cd "$(dirname "$0")" && pwd)"
PASTA="$(dirname "$AQUI")"
if [ ! -f "$PASTA/manifest.json" ]; then
  echo "Abra este instalador de dentro da pasta da extensão (atualizador/instalar-mac.command)."
  exit 1
fi
xattr -dr com.apple.quarantine "$PASTA" 2>/dev/null
chmod +x "$AQUI/atualizador.jxa" "$AQUI/instalar-mac.command"
NOME="br.gov.governarv.pca_atualizador"
CAMINHO=$(printf '%s' "$AQUI/atualizador.jxa" | sed 's/\\/\\\\/g; s/"/\\"/g')
for D in "$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts" \
         "$HOME/Library/Application Support/Microsoft Edge/NativeMessagingHosts"; do
  mkdir -p "$D"
  cat > "$D/$NOME.json" <<JSON
{
  "name": "$NOME",
  "description": "Atualizador da extensão Automação PCA",
  "path": "$CAMINHO",
  "type": "stdio",
  "allowed_origins": ["chrome-extension://lhdooglmnecpbocibgfobaefahliicnn/"]
}
JSON
done
echo ""
echo "Pronto! O atualizador da extensão Automação PCA está instalado."
echo "Volte ao Chrome e abra o ícone da extensão: \"Atualização automática\" deve aparecer como Ativa."
echo "Não mova nem apague esta pasta (a extensão é carregada dela)."
