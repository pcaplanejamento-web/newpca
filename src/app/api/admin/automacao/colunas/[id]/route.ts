import { z } from "zod";
import { exigirAdmin, intId } from "@/lib/api-auth";
import { registrarAuditoria } from "@/lib/auditoria";
import { erro, ok, parseCorpo } from "@/lib/http";
import { MAX_VALOR_COLUNA } from "@/lib/mesa-colunas-core";
import { excluirColunaMesa, getColunaMesa, gravarValoresColuna } from "@/lib/mesa-colunas";

export const dynamic = "force-dynamic";

const corpoSchema = z.strictObject({
  valores: z
    .array(z.strictObject({ alvoId: z.number().int().positive(), valor: z.string().max(MAX_VALOR_COLUNA).nullable() }))
    .min(1)
    .max(500),
});

/** Grava os valores da coluna (até 500 por chamada; `null` apaga). */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await exigirAdmin();
  if ("erro" in g) return g.erro;
  const id = intId((await params).id);
  if (!id) return erro("Coluna inválida.", 400);
  const coluna = await getColunaMesa(id);
  if (!coluna) return erro("Coluna não encontrada.", 404);
  const p = await parseCorpo(corpoSchema, req);
  if ("resp" in p) return p.resp;
  const valores = p.data.valores.map((v) => ({ alvoId: v.alvoId, valor: v.valor?.trim() ? v.valor.trim() : null }));
  await gravarValoresColuna(id, valores);
  const apagados = valores.filter((v) => v.valor == null).length;
  await registrarAuditoria({
    usuario: g.u,
    acao: "editar",
    entidade: "automacao",
    origem: "centi",
    resumo: `Coluna da Mesa “${coluna.nome}”: ${valores.length - apagados} valor(es) gravado(s)${apagados ? ` · ${apagados} apagado(s)` : ""}`,
  });
  return ok({ gravados: valores.length - apagados, apagados });
}

/** Exclui a coluna e os valores dela. */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await exigirAdmin();
  if ("erro" in g) return g.erro;
  const id = intId((await params).id);
  if (!id) return erro("Coluna inválida.", 400);
  const coluna = await getColunaMesa(id);
  if (!coluna) return erro("Coluna não encontrada.", 404);
  await excluirColunaMesa(id);
  await registrarAuditoria({ usuario: g.u, acao: "excluir", entidade: "automacao", origem: "centi", resumo: `Coluna da Mesa excluída: ${coluna.nome} (${coluna.entidade})` });
  return ok();
}
