import { exigirSessao } from "@/lib/api-auth";
import { registrarAuditoria } from "@/lib/auditoria";
import { criarEdicaoTabela, recusaNaChave } from "@/lib/edicoes-tabela";
import { erro, ok, parseCorpo } from "@/lib/http";
import { criarEdicaoSchema } from "@/lib/preferencias-validation";

export const dynamic = "force-dynamic";

/** Cria uma EDIÇÃO SALVA de tabela: só para a pessoa (Visualizar a tela da tabela) ou PÚBLICA (Configurar — todos veem). */
export async function POST(req: Request) {
  const a = await exigirSessao();
  if ("erro" in a) return a.erro;
  const p = await parseCorpo(criarEdicaoSchema, req);
  if ("resp" in p) return p.resp;
  const d = p.data;
  const r = await recusaNaChave(a.acesso, d.chave, d.publico ? "configurar" : "visualizar");
  if (r) return erro(r.msg, r.status);
  const id = await criarEdicaoTabela(a.u.id, d);
  // A PÚBLICA vai ao histórico (todos passam a vê-la); a pessoal é só da pessoa.
  if (d.publico)
    await registrarAuditoria({
      usuario: a.u,
      acao: "criar",
      entidade: "edicao_tabela",
      entidadeId: id,
      resumo: `Edição pública "${d.nome}" publicada (${d.chave})`,
      depois: { chave: d.chave, nome: d.nome, publico: true },
    });
  return ok({ id });
}
