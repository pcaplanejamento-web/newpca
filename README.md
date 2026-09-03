# PCA Rio Verde — Sistema de Visualização

Sistema em **Next.js** para importar e visualizar o **Plano de Contratações Anual (PCA)** da
Prefeitura de Rio Verde. Roda na **Cloudflare** (Workers) com banco **D1** (SQLite).

- Importa a planilha `.xlsx` do PCA (lida no navegador), normaliza os dados e grava no D1.
- Dashboard com KPIs, gráficos (classificação, cronograma mensal, unidades de medida, top itens)
  e uma consulta de itens com busca, filtro, ordenação e paginação.
- **Multi-unidade**: cada planilha importada é uma unidade (identificada pelo `Código`). Reimportar
  o mesmo código substitui os itens daquela unidade.

## Stack

- Next.js 16 (App Router) + React 19 + Tailwind CSS 4
- Cloudflare Workers via [`@opennextjs/cloudflare`](https://opennext.js.org/cloudflare) (OpenNext)
- Cloudflare **D1** (SQLite) + **Drizzle ORM**
- Recharts (gráficos), SheetJS (leitura do `.xlsx` no cliente), Zod (validação)

## Pré-requisitos

- Node.js 20+ (recomendado 22/24)
- Conta na Cloudflare + login no wrangler: `npx wrangler login`

## Rodando localmente

```bash
npm install
```

Crie o banco D1 e cole o `database_id` no `wrangler.jsonc` (substituindo o placeholder):

```bash
npx wrangler d1 create newpca-db
```

Aplique a migração no banco **local** e suba o dev server:

```bash
npm run db:migrate:local
npm run dev
```

Abra http://localhost:3000 → **Importar Planilha** → envie `PCA_ID_50.xlsx`.
Volte ao dashboard para ver os indicadores.

> `npm run dev` usa o D1 **local** (em `.wrangler/state`). O D1 remoto (produção) é separado.

## Deploy (Cloudflare)

1. Aplique a migração no banco **remoto** (produção):

   ```bash
   npm run db:migrate:remote
   ```

2. Faça o deploy:

   ```bash
   npm run deploy
   ```

   (equivale a `opennextjs-cloudflare build && opennextjs-cloudflare deploy`)

### Deploy automático via GitHub (opcional)

No painel da Cloudflare: **Workers & Pages → seu Worker → Settings → Builds → Connect** e escolha o
repositório do GitHub. Configure:

- **Build command:** `npx opennextjs-cloudflare build`
- **Deploy command:** `npx wrangler deploy`

> O nome do Worker no painel deve ser igual ao `name` do `wrangler.jsonc` (`newpca`).
> O Workers Builds **não** roda migrações — rode `npm run db:migrate:remote` sempre que o schema mudar.

## Prévia local no runtime real da Cloudflare (workerd)

```bash
npm run preview
```

Compila com o OpenNext e roda no `workerd` (mais fiel à produção que o `next dev`).

## Alterando o schema do banco

1. Edite `src/db/schema.ts`.
2. Gere a migração: `npm run db:generate` (drizzle-kit cria um novo arquivo em `drizzle/`).
3. Aplique em local e remoto: `npm run db:migrate:local` e `npm run db:migrate:remote`.

> As migrações em `drizzle/` também são aplicadas pelo `wrangler d1 migrations apply`. A primeira
> migração (`0000_init.sql`) já está incluída.

## Estrutura

```
src/
  app/
    page.tsx              Dashboard (Server Component, force-dynamic)
    upload/page.tsx       Importação da planilha
    api/upload/route.ts   Ingestão: valida (zod) → normaliza → grava no D1 (batch atômico)
    api/itens/route.ts    Consulta paginada de itens (tabela)
  components/             AppShell, KPIs, gráficos (Recharts), tabela, upload
  lib/
    parse-xlsx.ts         Lê o .xlsx no navegador (SheetJS)
    normalize.ts          Normaliza classificação/unidade/data/valores
    queries.ts            Agregações do dashboard (Drizzle)
    db.ts                 Handle Drizzle sobre o D1 (getCloudflareContext)
    format.ts             Formatação pt-BR (R$, datas)
  db/schema.ts            Tabelas `unidades` e `itens` (Drizzle)
drizzle/0000_init.sql     Migração inicial do D1
wrangler.jsonc            Config do Worker + binding do D1
```

## Formato da planilha

Aba `Pca`, com cabeçalho contendo `Código` e `Município`, e uma linha de títulos com:
`Id Produto`, `Sequencial`, `Nome do Produto`, `Unidade Medida`, `Quantidade`,
`Valor Referência`, `Classificação`, `Data desejada`. As linhas de produto vêm em seguida.

O acesso é **aberto** (sem login) nesta versão — qualquer um pode ver e importar.
