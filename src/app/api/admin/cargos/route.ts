import { exigirAdmin } from "@/lib/api-auth";
import { registrarAuditoria } from "@/lib/auditoria";
import { cargoSchema } from "@/lib/auth-validation";
import { criarCargo, listarCargosComUso, nomeCargoEmUso } from "@/lib/cargos";
import { erro, ok, parseCorpo } from "@/lib/http";

export const dynamic = "force-dynamic";

/** Cargos e funções (Usuários → Cargos e funções) com quantas pessoas têm cada um. */
export async function GET() {
  const g = await exigirAdmin();
  if ("erro" in g) return g.erro;
  return ok({ cargos: await listarCargosComUso() });
}

export async function POST(req: Request) {
  const g = await exigirAdmin();
  if ("erro" in g) return g.erro;
  const p = await parseCorpo(cargoSchema, req);
  if ("resp" in p) return p.resp;
  if (await nomeCargoEmUso(p.data.nome)) return erro("Já existe um cargo ou função com esse nome.", 409);
  const r = await criarCargo(p.data.nome);
  await registrarAuditoria({ usuario: g.u, acao: "criar", entidade: "cargo", entidadeId: r.id, resumo: `Cargo/função "${p.data.nome}" criado`, depois: p.data });
  return ok({ id: r.id });
}
