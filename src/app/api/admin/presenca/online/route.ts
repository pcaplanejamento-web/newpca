import { getCloudflareContext } from "@opennextjs/cloudflare";
import { asc } from "drizzle-orm";
import { grupos } from "@/db/schema";
import { exigirAdmin } from "@/lib/api-auth";
import { getDb } from "@/lib/db";
import { erro, ok } from "@/lib/http";
import { getConfigPresenca } from "@/lib/presenca";
import { lerAtividade, lerListaMensagem, textoAtividade } from "@/lib/presenca-core";
import { pessoasPorIds } from "@/lib/usuarios";

export const dynamic = "force-dynamic";

/** Grupos consultados por vez (cada um é um pedido ao objeto do grupo — o Worker tem limite de subpedidos). */
const MAX_GRUPOS = 40;

/**
 * Armazenamento → "ONLINE AGORA" (ADM): quem está online em CADA grupo, perguntando ao objeto de presença de cada um
 * (`/estado`, só leitura — não acorda nenhuma aba). Só quando o ADM toca; os invisíveis não aparecem.
 */
export async function GET() {
  const g = await exigirAdmin();
  if ("erro" in g) return g.erro;
  if (!(await getConfigPresenca({ fresco: true })).ativo) return erro("A presença está desligada (Configurações → Presença).", 409);
  let ns: CloudflareEnv["PRESENCA_GRUPO"] | undefined;
  try {
    ns = getCloudflareContext().env.PRESENCA_GRUPO;
  } catch {
    ns = undefined;
  }
  if (!ns) return erro("Presença indisponível neste ambiente.", 503);
  const todos = await getDb().select({ id: grupos.id, nome: grupos.nome }).from(grupos).orderBy(asc(grupos.nome));
  const lista = todos.slice(0, MAX_GRUPOS);
  const objetos = ns;
  const estados = await Promise.all(
    lista.map(async (gr) => {
      try {
        const r = await objetos.get(objetos.idFromName(`g${gr.id}`)).fetch("https://presenca/estado");
        const j = (await r.json()) as { p?: unknown; a?: unknown };
        const est = lerListaMensagem(JSON.stringify({ t: "presenca", p: j.p ?? [] }))?.estados ?? new Map();
        const at = lerAtividade({ a: j.a });
        return new Map(
          [...est].map(([id, info]) => {
            const a = at?.get(id);
            return [id, { ...info, atividade: a ? textoAtividade(a) : null }];
          }),
        );
      } catch {
        return null;
      }
    }),
  );
  const ids = estados.flatMap((m) => (m ? [...m.keys()] : []));
  const pessoas = new Map((await pessoasPorIds(ids)).map((p) => [p.id, p]));
  return ok({
    grupos: lista.map((gr, i) => {
      const m = estados[i];
      return {
        id: gr.id,
        nome: gr.nome,
        falhou: m == null,
        pessoas: m ? [...m].flatMap(([id, info]) => (pessoas.has(id) ? [{ pessoa: pessoas.get(id), ...info }] : [])) : [],
      };
    }),
    truncado: todos.length > lista.length,
  });
}
