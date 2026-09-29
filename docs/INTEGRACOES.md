# Integrações externas — configuração (ADM)

A tela **Configurações → Integrações** (`/painel/integracoes`, admin) conecta serviços externos.
Integrações: **Cloudflare** (captcha Turnstile + monitoramento), **Trello** e **e-mail (Resend)**. Google login
aparece como **em breve**.

Tudo começa **desligado** — nada muda no sistema até você ativar e configurar. Os valores secretos
(chave secreta do Turnstile) são **cifrados** no servidor e **nunca reexibidos**.

## 0. Chave mestra (uma vez) — necessária para guardar segredos
O segredo do captcha é cifrado (AES-GCM) com uma **chave mestra** guardada como *secret* do Worker
(nunca no repositório). Defina-a uma única vez:

```bash
# gere 32 bytes aleatórios em base64 e cole quando o wrangler pedir o valor:
openssl rand -base64 32
npx wrangler secret put INTEGRACOES_CHAVE
```

Alternativa pelo painel: **Cloudflare → Workers & Pages → `newpca` → Settings → Variables and Secrets →
Add → Secret**, nome `INTEGRACOES_CHAVE`. Sem essa chave o site funciona normalmente; só não é possível
salvar o segredo do captcha (a tela avisa).

## 1. Captcha (Turnstile)
Protege os formulários de **login** e **cadastro** contra robôs.
1. Cloudflare → **Turnstile** → **Add widget**: informe o domínio **governarv.com.br** (adicione também
   o domínio `*.workers.dev` e `localhost` se for testar). Copie a **Site Key** e a **Secret Key**.
2. Em `/painel/integracoes` → card **Captcha (Turnstile)**: marque **Ativar**, cole a **Site key** e a
   **Secret key**, clique **Salvar**.
3. Clique **Testar conexão** (valida a secret) e depois confira o widget na tela de login.

Enquanto o captcha não estiver **ativo + com site key + com secret**, o login/cadastro seguem
**exatamente como hoje** (o widget nem carrega). Em falha de rede na verificação, o login **não trava**
(fail-open); só reprova quando o Cloudflare responde que o desafio falhou.

## 2. Monitoramento (métricas do Worker)
Mostra requisições, erros e CPU do Worker (últimos 7 dias). **Reusa os mesmos secrets** já usados pela
tela de **Armazenamento** — não precisa cadastrar token de novo:
- `CF_ANALYTICS_TOKEN` — API token com permissão **Account Analytics: Read**.
- `CF_ACCOUNT_ID` — o Account ID da conta Cloudflare.

Se ainda não os definiu (para o Armazenamento):
```bash
npx wrangler secret put CF_ANALYTICS_TOKEN
npx wrangler secret put CF_ACCOUNT_ID   # (ou como var, se preferir)
```
Depois, em `/painel/integracoes` → card **Monitoramento**: marque **Ativar** e **Salvar**. As métricas
carregam no próprio card (com **Testar conexão** e **Recarregar**).

## Fotos de fundo dos quadros (Unsplash)
A **Pesquisa de fotos** do fundo dos quadros de Tarefas (Novo quadro e Configuração → Fundo do quadro) busca no
**Unsplash** quando a chave existe; sem ela, mostra uma seleção fixa de paisagens (Picsum) — tudo segue funcionando.

1. Crie um app em <https://unsplash.com/developers> (gratuito; 50 buscas/hora no modo demo — peça o modo produção
   depois) e copie a **Access Key**.
2. Defina o Worker Secret (fora do repositório):
```bash
npx wrangler secret put UNSPLASH_ACCESS_KEY
```
As buscas ficam 10 minutos em memória (`src/lib/fotos-fundo.ts`); a tela credita as fotos ao Unsplash.

## Trello (sincronização dos quadros de Tarefas)
Usa UMA conta institucional do Trello (ex.: "PCA Rio Verde"); tudo o que o sistema grava no Trello sai por ela.
1. Entre no Trello com a conta institucional e crie uma aplicação em **trello.com/power-ups/admin** (Novo → qualquer
   área de trabalho). Na aba **API key**, copie a **chave** e o **segredo**.
2. Na mesma tela, clique em **Token** e autorize (escopo leitura + escrita, sem expiração); copie o **token**.
3. No sistema: **Administração → Integrações → Trello** → ative, cole chave, token e segredo → **Salvar** →
   **Testar conexão** (mostra a conta).
4. Ligue as **pessoas** aos membros do Trello (sugestões pelo nome; ou pelo usuário do Trello). Pessoa sem ligação segue
   nas tarefas do sistema, mas não aparece como membro no Trello.
O token e o segredo ficam cifrados com a `INTEGRACOES_CHAVE` e nunca voltam à tela.
5. Em cada quadro de Tarefas: **Configuração → Trello** → **Criar no Trello** (um quadro novo, adaptado) ou **Ligar a um
   quadro existente** (a conta institucional precisa ser membro dele; listas, etiquetas e cartões de mesmo nome são
   casados). Depois disso, as mudanças vão e voltam sozinhas; a cada 5 minutos o sistema confere os dois lados (cron do
   Worker — precisa da `INTEGRACOES_CHAVE`). Sem o **segredo**, as mudanças do Trello só chegam nessa conferência.
   **Sincronizar agora** vai até zerar a fila, com a barra de andamento.
6. **Campos personalizados** (Prioridade, Estimativa, Ticket e os campos do quadro): num quadro EXISTENTE, a conta
   institucional precisa ser **administradora** do quadro no Trello (ou o Power-Up "Campos personalizados" precisa estar
   ligado lá). Se o aviso "O Trello não liberou os campos personalizados" aparecer, ajuste isso no Trello e clique em
   **Tentar de novo** (Configuração → Trello).

## E-mail (Resend)
Envia por e-mail os avisos do sino (tarefa atribuída, menção, convite, prazo, lembrete…), o aviso de cadastro novo aos
ADMs e a liberação de acesso à pessoa aprovada.
1. **Domínio no Resend** (resend.com → Domínios → governarv.com.br, região São Paulo):
   - **DKIM** (TXT `resend._domainkey`) e **envio** (CNAMEs `send`/`rsend`, "Somente DNS") verificados no Cloudflare.
   - **Desligue "Ativar recebimento"**: o sistema só ENVIA. O MX `@` do Resend conflita com o e-mail que o domínio já
     recebe — não troque o MX da raiz. Para receber, use um subdomínio.
   - "Recurso SES inválido" com os CNAMEs verificados = sobra do setup antigo: apague no Cloudflare os MX/TXT antigos com
     nome `send`/`rsend` (ex.: `feedback-smtp…amazonses.com`, `v=spf1 include:amazonses.com`) e clique em **reiniciar
     verificação**. Persistindo, use **Configuração automática** (Cloudflare).
2. **Chave de API** (resend.com → API Keys): "Full access" deixa o teste conferir o domínio; "Sending access" também
   funciona (o teste só envia).
3. No sistema: **Administração → Integrações → E-mail (Resend)** → ative, cole a chave (`re_…`), o **remetente**
   (`Plataforma PCA <avisos@governarv.com.br>` — do domínio verificado) e o **endereço do sistema** → **Salvar** →
   **Testar e enviar e-mail de teste** (chega no seu e-mail; o cartão mostra o domínio "Verificado").
4. Cada pessoa escolhe no **Perfil → E-mail** quais avisos quer receber (padrão: os que pedem ação).

Os avisos de evento saem na hora; os de prazo e lembrete, na conferência a cada 5 minutos (cron do Worker — precisa da
`INTEGRACOES_CHAVE`). A chave fica cifrada e nunca volta à tela.

## Login com Google (OAuth)
Quem pode entrar: o e-mail JÁ cadastrado e ATIVO entra direto; e-mail cadastrado pendente/inativo recebe o aviso na
tela de login; e-mail NOVO vira cadastro **pendente de aprovação** (os ADMs recebem o e-mail, com o Resend ativo). O 1º
usuário do sistema nasce pelo cadastro com senha. Quem se cadastra pelo Google não tem senha (entra só pelo Google).

1. **Google Cloud Console** (console.cloud.google.com) → crie/escolha um projeto.
2. **APIs e serviços → Tela de consentimento OAuth**: tipo **Externo**; nome do app, e-mail de suporte, domínio
   autorizado `governarv.com.br`; escopos `openid`, `email`, `profile` (não precisam de verificação); **Publicar o app**
   (em "Teste", só os usuários de teste listados conseguem entrar).
3. **Credenciais → Criar credenciais → ID do cliente OAuth → Aplicativo da Web**:
   - Origens JavaScript autorizadas: `https://governarv.com.br`
   - URIs de redirecionamento autorizados: `https://governarv.com.br/api/auth/google/callback` (o cartão mostra a URI
     com o botão Copiar).
4. **Integrações → Login com Google**: marque "Permitir", cole o **Client ID** e o **Client secret** (cifrado; exige a
   chave mestra) → **Salvar** → **Testar configuração**.
5. Abra `/login` numa janela anônima: aparece **"Entrar com Google"**.

Segurança: fluxo Authorization Code + **PKCE** + **state** (cookie httpOnly de 10 min); o código é trocado no servidor
(host fixo `oauth2.googleapis.com`) e o `id_token` é validado (emissor, público = o Client ID, validade, e-mail
verificado). Erros voltam como `/login?erro=…` (o motivo técnico só no log do Worker).

## Notas técnicas
- Config não-secreta (flags, site key) fica no blob `configuracoes` id=1 (chave `integracoes`, sem migração).
- Segredo do Turnstile: cifrado em `src/lib/cripto.ts` (AES-GCM), wrapper `src/lib/integracoes-segredos.ts`.
- Verificação do captcha: `src/lib/turnstile.ts` (+ `cloudflare-core.ts`); métricas: `getMetricasWorker`
  em `src/lib/cf-analytics.ts` (+ `cloudflare-core.ts`).
- E-mails: cliente `src/lib/resend-api.ts`, modelos/preferências `src/lib/email-core.ts`, envio `src/lib/email.ts`
  (pendentes em `notificacoes.email_enviado_em`, migração `0065`), cron `/api/integracoes/email/cron`.
- Deploy é sempre `git push origin main`. Secrets são definidos **fora** do repositório (wrangler/painel).
