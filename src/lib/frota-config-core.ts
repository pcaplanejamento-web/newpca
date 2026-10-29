/**
 * FROTAS — a CONFIGURAÇÃO (blob `configuracoes` id=1, chave `frota`) e a régua da ATUALIZAÇÃO AUTOMÁTICA. Puro (testado).
 * O `clientSecret` fica CIFRADO pela chave mestra e NUNCA volta ao navegador (`configFrotaView`).
 */

export type ConfigFrota = {
  /** A credencial da Vólus (Client ID público; o segredo CIFRADO — "" = não definido). */
  clientId: string;
  clientSecret: string;
  /** A atualização automática (cron): ligada, a cada `frequenciaMin` (por contrato), nos dias úteis e no horário. */
  ativa: boolean;
  frequenciaMin: number;
  diasUteis: boolean;
  horaInicio: number;
  horaFim: number;
  /** Quantos dias para trás cada ciclo relê (a Vólus corrige e fatura transações depois — os recentes mudam). */
  diasRecentes: number;
  /** Os ALERTAS (os limites que o ADM ajusta). */
  alertas: LimitesAlertas;
  /** As CORES dos dados (combustível e manutenção) em todo o sistema — `null` = a do tema (`--serie-1`/`--serie-2`). */
  cores: CoresFrota;
  /** O último teste da credencial (quando deu certo e quantos contratos ela alcança). */
  testadoEm: string | null;
  empresasNoTeste: number;
};

export type LimitesAlertas = {
  /** Consumo (km/l) que se afasta da mediana do PRÓPRIO veículo além deste % — alerta. */
  consumoPct: number;
  /** Preço por litro que se afasta da mediana do MESMO combustível no mês além deste % — alerta. */
  precoPct: number;
  /** Dois abastecimentos do mesmo veículo com menos que estas horas de intervalo — alerta. */
  horasEntre: number;
  /** Litros acima da capacidade do tanque (cadastrada) mais esta folga % — alerta. */
  tanquePct: number;
  /** Km rodado entre dois abastecimentos acima deste valor — alerta (hodômetro digitado errado). */
  kmMaximo: number;
};

export type CoresFrota = { combustivel: string | null; manutencao: string | null };
/** As cores do tema que valem sem escolha (as mesmas da paleta dos gráficos). */
export const COR_PADRAO_FROTA = { combustivel: "var(--serie-1)", manutencao: "var(--serie-2)" } as const;
/** O hex aceito (#rrggbb) — qualquer outra coisa = a cor do tema (nada de CSS livre). */
export const hexValido = (v: unknown): string | null => (typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v.trim()) ? v.trim().toLowerCase() : null);
/** As variáveis CSS das cores escolhidas (`--frota-combustivel`, `--frota-manutencao`), só com hex validado. */
export function cssCoresFrota(c: CoresFrota): string {
  const v = [c.combustivel ? `--frota-combustivel:${c.combustivel}` : "", c.manutencao ? `--frota-manutencao:${c.manutencao}` : ""].filter(Boolean);
  return v.length ? `:root{${v.join(";")}}` : "";
}

export const ALERTAS_PADRAO: LimitesAlertas = { consumoPct: 40, precoPct: 20, horasEntre: 3, tanquePct: 10, kmMaximo: 2000 };

export const OPCOES_FREQUENCIA_FROTA = [60, 120, 180, 360, 720, 1440];
export const OPCOES_DIAS_RECENTES = [15, 30, 45, 60, 90];

export const CONFIG_FROTA_PADRAO: ConfigFrota = {
  clientId: "",
  clientSecret: "",
  ativa: false,
  frequenciaMin: 360,
  diasUteis: false,
  horaInicio: 6,
  horaFim: 22,
  diasRecentes: 45,
  alertas: ALERTAS_PADRAO,
  cores: { combustivel: null, manutencao: null },
  testadoEm: null,
  empresasNoTeste: 0,
};

const num = (v: unknown, d: number, min: number, max: number) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : d;
};

/** Qualquer JSON → a config válida (campo a campo; o inválido vira o padrão). */
export function lerConfigFrota(bruto: unknown): ConfigFrota {
  const r = (bruto && typeof bruto === "object" ? bruto : {}) as Record<string, unknown>;
  const a = (r.alertas && typeof r.alertas === "object" ? r.alertas : {}) as Record<string, unknown>;
  const c = (r.cores && typeof r.cores === "object" ? r.cores : {}) as Record<string, unknown>;
  const p = CONFIG_FROTA_PADRAO;
  const horaInicio = num(r.horaInicio, p.horaInicio, 0, 23);
  const horaFim = num(r.horaFim, p.horaFim, 1, 24);
  return {
    clientId: typeof r.clientId === "string" ? r.clientId.trim().slice(0, 200) : "",
    clientSecret: typeof r.clientSecret === "string" ? r.clientSecret : "",
    ativa: r.ativa === true,
    frequenciaMin: num(r.frequenciaMin, p.frequenciaMin, 30, 10_080),
    diasUteis: r.diasUteis === true,
    horaInicio,
    horaFim: horaFim > horaInicio ? horaFim : Math.min(24, horaInicio + 1),
    diasRecentes: num(r.diasRecentes, p.diasRecentes, 7, 366),
    alertas: {
      consumoPct: num(a.consumoPct, ALERTAS_PADRAO.consumoPct, 5, 200),
      precoPct: num(a.precoPct, ALERTAS_PADRAO.precoPct, 5, 200),
      horasEntre: num(a.horasEntre, ALERTAS_PADRAO.horasEntre, 0, 48),
      tanquePct: num(a.tanquePct, ALERTAS_PADRAO.tanquePct, 0, 100),
      kmMaximo: num(a.kmMaximo, ALERTAS_PADRAO.kmMaximo, 100, 100_000),
    },
    cores: { combustivel: hexValido(c.combustivel), manutencao: hexValido(c.manutencao) },
    testadoEm: typeof r.testadoEm === "string" ? r.testadoEm : null,
    empresasNoTeste: num(r.empresasNoTeste, 0, 0, 1000),
  };
}

/** A config para o NAVEGADOR: sem o segredo (só se está definido). */
export type ConfigFrotaView = Omit<ConfigFrota, "clientSecret"> & { segredoDefinido: boolean };
export function configFrotaView(c: ConfigFrota): ConfigFrotaView {
  const { clientSecret, ...resto } = c;
  return { ...resto, segredoDefinido: !!clientSecret };
}

/** A credencial pronta para ler (Client ID + segredo cifrado). */
export const credencialDefinida = (c: ConfigFrota) => !!c.clientId && !!c.clientSecret;

// ─── A AUTOMÁTICA ───────────────────────────────────────────────────────────────────────────────────────────────

const FMT = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23", weekday: "short" });

/** Hoje (AAAA-MM-DD), a hora e o dia da semana em BRASÍLIA. */
export function agoraBrasilia(agora: Date): { dia: string; hora: number; util: boolean } {
  const p = Object.fromEntries(FMT.formatToParts(agora).map((x) => [x.type, x.value]));
  return { dia: `${p.year}-${p.month}-${p.day}`, hora: Number(p.hour), util: !["Sat", "Sun"].includes(String(p.weekday)) };
}

/** A automática pode rodar AGORA (ligada, com credencial, no horário e — se pedido — em dia útil)? `null` = pode; senão o motivo. */
export function motivoForaDaHora(c: ConfigFrota, agora: Date): string | null {
  if (!c.ativa) return "A atualização automática está desligada.";
  if (!credencialDefinida(c)) return "A credencial da Vólus não está configurada.";
  const b = agoraBrasilia(agora);
  if (c.diasUteis && !b.util) return "Fora dos dias úteis.";
  if (b.hora < c.horaInicio || b.hora >= c.horaFim) return `Fora do horário (${c.horaInicio}h às ${c.horaFim}h).`;
  return null;
}

/** O cursor de um contrato × tipo, como gravado. */
export type CursorFrota = {
  contrato: string;
  tipo: string;
  cicloInicio: string | null;
  proximo: string | null;
  passoDias: number;
  falhas: number;
  esperaAte: string | null;
  travaAte: string | null;
  cicloConcluidoEm: string | null;
};

/** O próximo trabalho da automática: o cursor com leitura pendente (ou o que deve começar um ciclo novo). */
export type TrabalhoFrota = { contrato: string; tipo: string; inicio: string; fim: string; novoCiclo: boolean };

/**
 * Escolhe o PRÓXIMO trabalho entre os cursores (o mais atrasado primeiro): um ciclo em andamento continua; um concluído há
 * mais que a frequência começa outro (dos últimos `diasRecentes` dias até hoje); em espera ou travado, pula. Puro.
 */
export function proximoTrabalho(cursores: readonly CursorFrota[], c: ConfigFrota, agora: Date): TrabalhoFrota | null {
  const hoje = agoraBrasilia(agora).dia;
  const iso = agora.toISOString();
  const candidatos: { t: TrabalhoFrota; ordem: string }[] = [];
  for (const k of cursores) {
    if (k.esperaAte && k.esperaAte > iso) continue;
    if (k.travaAte && k.travaAte > iso) continue;
    const passo = Math.max(1, Math.min(31, k.passoDias || 7));
    if (k.proximo && k.proximo <= hoje) {
      const fim = somar(k.proximo, passo - 1);
      candidatos.push({ t: { contrato: k.contrato, tipo: k.tipo, inicio: k.proximo, fim: fim < hoje ? fim : hoje, novoCiclo: false }, ordem: `0${k.proximo}` });
      continue;
    }
    const concluido = k.cicloConcluidoEm ? Date.parse(k.cicloConcluidoEm.replace(" ", "T") + (/Z$/.test(k.cicloConcluidoEm) ? "" : "Z")) : 0;
    if (!k.cicloConcluidoEm || agora.getTime() - concluido >= c.frequenciaMin * 60_000) {
      const inicio = somar(hoje, -(c.diasRecentes - 1));
      const fim = somar(inicio, passo - 1);
      candidatos.push({ t: { contrato: k.contrato, tipo: k.tipo, inicio, fim: fim < hoje ? fim : hoje, novoCiclo: true }, ordem: `1${k.cicloConcluidoEm ?? ""}` });
    }
  }
  candidatos.sort((a, b) => a.ordem.localeCompare(b.ordem));
  return candidatos[0]?.t ?? null;
}

/** Depois de ler [.., fim] com sucesso: o próximo dia do ciclo — `null` quando o ciclo chegou a hoje (terminou). */
export function avancarCursor(fim: string, hoje: string): string | null {
  const proximo = somar(fim, 1);
  return proximo > hoje ? null : proximo;
}

const somar = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

/** O passo (dias por pedido) depois de um resultado: divide quando não coube; cresce (até 31) quando sobrou muito. */
export function novoPasso(atual: number, dias: number, r: { dividir?: number; bytes?: number }, maxBytes: number): number {
  if (r.dividir) return Math.max(1, Math.floor(dias / r.dividir));
  if (r.bytes != null && r.bytes < maxBytes / 4 && dias >= atual) return Math.min(31, Math.max(atual, dias) * 2);
  return Math.max(1, Math.min(31, atual));
}

/** A espera depois de uma falha: 2, 4, 8… até 60 min (transitória); a permanente (credencial, permissão) espera 6 h. */
export function esperaDaFalha(falhas: number, transitoria: boolean): number {
  return transitoria ? Math.min(60, 2 ** Math.max(1, falhas)) : 360;
}
