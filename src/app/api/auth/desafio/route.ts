import { BITS_DESAFIO } from "@/lib/desafio-core";
import { erro, ok } from "@/lib/http";
import { contarTentativa, criarDesafio, ipDe, respostaLimite } from "@/lib/seguranca-acesso";

export const dynamic = "force-dynamic";

/** Um DESAFIO da verificação anti-robô própria (o captcha quando o Turnstile não está configurado) — vale uma vez. */
export async function POST(req: Request) {
  const espera = await contarTentativa("desafioIp", ipDe(req));
  if (espera) return respostaLimite(espera);
  try {
    return ok({ desafio: await criarDesafio(), bits: BITS_DESAFIO });
  } catch (e) {
    console.error("[desafio] falha:", (e as Error).message);
    return erro("Não foi possível iniciar a verificação anti-robô. Tente de novo.", 500);
  }
}
