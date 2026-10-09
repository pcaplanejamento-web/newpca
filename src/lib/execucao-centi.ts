// EXECUÇÃO dos DFDs na Centi (puro, testado em tests/execucao-centi.test.ts): a tela CM002 - Planejamento lista cada
// PLANEJAMENTO pelo ID (= o nº de planejamento do DFD) com a SITUAÇÃO (Executado, Cancelado…). A Automação lê essa grade
// e o sistema grava a situação em cada DFD do mesmo planejamento.

export type ClasseExecucao = "executado" | "cancelado" | "outro";

/** O nº de planejamento comparável: só os dígitos, sem zeros à esquerda ("0154" = "154"); vazio = null. */
export function chavePlanejamento(v: unknown): string | null {
  const d = String(v ?? "").replace(/\D/g, "").replace(/^0+/, "");
  return d ? d.slice(0, 12) : null;
}

const semAcento = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();

/** A situação como a Centi mostra, limpa (≤ 40); vazio ou só CÓDIGO numérico (não é o texto) = null. */
export function limparSituacao(v: unknown): string | null {
  const s = String(v ?? "")
    .replace(/\p{Cc}/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  return s && !/^-?\d+$/.test(s) ? s.slice(0, 40) : null;
}

/** A classe da situação: "Executado" (e "Executada") = executado; "Cancelado" = cancelado; o resto (inclusive "Não executado") = outro. */
export function classeExecucao(situacao: string | null | undefined): ClasseExecucao | null {
  if (!situacao) return null;
  const s = semAcento(situacao);
  if (/^(NAO|NÃO)\b/.test(s)) return "outro";
  if (/^EXECUTAD[OA]S?\b/.test(s)) return "executado";
  if (/^CANCELAD[OA]S?\b/.test(s)) return "cancelado";
  return "outro";
}

/**
 * A grade lida da CM002 (os rótulos das colunas + as linhas como a tela mostra) → planejamento → situação. Acha as colunas
 * "ID" e "SITUAÇÃO" pelo rótulo (sem acento/caixa); sem elas, vazio. O mesmo ID repetido vale a 1ª leitura.
 */
export function situacoesDaGrade(colunas: unknown, linhas: unknown): Map<string, string> {
  const mapa = new Map<string, string>();
  if (!Array.isArray(colunas) || !Array.isArray(linhas)) return mapa;
  const rot = colunas.map((c) => semAcento(String(c ?? "")));
  const ci = rot.indexOf("ID");
  const cs = rot.indexOf("SITUACAO");
  if (ci < 0 || cs < 0) return mapa;
  for (const l of linhas) {
    const valores = Array.isArray(l) ? l : Array.isArray((l as { valores?: unknown })?.valores) ? (l as { valores: unknown[] }).valores : null;
    if (!valores) continue;
    const id = chavePlanejamento(valores[ci]);
    const sit = limparSituacao(valores[cs]);
    if (id && sit && !mapa.has(id)) mapa.set(id, sit);
  }
  return mapa;
}

export type DfdParaExecucao = { id: number; numero: string; planejamento: string | null; execucaoCenti: string | null };
export type ResultadoExecucao = {
  /** Os DFDs cuja situação MUDOU (o que será gravado). */
  atualizar: { id: number; situacao: string }[];
  /** Por DFD: o que a Centi diz (null = o planejamento não apareceu na CM002). */
  linhas: { id: number; numero: string; planejamento: string; antes: string | null; situacao: string | null }[];
  /** DFDs sem nº de planejamento (não há o que procurar). */
  semPlanejamento: number;
};

/** O plano da gravação: cada DFD com planejamento recebe a situação lida; só os que mudaram são gravados. */
export function planoExecucao(dfds: DfdParaExecucao[], situacoes: Map<string, string>): ResultadoExecucao {
  const atualizar: ResultadoExecucao["atualizar"] = [];
  const linhas: ResultadoExecucao["linhas"] = [];
  let semPlanejamento = 0;
  for (const d of dfds) {
    const chave = chavePlanejamento(d.planejamento);
    if (!chave) {
      semPlanejamento++;
      continue;
    }
    const situacao = situacoes.get(chave) ?? null;
    linhas.push({ id: d.id, numero: d.numero, planejamento: d.planejamento ?? chave, antes: d.execucaoCenti, situacao });
    if (situacao && situacao !== d.execucaoCenti) atualizar.push({ id: d.id, situacao });
  }
  return { atualizar, linhas, semPlanejamento };
}

