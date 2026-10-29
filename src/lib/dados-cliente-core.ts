// DADOS NO NAVEGADOR — o núcleo PURO (testado): a chave de cada dado guardado, quando a entrada guardada ainda vale e a
// limpeza das antigas. O acesso ao IndexedDB e à memória fica em `dados-cliente.ts`.
//
// Regras (a correção vem antes da velocidade — em qualquer dúvida o dado é pedido de novo ao servidor):
// - a CHAVE leva a pessoa, o ESCOPO (grupo, unidades, telas, papel — assinado pelo layout), o recurso e o endereço:
//   nunca o dado de outra pessoa, de outra unidade ou de outra permissão;
// - a entrada só vale com a MESMA versão do recurso (a versão vem do servidor) e o mesmo FORMATO do código;
// - a sessão encerrada (401) apaga tudo deste navegador.

/** Muda quando a FORMA de algum dado guardado muda num deploy: o guardado antigo é ignorado (e apagado). */
export const FORMATO_DADOS = 1;

/** Entradas guardadas no aparelho, no máximo (as menos usadas saem primeiro). */
export const MAX_ENTRADAS = 120;
/** Sem uso há mais que isto, a entrada sai na limpeza. */
export const VALIDADE_SEM_USO_MS = 30 * 24 * 60 * 60_000;

export type Escopo = { pessoa: number; assinatura: string };

export type EntradaDado = {
  chave: string;
  pessoa: number;
  formato: number;
  versao: string;
  /** O valor (o que a tela guardou do servidor). */
  valor: unknown;
  /** Quando foi lido do servidor e quando foi usado por último (ms). */
  em: number;
  uso: number;
};

/** A chave de um dado: pessoa · escopo · recurso · endereço. */
export function chaveDado(escopo: Escopo, recurso: string, url: string): string {
  return `${escopo.pessoa}|${escopo.assinatura}|${recurso}|${url}`;
}

/** A entrada guardada ainda vale para esta pessoa, esta versão e este formato. */
export function entradaVale(e: unknown, chave: string, escopo: Escopo, versao: string): e is EntradaDado {
  if (!e || typeof e !== "object") return false;
  const x = e as Partial<EntradaDado>;
  return x.chave === chave && x.pessoa === escopo.pessoa && x.formato === FORMATO_DADOS && typeof x.versao === "string" && versao !== "" && x.versao === versao && "valor" in x;
}

/** As chaves a APAGAR: de outra pessoa, de outro formato, sem uso há muito ou além do máximo (as menos usadas). */
export function aApagar(entradas: readonly Pick<EntradaDado, "chave" | "pessoa" | "formato" | "uso">[], pessoa: number, agora: number): string[] {
  const fora: string[] = [];
  const ficam: { chave: string; uso: number }[] = [];
  for (const e of entradas) {
    if (e.pessoa !== pessoa || e.formato !== FORMATO_DADOS || !(agora - e.uso <= VALIDADE_SEM_USO_MS)) fora.push(e.chave);
    else ficam.push(e);
  }
  if (ficam.length > MAX_ENTRADAS) {
    ficam.sort((a, b) => b.uso - a.uso);
    for (const e of ficam.slice(MAX_ENTRADAS)) fora.push(e.chave);
  }
  return fora;
}

/** A resposta diz que a sessão acabou (o guardado deste navegador deve sair). */
export function sessaoEncerrada(status: number): boolean {
  return status === 401;
}
