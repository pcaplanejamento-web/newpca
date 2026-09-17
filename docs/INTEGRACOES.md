# Integrações externas — configuração (ADM)

A tela **Configurações → Integrações** (`/painel/integracoes`, admin) conecta serviços externos.
Escopo atual: **Cloudflare** (captcha Turnstile + monitoramento). Google login e e-mail (Resend)
aparecem como **em breve**.

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

## Em breve
- **Login com Google** (OAuth) — exigirá um app no Google Cloud + ajuste no cadastro de usuários.
- **E-mail (Resend)** — envio de avisos (aprovação de cadastro etc.); exigirá domínio verificado no Resend.

## Notas técnicas
- Config não-secreta (flags, site key) fica no blob `configuracoes` id=1 (chave `integracoes`, sem migração).
- Segredo do Turnstile: cifrado em `src/lib/cripto.ts` (AES-GCM), wrapper `src/lib/integracoes-segredos.ts`.
- Verificação do captcha: `src/lib/turnstile.ts` (+ `cloudflare-core.ts`); métricas: `getMetricasWorker`
  em `src/lib/cf-analytics.ts` (+ `cloudflare-core.ts`).
- Deploy é sempre `git push origin main`. Secrets são definidos **fora** do repositório (wrangler/painel).
