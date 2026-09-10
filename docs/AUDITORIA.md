# Auditoria da Plataforma PCA — 10/09/2026

Auditoria completa e honesta do estado atual, do que o plano técnico (PDF enviado pela equipe) prevê, e do que precisa ser feito. Escrita para ser lida de ponta a ponta.

---

## 1. Status atual — CRÍTICO 🔴

| Item | Estado |
|---|---|
| Site em produção (`newpca.jhoneduardorioverde.workers.dev`) | **FORA DO AR** — todas as rotas retornam 404 (erro Cloudflare 1042) |
| Pipeline de deploy (GitHub Actions) | **BLOQUEADO** — o secret `CLOUDFLARE_API_TOKEN` está inválido |
| Código no GitHub | OK, íntegro (`main` @ `d2f4ab9`) |

**Diagnóstico:** o código não mudou desde o último deploy verdadeiro (03/09, que ficou no ar respondendo 200). O site caiu **sem alteração de código** → causa é de infraestrutura/conta: o Worker/rota foi removido ou desativado. E o log do Actions mostra `wrangler` reportando *"não está logado"* mesmo com o secret presente → **o token de deploy foi revogado** (provavelmente junto com os tokens que você revogou por segurança).

**Para restaurar:** é preciso um **token novo** da Cloudflare no secret (única ação que depende de você — ver §8). Com ele, um novo deploy recria o Worker e o site volta.

---

## 2. O que EXISTE hoje (implementado e funcional em código)

Arquitetura: **Next.js 16 + Cloudflare Workers (OpenNext) + D1 (Drizzle)**. 100% orientado a componentes.

- **Importação de planilha `.xlsx`**: parsing no navegador (`src/lib/parse-xlsx.ts`), normalização no servidor (`src/lib/normalize.ts`), gravação no D1 (`src/app/api/upload/route.ts`).
- **Dashboard** (`src/app/page.tsx`): KPIs, gráficos (classificação, cronograma, unidades de medida, top itens), consulta de itens com busca/filtro/ordenação/paginação.
- **Deploy automático** via GitHub Actions (`.github/workflows/deploy.yml` + `scripts/publish.sh`).

> Em termos do plano, isso equivale a uma fração da **Fase 5** (importar a planilha). O **núcleo da plataforma (Fases 1–4) ainda não existe.**

---

## 3. Auditoria do que foi pedido: Integrações · Login · Cadastro · Integração de usuário

**Conclusão honesta: nenhum desses módulos existe no código.** Não há o que "corrigir/limpar" — eles precisam ser **construídos** conforme o plano.

| Área pedida | Estado | O que o plano exige |
|---|---|---|
| **Login** | ❌ 0% | Auth.js (NextAuth v5) + adaptador D1, sessão em cookie, middleware de proteção de rotas |
| **Cadastro de usuário** | ❌ 0% | Registro/convite, perfis, primeiro-acesso, definição de senha |
| **Integração/gestão de usuário** | ❌ 0% | Tabelas `users`, `roles`, `permissions`, `teams`; RBAC; associação usuário↔time↔ferramenta |
| **Integrações externas** | ❌ 0% | O plano cita e-mail/Google como evolução futura (não é prioridade da Fase 1) |

Ou seja: o app atual é **aberto, sem contas de usuário** (decisão inicial do MVP). O plano muda isso radicalmente para uma plataforma interna **autenticada e com papéis**.

---

## 4. Bug de importação — causa e correção ✅

- **Sintoma:** "não importa todas as linhas".
- **Causa raiz:** a gravação em massa fazia muitas escritas no D1 numa única requisição do Worker, estourando limites (sub-requisições/CPU/tamanho de batch) e truncando a importação no meio.
- **Correção implementada (esta sessão):** importação **em lotes**. O navegador envia ~200 linhas por requisição; o servidor insere 7 linhas por statement (98 parâmetros, < 100 do D1) num `batch` pequeno. Cada requisição fica folgada dentro dos limites.
- **Verificação local (mesmo motor SQLite do D1):** 1965 linhas → **1965 gravadas** (10 requisições, 29 statements cada, máx. 98 parâmetros/statement). ✔️
- **Arquivos:** `src/lib/validation.ts`, `src/app/api/upload/route.ts`, `src/components/UploadForm.tsx` (com barra de progresso).
- **Pendência:** só falta **fazer o deploy** (bloqueado pelo token) para valer em produção.

---

## 5. Dívidas técnicas / limpezas recomendadas

- **Autenticação do deploy:** trocar o token no secret **ou** migrar para **Cloudflare Workers Builds** (conecta o repo pelo painel, usa OAuth, sem token em secret) — mais robusto e evita quebrar quando um token é revogado.
- **Type-check no CI:** hoje o build ignora erros de tipo (`typescript.ignoreBuildErrors`) por divergências de tipos de ambiente. Recomenda-se reativar com `cf-typegen` + `@cloudflare/workers-types` para não perder segurança de tipos.
- **Sem código morto:** a base está enxuta; manter assim a cada fase.

---

## 6. Roadmap recomendado (para chegar na plataforma do plano)

1. **Fase 0 — Restaurar + estabilizar (imediato):** token novo → deploy → site no ar; a correção de importação entra junto. *(pronto, aguardando token)*
2. **Fase 1 — Núcleo autenticado:** schema `users/roles/permissions/teams`; Auth.js + D1; login; middleware/RBAC; layout autenticado (reaproveitando `AppShell`, `Sidebar`, `ThemeProvider`).
3. **Fase 2 — Módulo Protocolos:** CRUD de protocolos + importação da planilha de controle (as 5 abas), reaproveitando o pipeline de import já existente.
4. **Fase 3 — Notificações, auditoria e administração.**
5. **Transversal:** responsividade e toque (mobile) validados em cada tela; `.md` sempre atualizados.

---

## 7. Decisão necessária (bifurcação de rota)

O app atual (dashboard de itens de compra) e o plano (plataforma de protocolos autenticada) são **aplicações fundamentalmente diferentes**. Preciso da sua direção:

- **(A) Estabilizar o MVP atual** — restaurar o site + entregar a importação corrigida (rápido, baixo risco).
- **(B) Começar a plataforma do plano** — iniciar a Fase 1 (login/cadastro/usuários/RBAC) de forma incremental e cirúrgica, sem descartar o que já existe.

## 8. O que depende de você

1. **Token de deploy (para o site voltar):** criar um **novo** API Token na Cloudflare (*Edit Cloudflare Workers* + *D1: Edit*) e salvar no secret:
   ```bash
   gh secret set CLOUDFLARE_API_TOKEN --repo pcaplanejamento-web/newpca
   ```
2. **Escolher a direção** (A ou B acima).
