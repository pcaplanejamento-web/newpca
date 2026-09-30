import { exigirAdmin } from "@/lib/api-auth";
import { registrarAuditoria } from "@/lib/auditoria";
import { erro, ok, parseCorpo } from "@/lib/http";
import { resumoCapacidades } from "@/lib/papeis-core";
import { compactarDetalhes, contarRestricoes, detalhesPadrao, textoResumoDetalhes } from "@/lib/papeis-detalhes-core";
import { criarPapel, listarPapeis, nomeDuplicado, nomePapelEmUso } from "@/lib/papeis";
import { criarPapelSchema } from "@/lib/papeis-validation";

export const dynamic = "force-dynamic";

/** Os PAPÉIS (Configurações → Papéis) com quantas pessoas têm cada um. */
export async function GET() {
  const g = await exigirAdmin();
  if ("erro" in g) return g.erro;
  return ok({ papeis: await listarPapeis() });
}

/** Cria um papel: nome único (sem caixa), descrição, as capacidades por tela, os DETALHES (restrições dentro das telas)
 * e, se pedido, o padrão dos novos cadastros. */
export async function POST(req: Request) {
  const g = await exigirAdmin();
  if ("erro" in g) return g.erro;
  const p = await parseCorpo(criarPapelSchema, req);
  if ("resp" in p) return p.resp;
  const d = p.data;
  const detalhes = d.detalhes ?? detalhesPadrao();
  if (await nomePapelEmUso(d.nome)) return erro("Já existe um papel com este nome.", 409);
  let id: number;
  try {
    id = await criarPapel({ nome: d.nome, descricao: d.descricao || null, capacidades: d.capacidades, detalhes, padraoCadastro: !!d.padraoCadastro });
  } catch (e) {
    // Dois cadastros do mesmo nome ao mesmo tempo: o índice único do banco recusa o segundo.
    if (nomeDuplicado(e)) return erro("Já existe um papel com este nome.", 409);
    throw e;
  }
  const telas = resumoCapacidades(d.capacidades).map((t) => `${t.rotulo} (${t.acoes.length})`).join(", ");
  await registrarAuditoria({
    usuario: g.u,
    acao: "criar",
    entidade: "papel",
    entidadeId: id,
    resumo: `Papel "${d.nome}" criado — ${telas || "nenhuma tela"}${contarRestricoes(detalhes) ? ` · restrições: ${textoResumoDetalhes(detalhes)}` : ""}${d.padraoCadastro ? " · padrão dos novos cadastros" : ""}`,
    depois: { nome: d.nome, descricao: d.descricao ?? null, capacidades: d.capacidades, detalhes: compactarDetalhes(detalhes), padraoCadastro: !!d.padraoCadastro },
  });
  return ok({ id });
}
