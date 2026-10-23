import { exigirAdmin } from "@/lib/api-auth";
import { registrarAuditoria } from "@/lib/auditoria";
import { orgaosDoCadastro, unidadesDoCadastro } from "@/lib/centi-apis";
import { vincularUnidadesCentiSchema } from "@/lib/centi-apis-validation";
import { motivoVinculoInvalido, mudaVinculo, rotuloUnidadeCenti, type Vinculo } from "@/lib/centi-unidades-core";
import { comandosVincular, consultaUnidadesCenti } from "@/lib/centi-unidades-sql";
import { getDb } from "@/lib/db";
import { erro, ok, parseCorpo } from "@/lib/http";

export const dynamic = "force-dynamic";

/** As UNIDADES DA CENTI (as que as leituras já trouxeram), com o vínculo no cadastro e os registros gravados. */
export async function GET() {
  const g = await exigirAdmin();
  if ("erro" in g) return g.erro;
  return ok({ unidades: await consultaUnidadesCenti(getDb()) });
}

/**
 * VINCULA as unidades da Centi ao cadastro (Órgãos e Unidades), várias de uma vez, num lote ATÔMICO. Cada vínculo é
 * conferido contra o cadastro VISÍVEL (a unidade tem de ser do órgão); tirar o vínculo APAGA os registros gravados dela —
 * o banco só guarda o que o sistema usa. Unidade inexistente ou vínculo inválido = nada é gravado (422).
 */
export async function PUT(req: Request) {
  const g = await exigirAdmin();
  if ("erro" in g) return g.erro;
  const p = await parseCorpo(vincularUnidadesCentiSchema, req);
  if ("resp" in p) return p.resp;
  const db = getDb();
  const [lista, orgaos, unidades] = await Promise.all([consultaUnidadesCenti(db), orgaosDoCadastro(), unidadesDoCadastro()]);
  const porId = new Map(lista.map((u) => [u.id, u]));
  const cadastro = { orgaos, unidades };
  const itens: [number, number | null, number | null][] = [];
  const mudancas: string[] = [];
  let apagados = 0;
  for (const v of p.data.vinculos) {
    const u = porId.get(v.id);
    if (!u) return erro(`Unidade da Centi ${v.id} não encontrada.`, 404);
    const vinculo: Vinculo = v.orgaoId == null ? null : { orgaoId: v.orgaoId, reparticaoId: v.reparticaoId };
    if (v.orgaoId == null && v.reparticaoId != null) return erro("Informe o órgão da unidade.", 422);
    if (!mudaVinculo(u, vinculo)) continue;
    const motivo = motivoVinculoInvalido(vinculo, cadastro);
    if (motivo) return erro(`${rotuloUnidadeCenti(u)}: ${motivo}`, 422);
    itens.push([u.id, vinculo?.orgaoId ?? null, vinculo?.reparticaoId ?? null]);
    if (!vinculo) apagados += u.gravados;
    const destino = vinculo ? (vinculo.reparticaoId != null ? unidades.find((x) => x.id === vinculo.reparticaoId)?.codigo : orgaos.find((o) => o.id === vinculo.orgaoId)?.sigla) : null;
    mudancas.push(`${rotuloUnidadeCenti(u)} → ${destino ?? "sem vínculo"}`);
  }
  if (itens.length) {
    await db.batch(comandosVincular(db, itens, g.u.nome) as never);
    await registrarAuditoria({
      usuario: g.u,
      acao: "editar",
      entidade: "centi_api",
      resumo: `Unidades da Centi vinculadas ao cadastro (${itens.length}): ${mudancas.slice(0, 12).join("; ")}${mudancas.length > 12 ? ` e mais ${mudancas.length - 12}` : ""}${apagados ? ` — ${apagados} empenho(s) de unidade desvinculada apagado(s)` : ""}`,
    });
  }
  return ok({ alterados: itens.length, apagados, unidades: await consultaUnidadesCenti(db) });
}
