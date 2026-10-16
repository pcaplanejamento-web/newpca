import { z } from "zod";
import { reparticoes } from "@/db/schema";
import { exigirAcesso } from "@/lib/api-auth";
import { registrarAuditoria } from "@/lib/auditoria";
import { getDb } from "@/lib/db";
import { erro, ok, parseCorpo } from "@/lib/http";
import { MAX_GRUPOS_ORCAMENTO, motivoGruposInvalidos } from "@/lib/orcamento-grupos";
import { getGruposOrcamento, gravarGruposOrcamento } from "@/lib/orcamento-grupos-dados";

export const dynamic = "force-dynamic";

const gruposSchema = z.strictObject({
  grupos: z
    .array(z.strictObject({ id: z.number().int().positive(), nome: z.string().trim().min(1).max(80), unidades: z.array(z.number().int().positive()).min(2).max(200) }))
    .max(MAX_GRUPOS_ORCAMENTO),
});

/** GRAVA os grupos orçamentários (unidades que compartilham o orçamento) — Configurar no Orçamento. A lista inteira. */
export async function PUT(req: Request) {
  const a = await exigirAcesso("orcamento", "configurar");
  if ("erro" in a) return a.erro;
  const p = await parseCorpo(gruposSchema, req);
  if ("resp" in p) return p.resp;
  const ids = new Set((await getDb().select({ id: reparticoes.id }).from(reparticoes)).map((r) => r.id));
  const motivo = motivoGruposInvalidos(p.data.grupos, ids);
  if (motivo) return erro(motivo, 422);
  const antes = await getGruposOrcamento();
  const grupos = await gravarGruposOrcamento(p.data.grupos, a.u.id);
  await registrarAuditoria({
    usuario: a.u,
    acao: "editar",
    entidade: "orcamento",
    entidadeId: null,
    resumo: `grupos orçamentários: ${grupos.length ? grupos.map((g) => g.nome).join(", ") : "nenhum"}`,
    antes: { grupos: antes },
    depois: { grupos },
  });
  return ok({ grupos });
}
