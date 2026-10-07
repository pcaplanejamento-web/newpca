import { exigirAdmin, intId } from "@/lib/api-auth";
import { fluxoEditavel } from "@/lib/fluxo-core";
import { getFluxo, gravarProgresso, lerProgresso, limparProgresso } from "@/lib/fluxos";
import { noProgressoSchema, progressoFluxoSchema } from "@/lib/fluxos-validation";
import { erro, ok, parseCorpo } from "@/lib/http";

/** A RETOMADA de um nó "Executar fluxo": o que já foi concluído (o fluxo interrompido continua de onde parou). */
export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

async function alvo(req: Request, params: Ctx["params"], usuarioId: number) {
  const id = intId((await params).id);
  if (!id) return { resp: erro("Id inválido.", 400) };
  const no = noProgressoSchema.safeParse(new URL(req.url).searchParams.get("no") ?? "");
  if (!no.success) return { resp: erro("Informe o nó.", 422) };
  const f = await getFluxo(id);
  // A retomada é do fluxo de TOPO que a pessoa executa (o dela).
  if (!f || !fluxoEditavel(f, usuarioId)) return { resp: erro("Fluxo não encontrado.", 404) };
  return { id, no: no.data };
}

export async function GET(req: Request, { params }: Ctx) {
  const g = await exigirAdmin();
  if ("erro" in g) return g.erro;
  const a = await alvo(req, params, g.u.id);
  if ("resp" in a) return a.resp;
  return ok({ chaves: await lerProgresso(a.id, a.no) });
}

export async function POST(req: Request, { params }: Ctx) {
  const g = await exigirAdmin();
  if ("erro" in g) return g.erro;
  const a = await alvo(req, params, g.u.id);
  if ("resp" in a) return a.resp;
  const p = await parseCorpo(progressoFluxoSchema, req);
  if ("resp" in p) return p.resp;
  await gravarProgresso(a.id, a.no, p.data.itens);
  return ok();
}

export async function DELETE(req: Request, { params }: Ctx) {
  const g = await exigirAdmin();
  if ("erro" in g) return g.erro;
  const a = await alvo(req, params, g.u.id);
  if ("resp" in a) return a.resp;
  await limparProgresso(a.id, a.no);
  return ok();
}
