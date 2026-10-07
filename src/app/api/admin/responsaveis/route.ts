import { exigirAdmin } from "@/lib/api-auth";
import { registrarAuditoria } from "@/lib/auditoria";
import { erro, ok, parseCorpo } from "@/lib/http";
import { pessoaResponsavelSchema } from "@/lib/rbac-validation";
import { criarPessoa, listarPlanilha, pessoaRepetida } from "@/lib/responsaveis";

export const dynamic = "force-dynamic";

/** A PLANILHA ÚNICA dos responsáveis por DFDs: as pessoas, os vínculos com unidades/órgãos e os alvos possíveis. */
export async function GET() {
  const g = await exigirAdmin();
  if ("erro" in g) return g.erro;
  return ok({ planilha: await listarPlanilha() });
}

/** Uma PESSOA nova na planilha (nome + matrícula — a mesma pessoa não se repete). */
export async function POST(req: Request) {
  const g = await exigirAdmin();
  if ("erro" in g) return g.erro;
  const p = await parseCorpo(pessoaResponsavelSchema, req);
  if ("resp" in p) return p.resp;
  const igual = await pessoaRepetida(p.data.nome, p.data.matricula);
  if (igual != null) return erro("Esta pessoa já está na planilha (mesmo nome e matrícula).", 409);
  const id = await criarPessoa(p.data.nome, p.data.matricula);
  await registrarAuditoria({ usuario: g.u, acao: "criar", entidade: "responsavel", entidadeId: id, resumo: `Responsável "${p.data.nome}" cadastrado`, depois: p.data });
  return ok({ id });
}
