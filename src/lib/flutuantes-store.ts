import type { FaixaFixa } from "./chat-core";

/**
 * Os FLUTUANTES da tela que se evitam: o painel "Em segundo plano" publica a faixa que ocupa (o lado, o topo e a altura —
 * muda ao arrastar, expandir ou recolher) e as bolhas do chat pousam fora dela. Um armazém de módulo (os dois vivem em
 * árvores diferentes do React), lido com `useSyncExternalStore`.
 */
let faixa: FaixaFixa | null = null;
const ouvintes = new Set<() => void>();

export function publicarFaixaFlutuante(f: FaixaFixa | null) {
  if (f === faixa || (f && faixa && f.lado === faixa.lado && f.top === faixa.top && f.altura === faixa.altura && f.ambos === faixa.ambos)) return;
  faixa = f;
  for (const o of ouvintes) o();
}

export function assinarFaixaFlutuante(o: () => void) {
  ouvintes.add(o);
  return () => {
    ouvintes.delete(o);
  };
}

export const lerFaixaFlutuante = () => faixa;
