import { exigirAcesso } from "@/lib/api-auth";
import { dataIsoBrasilia } from "@/lib/format";
import { ok } from "@/lib/http";
import { buscarNoCalendario } from "@/lib/tarefas";
import { quadrosDoCalendario } from "@/lib/tarefas-dados";

export const dynamic = "force-dynamic";

/** BUSCA do calendário em todos os meses (`?q=`, 2+ letras): eventos e tarefas com prazo dos quadros da pessoa. */
export async function GET(req: Request) {
  const a = await exigirAcesso("calendario", "visualizar");
  if ("erro" in a) return a.erro;
  const q = new URL(req.url).searchParams.get("q") ?? "";
  const hoje = dataIsoBrasilia(new Date().toISOString());
  return ok({ resultados: await buscarNoCalendario(await quadrosDoCalendario(a.acesso), q, a.u.id, hoje) });
}
