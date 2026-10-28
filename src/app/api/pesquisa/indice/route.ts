import { componenteLibera, podeTela } from "@/lib/acesso";
import type { AbaKey } from "@/lib/abas";
import { exigirSessao } from "@/lib/api-auth";
import { ok } from "@/lib/http";
import { espacosDaPesquisa } from "@/lib/pesquisa";
import { type LinhaIndice, MAX_INDICE, type PortaoPesquisa, tipoPermitido } from "@/lib/pesquisa-core";
import { indiceMesa } from "@/lib/tarefas";
import { versaoDados } from "@/lib/versao-dados";

export const dynamic = "force-dynamic";

/**
 * O ÍNDICE LOCAL da pesquisa: os protocolos e DFDs que a pessoa vê (o MESMO portão da `GET /api/pesquisa`), com a versão
 * dos dados — e os ESPAÇOS (orçamentos e quadros de Tarefas) com as abas que a pessoa abre. O navegador o guarda na MEMÓRIA da aba e só pede de novo quando a versão muda. Tipo acima de `MAX_INDICE`
 * linhas volta `completo: false` e segue pelo servidor.
 */
export async function GET(req: Request) {
  const a = await exigirSessao();
  if ("erro" in a) return a.erro;
  const acao = "visualizar" as const;
  const portao: PortaoPesquisa = {
    admin: a.u.admin,
    ve: (t) => podeTela(a.acesso, t as AbaKey)[acao],
    libera: (c) => componenteLibera(a.acesso, c),
  };
  // `?so=espacos`: só os espaços (um quadro novo de Tarefas não muda a versão `dados` — a tela pede só eles).
  if (new URL(req.url).searchParams.get("so") === "espacos") {
    const r = ok({ espacos: await espacosDaPesquisa(a.acesso) });
    r.headers.set("Cache-Control", "private, no-store");
    return r;
  }
  const grupos: { tipo: "protocolo" | "dfd"; completo: boolean; linhas: LinhaIndice[] }[] = [];
  for (const tipo of ["protocolo", "dfd"] as const) {
    if (!tipoPermitido(portao, tipo)) continue;
    const linhas = await indiceMesa(a.acesso, tipo);
    grupos.push({ tipo, completo: linhas.length < MAX_INDICE, linhas: linhas.length < MAX_INDICE ? linhas : [] });
  }
  // Os espaços (orçamentos e quadros) com as abas que a pessoa abre: a pesquisa acha as abas deles ("comparativo 2026").
  const v = await versaoDados();
  const r = ok({ versao: v.dados, completa: v.completa, grupos, espacos: await espacosDaPesquisa(a.acesso) });
  r.headers.set("Cache-Control", "private, no-store");
  return r;
}
