import { exigirUsuario } from "@/lib/api-auth";
import { conferirItensNoCatalogo } from "@/lib/catalogo";
import { conferirCatalogoSchema } from "@/lib/catalogo-validation";
import { tipoCurtoDfd } from "@/lib/parse-dfd-comum";
import { ok, parseCorpo } from "@/lib/http";

export const dynamic = "force-dynamic";

/**
 * Confere os itens de UM DFD contra o CATÁLOGO (referência) e devolve, por CÓDIGO
 * normalizado, o veredito (não catalogado / divergente / tipo incompatível + sugestão).
 * Escalável: o servidor consulta só os códigos daquele DFD (não envia o catálogo ao
 * cliente). Alimenta o preview de import/protocolação — o resultado é threadado no `ctx`
 * de `avaliarDfd`/`mensagensDfd` (níveis do ADM decidem se avisa ou bloqueia). Só usuário.
 */
export async function POST(req: Request) {
  const a = await exigirUsuario();
  if ("erro" in a) return a.erro;

  const p = await parseCorpo(conferirCatalogoSchema, req);
  if ("resp" in p) return p.resp;
  const { itens, tipo } = p.data;

  const conformidade = await conferirItensNoCatalogo(itens, tipoCurtoDfd(tipo));
  // Map não serializa em JSON → devolve as entradas (o cliente reconstrói o Map).
  return ok({ conformidade: [...conformidade.entries()] });
}
