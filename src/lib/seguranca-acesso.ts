import { NextResponse } from "next/server";
import { interpretarSiteverify } from "./cloudflare-core";
import { getDb } from "./db";
import { desafioValido, lerTokenDesafio, solucaoValida, VALIDADE_DESAFIO_S } from "./desafio-core";
import { getIntegracoes } from "./integracoes";
import { turnstileConfigurado } from "./integracoes-core";
import { chaveLimite, corteJanela, esperaLimite, LIMITES_ACESSO, mensagemLimite, type TipoLimite } from "./limite-acesso-core";
import {
  comandoConsumirDesafio,
  comandoContarTentativa,
  comandoCriarDesafio,
  comandoLimparDesafios,
  comandoLimparTentativas,
  comandoZerarTentativas,
  consultaTentativas,
} from "./limite-acesso-sql";
import { verificarTurnstile } from "./turnstile";

// SEGURANÇA DO ACESSO (rotas de login, cadastro, código por e-mail e senha): o LIMITE DE TENTATIVAS por IP/e-mail e o
// CAPTCHA SEMPRE exigido — o Turnstile quando o ADM o configurou, senão a verificação anti-robô própria (`desafio-core`).

const agoraS = () => Math.floor(Date.now() / 1000);

/** O IP de quem pede (o Cloudflare informa em `cf-connecting-ip`). */
export function ipDe(req: Request): string {
  return req.headers.get("cf-connecting-ip") ?? req.headers.get("x-real-ip") ?? "local";
}

/** A resposta 429 do bloqueio (com `esperarS`). */
export function respostaLimite(esperarS: number) {
  return NextResponse.json({ ok: false, error: mensagemLimite(esperarS), esperarS }, { status: 429, headers: { "Retry-After": String(esperarS) } });
}

/** CONTA uma tentativa; devolve a espera (s) quando passou do limite — 0 = pode seguir. Falha do banco não trava o acesso. */
export async function contarTentativa(tipo: TipoLimite, sujeito: string): Promise<number> {
  const regra = LIMITES_ACESSO[tipo];
  const t = agoraS();
  try {
    const [r] = await comandoContarTentativa(getDb(), chaveLimite(tipo, sujeito), t, corteJanela(t, regra));
    return r ? esperaLimite(r.contagem, r.inicio, t, regra) : 0;
  } catch (e) {
    console.error("[limite] falha ao contar:", (e as Error).message);
    return 0;
  }
}

/** A espera (s) de uma chave JÁ bloqueada, sem contar (0 = liberada). */
export async function esperaDe(tipo: TipoLimite, sujeito: string): Promise<number> {
  const regra = LIMITES_ACESSO[tipo];
  const t = agoraS();
  try {
    const [r] = await consultaTentativas(getDb(), chaveLimite(tipo, sujeito), corteJanela(t, regra));
    // Bloqueada quando a PRÓXIMA tentativa passaria do máximo.
    return r ? esperaLimite(r.contagem + 1, r.inicio, t, regra) : 0;
  } catch {
    return 0;
  }
}

/** Zera a contagem (ex.: o login deu certo). */
export async function zerarTentativas(tipo: TipoLimite, sujeito: string): Promise<void> {
  try {
    await comandoZerarTentativas(getDb(), chaveLimite(tipo, sujeito));
  } catch {
    /* best-effort */
  }
}

/** Um desafio NOVO da verificação anti-robô própria (hex de 32). */
export async function criarDesafio(): Promise<string> {
  const b = crypto.getRandomValues(new Uint8Array(16));
  const id = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
  await comandoCriarDesafio(getDb(), id, agoraS() + VALIDADE_DESAFIO_S);
  return id;
}

/** O captcha em uso: o Turnstile (configurado pelo ADM) ou a verificação própria. */
export async function captchaEmUso(): Promise<"turnstile" | "proprio"> {
  return turnstileConfigurado(await getIntegracoes()) ? "turnstile" : "proprio";
}

/**
 * Confere o CAPTCHA do formulário — SEMPRE exigido. Com o Turnstile configurado, o token dele; senão, a verificação
 * própria: a solução confere E o desafio é CONSUMIDO (vale uma vez, dentro da validade).
 */
export async function verificarCaptcha(req: Request, token: string | null | undefined): Promise<{ ok: true } | { ok: false; motivo: string }> {
  const integ = await getIntegracoes();
  if (turnstileConfigurado(integ)) {
    const r = await verificarTurnstile(integ, token, req.headers.get("cf-connecting-ip"));
    return r.ok ? { ok: true } : { ok: false, motivo: r.motivo ?? "Falha na verificação anti-robô." };
  }
  const falha = { ok: false as const, motivo: interpretarSiteverify(null, false).motivo ?? "Confirme que você não é um robô." };
  const t = lerTokenDesafio(token);
  if (!t || !desafioValido(t.desafio) || !solucaoValida(t.desafio, t.n)) return falha;
  try {
    const [usado] = await comandoConsumirDesafio(getDb(), t.desafio, agoraS());
    return usado ? { ok: true } : { ok: false, motivo: "A verificação anti-robô expirou ou já foi usada. Confirme de novo." };
  } catch (e) {
    console.error("[captcha] falha ao consumir o desafio:", (e as Error).message);
    return { ok: false, motivo: "Não foi possível conferir a verificação anti-robô. Tente de novo." };
  }
}

/** Higiene (cron): as contagens vencidas (mais velhas que a maior janela) e os desafios vencidos. */
export async function limparSegurancaVencida(): Promise<void> {
  const t = agoraS();
  const maiorJanela = Math.max(...Object.values(LIMITES_ACESSO).map((r) => r.janelaS));
  const db = getDb();
  await db.batch([comandoLimparTentativas(db, t - maiorJanela), comandoLimparDesafios(db, t)]);
}
