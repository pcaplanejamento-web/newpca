import { asc, count, eq } from "drizzle-orm";
import { papeis, usuarios } from "@/db/schema";
import { colunasSessao, papelDoUsuarioSql, sessaoDaLinha } from "@/lib/auth";
import { cronAutorizado } from "@/lib/cron";
import { getDb } from "@/lib/db";
import { enviarEmailsPendentes } from "@/lib/email";
import { comandoEncerrarEmailsVelhos } from "@/lib/email-sql";
import { comandosRetencaoNotificacoes } from "@/lib/notificacoes-sql";
import { erro, ok } from "@/lib/http";
import { derivarDaPessoa } from "@/lib/notificacoes";
import { resendDaConfig } from "@/lib/resend-config";
import { limparSegurancaVencida } from "@/lib/seguranca-acesso";

export const dynamic = "force-dynamic";

/**
 * Quantas pessoas têm os avisos de prazo/lembrete derivados por passada (rodízio). Cada uma custa ~7 consultas ao D1 — com
 * a higiene e o envio, a passada fica abaixo do limite de 50 consultas por invocação do plano gratuito.
 */
const PESSOAS_POR_PASSADA = 4;

/**
 * O CRON dos E-MAILS e AVISOS (a cada 5 min, no SEU gatilho do `worker.ts` — separado do Trello): a RETENÇÃO das
 * notificações (lidas > 30 dias, não lidas > 90, o teto por pessoa, as dispensas vencidas) e a HIGIENE do acesso sempre;
 * com o Resend ativo, os avisos de PRAZO e LEMBRETE derivados para as pessoas ativas (em rodízio — o sino também os deriva
 * ao abrir) e os e-mails pendentes (a fila sem o que desistiu ou ficou velho).
 */
export async function POST(req: Request) {
  if (!(await cronAutorizado(req))) return erro("Não autorizado.", 401);
  await limparSegurancaVencida().catch((e) => console.error("[cron] higiene do acesso:", (e as Error).message));
  const db = getDb();
  await db.batch([...comandosRetencaoNotificacoes(db), comandoEncerrarEmailsVelhos(db)]).catch((e) => console.error("[cron] retenção das notificações:", (e as Error).message));
  if ("erro" in (await resendDaConfig())) return ok({ ativo: false });
  const [{ n }] = await db.select({ n: count() }).from(usuarios).where(eq(usuarios.status, "ativo"));
  const total = Number(n) || 0;
  const voltas = Math.max(1, Math.ceil(total / PESSOAS_POR_PASSADA));
  const passada = Math.floor(Date.now() / 300_000) % voltas;
  // Cada pessoa como a sessão a veria (com o papel): os avisos seguem as telas que ela abre.
  const pessoas = await db
    .select(colunasSessao)
    .from(usuarios)
    .leftJoin(papeis, eq(papeis.id, papelDoUsuarioSql))
    .where(eq(usuarios.status, "ativo"))
    .orderBy(asc(usuarios.id))
    .limit(PESSOAS_POR_PASSADA)
    .offset(passada * PESSOAS_POR_PASSADA);
  await Promise.all(pessoas.map((p) => derivarDaPessoa(sessaoDaLinha(p))));
  const r = await enviarEmailsPendentes(100);
  return ok({ ativo: true, pessoas: pessoas.length, ...r });
}
