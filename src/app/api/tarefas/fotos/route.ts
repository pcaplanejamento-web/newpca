import { gruposDeTarefas } from "@/lib/acesso";
import { exigirSessao } from "@/lib/api-auth";
import { buscarFotosFundo } from "@/lib/fotos-fundo";
import { erro, ok } from "@/lib/http";

export const dynamic = "force-dynamic";

/** As FOTOS de fundo do quadro (`?q=` = a busca; vazio = as em destaque) — Unsplash com a chave, senão a seleção fixa. Para
 * quem CONFIGURA Tarefas em algum grupo (o fundo é do "Novo quadro" e da Configuração do quadro). */
export async function GET(req: Request) {
  const a = await exigirSessao();
  if ("erro" in a) return a.erro;
  const configura = gruposDeTarefas(a.acesso, "configurar");
  if (configura && !configura.length) return erro("Seu papel não permite configurar em Tarefas.", 403);
  return ok(await buscarFotosFundo(new URL(req.url).searchParams.get("q") ?? ""));
}
