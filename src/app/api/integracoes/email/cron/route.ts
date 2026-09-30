import { asc, count, eq } from "drizzle-orm";
import { usuarios } from "@/db/schema";
import { cronAutorizado } from "@/lib/cron";
import { getDb } from "@/lib/db";
import { enviarEmailsPendentes } from "@/lib/email";
import { erro, ok } from "@/lib/http";
import { derivarDaPessoa } from "@/lib/notificacoes";
import { resendDaConfig } from "@/lib/resend-config";
import { limparSegurancaVencida } from "@/lib/seguranca-acesso";

export const dynamic = "force-dynamic";

/** Quantas pessoas têm os avisos de prazo/lembrete derivados por passada (rodízio: todas são vistas a cada poucas passadas). */
const PESSOAS_POR_PASSADA = 40;

/**
 * O CRON dos E-MAILS (a cada 5 min, pelo `scheduled` do `worker.ts`): os avisos de PRAZO e LEMBRETE nascem na leitura do
 * sino — aqui eles são derivados para as pessoas ativas (em rodízio) mesmo sem ninguém abrir o sistema, e os e-mails
 * pendentes saem (sem o Resend ativo, só a higiene). Também a HIGIENE do acesso: as contagens de tentativas e os desafios
 * anti-robô vencidos.
 */
export async function POST(req: Request) {
  if (!(await cronAutorizado(req))) return erro("Não autorizado.", 401);
  await limparSegurancaVencida().catch((e) => console.error("[cron] higiene do acesso:", (e as Error).message));
  if ("erro" in (await resendDaConfig())) return ok({ ativo: false });
  const db = getDb();
  const [{ n }] = await db.select({ n: count() }).from(usuarios).where(eq(usuarios.status, "ativo"));
  const total = Number(n) || 0;
  const voltas = Math.max(1, Math.ceil(total / PESSOAS_POR_PASSADA));
  const passada = Math.floor(Date.now() / 300_000) % voltas;
  const pessoas = await db
    .select({ id: usuarios.id, email: usuarios.email, nome: usuarios.nome, apelido: usuarios.apelido, matricula: usuarios.matricula, role: usuarios.role, status: usuarios.status })
    .from(usuarios)
    .where(eq(usuarios.status, "ativo"))
    .orderBy(asc(usuarios.id))
    .limit(PESSOAS_POR_PASSADA)
    .offset(passada * PESSOAS_POR_PASSADA);
  for (let i = 0; i < pessoas.length; i += 5)
    await Promise.all(
      pessoas.slice(i, i + 5).map((p) =>
        derivarDaPessoa({ ...p, foto: null, role: p.role as "admin" | "gestor" | "membro", status: "ativo" }),
      ),
    );
  const r = await enviarEmailsPendentes(100);
  return ok({ ativo: true, pessoas: pessoas.length, ...r });
}
