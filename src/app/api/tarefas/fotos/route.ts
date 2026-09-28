import { exigirUsuario } from "@/lib/api-auth";
import { buscarFotosFundo } from "@/lib/fotos-fundo";
import { ok } from "@/lib/http";

export const dynamic = "force-dynamic";

/** As FOTOS de fundo do quadro (`?q=` = a busca; vazio = as em destaque) — Unsplash com a chave, senão a seleção fixa. */
export async function GET(req: Request) {
  const a = await exigirUsuario();
  if ("erro" in a) return a.erro;
  return ok(await buscarFotosFundo(new URL(req.url).searchParams.get("q") ?? ""));
}
