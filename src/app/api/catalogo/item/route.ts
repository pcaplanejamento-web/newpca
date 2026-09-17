import { exigirEditor } from "@/lib/api-auth";
import { codigosEmConflito, criarCatalogoItem, getCatalogo } from "@/lib/catalogo";
import { criarItemSchema } from "@/lib/catalogo-validation";
import { erro, ok, parseCorpo } from "@/lib/http";
import { normalizarCodigo } from "@/lib/parse-catalogo-comum";

export const dynamic = "force-dynamic";

/**
 * Cria UM item manualmente num catálogo — só editor. O CÓDIGO é a chave ÚNICA GLOBAL:
 * rejeita (422) se já existir em QUALQUER catálogo. É salvo só com dígitos. Recalcula o total.
 */
export async function POST(req: Request) {
  const a = await exigirEditor();
  if ("erro" in a) return a.erro;
  const p = await parseCorpo(criarItemSchema, req);
  if ("resp" in p) return p.resp;
  const d = p.data;

  if (!(await getCatalogo(d.catalogoId))) return erro("Catálogo não encontrado.", 404);
  const codigo = normalizarCodigo(d.codigo);
  if (!codigo) return erro("Código inválido — informe ao menos um dígito.", 422);
  const conf = await codigosEmConflito([codigo], null);
  if (conf.length > 0) return erro(`Código ${codigo} já existe no catálogo "${conf[0].catalogoNome}".`, 422);

  const r = await criarCatalogoItem(d.catalogoId, { codigo, descricao: d.descricao, unidade: d.unidade, tipos: d.tipos });
  return ok({ id: r.id });
}
