/**
 * O RÓTULO de uma camada no navegador do celular (Modal em pilha: Protocolo · DFD · Item…): duas linhas curtas — o TIPO
 * (a 1ª palavra do título) e o IDENTIFICADOR (o resto do 1º trecho, antes de " — "). Puro, testado em
 * `tests/gesto-fechar.test.ts`. "Item 3 — DFD 1000" → {tipo: "Item", detalhe: "3"}; "Histórico do protocolo" →
 * {tipo: "Histórico", detalhe: "do protocolo"}; sem identificador no 1º trecho, o próximo trecho com texto ("Item — — DFD
 * 1000" → "DFD 1000": a aba nunca fica com uma linha só quando o título diz algo mais).
 */
export function rotuloCamada(titulo: string): { tipo: string; detalhe: string } {
  const partes = titulo.split(/\s+[—–-]\s+/).map((t) => t.replace(/^[—–-]+\s*/, "").trim());
  const [tipo = "", ...resto] = (partes[0] ?? "").split(/\s+/);
  const detalhe = resto.join(" ").replace(/^[—–-]+$/, "").trim() || (partes.slice(1).find(Boolean) ?? "");
  return { tipo: tipo || titulo.trim(), detalhe };
}
