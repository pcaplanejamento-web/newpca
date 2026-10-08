import { exigirAdmin } from "@/lib/api-auth";
import { registrarAuditoria } from "@/lib/auditoria";
import { erro, ok, parseCorpo } from "@/lib/http";
import { vinculoResponsavelSchema } from "@/lib/rbac-validation";
import { hojeISO } from "@/lib/reparticao-responsaveis";
import { alvoExiste, alvoParaGravar, cargoParaGravar, conflitoDoVinculo, criarVinculo, getPessoa, MSG_CARGO_FORA } from "@/lib/responsaveis";
import { motivoNaoVincular, motivoVinculoInvalido, normalizarVinculo, rotuloVinculo } from "@/lib/responsaveis-planilha-core";

export const dynamic = "force-dynamic";

/** VINCULA uma pessoa da planilha a uma unidade OU a um órgão (padrão — o cargo da pessoa — ou temporário — o cargo do
 * período, da lista de cargos) — gravado no lugar que VALE pela regra do órgão (`aviso` quando não é o pedido). */
export async function POST(req: Request) {
  const g = await exigirAdmin();
  if ("erro" in g) return g.erro;
  const p = await parseCorpo(vinculoResponsavelSchema, req);
  if ("resp" in p) return p.resp;
  const n = { ...p.data, ...normalizarVinculo(p.data) };
  const invalido = motivoVinculoInvalido(n);
  if (invalido) return erro(invalido, 422);
  const funcao = await cargoParaGravar(n.funcao);
  if (funcao == null) return erro(MSG_CARGO_FORA, 422);
  const pedido = { ...n, funcao };
  const pessoa = await getPessoa(pedido.responsavelId);
  if (!pessoa) return erro("Pessoa não encontrada na planilha.", 422);
  const exonerada = motivoNaoVincular(pessoa, pedido, hojeISO(), true);
  if (exonerada) return erro(exonerada, 409);
  if (!(await alvoExiste(pedido))) return erro("Unidade ou órgão não encontrado.", 422);
  // O vínculo mora SEMPRE no lugar que vale pela regra do órgão (a unidade de órgão com assinatura única vai ao órgão).
  const lugar = await alvoParaGravar(pedido);
  if ("erro" in lugar) return erro(lugar.erro, 422);
  const d = { ...pedido, ...lugar.alvo };
  const conflito = await conflitoDoVinculo(d);
  if (conflito) return erro(conflito, 409);
  const id = await criarVinculo(d);
  await registrarAuditoria({
    usuario: g.u,
    acao: "criar",
    entidade: "responsavel",
    entidadeId: d.responsavelId,
    resumo: `${pessoa.nome} vinculado(a) — ${rotuloVinculo(d)}${d.orgaoId != null ? ` no órgão #${d.orgaoId}` : ` na unidade #${d.reparticaoId}`}`,
    depois: d,
  });
  return ok({ id, aviso: lugar.aviso });
}
