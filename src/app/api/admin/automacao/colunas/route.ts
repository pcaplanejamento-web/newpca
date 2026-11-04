import { z } from "zod";
import { exigirAdmin } from "@/lib/api-auth";
import { registrarAuditoria } from "@/lib/auditoria";
import { erro, ok, parseCorpo } from "@/lib/http";
import { ENTIDADES_COLUNA, MAX_COLUNAS_POR_ENTIDADE, MAX_NOME_COLUNA, nomeColuna } from "@/lib/mesa-colunas-core";
import { colunaPorNome, listarColunasMesa } from "@/lib/mesa-colunas";

export const dynamic = "force-dynamic";

/** As colunas da Mesa criadas pelas automações. */
export async function GET() {
  const g = await exigirAdmin();
  if ("erro" in g) return g.erro;
  return ok({ colunas: await listarColunasMesa() });
}

const corpoSchema = z.strictObject({
  entidade: z.enum(ENTIDADES_COLUNA),
  nome: z.string().trim().min(1).max(MAX_NOME_COLUNA),
  /** Só DFD: a coluna aparece também na tabela de Itens (o item herda o valor do DFD dele). */
  nosItens: z.boolean().optional(),
});

/** A coluna pelo NOME — usa a cadastrada ou cria (idempotente; o nó "Gravar na coluna da Mesa"). */
export async function POST(req: Request) {
  const g = await exigirAdmin();
  if ("erro" in g) return g.erro;
  const p = await parseCorpo(corpoSchema, req);
  if ("resp" in p) return p.resp;
  if (!nomeColuna(p.data.nome)) return erro("Informe o nome da coluna.", 422);
  if (p.data.nosItens != null && p.data.entidade !== "dfd") return erro("“Também nos Itens” só vale para uma coluna de DFDs.", 422);
  const r = await colunaPorNome(p.data.entidade, p.data.nome, g.u.id, p.data.nosItens);
  if (!r) return erro(`No máximo ${MAX_COLUNAS_POR_ENTIDADE} colunas por tabela da Mesa.`, 409);
  if (r.criada)
    await registrarAuditoria({ usuario: g.u, acao: "criar", entidade: "automacao", origem: "centi", resumo: `Coluna da Mesa criada: ${r.coluna.nome} (${r.coluna.entidade}${r.coluna.nosItens ? " · também nos Itens" : ""})` });
  return ok(r);
}
