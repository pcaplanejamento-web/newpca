# Fase 1 — Autenticação, Área da Equipe e Usuários

Núcleo da plataforma: separa o **público** do **interno** e adiciona controle de acesso.

## Estrutura de rotas
| Rota | Acesso | O quê |
|---|---|---|
| `/` | **Pública** | Página inicial institucional (com botão "Entrar") |
| `/login` | Pública | **Tela única** de acesso: Entrar · Criar conta (`?modo=cadastro`) · Esqueci a senha (`?modo=senha`); `/cadastro` e `/recuperar-senha` redirecionam |
| `/painel` | **Requer login** | Porta de entrada: redireciona à **Mesa** (ou ao 1º módulo liberado; sem nenhum, ao Perfil). O Dashboard do PCA fica em `/` (público) e na aba Dashboard de cada PCA |
| `/painel/upload` | Requer login | Importação de planilha |
| `/painel/usuarios` | **Admin** | Aprovar cadastros, definir papéis, ativar/excluir |

A proteção é feita no **layout** `src/app/painel/layout.tsx` (`getUsuarioAtual()` → redireciona para `/login` se não autenticado). O `AppShell` (barra lateral + menu do usuário + Sair) só existe dentro de `/painel`.

## Decisão de arquitetura
Autenticação **própria** (não Auth.js), 100% **Web Crypto** (confiável no Cloudflare Workers):
- **Senhas:** PBKDF2-SHA256, **100.000 iterações** (teto do Workers), salt aleatório.
- **Sessão:** token de 32 bytes; guardamos só o **hash** no D1 (`sessoes`); cookie `httpOnly`+`Secure`+`SameSite=Lax`.
- **RBAC:** `role` (`admin`|`gestor`|`membro`) + `status` (`ativo`|`pendente`|`inativo`) em `usuarios`.

## Fluxo de acesso
- **Cadastro institucional (2 etapas, cabe na tela sem rolar):** nome completo, matrícula, cargo ou função (seleção da lista
  que o ADM cadastra em Usuários → Cargos e funções), unidade em que trabalha, o usuário do e-mail (o `@rioverde.go.gov.br`
  já vem preenchido), e-mail **@rioverde.go.gov.br** e
  senha → captcha (sempre) → **código de 6 dígitos** no e-mail (validade 10 min, reenvio após 60 s, 5 tentativas) →
  conta criada **membro/pendente** com o e-mail confirmado.
- **1º cadastro** → vira **admin/ativo** (bootstrap, sem código — ainda não há envio de e-mails configurado).
- **Senha obrigatória:** trocar (Perfil), criar (quem só entrava pelo Google) ou redefinir ("Esqueci a senha") vale só com o
  código enviado ao e-mail; as outras sessões são encerradas.
- **Nome, e-mail, matrícula, cargo e unidade** só o **admin** altera (Usuários → Editar); no Perfil ficam só-leitura (apelido e foto
  seguem editáveis).
- **Google:** conta nova não nasce pelo Google — cadastre-se e vincule o Google no Perfil. Os avisos por e-mail podem chegar
  no institucional ou na conta Google vinculada.
- O **admin** aprova (ativa) os pendentes, muda papéis, desativa ou exclui — em `/painel/usuarios`.
- Login válido (com o captcha) → cookie de sessão → acesso ao `/painel`. "Sair" encerra a sessão.
- **Segurança (migração `0071`):** captcha SEMPRE (Turnstile do ADM ou a verificação anti-robô própria); limite de
  tentativas por IP e por conta (8 senhas erradas em 15 min bloqueiam a conta por 15 min) → 429; campos só com dados
  permitidos (nome só letras, matrícula só números, usuário do e-mail `a-z 0-9 . _ -`, senha com letras e números);
  e-mail e **matrícula únicos** (também no banco, por gatilho); cabeçalhos de segurança e recusa de requisição de outro site.

## Arquivos
- `src/lib/auth.ts` — hash/verificação, sessões, cookie, `getUsuarioAtual()`.
- `src/app/api/auth/{cadastro,codigo,senha,login,logout,me}` — autenticação (código por e-mail em `codigo`).
- `src/lib/seguranca-acesso.ts` (captcha + limite), `desafio-core.ts`, `limite-acesso-core.ts`/`-sql.ts`, `origem.ts`,
  `usuarios-unicos.ts`; `POST /api/auth/desafio`; `VerificacaoRobo.tsx`.
- `src/lib/cadastro-core.ts`, `codigo-email-core.ts` (puros, testados) e `codigo-email.ts` (D1) — regras do cadastro e do código.
- `src/app/api/admin/usuarios` (+ `/[id]`) — listagem e gestão (admin).
- `src/components/TelaAcesso.tsx` (tela única) + `VitrineAcesso.tsx` (+ `ConstelacaoAnimada.tsx`) + `MarcaSistema.tsx`;
  textos da vitrine e o aviso em Configurações → Tela de acesso (`TextosAcessoAdmin`, `src/lib/acesso-core.ts`); `AuthForm.tsx` (entrar), `CadastroForm.tsx`, `RecuperarSenhaForm.tsx`, `CartaoAuth.tsx`, `CodigoEmail.tsx`,
  `UsuariosAdmin.tsx`, `AppShell.tsx` (menu + Sair).

## Pendente (próximas fases)
- Permissões/times (RBAC completo) e módulo **Protocolos** (plano).
- Convite por e-mail (hoje o cadastro é auto-serviço com aprovação do admin).

## Verificação (produção)
1. `/` pública; `/painel` sem login → redireciona para `/login`.
2. Cadastro do 1º usuário → admin, cai no `/painel`. Os seguintes: e-mail institucional + código → pendente.
3. `/painel/usuarios` lista e aprova/gerencia; não-admin vê "acesso restrito".
4. "Sair" volta ao login.
