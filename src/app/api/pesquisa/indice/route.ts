import { componenteLibera, podeTela } from "@/lib/acesso";
import type { AbaKey } from "@/lib/abas";
import { exigirSessao } from "@/lib/api-auth";
import { ok } from "@/lib/http";
import { type LinhaIndice, MAX_INDICE, type PortaoPesquisa, tipoPermitido } from "@/lib/pesquisa-core";
import { indiceMesa } from "@/lib/tarefas";
import { versaoDados } from "@/lib/versao-dados";

export const dynamic = "force-dynamic";

/**
 * O ÍNDICE LOCAL da pesquisa: os protocolos e DFDs que a pessoa vê (o MESMO portão da `GET /api/pesquisa`), com a versão
 * dos dados. O navegador o guarda na MEMÓRIA da aba e só pede de novo quando a versão muda. Tipo acima de `MAX_INDICE`
 * linhas volta `completo: false` e segue pelo servidor.
 */
export async function GET() {
  const a = await exigirSessao();
  if ("erro" in a) return a.erro;
  const acao = "visualizar" as const;
  const portao: PortaoPesquisa = {
    admin: a.u.admin,
    ve: (t) => podeTela(a.acesso, t as AbaKey)[acao],
    libera: (c) => componenteLibera(a.acesso, c),
  };
  const grupos: { tipo: "protocolo" | "dfd"; completo: boolean; linhas: LinhaIndice[] }[] = [];
  for (const tipo of ["protocolo", "dfd"] as const) {
    if (!tipoPermitido(portao, tipo)) continue;
    const linhas = await indiceMesa(a.acesso, tipo);
    grupos.push({ tipo, completo: linhas.length < MAX_INDICE, linhas: linhas.length < MAX_INDICE ? linhas : [] });
  }
  const r = ok({ versao: await versaoDados(), grupos });
  r.headers.set("Cache-Control", "private, no-store");
  return r;
}
