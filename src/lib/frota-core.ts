/**
 * FROTAS — núcleo PURO das telas (testado — `tests/frota-core.test.ts`): o pacote do banco vira transações; daí saem os
 * INDICADORES, os AGRUPAMENTOS, o CONSUMO entre abastecimentos (pelo hodômetro), os ALERTAS e a FICHA do veículo. Tudo sobre
 * as transações que a tela já tem (nenhuma consulta nova). Valores em reais; litros; km.
 */
import type { LimitesAlertas } from "./frota-config-core.ts";
import { baldesData, type BaldeData, type GranularidadeData } from "./mesa-metricas.ts";

export type TipoNum = 0 | 1;

/** Uma transação do PACOTE (a tupla de `COLUNAS_PACOTE`, `frota-sql.ts`, na mesma ordem). */
export type Transacao = {
  id: number;
  tipo: "abastecimento" | "manutencao";
  dia: string;
  hora: string | null;
  contrato: string;
  placa: string | null;
  produto: string | null;
  tipoManutencao: string | null;
  litros: number | null;
  precoLitro: number | null;
  valor: number;
  hodometro: number | null;
  kmRodado: number | null;
  consumo: number | null;
  estabelecimento: string | null;
  cidade: string | null;
  uf: string | null;
  motorista: string | null;
  unidade: string | null;
  reparticaoId: number | null;
  orgaoId: number | null;
  empenho: string | null;
  processo: string | null;
  qtdItens: number;
  removido: boolean;
  /** A UNIDADE do SISTEMA (o cadastro — pela ligação da unidade da Vólus): a sigla única e o nome; `null` = sem unidade. */
  unidadeSistema: string | null;
  unidadeSistemaNome: string | null;
  /** O ÓRGÃO do SISTEMA (o da unidade, senão o do contrato): a sigla e o nome; `null` = sem órgão. */
  orgao: string | null;
  orgaoNome: string | null;
};

type Celula = string | number | null;
const s = (v: Celula | undefined) => (v == null || v === "" ? null : String(v));
const n = (v: Celula | undefined) => (v == null || v === "" ? null : Number.isFinite(Number(v)) ? Number(v) : null);

/** O pacote do banco → as transações (do mais recente ao mais antigo). */
export function transacoesDoPacote(tuplas: readonly Celula[][]): Transacao[] {
  const out = tuplas.map((t) => ({
    id: Number(t[0]),
    tipo: (Number(t[1]) === 0 ? "abastecimento" : "manutencao") as Transacao["tipo"],
    dia: String(t[2] ?? ""),
    hora: s(t[3]),
    contrato: String(t[4] ?? ""),
    placa: s(t[5]),
    produto: s(t[6]),
    tipoManutencao: s(t[7]),
    litros: n(t[8]),
    precoLitro: n(t[9]),
    valor: n(t[10]) ?? 0,
    hodometro: n(t[11]),
    kmRodado: n(t[12]),
    consumo: n(t[13]),
    estabelecimento: s(t[14]),
    cidade: s(t[15]),
    uf: s(t[16]),
    motorista: s(t[17]),
    unidade: s(t[18]),
    reparticaoId: n(t[19]),
    orgaoId: n(t[20]),
    empenho: s(t[21]),
    processo: s(t[22]),
    qtdItens: n(t[23]) ?? 0,
    removido: Number(t[24]) === 1,
    unidadeSistema: s(t[25]),
    unidadeSistemaNome: s(t[26]),
    orgao: s(t[27]),
    orgaoNome: s(t[28]),
  }));
  return out.sort((a, b) => (b.dia + (b.hora ?? "")).localeCompare(a.dia + (a.hora ?? "")) || b.id - a.id);
}

/** Um veículo do CADASTRO (como a rota devolve). */
export type Veiculo = {
  placa: string;
  tipo: string;
  classificacaoId: number | null;
  marca: string | null;
  modelo: string | null;
  ano: number | null;
  situacao: string;
  origem: string | null;
  fipe: number | null;
  locacao: number | null;
  contrato: string | null;
  capacidadeTanque: number | null;
  reparticaoId: number | null;
  observacao: string | null;
  atualizadoEm?: string;
  atualizadoPor?: string | null;
};
export type Classificacao = { id: number; nome: string; cor: string };

export const ROTULO_TIPO_VEICULO: Record<string, string> = { veiculo: "Veículo", maquina: "Máquina" };
export const ROTULO_SITUACAO: Record<string, string> = { ativo: "Ativo", inativo: "Inativo" };
export const ROTULO_ORIGEM: Record<string, string> = { proprio: "Próprio", contrato: "Contrato" };

/**
 * A TRAVA PELA ORIGEM (a mesma na tela e no servidor): o veículo PRÓPRIO não tem locação nem contrato; o de CONTRATO não
 * tem FIPE — o que não cabe é gravado vazio.
 */
export function aplicarTravaOrigem<T extends Pick<Veiculo, "origem" | "fipe" | "locacao" | "contrato">>(v: T): T {
  if (v.origem === "proprio") return { ...v, locacao: null, contrato: null };
  if (v.origem === "contrato") return { ...v, fipe: null };
  return v;
}

// ─── FILTROS ────────────────────────────────────────────────────────────────────────────────────────────────────

/** As DIMENSÕES de filtro e de agrupamento da frota. `so` = só de um tipo (a do outro tipo não o filtra). */
export const DIMS_FROTA = [
  { chave: "orgao", rotulo: "Órgão" },
  { chave: "unidadeSistema", rotulo: "Unidade" },
  { chave: "contrato", rotulo: "Contrato" },
  { chave: "unidade", rotulo: "Setor (Vólus)" },
  { chave: "placa", rotulo: "Placa" },
  { chave: "tipoVeiculo", rotulo: "Tipo" },
  { chave: "classificacao", rotulo: "Classificação" },
  { chave: "origem", rotulo: "Origem" },
  { chave: "situacao", rotulo: "Situação" },
  { chave: "marca", rotulo: "Marca" },
  { chave: "modelo", rotulo: "Modelo" },
  { chave: "motorista", rotulo: "Motorista" },
  { chave: "produto", rotulo: "Combustível", so: "abastecimento" },
  { chave: "tipoManutencao", rotulo: "Serviço", so: "manutencao" },
  { chave: "estabelecimento", rotulo: "Fornecedor" },
  { chave: "cidade", rotulo: "Cidade" },
] as const;
export type DimFrota = (typeof DIMS_FROTA)[number]["chave"] | "mes";
export const ROTULO_DIM: Record<DimFrota, string> = { ...Object.fromEntries(DIMS_FROTA.map((d) => [d.chave, d.rotulo])), mes: "Mês" } as Record<DimFrota, string>;

export const SEM_VALOR = "(não informado)";
/** O registro sem a unidade / o órgão do SISTEMA (a unidade da Vólus sem ligação; o contrato sem órgão) — filtrável. */
export const SEM_UNIDADE = "Sem unidade";
export const SEM_ORGAO = "Sem órgão";
const VAZIOS = new Set([SEM_VALOR, SEM_UNIDADE, SEM_ORGAO]);

/** A dimensão que só existe num TIPO de transação (Combustível, Serviço) — a do outro tipo não é filtrada. */
export function soDoTipo(dim: DimFrota): Transacao["tipo"] | undefined {
  const d = DIMS_FROTA.find((x) => x.chave === dim);
  return d && "so" in d ? (d.so as Transacao["tipo"]) : undefined;
}

export type ContextoFrota = { veiculos: ReadonlyMap<string, Veiculo>; classificacoes: ReadonlyMap<number, Classificacao>; contratos: ReadonlyMap<string, string> };

export function contextoFrota(veiculos: readonly Veiculo[], classificacoes: readonly Classificacao[], contratos: readonly { codigo: string; sigla: string; nome: string }[] = []): ContextoFrota {
  return {
    veiculos: new Map(veiculos.map((v) => [v.placa, v])),
    classificacoes: new Map(classificacoes.map((c) => [c.id, c])),
    contratos: new Map(contratos.map((c) => [c.codigo, c.sigla || c.nome || c.codigo])),
  };
}

const MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
export const rotuloMes = (m: string) => `${MESES[Number(m.slice(5, 7)) - 1] ?? m}/${m.slice(2, 4)}`;

/** O valor de uma dimensão numa transação (o texto — vazio = `SEM_VALOR`, para a soma bater com os indicadores). */
export function valorDim(t: Transacao, dim: DimFrota, ctx: ContextoFrota): string {
  const v = t.placa ? ctx.veiculos.get(t.placa) : undefined;
  const r = (() => {
    switch (dim) {
      case "contrato":
        return ctx.contratos.get(t.contrato) ?? t.contrato;
      case "placa":
        return t.placa;
      case "tipoVeiculo":
        return v ? ROTULO_TIPO_VEICULO[v.tipo] : null;
      case "classificacao":
        return v?.classificacaoId != null ? (ctx.classificacoes.get(v.classificacaoId)?.nome ?? null) : null;
      case "marca":
        return v?.marca ?? null;
      case "modelo":
        return v?.modelo ?? null;
      case "origem":
        return v?.origem ? ROTULO_ORIGEM[v.origem] : null;
      case "situacao":
        return v ? ROTULO_SITUACAO[v.situacao] : null;
      case "produto":
        return t.tipo === "abastecimento" ? t.produto : null;
      case "tipoManutencao":
        return t.tipo === "manutencao" ? t.tipoManutencao : null;
      case "motorista":
        return t.motorista;
      case "estabelecimento":
        return t.estabelecimento;
      case "cidade":
        return t.cidade ? `${t.cidade}${t.uf ? `/${t.uf}` : ""}` : null;
      case "unidade":
        return t.unidade;
      case "unidadeSistema":
        return t.unidadeSistema ?? SEM_UNIDADE;
      case "orgao":
        return t.orgao ?? SEM_ORGAO;
      case "mes":
        return t.dia.slice(0, 7);
    }
  })();
  return r || SEM_VALOR;
}

export type FiltrosFrota = { de?: string | null; ate?: string | null; dims?: Partial<Record<DimFrota, readonly string[]>> };

/**
 * FILTRA: o período (pelo dia) e as dimensões (E entre elas; OU dentro). A dimensão só de um tipo (Combustível, Tipo de
 * manutenção) não filtra o outro tipo — escolher "Diesel" não tira as manutenções dos indicadores.
 */
export function filtrarFrota(trs: readonly Transacao[], f: FiltrosFrota, ctx: ContextoFrota): Transacao[] {
  const ativos = Object.entries(f.dims ?? {}).filter(([, vs]) => vs?.length) as [DimFrota, readonly string[]][];
  const conjuntos = ativos.map(([d, vs]) => [d, new Set(vs), soDoTipo(d)] as const);
  return trs.filter((t) => {
    if (f.de && t.dia < f.de) return false;
    if (f.ate && t.dia > f.ate) return false;
    for (const [d, vs, so] of conjuntos) {
      if (so && so !== t.tipo) continue;
      if (!vs.has(valorDim(t, d, ctx))) return false;
    }
    return true;
  });
}

/**
 * As OPÇÕES de uma dimensão (as que aparecem nas transações, com quantas) — ordem alfabética, o sem valor no fim. Os
 * `marcados` que os demais filtros zeraram FICAM (com 0) — senão não haveria como desmarcá-los.
 */
export function opcoesDim(trs: readonly Transacao[], dim: DimFrota, ctx: ContextoFrota, marcados: readonly string[] = []): { valor: string; n: number }[] {
  const m = new Map<string, number>(marcados.map((v) => [v, 0]));
  const so = soDoTipo(dim);
  for (const t of trs) {
    if (so && so !== t.tipo) continue;
    const v = valorDim(t, dim, ctx);
    m.set(v, (m.get(v) ?? 0) + 1);
  }
  return [...m]
    .map(([valor, k]) => ({ valor, n: k }))
    .sort((a, b) => Number(VAZIOS.has(a.valor)) - Number(VAZIOS.has(b.valor)) || a.valor.localeCompare(b.valor, "pt-BR"));
}

/** O NOME de cada valor de Unidade/Órgão do sistema (o detalhe das opções do filtro — a sigla em cima, o nome embaixo). */
export function nomesDim(trs: readonly Transacao[], dim: DimFrota): Map<string, string> {
  const m = new Map<string, string>();
  if (dim !== "unidadeSistema" && dim !== "orgao") return m;
  for (const t of trs) {
    const [k, nome] = dim === "orgao" ? [t.orgao, t.orgaoNome] : [t.unidadeSistema, t.unidadeSistemaNome];
    if (k && nome && nome !== k && !m.has(k)) m.set(k, nome);
  }
  return m;
}

// ─── CONSUMO ────────────────────────────────────────────────────────────────────────────────────────────────────

/** O consumo de cada abastecimento: o km desde o anterior DO MESMO veículo (pelo hodômetro; senão o km que a Vólus mandou) e km/l. */
export type Consumo = { km: number | null; kmPorLitro: number | null; horasDesdeAnterior: number | null; hodometroVoltou: boolean };

const instante = (t: Transacao) => Date.parse(`${t.dia}T${t.hora ?? "12:00"}:00Z`);

export function consumoDosAbastecimentos(trs: readonly Transacao[]): Map<number, Consumo> {
  const porPlaca = new Map<string, Transacao[]>();
  for (const t of trs) {
    if (t.tipo !== "abastecimento" || !t.placa || t.removido) continue;
    const l = porPlaca.get(t.placa) ?? [];
    l.push(t);
    porPlaca.set(t.placa, l);
  }
  const out = new Map<number, Consumo>();
  for (const l of porPlaca.values()) {
    l.sort((a, b) => instante(a) - instante(b) || a.id - b.id);
    let anterior: Transacao | null = null;
    for (const t of l) {
      let km: number | null = null;
      let voltou = false;
      if (anterior?.hodometro != null && t.hodometro != null) {
        const d = t.hodometro - anterior.hodometro;
        if (d > 0) km = d;
        else if (d < 0) voltou = true;
      }
      if (km == null && t.kmRodado != null && t.kmRodado > 0) km = t.kmRodado;
      const litros = t.litros ?? 0;
      out.set(t.id, {
        km,
        kmPorLitro: km != null && litros > 0 ? km / litros : null,
        horasDesdeAnterior: anterior ? (instante(t) - instante(anterior)) / 3_600_000 : null,
        hodometroVoltou: voltou,
      });
      if (t.hodometro != null) anterior = t;
      else anterior ??= t;
    }
  }
  return out;
}

export function mediana(vs: readonly number[]): number | null {
  if (!vs.length) return null;
  const o = [...vs].sort((a, b) => a - b);
  const m = Math.floor(o.length / 2);
  return o.length % 2 ? o[m] : (o[m - 1] + o[m]) / 2;
}

// ─── INDICADORES ────────────────────────────────────────────────────────────────────────────────────────────────

export type KpisFrota = {
  total: number;
  combustivel: number;
  manutencao: number;
  litros: number;
  abastecimentos: number;
  manutencoes: number;
  veiculos: number;
  porVeiculo: number;
  precoMedio: number | null;
  kmRodados: number;
  kmPorLitro: number | null;
  custoPorKm: number | null;
  /** Os meses com algum gasto (a média mensal divide por eles — o recorte pode não ter o ano inteiro). */
  meses: number;
  /** O veículo de MAIOR gasto no recorte. */
  maiorVeiculo: { placa: string; valor: number } | null;
  /** A menor e a maior preço do litro pagos (os abastecimentos com preço). */
  precoMin: number | null;
  precoMax: number | null;
  /** A MAIOR manutenção (o valor e a placa) e o total de itens das manutenções. */
  maiorManutencao: { valor: number; placa: string | null } | null;
  itens: number;
  /** Os registros SEM a unidade do sistema (a unidade da Vólus sem ligação) e o valor deles. */
  semUnidade: number;
  valorSemUnidade: number;
  /** Os fornecedores (postos/oficinas) e os motoristas distintos. */
  fornecedores: number;
  motoristas: number;
};

export function kpisFrota(trs: readonly Transacao[], consumo: ReadonlyMap<number, Consumo>): KpisFrota {
  let comb = 0;
  let manu = 0;
  let litros = 0;
  let nA = 0;
  let nM = 0;
  let km = 0;
  let litrosComKm = 0;
  let itens = 0;
  let precoMin: number | null = null;
  let precoMax: number | null = null;
  let maiorManutencao: KpisFrota["maiorManutencao"] = null;
  const porPlaca = new Map<string, number>();
  const meses = new Set<string>();
  const fornecedores = new Set<string>();
  const motoristas = new Set<string>();
  let semUnidade = 0;
  let valorSemUnidade = 0;
  for (const t of trs) {
    if (t.unidadeSistema == null) {
      semUnidade++;
      valorSemUnidade += t.valor;
    }
    if (t.estabelecimento) fornecedores.add(t.estabelecimento);
    if (t.motorista) motoristas.add(t.motorista);
    if (t.placa) porPlaca.set(t.placa, (porPlaca.get(t.placa) ?? 0) + t.valor);
    if (t.valor > 0) meses.add(t.dia.slice(0, 7));
    if (t.tipo === "abastecimento") {
      comb += t.valor;
      litros += t.litros ?? 0;
      nA++;
      if (t.precoLitro != null && t.precoLitro > 0) {
        precoMin = precoMin == null ? t.precoLitro : Math.min(precoMin, t.precoLitro);
        precoMax = precoMax == null ? t.precoLitro : Math.max(precoMax, t.precoLitro);
      }
      const c = consumo.get(t.id);
      if (c?.km && (t.litros ?? 0) > 0) {
        km += c.km;
        litrosComKm += t.litros ?? 0;
      }
    } else {
      manu += t.valor;
      nM++;
      itens += t.qtdItens;
      if (!maiorManutencao || t.valor > maiorManutencao.valor) maiorManutencao = { valor: t.valor, placa: t.placa };
    }
  }
  let maiorVeiculo: KpisFrota["maiorVeiculo"] = null;
  for (const [placa, valor] of porPlaca) if (!maiorVeiculo || valor > maiorVeiculo.valor) maiorVeiculo = { placa, valor };
  const total = comb + manu;
  return {
    total,
    combustivel: comb,
    manutencao: manu,
    litros,
    abastecimentos: nA,
    manutencoes: nM,
    veiculos: porPlaca.size,
    porVeiculo: porPlaca.size ? total / porPlaca.size : 0,
    precoMedio: litros > 0 ? comb / litros : null,
    kmRodados: km,
    kmPorLitro: litrosComKm > 0 ? km / litrosComKm : null,
    custoPorKm: km > 0 ? total / km : null,
    meses: meses.size,
    maiorVeiculo,
    precoMin,
    precoMax,
    maiorManutencao,
    itens,
    semUnidade,
    valorSemUnidade,
    fornecedores: fornecedores.size,
    motoristas: motoristas.size,
  };
}

/** O gasto por MÊS (AAAA-MM), combustível e manutenção, em ordem. */
export function porMesFrota(trs: readonly Transacao[]): { mes: string; combustivel: number; manutencao: number; total: number }[] {
  const m = new Map<string, { combustivel: number; manutencao: number }>();
  for (const t of trs) {
    const k = t.dia.slice(0, 7);
    const x = m.get(k) ?? { combustivel: 0, manutencao: 0 };
    if (t.tipo === "abastecimento") x.combustivel += t.valor;
    else x.manutencao += t.valor;
    m.set(k, x);
  }
  return [...m]
    .map(([mes, x]) => ({ mes, ...x, total: x.combustivel + x.manutencao }))
    .sort((a, b) => a.mes.localeCompare(b.mes));
}

export type GrupoFrota = { chave: string; combustivel: number; manutencao: number; total: number; registros: number; litros: number; km: number; placas: number };

/** AGRUPA por uma dimensão (a soma de todos = os indicadores), do maior total ao menor. */
export function agruparFrota(trs: readonly Transacao[], dim: DimFrota, ctx: ContextoFrota, consumo: ReadonlyMap<number, Consumo>): GrupoFrota[] {
  const m = new Map<string, GrupoFrota & { _p: Set<string> }>();
  for (const t of trs) {
    const k = valorDim(t, dim, ctx);
    const g = m.get(k) ?? { chave: k, combustivel: 0, manutencao: 0, total: 0, registros: 0, litros: 0, km: 0, placas: 0, _p: new Set<string>() };
    if (t.tipo === "abastecimento") {
      g.combustivel += t.valor;
      g.litros += t.litros ?? 0;
      g.km += consumo.get(t.id)?.km ?? 0;
    } else g.manutencao += t.valor;
    g.total += t.valor;
    g.registros++;
    if (t.placa) g._p.add(t.placa);
    m.set(k, g);
  }
  return [...m.values()]
    .map(({ _p, ...g }) => ({ ...g, placas: _p.size }))
    .sort((a, b) => (dim === "mes" ? a.chave.localeCompare(b.chave) : b.total - a.total || a.chave.localeCompare(b.chave)));
}

// ─── ALERTAS ────────────────────────────────────────────────────────────────────────────────────────────────────

export const TIPOS_ALERTA = {
  hodometro: { rotulo: "Hodômetro voltou", gravidade: "erro" },
  km: { rotulo: "Km acima do esperado", gravidade: "atencao" },
  consumo: { rotulo: "Consumo fora do padrão", gravidade: "atencao" },
  preco: { rotulo: "Preço do litro fora do padrão", gravidade: "atencao" },
  intervalo: { rotulo: "Abastecimentos muito próximos", gravidade: "atencao" },
  tanque: { rotulo: "Litros acima do tanque", gravidade: "erro" },
  inativo: { rotulo: "Veículo inativo com gasto", gravidade: "erro" },
  semPlaca: { rotulo: "Sem placa", gravidade: "atencao" },
  semCadastro: { rotulo: "Placa sem cadastro", gravidade: "atencao" },
} as const;
export type TipoAlerta = keyof typeof TIPOS_ALERTA;
export type AlertaFrota = { id: number; tipo: TipoAlerta; placa: string | null; dia: string; texto: string; valor: number };

const pct = (x: number) => `${Math.round(x * 100)}%`;
const num1 = (x: number) => x.toLocaleString("pt-BR", { maximumFractionDigits: 1 });

/**
 * Os ALERTAS das transações (cada um aponta a transação e diz o porquê), pelos limites do ADM. O consumo compara com a
 * MEDIANA do próprio veículo (pelo menos 4 abastecimentos com km); o preço com a mediana do mesmo combustível no mês (pelo
 * menos 5 no mês).
 */
export function alertasFrota(trs: readonly Transacao[], ctx: ContextoFrota, consumo: ReadonlyMap<number, Consumo>, lim: LimitesAlertas): AlertaFrota[] {
  const out: AlertaFrota[] = [];
  const add = (t: Transacao, tipo: TipoAlerta, texto: string) => out.push({ id: t.id, tipo, placa: t.placa, dia: t.dia, texto, valor: t.valor });
  const kmlPorPlaca = new Map<string, number[]>();
  const precoPorGrupo = new Map<string, number[]>();
  for (const t of trs) {
    if (t.tipo !== "abastecimento" || t.removido) continue;
    const c = consumo.get(t.id);
    if (t.placa && c?.kmPorLitro && c.kmPorLitro > 0) {
      const l = kmlPorPlaca.get(t.placa) ?? [];
      l.push(c.kmPorLitro);
      kmlPorPlaca.set(t.placa, l);
    }
    if (t.precoLitro && t.precoLitro > 0) {
      const k = `${(t.produto ?? "").toUpperCase()}|${t.dia.slice(0, 7)}`;
      const l = precoPorGrupo.get(k) ?? [];
      l.push(t.precoLitro);
      precoPorGrupo.set(k, l);
    }
  }
  const medKml = new Map([...kmlPorPlaca].filter(([, l]) => l.length >= 4).map(([k, l]) => [k, mediana(l) as number]));
  const medPreco = new Map([...precoPorGrupo].filter(([, l]) => l.length >= 5).map(([k, l]) => [k, mediana(l) as number]));
  for (const t of trs) {
    if (t.removido) continue;
    const v = t.placa ? ctx.veiculos.get(t.placa) : undefined;
    if (!t.placa) add(t, "semPlaca", "A transação veio sem placa (cartão sem veículo).");
    else if (!v) add(t, "semCadastro", `A placa ${t.placa} não está no cadastro de veículos.`);
    if (v?.situacao === "inativo") add(t, "inativo", `${t.placa} está inativo no cadastro e teve ${t.tipo === "abastecimento" ? "abastecimento" : "manutenção"} neste dia.`);
    if (t.tipo !== "abastecimento") continue;
    const c = consumo.get(t.id);
    if (c?.hodometroVoltou) add(t, "hodometro", `O hodômetro (${num1(t.hodometro ?? 0)} km) ficou abaixo do abastecimento anterior.`);
    if (c?.km != null && c.km > lim.kmMaximo) add(t, "km", `${num1(c.km)} km desde o abastecimento anterior (limite ${num1(lim.kmMaximo)} km).`);
    const med = t.placa ? medKml.get(t.placa) : undefined;
    if (med && c?.kmPorLitro && Math.abs(c.kmPorLitro - med) / med > lim.consumoPct / 100)
      add(t, "consumo", `${num1(c.kmPorLitro)} km/l — a mediana do veículo é ${num1(med)} km/l (${c.kmPorLitro > med ? "+" : "−"}${pct(Math.abs(c.kmPorLitro - med) / med)}).`);
    const mp = medPreco.get(`${(t.produto ?? "").toUpperCase()}|${t.dia.slice(0, 7)}`);
    if (mp && t.precoLitro && Math.abs(t.precoLitro - mp) / mp > lim.precoPct / 100)
      add(t, "preco", `R$ ${t.precoLitro.toFixed(2).replace(".", ",")}/l — a mediana do ${t.produto ?? "combustível"} no mês é R$ ${mp.toFixed(2).replace(".", ",")}/l.`);
    if (lim.horasEntre > 0 && c?.horasDesdeAnterior != null && c.horasDesdeAnterior >= 0 && c.horasDesdeAnterior < lim.horasEntre)
      add(t, "intervalo", `Abastecido ${num1(c.horasDesdeAnterior)} h depois do anterior (mínimo ${lim.horasEntre} h).`);
    if (v?.capacidadeTanque && t.litros && t.litros > v.capacidadeTanque * (1 + lim.tanquePct / 100))
      add(t, "tanque", `${num1(t.litros)} l num tanque de ${num1(v.capacidadeTanque)} l.`);
  }
  return out.sort((a, b) => b.dia.localeCompare(a.dia) || b.id - a.id);
}

// ─── FICHA DO VEÍCULO ───────────────────────────────────────────────────────────────────────────────────────────

export type FichaVeiculo = {
  placa: string;
  total: number;
  combustivel: number;
  manutencao: number;
  registros: number;
  abastecimentos: number;
  manutencoes: number;
  litros: number;
  primeiroDia: string | null;
  ultimoDia: string | null;
  porMes: number;
  mediaFrota: number;
  vsMedia: number | null;
  posicao: number;
  frota: number;
  kmPorLitro: number | null;
  custoPorKm: number | null;
  precoMedio: number | null;
  ultimoHodometro: number | null;
  unidadeAtual: string | null;
  /** A unidade e o órgão do SISTEMA do registro mais recente. */
  unidadeSistemaAtual: string | null;
  orgaoAtual: string | null;
  contratoAtual: string | null;
  unidades: string[];
  postos: { nome: string; valor: number; n: number }[];
  meses: { mes: string; combustivel: number; manutencao: number; total: number }[];
};

/** A FICHA de um veículo sobre as transações dadas (a posição e a média só entre os veículos COM gasto nelas). */
export function fichaDoVeiculo(placa: string, trs: readonly Transacao[], consumo: ReadonlyMap<number, Consumo>): FichaVeiculo {
  const doVeiculo = trs.filter((t) => t.placa === placa && !t.removido);
  const k = kpisFrota(doVeiculo, consumo);
  const totais = new Map<string, number>();
  for (const t of trs) if (t.placa && !t.removido) totais.set(t.placa, (totais.get(t.placa) ?? 0) + t.valor);
  const lista = [...totais.values()];
  const media = lista.length ? lista.reduce((a, b) => a + b, 0) / lista.length : 0;
  const posicao = 1 + lista.filter((x) => x > k.total).length;
  const dias = doVeiculo.map((t) => t.dia).sort();
  const primeiro = dias[0] ?? null;
  const ultimo = dias.at(-1) ?? null;
  const meses = primeiro && ultimo ? (Number(ultimo.slice(0, 4)) - Number(primeiro.slice(0, 4))) * 12 + Number(ultimo.slice(5, 7)) - Number(primeiro.slice(5, 7)) + 1 : 1;
  const recente = doVeiculo[0];
  const postos = new Map<string, { valor: number; n: number }>();
  for (const t of doVeiculo) {
    const p = t.estabelecimento ?? SEM_VALOR;
    const x = postos.get(p) ?? { valor: 0, n: 0 };
    x.valor += t.valor;
    x.n++;
    postos.set(p, x);
  }
  const hodo = doVeiculo.filter((t) => t.hodometro != null).sort((a, b) => instante(b) - instante(a))[0]?.hodometro ?? null;
  return {
    placa,
    total: k.total,
    combustivel: k.combustivel,
    manutencao: k.manutencao,
    registros: doVeiculo.length,
    abastecimentos: k.abastecimentos,
    manutencoes: k.manutencoes,
    litros: k.litros,
    primeiroDia: primeiro,
    ultimoDia: ultimo,
    porMes: k.total / Math.max(1, meses),
    mediaFrota: media,
    vsMedia: media > 0 && lista.length > 1 ? (k.total - media) / media : null,
    posicao,
    frota: lista.length,
    kmPorLitro: k.kmPorLitro,
    custoPorKm: k.custoPorKm,
    precoMedio: k.precoMedio,
    ultimoHodometro: hodo,
    unidadeAtual: recente?.unidade ?? null,
    unidadeSistemaAtual: recente?.unidadeSistema ?? null,
    orgaoAtual: recente?.orgao ?? null,
    contratoAtual: recente?.contrato ?? null,
    unidades: [...new Set(doVeiculo.map((t) => t.unidade).filter((u): u is string => !!u))].sort((a, b) => a.localeCompare(b, "pt-BR")),
    postos: [...postos]
      .map(([nome, x]) => ({ nome, ...x }))
      .sort((a, b) => b.valor - a.valor)
      .slice(0, 8),
    meses: porMesFrota(doVeiculo),
  };
}

// ─── PLANILHA DO CADASTRO ───────────────────────────────────────────────────────────────────────────────────────

/** Uma alteração do cadastro (o que veio na planilha, só as colunas que ela tem). */
export type AlteracaoVeiculo = { placa: string } & Partial<Omit<Veiculo, "placa" | "marca" | "modelo" | "atualizadoEm" | "atualizadoPor">>;

const semAcento = (s: unknown) =>
  String(s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/** As COLUNAS que a planilha pode trazer (pelo nome do cabeçalho, sem acento/caixa). */
const COLUNAS_PLANILHA: { campo: keyof AlteracaoVeiculo; nomes: string[] }[] = [
  { campo: "placa", nomes: ["placa"] },
  { campo: "tipo", nomes: ["tipo", "tipo de veiculo"] },
  { campo: "classificacaoId", nomes: ["classificacao"] },
  { campo: "ano", nomes: ["ano", "ano de fabricacao", "ano fabricacao"] },
  { campo: "situacao", nomes: ["situacao", "status"] },
  { campo: "origem", nomes: ["origem"] },
  { campo: "fipe", nomes: ["fipe", "valor fipe"] },
  { campo: "locacao", nomes: ["locacao", "valor locacao", "locacao mensal"] },
  { campo: "contrato", nomes: ["contrato", "contrato de locacao"] },
  { campo: "capacidadeTanque", nomes: ["tanque", "capacidade do tanque", "capacidade tanque", "capacidade"] },
  { campo: "reparticaoId", nomes: ["unidade", "lotacao", "sigla"] },
  { campo: "observacao", nomes: ["observacao", "observacoes", "obs"] },
];

const numeroPlanilha = (v: unknown): number | null => {
  if (v == null || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const s = String(v).replace(/[R$\s]/g, "");
  const n = Number(s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s);
  return Number.isFinite(n) ? n : null;
};

/**
 * LÊ a planilha do cadastro (a matriz de células, a 1ª linha = o cabeçalho): cada linha com placa vira uma alteração só
 * com as colunas que a planilha tem (célula vazia = limpa o campo). Classificação e unidade pelo NOME/sigla; o que não casa
 * vira aviso (a linha segue sem aquele campo). Placas fora do cadastro e repetidas também viram aviso.
 */
export function alteracoesDaPlanilha(
  matriz: readonly (readonly unknown[])[],
  o: { placas: ReadonlySet<string>; classificacoes: readonly Classificacao[]; unidades: readonly { id: number; codigo: string; nome: string }[] },
): { alteracoes: AlteracaoVeiculo[]; avisos: string[] } {
  const avisos: string[] = [];
  const cab = (matriz[0] ?? []).map(semAcento);
  const idx = new Map<keyof AlteracaoVeiculo, number>();
  for (const c of COLUNAS_PLANILHA) {
    const i = cab.findIndex((h) => c.nomes.includes(h));
    if (i >= 0) idx.set(c.campo, i);
  }
  if (!idx.has("placa")) return { alteracoes: [], avisos: ["A planilha não tem a coluna Placa."] };
  const porNome = new Map(o.classificacoes.map((c) => [semAcento(c.nome), c.id]));
  const porUnidade = new Map(o.unidades.flatMap((u) => [[semAcento(u.codigo), u.id] as const, [semAcento(u.nome), u.id] as const]));
  const vistas = new Set<string>();
  const alteracoes: AlteracaoVeiculo[] = [];
  for (let l = 1; l < matriz.length; l++) {
    const linha = matriz[l] ?? [];
    const cel = (c: keyof AlteracaoVeiculo) => (idx.has(c) ? linha[idx.get(c) as number] : undefined);
    const placa = String(cel("placa") ?? "")
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "");
    if (!placa) continue;
    if (vistas.has(placa)) {
      avisos.push(`Linha ${l + 1}: a placa ${placa} repete — vale a primeira.`);
      continue;
    }
    vistas.add(placa);
    if (!o.placas.has(placa)) {
      avisos.push(`Linha ${l + 1}: a placa ${placa} não está no cadastro (as placas entram pelas transações da Vólus).`);
      continue;
    }
    const a: AlteracaoVeiculo = { placa };
    const txt = (c: keyof AlteracaoVeiculo) => {
      const v = cel(c);
      return v == null ? "" : String(v).trim();
    };
    if (idx.has("tipo")) {
      const t = semAcento(cel("tipo"));
      if (t.startsWith("maq")) a.tipo = "maquina";
      else if (t.startsWith("vei")) a.tipo = "veiculo";
      else if (t) avisos.push(`Linha ${l + 1}: tipo "${txt("tipo")}" desconhecido (Veículo ou Máquina).`);
    }
    if (idx.has("classificacaoId")) {
      const t = semAcento(cel("classificacaoId"));
      if (!t) a.classificacaoId = null;
      else if (porNome.has(t)) a.classificacaoId = porNome.get(t) as number;
      else avisos.push(`Linha ${l + 1}: classificação "${txt("classificacaoId")}" não cadastrada.`);
    }
    if (idx.has("ano")) {
      const n = numeroPlanilha(cel("ano"));
      a.ano = n != null && n >= 1950 && n <= 2100 ? Math.round(n) : null;
    }
    if (idx.has("situacao")) {
      const t = semAcento(cel("situacao"));
      if (t.startsWith("inat")) a.situacao = "inativo";
      else if (t.startsWith("ativ")) a.situacao = "ativo";
    }
    if (idx.has("origem")) {
      const t = semAcento(cel("origem"));
      a.origem = t.startsWith("prop") ? "proprio" : t.startsWith("cont") || t.startsWith("loc") ? "contrato" : null;
    }
    for (const c of ["fipe", "locacao", "capacidadeTanque"] as const) if (idx.has(c)) a[c] = numeroPlanilha(cel(c));
    if (idx.has("contrato")) a.contrato = txt("contrato") || null;
    if (idx.has("observacao")) a.observacao = txt("observacao") || null;
    if (idx.has("reparticaoId")) {
      const t = semAcento(cel("reparticaoId"));
      if (!t) a.reparticaoId = null;
      else if (porUnidade.has(t)) a.reparticaoId = porUnidade.get(t) as number;
      else avisos.push(`Linha ${l + 1}: unidade "${txt("reparticaoId")}" não cadastrada.`);
    }
    alteracoes.push(a);
  }
  return { alteracoes, avisos };
}

/** Onde o ADM configura a Vólus (Configurações → Importações → Frotas). */
export const LINK_CONFIG_FROTA = "/painel/configuracoes?aba=importacoes&tipo=frotas";


/** Um ponto da SÉRIE da frota no tempo (o balde, o que entrou nele e o acumulado até ele). */
export type PontoFrota = {
  chave: string;
  rotulo: string;
  titulo: string;
  de: string;
  ate: string;
  atual: boolean;
  combustivel: number;
  manutencao: number;
  acCombustivel: number;
  acManutencao: number;
  qComb: number;
  qMan: number;
};
export type SerieFrota = { granularidade: GranularidadeData; pontos: PontoFrota[]; de: string | null; ate: string | null };

/**
 * A SÉRIE da frota para o gráfico no tempo — a MESMA régua da Execução (`serie`, `execucao-dash-core.ts`): os baldes de
 * `baldesData` do período (sem ele, do 1º ao último dia com registro; o que passa de hoje vai só até hoje), na granularidade
 * pedida ("auto" = a do tamanho), dia/semana com mais de `MAX_BALDES_FROTA` sobe. `acumularDesde` = o ZOOM: o acumulado
 * começa com o que veio antes da janela. O último acumulado = a soma das transações do intervalo (testado).
 */
export function serieFrota(
  trs: readonly Transacao[],
  intervalo: { de?: string | null; ate?: string | null },
  gran: "auto" | "dia" | "semana" | "mes",
  hoje: string,
  opc: { acumularDesde?: string | null } = {},
): SerieFrota {
  let mi: string | null = null;
  let ma: string | null = null;
  for (const t of trs) {
    if (!t.dia) continue;
    if (mi == null || t.dia < mi) mi = t.dia;
    if (ma == null || t.dia > ma) ma = t.dia;
  }
  const de = intervalo.de ?? mi;
  const limite = ma && ma > hoje ? ma : hoje;
  const ateBruto = intervalo.ate ?? ma;
  const ate = ateBruto && ateBruto > limite && (!de || de <= limite) ? limite : ateBruto;
  if (!de || !ate || de > ate) return { granularidade: "dia", pontos: [], de, ate };
  const nDias = Math.round((Date.parse(ate) - Date.parse(de)) / 86_400_000) + 1;
  let forcar: GranularidadeData | undefined = gran === "auto" ? undefined : gran;
  if (forcar === "dia" && nDias > MAX_BALDES_FROTA) forcar = "semana";
  if (forcar === "semana" && nDias / 7 > MAX_BALDES_FROTA) forcar = "mes";
  const { granularidade, baldes, chaveDoDia } = baldesData(de, ate, hoje, forcar);
  const pos = new Map(baldes.map((x: BaldeData, i) => [x.chave, i]));
  const c = new Float64Array(baldes.length);
  const m = new Float64Array(baldes.length);
  const qc = new Float64Array(baldes.length);
  const qm = new Float64Array(baldes.length);
  const inicio = baldes[0]?.de ?? de;
  const desde = opc.acumularDesde ?? null;
  let ac = 0;
  let am = 0;
  for (const t of trs) {
    if (!t.dia) continue;
    const p = pos.get(chaveDoDia(t.dia) ?? "");
    if (p != null) {
      if (t.tipo === "abastecimento") {
        c[p] += t.valor;
        qc[p]++;
      } else {
        m[p] += t.valor;
        qm[p]++;
      }
    } else if (desde && t.dia >= desde && t.dia < inicio) {
      if (t.tipo === "abastecimento") ac += t.valor;
      else am += t.valor;
    }
  }
  const pontos = baldes.map((x, i) => {
    ac += c[i];
    am += m[i];
    return { chave: x.chave, rotulo: x.rotulo, titulo: x.titulo, de: x.de, ate: x.ate, atual: x.atual, combustivel: c[i], manutencao: m[i], acCombustivel: ac, acManutencao: am, qComb: qc[i], qMan: qm[i] };
  });
  return { granularidade, pontos, de, ate };
}
/** Dia/semana com mais baldes que isto sobe de granularidade (a mesma régua da Execução). */
export const MAX_BALDES_FROTA = 400;
