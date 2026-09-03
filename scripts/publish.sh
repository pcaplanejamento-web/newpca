#!/usr/bin/env bash
# Publica o sistema PCA na Cloudflare (Workers + D1).
# Rode no SEU Terminal (não dentro do Claude Code):  bash scripts/publish.sh
set -euo pipefail

cd "$(dirname "$0")/.."
DB_NAME="newpca-db"
PLACEHOLDER="00000000-0000-0000-0000-000000000000"

echo "==> 1/5 Verificando login na Cloudflare..."
if ! npx wrangler whoami >/dev/null 2>&1; then
  echo "   Você não está logado. Rode:  npx wrangler login   e tente de novo."
  exit 1
fi

echo "==> 2/5 Garantindo o banco D1 '$DB_NAME'..."
if grep -q "$PLACEHOLDER" wrangler.jsonc; then
  # tenta criar; se já existir, pega o id da listagem
  ID="$(npx wrangler d1 create "$DB_NAME" 2>/dev/null \
        | grep -oiE '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' | head -1 || true)"
  if [ -z "${ID:-}" ]; then
    echo "   (banco já existe — buscando o id)"
    ID="$(npx wrangler d1 list --json 2>/dev/null \
          | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const a=JSON.parse(s);const m=a.find(x=>x.name==="'"$DB_NAME"'");if(m)process.stdout.write(m.uuid||m.database_id||m.id||"")}catch(e){}})' || true)"
  fi
  if [ -z "${ID:-}" ]; then
    echo "   Não consegui obter o database_id automaticamente."
    echo "   Rode 'npx wrangler d1 list', copie o id de '$DB_NAME' e cole no wrangler.jsonc."
    exit 1
  fi
  node -e 'const fs=require("fs");const f="wrangler.jsonc";let t=fs.readFileSync(f,"utf8");t=t.replace("'"$PLACEHOLDER"'","'"$ID"'");fs.writeFileSync(f,t)'
  echo "   database_id definido: $ID"
else
  echo "   database_id já configurado no wrangler.jsonc."
fi

echo "==> 3/5 Aplicando migrações no D1 remoto..."
npx wrangler d1 migrations apply "$DB_NAME" --remote

echo "==> 4/5 Build (OpenNext) + deploy..."
npm run deploy

echo "==> 5/5 Pronto! A URL do site aparece acima (formato: https://newpca.<seu-subdominio>.workers.dev)."
