# Fase 1 — Autenticação e Usuários (em construção)

Início do núcleo da plataforma do plano. Construído de forma **aditiva**: nada do
dashboard atual foi alterado; enquanto o login não é validado em produção, as
telas antigas seguem públicas e funcionando.

## Decisão de arquitetura
Autenticação **própria e enxuta** (não Auth.js), 100% **Web Crypto** — mais
confiável de operar no Cloudflare Workers sem testes locais, e com controle total
do RBAC. Pode evoluir para login Google/Auth.js depois.

- **Senhas:** PBKDF2-SHA256, **100.000 iterações** (teto do Cloudflare Workers — acima disso o runtime rejeita), salt aleatório. `src/lib/auth.ts`
- **Sessão:** token aleatório de 32 bytes; guardamos só o **hash** no D1 (`sessoes`); cookie `httpOnly` + `Secure` + `SameSite=Lax`.
- **RBAC:** coluna `role` em `usuarios` (`admin` | `gestor` | `membro`) + `status` (`ativo` | `pendente` | `inativo`).

## Bootstrap (primeiro acesso)
O **primeiro** usuário cadastrado vira **admin/ativo**; os demais entram como
**membro/pendente** até um admin aprovar. (Depois adicionaremos gate por convite.)

## O que já existe nesta entrega
- Tabelas `usuarios` e `sessoes` (migration `drizzle/0001_auth.sql`, validada em SQLite).
- `src/lib/auth.ts` — hash/verificação de senha, sessões, cookie, `getUsuarioAtual()`.
- Rotas: `POST /api/auth/cadastro`, `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`.
- Páginas `/login` e `/cadastro` (componente reaproveitável `AuthForm`, responsivo e com campos amigáveis a toque).
- `AppShell` esconde a barra lateral nessas telas.

## Pendente (próximas entregas da Fase 1)
- **Proteção de rotas** (exigir login no dashboard) — só depois de validar o login em produção, para não trancar ninguém para fora.
- **Menu do usuário** + botão **Sair** no `AppShell`.
- **Administração de usuários** (aprovar pendentes, definir papéis).
- Tabelas de **permissões/times** (RBAC completo) e o módulo **Protocolos**.

## Verificação
1. `/login` e `/cadastro` carregam (sem barra lateral).
2. `GET /api/auth/me` → `{ "usuario": null }` quando deslogado.
3. `POST /api/auth/login` com credenciais inexistentes → `401`.
4. Primeiro cadastro real (feito pelo usuário) → vira admin e loga.
