// Respostas JSON guardadas na MEMÓRIA DA ABA (fora do componente): sair e voltar a uma tela mostra o que já foi lido, sem
// pedir de novo, enquanto a `versao` dos dados for a mesma. A falha não fica guardada; `fresco` pede de novo.

const MAX = 40;
const guardadas = new Map<string, { valor?: unknown; promessa: Promise<unknown> }>();

/** O valor já lido (síncrono) — para desenhar a tela no 1º quadro, sem o "Carregando". */
export function jaLido<T>(url: string, versao = ""): T | undefined {
  return guardadas.get(`${versao}|${url}`)?.valor as T | undefined;
}

/** Lê o JSON de `url` uma vez por versão; `ler` confere a resposta (lança na falha). */
export function lerGuardado<T>(url: string, versao: string, ler: (r: Response) => Promise<T>, fresco = false): Promise<T> {
  const k = `${versao}|${url}`;
  const atual = guardadas.get(k);
  if (atual && !fresco) return atual.promessa as Promise<T>;
  const entrada: { valor?: unknown; promessa: Promise<unknown> } = { promessa: Promise.resolve() };
  entrada.promessa = fetch(url, { cache: "no-store" })
    .then(ler)
    .then((v) => {
      entrada.valor = v;
      return v;
    })
    .catch((e) => {
      if (guardadas.get(k) === entrada) guardadas.delete(k);
      throw e;
    });
  guardadas.delete(k);
  guardadas.set(k, entrada);
  while (guardadas.size > MAX) guardadas.delete(guardadas.keys().next().value as string);
  return entrada.promessa as Promise<T>;
}
