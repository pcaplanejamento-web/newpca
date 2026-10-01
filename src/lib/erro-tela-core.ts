/**
 * FALHA NA TELA — núcleo PURO da fronteira de erro (`error.tsx`): o TIPO da falha, a recuperação automática (uma por
 * tela a cada minuto, nunca em laço) e o RELATÓRIO que vai aos Logs do Worker. Sem DOM/React — testável.
 *
 * Os tipos (o que a pessoa vê e o que o sistema faz sozinho):
 * - `servidor` — o código do servidor lançou o erro (traz o `digest`, a "ref:"); tenta de novo uma vez.
 * - `versao`   — um pedaço do sistema não carregou (ChunkLoadError): publicaram uma versão nova com a página aberta;
 *                recarrega a página uma vez.
 * - `conexao`  — a resposta chegou CORTADA ("Connection closed.") ou a rede caiu: a tela foi grande demais para o
 *                limite do servidor, ou a conexão oscilou; tenta de novo uma vez.
 * - `tela`     — um erro da própria tela (no navegador): tentar sozinho repetiria o erro — mostra e informa.
 */

export const TIPOS_FALHA = ["servidor", "versao", "conexao", "tela"] as const;
export type TipoFalha = (typeof TIPOS_FALHA)[number];

/** O erro como chega à fronteira (campos não confiáveis: qualquer coisa pode ser lançada). */
export type ErroDaTela = { name?: unknown; message?: unknown; digest?: unknown; stack?: unknown } | null | undefined;

const RX_VERSAO =
  /ChunkLoadError|Loading (?:CSS )?chunk [\w./-]+ failed|Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|Unable to preload CSS/i;
const RX_CONEXAO =
  /Connection closed|Failed to fetch|NetworkError|Load failed|network error|network connection was lost|fetch failed|ERR_(?:INTERNET_DISCONNECTED|NETWORK|CONNECTION)|aborted due to timeout/i;

const texto = (v: unknown): string => (typeof v === "string" ? v : "");

/** O TIPO da falha (ver o topo do arquivo). O `digest` (o erro do servidor) vale primeiro. */
export function tipoDaFalha(e: ErroDaTela): TipoFalha {
  if (texto(e?.digest).trim()) return "servidor";
  const t = `${texto(e?.name)} ${texto(e?.message)}`;
  if (RX_VERSAO.test(t)) return "versao";
  if (RX_CONEXAO.test(t)) return "conexao";
  return "tela";
}

/** A falha que pode se resolver tentando de novo (todas, menos a da própria tela). */
export const recuperavelSozinho = (tipo: TipoFalha): boolean => tipo !== "tela";

/** Janela da recuperação automática: UMA tentativa por tela a cada minuto (a 2ª falha seguida mostra a tela). */
export const JANELA_RECUPERACAO_MS = 60_000;

/** Pode tentar sozinho de novo? Sem tentativa anterior, com a anterior fora da janela ou com o relógio voltado. */
export function podeTentarDeNovo(ultima: number | null, agora: number): boolean {
  if (ultima == null || !Number.isFinite(ultima)) return true;
  return agora < ultima || agora - ultima >= JANELA_RECUPERACAO_MS;
}

/** A chave (no `sessionStorage`) da última tentativa automática numa tela — o caminho com a busca (`?aba=` é outra tela). */
export const chaveTentativa = (caminho: string): string => `falha-tela:${caminho.slice(0, 200)}`;

/** Lê a hora gravada (texto do armazenamento → número, ou `null`). */
export function lerTentativa(v: string | null | undefined): number | null {
  const n = Number(v);
  return v != null && v !== "" && Number.isFinite(n) ? n : null;
}

/** Os tamanhos máximos de cada campo do relatório (o Zod usa os MESMOS). */
export const LIMITES_FALHA = { nome: 80, mensagem: 300, digest: 80, pilha: 1000, caminho: 200, instante: 40 } as const;

export type RelatorioFalha = {
  tipo: TipoFalha;
  nome: string;
  mensagem: string;
  digest: string;
  pilha: string;
  caminho: string;
  /** A falha veio DEPOIS de uma recuperação automática (a 2ª seguida na mesma tela). */
  automatica: boolean;
  instante: string;
};

const cortar = (s: string, max: number): string => (s.length > max ? `${s.slice(0, max - 1)}…` : s);

/** O relatório da falha, com cada campo cortado no seu limite (vai aos Logs do Worker e ao "Copiar detalhes"). */
export function relatorioDaFalha(
  e: ErroDaTela,
  ctx: { caminho: string; automatica: boolean; instante: string },
): RelatorioFalha {
  return {
    tipo: tipoDaFalha(e),
    nome: cortar(texto(e?.name), LIMITES_FALHA.nome),
    mensagem: cortar(texto(e?.message), LIMITES_FALHA.mensagem),
    digest: cortar(texto(e?.digest), LIMITES_FALHA.digest),
    pilha: cortar(texto(e?.stack), LIMITES_FALHA.pilha),
    caminho: cortar(ctx.caminho, LIMITES_FALHA.caminho),
    automatica: ctx.automatica,
    instante: cortar(ctx.instante, LIMITES_FALHA.instante),
  };
}

/** O título e a explicação de cada tipo (a tela de falha e a Referência). */
export const TEXTO_FALHA: Record<TipoFalha, { titulo: string; explicacao: string }> = {
  conexao: {
    titulo: "A página não chegou inteira",
    explicacao:
      "A resposta do servidor foi interrompida no meio do caminho — acontece quando a tela é grande demais para o limite do servidor ou quando a conexão oscila. Tente de novo.",
  },
  versao: {
    titulo: "O sistema foi atualizado",
    explicacao: "Uma versão nova foi publicada enquanto esta página estava aberta. Recarregue a página para usar a versão atual.",
  },
  servidor: {
    titulo: "O servidor não conseguiu montar esta tela",
    explicacao: "Tente de novo. Se continuar, envie ao administrador os detalhes técnicos abaixo.",
  },
  tela: {
    titulo: "Algo deu errado nesta tela",
    explicacao:
      "Um erro inesperado interrompeu a tela. Tente de novo; se continuar, recarregue a página e envie ao administrador os detalhes técnicos abaixo.",
  },
};

const ROTULO_TIPO: Record<TipoFalha, string> = {
  conexao: "resposta interrompida",
  versao: "versão nova publicada",
  servidor: "erro no servidor",
  tela: "erro na tela",
};

/** O texto dos DETALHES TÉCNICOS (o "Copiar detalhes" — o que o administrador precisa para achar a falha nos Logs). */
export function textoDetalhes(r: RelatorioFalha): string {
  return [
    `Tipo: ${ROTULO_TIPO[r.tipo]}`,
    r.mensagem && `Mensagem: ${r.mensagem}`,
    r.digest && `Ref.: ${r.digest}`,
    `Tela: ${r.caminho || "—"}`,
    r.instante && `Hora: ${r.instante}`,
  ]
    .filter(Boolean)
    .join("\n");
}
