# Fase 1 — Autenticação, Área da Equipe e Usuários

Núcleo da plataforma: separa o **público** do **interno** e adiciona controle de acesso.

## Estrutura de rotas
| Rota | Acesso | O quê |
|---|---|---|
| `/` | **Pública** | Página inicial institucional (com botão "Entrar") |
| `/login`, `/cadastro` | Pública | Autenticação (sem barra lateral) |
| `/painel` | **Requer login** | Dashboard (indicadores, gráficos, consulta) |
| `/painel/upload` | Requer login | Importação de planilha |
| `/painel/usuarios` | **Admin** | Aprovar cadastros, definir papéis, ativar/excluir |

A proteção é feita no **layout** `src/app/painel/layout.tsx` (`getUsuarioAtual()` → redireciona para `/login` se não autenticado). O `AppShell` (barra lateral + menu do usuário + Sair) só existe dentro de `/painel`.

## Decisão de arquitetura
Autenticação **própria** (não Auth.js), 100% **Web Crypto** (confiável no Cloudflare Workers):
- **Senhas:** PBKDF2-SHA256, **100.000 iterações** (teto do Workers), salt aleatório.
- **Sessão:** token de 32 bytes; guardamos só o **hash** no D1 (`sessoes`); cookie `httpOnly`+`Secure`+`SameSite=Lax`.
- **RBAC:** `role` (`admin`|`gestor`|`membro`) + `status` (`ativo`|`pendente`|`inativo`) em `usuarios`.

## Fluxo de acesso
- **1º cadastro** → vira **admin/ativo** (bootstrap). Os demais entram **membro/pendente**.
- O **admin** aprova (ativa) os pendentes, muda papéis, desativa ou exclui — em `/painel/usuarios`.
- Login válido → cookie de sessão → acesso ao `/painel`. "Sair" encerra a sessão.

## Arquivos
- `src/lib/auth.ts` — hash/verificação, sessões, cookie, `getUsuarioAtual()`.
- `src/app/api/auth/{cadastro,login,logout,me}` — autenticação.
- `src/app/api/admin/usuarios` (+ `/[id]`) — listagem e gestão (admin).
- `src/components/AuthForm.tsx`, `UsuariosAdmin.tsx`, `AppShell.tsx` (menu + Sair).

## Pendente (próximas fases)
- Permissões/times (RBAC completo) e módulo **Protocolos** (plano).
- Convite por e-mail (hoje o cadastro é auto-serviço com aprovação do admin).

## Verificação (produção)
1. `/` pública; `/painel` sem login → redireciona para `/login`.
2. Cadastro do 1º usuário → admin, cai no `/painel`.
3. `/painel/usuarios` lista e aprova/gerencia; não-admin vê "acesso restrito".
4. "Sair" volta ao login.
