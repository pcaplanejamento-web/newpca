import { ABA_KEYS, ABAS, type AbaKey } from "./abas.ts";

/**
 * PAPÉIS — o que a pessoa FAZ em cada tela. Módulo PURO (cliente e servidor; testado): o GRUPO (com a permissão dele)
 * decide QUAIS telas a pessoa abre; o PAPEL decide as AÇÕES dentro de cada uma. Acesso efetivo a uma tela = o grupo
 * libera **e** o papel pode Visualizar; o papel Administrador (fixo) pode tudo, em todas as telas (regra firme).
 *
 * `CATALOGO_PAPEIS` é a fonte única: a matriz da tela Papéis, a validação, as sementes da migração e a Referência. Uma
 * ação fora do catálogo de uma tela "não se aplica" (não aparece e nunca é gravada).
 */

export const ACOES_PAPEL = ["visualizar", "manipular", "importar", "exportar", "excluir", "configurar"] as const;
export type AcaoPapel = (typeof ACOES_PAPEL)[number];
export type Tela = AbaKey;

export const ROTULO_ACAO: Record<AcaoPapel, string> = {
  visualizar: "Visualizar",
  manipular: "Manipular",
  importar: "Importar",
  exportar: "Exportar",
  excluir: "Excluir",
  configurar: "Configurar",
};

/** Verbo da mensagem de recusa ("Seu papel não permite importar na Mesa."). */
const VERBO_ACAO: Record<AcaoPapel, string> = {
  visualizar: "abrir",
  manipular: "editar",
  importar: "importar",
  exportar: "exportar",
  excluir: "excluir",
  configurar: "configurar",
};

/** O que cada ação significa, em geral (a descrição por tela fica no catálogo). */
export const DESCRICAO_ACAO: Record<AcaoPapel, string> = {
  visualizar: "Abrir a tela e consultar os dados. Sem ela a tela fica fechada, mesmo que o grupo a libere.",
  manipular: "Criar e editar o conteúdo da tela.",
  importar: "Trazer arquivos para a tela (e reenviar).",
  exportar: "Baixar os dados da tela (planilha, PDF, agenda).",
  excluir: "Apagar registros da tela.",
  configurar: "Alterar a configuração da tela e publicar o que vale para todos.",
};

type InfoTela = { na: string; a: string; acoes: Partial<Record<AcaoPapel, string>> };

/** Por tela: as ações que se aplicam e o que cada uma cobre ali. */
export const CATALOGO_PAPEIS: Record<Tela, InfoTela> = {
  dfd: {
    na: "na Mesa",
    a: "à Mesa",
    acoes: {
      visualizar: "Abrir a Mesa: protocolos, DFDs, itens, histórico e o Dashboard.",
      manipular:
        "Editar capa, DFDs e itens (tratamento, validar assinatura, Situação, Responsável, edição em massa), vincular ou mover DFD e enviar ao PCA.",
      importar: "Importar protocolo e DFD, reenviar protocolo e sobrescrever DFD.",
      exportar: "Baixar as tabelas da Mesa em .xlsx.",
      excluir: "Excluir protocolos (com os DFDs) e DFDs.",
      configurar: "Publicar edições das tabelas para todos.",
    },
  },
  pca: {
    na: "no PCA",
    a: "ao PCA",
    acoes: {
      visualizar: "Abrir os PCAs: Dashboard, Orçamento, a Mesa do PCA e a consulta do Preview.",
      manipular: "Trabalhar na Mesa do PCA: incorporar, devolver, enviar a este PCA e editar o que foi enviado.",
      importar: "Importar planilhas (PCA de lista).",
      exportar: "Baixar o comparativo em .xlsx.",
      excluir: "Excluir PCA e planilha e retirar itens do PCA.",
      configurar: "Criar PCA, alterar a Configuração (nome, ano, fonte, publicar, capa, visão, marcados) e publicar edições das tabelas.",
    },
  },
  catalogo: {
    na: "no Catálogo",
    a: "ao Catálogo",
    acoes: {
      visualizar: "Consultar catálogos, itens, unidades de medida e classificações.",
      manipular: "Criar e editar catálogos e itens, os tipos de DFD e compartilhar itens.",
      importar: "Importar catálogo (.xlsx ou .pdf) e baixar o modelo.",
      exportar: "Baixar o catálogo em .xlsx ou PDF.",
      excluir: "Excluir catálogos e itens.",
      configurar: "Cadastrar unidades de medida, sinônimos e classificações.",
    },
  },
  orcamento: {
    na: "no Orçamento",
    a: "ao Orçamento",
    acoes: {
      visualizar: "Consultar orçamentos, lançamentos, comparativo, vínculos e visões.",
      importar: "Importar o CUBO e reenviar a planilha.",
      exportar: "Baixar os lançamentos (.xlsx ou PDF) e o comparativo.",
      excluir: "Excluir orçamentos.",
      configurar: "Vínculos, visões, nome e ano do orçamento e publicar edições das tabelas.",
    },
  },
  tarefas: {
    na: "em Tarefas",
    a: "a Tarefas",
    acoes: {
      visualizar: "Abrir os quadros do grupo, as tarefas e o Dashboard.",
      manipular:
        "Criar, editar, mover, copiar, arquivar e concluir tarefas (também em massa); checklists, comentários, eventos, criar listas, ordenar cartões e pastas privadas.",
      importar: "Importar quadro do Trello (.json).",
      exportar: "Baixar a Lista em .xlsx.",
      excluir: "Excluir tarefas, listas, quadros e comentários de outras pessoas.",
      configurar:
        "Criar e configurar quadros (listas, etiquetas, equipes, campos, automações, fundo, privado, Trello, modelos) e pastas públicas.",
    },
  },
  calendario: {
    na: "no Calendário",
    a: "ao Calendário",
    acoes: {
      visualizar: "Abrir o Calendário e responder convites.",
      manipular: "Criar e editar tarefas e eventos pelo Calendário.",
      importar: "Assinar agendas externas.",
      exportar: "Baixar .ics, gerar o link de assinatura e imprimir.",
      excluir: "Excluir tarefas pelo Calendário.",
    },
  },
};

export const rotuloTela = (tela: Tela): string => ABAS.find((a) => a.key === tela)?.label ?? tela;
export const ehTela = (x: unknown): x is Tela => typeof x === "string" && (ABA_KEYS as readonly string[]).includes(x);
export const ehAcao = (x: unknown): x is AcaoPapel => typeof x === "string" && (ACOES_PAPEL as readonly string[]).includes(x);

/** A ação faz sentido nesta tela? */
export const aplicavel = (tela: Tela, acao: AcaoPapel): boolean => CATALOGO_PAPEIS[tela].acoes[acao] !== undefined;
/** As ações da tela, na ordem da matriz. */
export const acoesDaTela = (tela: Tela): AcaoPapel[] => ACOES_PAPEL.filter((a) => aplicavel(tela, a));

/** As capacidades de um papel: por tela, as ações permitidas. Tela ausente = fechada. */
export type Capacidades = Partial<Record<Tela, AcaoPapel[]>>;

/**
 * Normaliza QUALQUER valor (JSON gravado, corpo da requisição): só telas e ações que existem e se aplicam, sem repetir,
 * na ordem da matriz; qualquer ação ⇒ Visualizar (a tela precisa estar aberta); tela sem ação some. Idempotente.
 */
export function coerceCapacidades(bruto: unknown): Capacidades {
  const out: Capacidades = {};
  if (!bruto || typeof bruto !== "object" || Array.isArray(bruto)) return out;
  const obj = bruto as Record<string, unknown>;
  for (const tela of ABA_KEYS) {
    const lista = obj[tela];
    if (!Array.isArray(lista)) continue;
    const marcadas = new Set(lista.filter((a): a is AcaoPapel => ehAcao(a) && aplicavel(tela, a)));
    if (marcadas.size === 0) continue;
    marcadas.add("visualizar");
    out[tela] = ACOES_PAPEL.filter((a) => marcadas.has(a));
  }
  return out;
}

/** Tudo o que se aplica, em todas as telas. */
export function capacidadesTudo(): Capacidades {
  const out: Capacidades = {};
  for (const tela of ABA_KEYS) out[tela] = acoesDaTela(tela);
  return out;
}

/** O que a pessoa pode numa tela — as 6 ações. */
export type PodeTela = Readonly<Record<AcaoPapel, boolean>>;
export const PODE_NADA: PodeTela = Object.freeze({
  visualizar: false,
  manipular: false,
  importar: false,
  exportar: false,
  excluir: false,
  configurar: false,
});
export const PODE_TUDO: PodeTela = Object.freeze({
  visualizar: true,
  manipular: true,
  importar: true,
  exportar: true,
  excluir: true,
  configurar: true,
});

/** O contexto do acesso: o papel (ADM ou as capacidades) + as telas que o GRUPO libera. */
export type ContextoAcesso = { admin: boolean; capacidades: Capacidades; abas: Iterable<string> };

/** O que a pessoa pode na tela: ADM = tudo (regra firme); senão o grupo libera a tela E o papel a visualiza. */
export function podeNaTela(ctx: ContextoAcesso, tela: Tela): PodeTela {
  if (ctx.admin) return PODE_TUDO;
  if (!new Set(ctx.abas).has(tela)) return PODE_NADA;
  const acoes = new Set(ctx.capacidades[tela] ?? []);
  if (!acoes.has("visualizar")) return PODE_NADA;
  return Object.freeze(Object.fromEntries(ACOES_PAPEL.map((a) => [a, acoes.has(a) && aplicavel(tela, a)])) as Record<AcaoPapel, boolean>);
}

/** As telas que a pessoa ABRE, na ordem da navegação (a 1ª é a porta de entrada do painel). */
export function telasAbertas(ctx: ContextoAcesso): Tela[] {
  return ABA_KEYS.filter((t) => podeNaTela(ctx, t).visualizar);
}

/** O `role` gravado junto do papel (espelho para leitores antigos: só distingue o Administrador). */
export function roleEspelho(chave: string | null | undefined): "admin" | "gestor" | "membro" {
  return chave === "admin" ? "admin" : chave === "gestor" ? "gestor" : "membro";
}

// ---------------------------------------------------------------------------------------------------------------
// Papéis do sistema (sementes da migração — Gestor e Membro reproduzem as guardas de antes dos papéis).
// ---------------------------------------------------------------------------------------------------------------

export type ChaveSistema = "admin" | "gestor" | "membro";
export type PapelSistema = {
  chave: ChaveSistema;
  nome: string;
  descricao: string;
  capacidades: Capacidades;
  padraoCadastro: boolean;
  ordem: number;
};

export const CAPACIDADES_MEMBRO: Capacidades = coerceCapacidades({
  dfd: ["visualizar", "exportar"],
  pca: ["visualizar", "exportar"],
  catalogo: ["visualizar", "exportar"],
  orcamento: ["visualizar", "exportar"],
  tarefas: ["visualizar", "manipular", "exportar"],
  calendario: ["visualizar", "manipular", "importar", "exportar"],
});

export const PAPEIS_SISTEMA: readonly PapelSistema[] = [
  {
    chave: "admin",
    nome: "Administrador",
    descricao: "Acesso total, inclusive a Administração. Papel fixo do sistema.",
    capacidades: capacidadesTudo(),
    padraoCadastro: false,
    ordem: 0,
  },
  {
    chave: "gestor",
    nome: "Gestor",
    descricao: "Opera e configura as telas que o grupo libera.",
    capacidades: capacidadesTudo(),
    padraoCadastro: false,
    ordem: 1,
  },
  {
    chave: "membro",
    nome: "Membro",
    descricao: "Consulta Mesa, PCA, Catálogo e Orçamento; trabalha em Tarefas e no Calendário.",
    capacidades: CAPACIDADES_MEMBRO,
    padraoCadastro: true,
    ordem: 2,
  },
];

export const papelSistema = (chave: string | null | undefined): PapelSistema | null =>
  PAPEIS_SISTEMA.find((p) => p.chave === chave) ?? null;

/** Pontos de partida do editor de papel ("Começar de"). */
export const MODELOS_PAPEL: readonly { id: string; nome: string; capacidades: Capacidades }[] = [
  {
    id: "consulta",
    nome: "Somente consulta",
    capacidades: Object.fromEntries(ABA_KEYS.map((t) => [t, ["visualizar"]])) as Capacidades,
  },
  { id: "membro", nome: "Como o Membro", capacidades: CAPACIDADES_MEMBRO },
  { id: "tudo", nome: "Tudo (como o Gestor)", capacidades: capacidadesTudo() },
  { id: "nada", nome: "Nada", capacidades: {} },
];

// ---------------------------------------------------------------------------------------------------------------
// Edição da matriz (com as implicações) e comparação.
// ---------------------------------------------------------------------------------------------------------------

/** Liga/desliga uma célula: ligar qualquer ação liga o Visualizar; desligar o Visualizar fecha a tela (tira tudo). */
export function alternarCelula(caps: Capacidades, tela: Tela, acao: AcaoPapel, ligar: boolean): Capacidades {
  if (!aplicavel(tela, acao)) return coerceCapacidades(caps);
  const atual = new Set(caps[tela] ?? []);
  if (ligar) {
    atual.add(acao);
    atual.add("visualizar");
  } else if (acao === "visualizar") {
    atual.clear();
  } else {
    atual.delete(acao);
  }
  return coerceCapacidades({ ...caps, [tela]: [...atual] });
}

/** Liga (tudo o que se aplica) ou desliga (fecha) a tela inteira. */
export function alternarLinha(caps: Capacidades, tela: Tela, ligar: boolean): Capacidades {
  return coerceCapacidades({ ...caps, [tela]: ligar ? acoesDaTela(tela) : [] });
}

/** Liga/desliga a ação em todas as telas em que ela se aplica (com as mesmas implicações da célula). */
export function alternarColuna(caps: Capacidades, acao: AcaoPapel, ligar: boolean): Capacidades {
  let out = coerceCapacidades(caps);
  for (const tela of ABA_KEYS) if (aplicavel(tela, acao)) out = alternarCelula(out, tela, acao, ligar);
  return out;
}

export type EstadoGrupo = "todas" | "algumas" | "nenhuma";

/** A linha da tela: todas as ações, algumas ou nenhuma (a caixa "marcar a linha" fica indeterminada no meio). */
export function estadoLinha(caps: Capacidades, tela: Tela): EstadoGrupo {
  const n = (caps[tela] ?? []).filter((a) => aplicavel(tela, a)).length;
  return n === 0 ? "nenhuma" : n === acoesDaTela(tela).length ? "todas" : "algumas";
}

/** A coluna da ação: marcada em todas as telas em que se aplica, em algumas ou em nenhuma. */
export function estadoColuna(caps: Capacidades, acao: AcaoPapel): EstadoGrupo {
  const telas = ABA_KEYS.filter((t) => aplicavel(t, acao));
  const n = telas.filter((t) => (caps[t] ?? []).includes(acao)).length;
  return n === 0 ? "nenhuma" : n === telas.length ? "todas" : "algumas";
}

export type DiffTela = { tela: Tela; ganhou: AcaoPapel[]; perdeu: AcaoPapel[] };

/** O que mudou, por tela (só as telas com mudança, na ordem da navegação). */
export function diffCapacidades(antes: Capacidades, depois: Capacidades): DiffTela[] {
  const a = coerceCapacidades(antes);
  const d = coerceCapacidades(depois);
  const out: DiffTela[] = [];
  for (const tela of ABA_KEYS) {
    const sa = new Set(a[tela] ?? []);
    const sd = new Set(d[tela] ?? []);
    const ganhou = ACOES_PAPEL.filter((x) => sd.has(x) && !sa.has(x));
    const perdeu = ACOES_PAPEL.filter((x) => sa.has(x) && !sd.has(x));
    if (ganhou.length || perdeu.length) out.push({ tela, ganhou, perdeu });
  }
  return out;
}

/** "Mesa: +Importar −Excluir; PCA: −Visualizar" — o resumo do histórico. Vazio = nada mudou. */
export function textoDiffCapacidades(diff: readonly DiffTela[]): string {
  return diff
    .map((d) => `${rotuloTela(d.tela)}: ${[...d.ganhou.map((a) => `+${ROTULO_ACAO[a]}`), ...d.perdeu.map((a) => `−${ROTULO_ACAO[a]}`)].join(" ")}`)
    .join("; ");
}

/** Alguma capacidade foi retirada? (a tela avisa antes de gravar num papel em uso) */
export const retiraAlgo = (diff: readonly DiffTela[]): boolean => diff.some((d) => d.perdeu.length > 0);

export type ResumoTela = { tela: Tela; rotulo: string; acoes: AcaoPapel[]; tudo: boolean };

/** As telas que o papel abre, com as ações — para o resumo compacto na lista de papéis. */
export function resumoCapacidades(caps: Capacidades): ResumoTela[] {
  const c = coerceCapacidades(caps);
  return ABA_KEYS.filter((t) => c[t]?.length).map((t) => {
    const acoes = c[t] ?? [];
    return { tela: t, rotulo: rotuloTela(t), acoes, tudo: acoes.length === acoesDaTela(t).length };
  });
}

// ---------------------------------------------------------------------------------------------------------------
// Mensagens.
// ---------------------------------------------------------------------------------------------------------------

/** A recusa de uma ação (403): "Seu papel não permite importar na Mesa." */
export function mensagemSemPermissao(tela: Tela, acao: AcaoPapel): string {
  return `Seu papel não permite ${VERBO_ACAO[acao]} ${CATALOGO_PAPEIS[tela].na}.`;
}

/** A tela fechada (página ou 403 de leitura). */
export function mensagemTelaFechada(tela: Tela): string {
  return `Você não tem acesso ${CATALOGO_PAPEIS[tela].a}: o grupo ativo não libera a tela ou o seu papel não permite visualizá-la. Fale com o administrador.`;
}

/**
 * Por que a pessoa não abre NENHUMA tela (o Perfil explica) — `null` quando abre alguma (ou é ADM).
 * `abasDoGrupo` = as telas que o grupo ATIVO libera.
 */
export function motivoSemModulos(p: { admin: boolean; temGrupo: boolean; abasDoGrupo: Iterable<string>; capacidades: Capacidades }): string | null {
  if (p.admin) return null;
  if (!p.temGrupo) return "Você ainda não está em nenhum grupo — peça ao administrador para incluir você num grupo.";
  const abas = [...p.abasDoGrupo].filter(ehTela);
  if (abas.length === 0) return "O grupo ativo não libera nenhuma tela (sem permissão ou com uma permissão sem telas) — fale com o administrador.";
  if (telasAbertas({ admin: false, capacidades: p.capacidades, abas }).length === 0)
    return "Seu papel não permite visualizar as telas que o grupo ativo libera — fale com o administrador.";
  return null;
}
