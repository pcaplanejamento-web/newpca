import { z } from "zod";
import { exigirAdmin } from "@/lib/api-auth";
import { registrarAuditoria } from "@/lib/auditoria";
import { CHAVES_FILTROS_INICIAIS, partesDefinidas } from "@/lib/filtros-visao-core";
import { getFiltrosIniciais, gravarFiltroInicial } from "@/lib/filtros-iniciais";
import { ok, parseCorpo } from "@/lib/http";
import { MAX_PREFERENCIA } from "@/lib/preferencias-validation";

export const dynamic = "force-dynamic";

// O ESTADO INICIAL dos filtros de um lugar (ADM): vale para todos ao abrir a tela e não aparece como filtro. Só as chaves
// da lista fechada; o estado é saneado no servidor (`coerceEstado` — dimensões e tipos do lugar); `null` = o padrão.
const schema = z.strictObject({
  chave: z.enum(CHAVES_FILTROS_INICIAIS),
  estado: z
    .record(z.string(), z.unknown())
    .nullable()
    .refine((v) => v == null || JSON.stringify(v).length <= MAX_PREFERENCIA, "Filtros grandes demais para salvar."),
});

const NOME: Record<(typeof CHAVES_FILTROS_INICIAIS)[number], string> = { execucao: "Execução" };

export async function PUT(req: Request) {
  const g = await exigirAdmin();
  if ("erro" in g) return g.erro;
  const p = await parseCorpo(schema, req);
  if ("resp" in p) return p.resp;
  const { chave } = p.data;
  const antes = (await getFiltrosIniciais({ fresco: true }))[chave] ?? null;
  const estado = await gravarFiltroInicial(chave, p.data.estado, g.u.id);
  await registrarAuditoria({
    usuario: g.u,
    acao: "editar",
    entidade: "configuracao",
    entidadeId: 1,
    resumo: estado
      ? `Estado inicial dos filtros (${NOME[chave]}) definido: ${partesDefinidas(estado)} parte(s)`
      : `Estado inicial dos filtros (${NOME[chave]}) voltou ao padrão do sistema`,
    antes: antes ? { filtrosIniciais: antes } : undefined,
    depois: estado ? { filtrosIniciais: estado } : undefined,
  });
  return ok({ estado });
}
