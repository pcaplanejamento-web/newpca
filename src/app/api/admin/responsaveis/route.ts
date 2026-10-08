import { exigirAdmin } from "@/lib/api-auth";
import { registrarAuditoria } from "@/lib/auditoria";
import { erro, ok, parseCorpo } from "@/lib/http";
import { pessoaResponsavelSchema } from "@/lib/rbac-validation";
import { cargoParaGravar, criarPessoa, listarPlanilha, MSG_CARGO_FORA, motivoUsuarioInvalido, pessoaRepetida } from "@/lib/responsaveis";
import { matriculaParaGravar } from "@/lib/responsaveis-planilha-core";

export const dynamic = "force-dynamic";

/** A PLANILHA ÚNICA dos responsáveis por DFDs: as pessoas, os vínculos com unidades/órgãos, os alvos possíveis, os
 * cargos cadastrados e os usuários ativos. */
export async function GET() {
  const g = await exigirAdmin();
  if ("erro" in g) return g.erro;
  return ok({ planilha: await listarPlanilha() });
}

/** Uma PESSOA nova na planilha (nome + matrícula — o funcionário de fora do município não tem — a mesma pessoa não se repete; o cargo da lista; o usuário opcional). */
export async function POST(req: Request) {
  const g = await exigirAdmin();
  if ("erro" in g) return g.erro;
  const p = await parseCorpo(pessoaResponsavelSchema, req);
  if ("resp" in p) return p.resp;
  const cargo = await cargoParaGravar(p.data.cargo);
  if (cargo == null) return erro(MSG_CARGO_FORA, 422);
  if (p.data.usuarioId != null) {
    const m = await motivoUsuarioInvalido(p.data.usuarioId);
    if (m) return erro(m.motivo, m.status);
  }
  // O funcionário de FORA DO MUNICÍPIO não tem matrícula.
  const matricula = matriculaParaGravar(p.data.externo, p.data.matricula);
  const igual = await pessoaRepetida(p.data.nome, matricula);
  if (igual != null) return erro(`Esta pessoa já está na planilha (mesmo nome e ${p.data.externo ? "sem matrícula" : "matrícula"}).`, 409);
  const dados = { ...p.data, matricula, cargo };
  const id = await criarPessoa(dados);
  await registrarAuditoria({ usuario: g.u, acao: "criar", entidade: "responsavel", entidadeId: id, resumo: `Responsável "${dados.nome}" cadastrado`, depois: dados });
  return ok({ id });
}
