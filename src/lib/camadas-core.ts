/**
 * O RÓTULO de uma camada no navegador do celular (Modal em pilha: Protocolo · DFD · Item…): duas linhas curtas — o TIPO
 * (a 1ª palavra do título) e o IDENTIFICADOR (o resto do 1º trecho, antes de " — "). Puro, testado em
 * `tests/gesto-fechar.test.ts`. "Item 3 — DFD 1000" → {tipo: "Item", detalhe: "3"}; "Histórico do protocolo" →
 * {tipo: "Histórico", detalhe: "do protocolo"}; sem identificador = detalhe vazio.
 */
export function rotuloCamada(titulo: string): { tipo: string; detalhe: string } {
  const primeiro = (titulo.split(/\s+[—–-]\s+/)[0] ?? "").trim();
  const [tipo = "", ...resto] = primeiro.split(/\s+/);
  const detalhe = resto.join(" ").replace(/^[—–-]+$/, "").trim();
  return { tipo: tipo || titulo.trim(), detalhe };
}
