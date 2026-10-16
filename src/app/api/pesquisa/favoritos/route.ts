import { z } from "zod";
import { exigirUsuario } from "@/lib/api-auth";
import { ok, parseCorpo } from "@/lib/http";
import { CHAVE_FAVORITOS, lerFavoritos, MAX_FAVORITOS } from "@/lib/pesquisa-favoritos-core";
import { listarPreferenciasTabela, salvarPreferenciaTabela } from "@/lib/preferencias-tabela";

export const dynamic = "force-dynamic";

const corpo = z.object({ itens: z.array(z.unknown()).max(MAX_FAVORITOS) });

/** Os FAVORITOS da pesquisa do sistema da própria pessoa. */
export async function GET() {
  const a = await exigirUsuario();
  if ("erro" in a) return a.erro;
  const p = await listarPreferenciasTabela(a.u.id, CHAVE_FAVORITOS);
  return ok({ itens: lerFavoritos(p[CHAVE_FAVORITOS]) });
}

/** Grava a lista inteira (a ordem é a da tela); o que não vale é descartado. */
export async function PUT(req: Request) {
  const a = await exigirUsuario();
  if ("erro" in a) return a.erro;
  const p = await parseCorpo(corpo, req);
  if ("resp" in p) return p.resp;
  const itens = lerFavoritos(p.data.itens);
  await salvarPreferenciaTabela(a.u.id, CHAVE_FAVORITOS, { itens });
  return ok({ itens });
}
