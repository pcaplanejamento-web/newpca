// AUTOMAÇÃO CENTI — o núcleo PURO (testado) da plataforma: as CAPACIDADES que o motor da extensão conhece, as RECEITAS
// (o que cada automação pode fazer), a configuração do ADM (freio de emergência, receitas ligadas, a operação do Emitir
// DFD), os estados da execução e o ALVO de uma escrita (o que a autorização de uso único autoriza).
// Princípios: negado por padrão · escrita só ACRESCENTA · toda escrita = autorização de uso único + confirmação · ensaio
// antes · freio · tudo auditado e idempotente · nada fixo.

import { coerceModeloTela, type ModeloTela } from "./automacao-tela-protocolo.ts";

/** As capacidades do MOTOR. As de ESCRITA são uma lista FIXA (cada uma tem o seu validador na extensão). */
export const CAPACIDADES_LEITURA = ["estado", "ler", "consultar", "baixar"] as const;
export const CAPACIDADES_OPERAR = ["operar"] as const;
export const CAPACIDADES_ESCRITA = ["anexar"] as const;
export type CapacidadeLeitura = (typeof CAPACIDADES_LEITURA)[number];
export type CapacidadeEscrita = (typeof CAPACIDADES_ESCRITA)[number];
export type Capacidade = CapacidadeLeitura | (typeof CAPACIDADES_OPERAR)[number] | CapacidadeEscrita;

export const ehEscrita = (c: string): c is CapacidadeEscrita => (CAPACIDADES_ESCRITA as readonly string[]).includes(c);

/** Uma RECEITA: o que a automação faz e com quais capacidades (o motor recusa as que ela não declara). */
export type Receita = {
  id: string;
  versao: number;
  nome: string;
  descricao: string;
  capacidades: readonly Capacidade[];
  /** Disponível nesta versão do sistema (as previstas aparecem como "Em breve" e nunca rodam). */
  disponivel: boolean;
  /** Ligada sem o ADM mexer (as de ESCRITA nascem ligadas só quando já existiam antes da plataforma). */
  padraoAtiva: boolean;
};

export const RECEITAS: readonly Receita[] = [
  {
    id: "emitir-dfd",
    versao: 1,
    nome: "Emitir DFDs",
    descricao: "Emite o PDF de cada DFD na Centi e salva no computador (pasta, .zip ou PDF unido).",
    capacidades: ["estado", "operar", "baixar"],
    disponivel: true,
    padraoAtiva: true,
  },
  {
    id: "anexar-dfds",
    versao: 1,
    nome: "Anexar DFDs ao protocolo da Centi",
    descricao: "Emite cada DFD e o anexa como documento novo ao protocolo da Centi (nada mais é alterado).",
    capacidades: ["estado", "ler", "operar", "baixar", "anexar"],
    disponivel: true,
    padraoAtiva: true,
  },
  {
    id: "protocolos-por-reparticao",
    versao: 1,
    nome: "Ler a Tela Protocolo",
    descricao:
      "Lê os protocolos das suas repartições na Tela Protocolo da Centi (as consultas aprendidas clicando), emite o PDF de cada um e o abre na mesma análise da importação de protocolo (só leitura na Centi).",
    capacidades: ["estado", "consultar", "operar", "baixar"],
    disponivel: true,
    padraoAtiva: true,
  },
  {
    id: "baixar-relatorios",
    versao: 1,
    nome: "Baixar relatórios",
    descricao: "Gera e baixa relatórios da Centi (orçamento, planejamento, empenhos).",
    capacidades: ["estado", "operar", "baixar"],
    disponivel: false,
    padraoAtiva: false,
  },
  {
    id: "consultar-dados",
    versao: 1,
    nome: "Consultar dados",
    descricao: "Lê registros da Centi para conferir com o sistema (só leitura).",
    capacidades: ["estado", "ler", "consultar"],
    disponivel: false,
    padraoAtiva: false,
  },
  {
    id: "tramitar-protocolo",
    versao: 1,
    nome: "Tramitar protocolo",
    descricao: "Envia o protocolo à repartição de destino (escrita — liberada numa versão própria da extensão).",
    capacidades: ["estado", "ler"],
    disponivel: false,
    padraoAtiva: false,
  },
];

export const receitaPorId = (id: string): Receita | null => RECEITAS.find((r) => r.id === id) ?? null;

/** A operação "Emitir DFD" da Centi (aprendida da tela; vale para TODOS os ADMs). */
export type OperacaoCentiServidor = { moduleKey: number; guid: string; assinatura: string; em: string | null };

/** A configuração da Automação (blob `configuracoes.automacao`). */
export type ConfigAutomacao = {
  /** FREIO DE EMERGÊNCIA: desligada = nenhuma escrita é autorizada (a leitura segue). */
  ativa: boolean;
  /** Receitas ligadas/desligadas pelo ADM (ausente = o padrão da receita). */
  receitas: Record<string, { ativa: boolean }>;
  operacao: OperacaoCentiServidor | null;
  /** O MODELO da Tela Protocolo (as consultas aprendidas clicando, as colunas e a emissão do PDF) — vale para todos. */
  telaProtocolo: ModeloTela | null;
};

export const CONFIG_AUTOMACAO_PADRAO: ConfigAutomacao = { ativa: true, receitas: {}, operacao: null, telaProtocolo: null };

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Qualquer JSON → configuração válida (o que não se reconhece é descartado). */
export function coerceConfigAutomacao(v: unknown): ConfigAutomacao {
  const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  const receitas: ConfigAutomacao["receitas"] = {};
  const r = o.receitas && typeof o.receitas === "object" ? (o.receitas as Record<string, unknown>) : {};
  for (const [id, x] of Object.entries(r)) {
    if (!receitaPorId(id)) continue;
    const ativa = (x as { ativa?: unknown } | null)?.ativa;
    if (typeof ativa === "boolean") receitas[id] = { ativa };
  }
  const op = o.operacao && typeof o.operacao === "object" ? (o.operacao as Record<string, unknown>) : null;
  const mk = Number(op?.moduleKey);
  const guid = typeof op?.guid === "string" ? op.guid.trim().toLowerCase() : "";
  const operacao =
    op && Number.isInteger(mk) && mk > 0 && GUID.test(guid)
      ? {
          moduleKey: mk,
          guid,
          assinatura: typeof op.assinatura === "string" ? op.assinatura.replace(/\D/g, "").slice(0, 12) : "",
          em: typeof op.em === "string" ? op.em.slice(0, 40) : null,
        }
      : null;
  return { ativa: typeof o.ativa === "boolean" ? o.ativa : true, receitas, operacao, telaProtocolo: coerceModeloTela(o.telaProtocolo) };
}

/** A receita roda? (existe, está disponível nesta versão e ligada pelo ADM — ou pelo padrão). */
export function receitaAtiva(cfg: ConfigAutomacao, id: string): boolean {
  const r = receitaPorId(id);
  if (!r?.disponivel) return false;
  return cfg.receitas[id]?.ativa ?? r.padraoAtiva;
}

/** Pode ESCREVER na Centi agora? — freio, receita ligada, e a capacidade é de escrita E declarada pela receita. */
export function motivoNaoEscrever(cfg: ConfigAutomacao, receitaId: string, capacidade: string): string | null {
  if (!cfg.ativa) return "A Automação está PAUSADA pelo Administrador (freio de emergência).";
  const r = receitaPorId(receitaId);
  if (!r) return "Receita desconhecida.";
  if (!receitaAtiva(cfg, receitaId)) return `A receita “${r.nome}” está desligada.`;
  if (!ehEscrita(capacidade)) return "Capacidade de escrita desconhecida.";
  if (!r.capacidades.includes(capacidade)) return `A receita “${r.nome}” não escreve com “${capacidade}”.`;
  return null;
}

/* ── Execução ──────────────────────────────────────────────────────────────────────────────────────────────────────── */

export const ESTADOS_EXECUCAO = ["preparada", "rodando", "pausada", "concluida", "falhou", "cancelada"] as const;
export type EstadoExecucao = (typeof ESTADOS_EXECUCAO)[number];
export const ESTADOS_PASSO = ["fila", "executando", "ok", "falhou", "pulado"] as const;
export type EstadoPasso = (typeof ESTADOS_PASSO)[number];

const TRANSICOES: Record<EstadoExecucao, readonly EstadoExecucao[]> = {
  preparada: ["rodando", "cancelada"],
  rodando: ["pausada", "concluida", "falhou", "cancelada"],
  pausada: ["rodando", "cancelada"],
  concluida: [],
  falhou: ["rodando"],
  cancelada: [],
};

/** A execução pode ir de `de` para `para`? (finalizadas não voltam — a falhou pode ser RETOMADA). */
export const podeTransitar = (de: EstadoExecucao, para: EstadoExecucao) => TRANSICOES[de].includes(para);

/** O estado final da execução pelos passos (nenhum pendente → concluída; algum falhou → falhou). */
export function estadoFinal(passos: readonly { estado: EstadoPasso }[]): EstadoExecucao | null {
  if (passos.some((p) => p.estado === "fila" || p.estado === "executando")) return null;
  return passos.some((p) => p.estado === "falhou") ? "falhou" : "concluida";
}

/* ── Alvo de uma escrita ───────────────────────────────────────────────────────────────────────────────────────────── */

/** O documento anexado a um protocolo da Centi: Id + nº + ano + a descrição (sem caixa/espaços repetidos). */
export type AlvoAnexo = { id: string; numero: string; ano: string | null; descricao: string };

const limpa = (t: string) => t.trim().replace(/\s+/g, " ").toUpperCase();

/** A forma CANÔNICA do alvo (a mesma no servidor e na extensão) — o que a autorização de uso único protege. */
export function textoAlvoAnexo(a: AlvoAnexo): string {
  return ["anexar", a.id.replace(/\D/g, ""), a.numero.replace(/\D/g, ""), (a.ano ?? "").replace(/\D/g, ""), limpa(a.descricao)].join("|");
}

/** A descrição como o sistema a REGISTRA (a mesma do alvo canônico) — para conferir "já anexado" antes de emitir. */
export const descricaoCanonica = (d: string) => limpa(d);

/** A validade da autorização (segundos) — o tempo de emitir, conferir e anexar UM PDF. */
export const VALIDADE_AUTORIZACAO_S = 300;
