/**
 * CORRIGIR O DFD DO SISTEMA PELA CENTI (puro, testado em `tests/correcao-centi.test.ts`): a partir do RETRATO guardado na
 * conferência, monta o DFD "novo" da Centi e decide — pela MESMA régua da conferência (textos sem pontuação/caixa/acento,
 * a tolerância nos valores) — quais dados DIVERGEM. O banner usa as escolhas da sobrescrita (Manter sistema | Usar Centi)
 * com só as divergências já marcadas "Usar Centi"; a correção em massa aplica só os TIPOS escolhidos.
 */
import { conferenciaDoRetrato, paraComparar, tipoCurto, type RetratoCenti } from "./conferencia-dfd-centi.ts";
import { normalizarSecoesDfd } from "./dfd-tratamento.ts";
import { arredondarValor, type DfdParseado, normComparacao, valorDosItens } from "./parse-dfd-comum.ts";
import { chaveSecao, type DfdComparavel, herdarTratamentos, parearItens } from "./comparar-protocolo.ts";
import { aplicarTodas, comparacaoEscolha, type EntradaEscolha, entradasEscolha, marcarItensGravados, marcarItensNovos, semMarcas } from "./sobrescrita-dfd.ts";

/** O DFD da Centi pronto para comparar e aplicar: as seções normalizadas como na conferência; nº do DFD, planejamento,
 * arquivo e ASSINATURAS ficam os do sistema (a correção nunca troca identificador nem a assinatura validada). */
export function novoDaCenti(sistema: DfdParseado, r: RetratoCenti, anoPca: number | null): DfdParseado {
  // O que a Centi NÃO traz (ou traz fora do padrão) e a equipe tratou no sistema — tipo, seções obrigatórias,
  // referências do DFD-R — fica o do sistema: a correção nunca APAGA um tratamento (a mesma régua do reenvio).
  const c = herdarTratamentos(normalizarSecoesDfd(r.dfd, undefined, anoPca).dfd, sistema, anoPca, { assinaturas: false }).dfd;
  return {
    ...c,
    numero: sistema.numero,
    planejamento: sistema.planejamento,
    nomeArquivo: sistema.nomeArquivo,
    assinaturas: sistema.assinaturas,
    // O tipo da IDENTIDADE é o do load da Centi (a conferência compara por ele); sem ele, o do PDF; sem nenhum, o do sistema.
    tipo: tipoCurto(r.tipoCenti) ? (r.tipoCenti ?? null) : tipoCurto(c.tipo) ? c.tipo : sistema.tipo,
    anoPca: sistema.anoPca,
  };
}

const n = (v: unknown) => (v == null ? "" : normComparacao(String(v)));
const cod = (v: unknown) => String(v ?? "").replace(/\D/g, "");
const textoSecao = (d: DfdParseado, k: string) =>
  normComparacao(
    d.secoes
      .filter((s) => chaveSecao(s.titulo) === k)
      .map((s) => s.texto)
      .join(" "),
  );

function indices(chave: string): { g: number | null; c: number | null } {
  const [t, a, b] = chave.split(":");
  if (t === "a") return { g: Number(a), c: Number(b) };
  if (t === "n") return { g: null, c: Number(a) };
  return { g: Number(a), c: null };
}

/** Os campos do ITEM que divergem (régua da conferência; a tolerância vale nos valores). */
export function camposItemDivergentes(x: DfdParseado["itens"][number], y: DfdParseado["itens"][number], tol: number): string[] {
  const fora = (u: number | null | undefined, v: number | null | undefined) => (u == null) !== (v == null) || (u != null && v != null && Math.abs(u - v) > tol);
  const out: string[] = [];
  if ((x.item ?? null) !== (y.item ?? null)) out.push("item");
  if (cod(x.codigo) !== cod(y.codigo)) out.push("codigo");
  if (n(x.descricao) !== n(y.descricao)) out.push("descricao");
  if (n(x.unidade) !== n(y.unidade)) out.push("unidade");
  if ((x.quantidade ?? null) !== (y.quantidade ?? null)) out.push("quantidade");
  if (fora(x.valorUnitario, y.valorUnitario)) out.push("valorUnitario");
  if (fora(x.valorTotal, y.valorTotal)) out.push("valorTotal");
  return out;
}

const ROTULO_CAMPO_ITEM: Record<string, string> = {
  item: "Item: nº",
  codigo: "Item: código",
  descricao: "Item: descrição",
  unidade: "Item: medida",
  quantidade: "Item: quantidade",
  valorUnitario: "Item: valor unitário",
  valorTotal: "Item: valor total",
};

/** Os TIPOS de divergência que uma escolha corrige — os MESMOS rótulos do filtro da coluna Centi (`tiposDivergencia`).
 * Vazio = a escolha não diverge pela régua da conferência (fica o sistema). */
export function tiposDaEntrada(e: EntradaEscolha, sistema: DfdParseado, centi: DfdParseado, r: Pick<RetratoCenti, "objeto" | "tolerancia">): string[] {
  if (e.tipo === "assinaturas") return [];
  if (e.tipo === "campo") {
    const k = e.campo;
    if (k === "planejamento") return [];
    if (k === "tipo") return tipoCurto(sistema.tipo) && tipoCurto(centi.tipo) && tipoCurto(sistema.tipo) !== tipoCurto(centi.tipo) ? ["Tipo"] : [];
    if (k === "objeto" && !r.objeto) return [];
    // A entrada só existe quando a régua da CONFERÊNCIA (`paraComparar` + `compararDfd`) acusa a diferença — as
    // referências são listas (a ordem não conta), mas "045/2025" × "045-2025" é diferença, como na conferência.
    return [e.rotulo];
  }
  if (e.tipo === "secao") {
    if (textoSecao(sistema, e.secao) === textoSecao(centi, e.secao)) return [];
    return [`Seção ${String(e.rotulo ?? "").replace(/\s+/g, " ").trim().replace(/^\d+\s*[-.–]\s*/, "") || "sem título"}`];
  }
  const { g, c } = indices(e.chave);
  // O item de um lado só muda também o VALOR TOTAL do DFD (escolher "Valor total" o traz junto).
  if (g == null) return ["Item só na Centi", "Nº de itens", "Valor total"];
  if (c == null) return ["Item só no sistema", "Nº de itens", "Valor total"];
  const x = sistema.itens[g];
  const y = centi.itens[c];
  if (!x || !y) return [];
  const campos = camposItemDivergentes(x, y, r.tolerancia);
  if (!campos.length) return [];
  // O total do item = quantidade × valor unitário: só conta como tipo próprio quando nenhum dos dois mudou (como no motivo).
  const qv = campos.includes("quantidade") || campos.includes("valorUnitario");
  const tipos = campos.filter((f) => !(qv && f === "valorTotal")).map((f) => ROTULO_CAMPO_ITEM[f]);
  if (campos.some((f) => f === "quantidade" || f === "valorUnitario" || f === "valorTotal")) tipos.push("Valor total");
  return tipos;
}

export type PlanoCorrecao = {
  /** A tolerância da conferência (valores do item). */
  tolerancia: number;
  /** O DFD da Centi pronto (o "novo" das escolhas). */
  centi: DfdParseado;
  entradas: EntradaEscolha[];
  /** As escolhas que divergem, com os tipos. */
  divergentes: { entrada: EntradaEscolha; tipos: string[] }[];
  /** O pareamento dos itens da CONFERÊNCIA (índice no sistema → índice na Centi) — o acerto do valor total acumulado. */
  pares: [number, number][];
};

/** A cópia NORMALIZADA da conferência (`paraComparar`) — os índices dos itens e das seções são os mesmos. */
const comoNaConferencia = (d: DfdParseado): DfdParseado => ({ ...d, ...paraComparar(d as unknown as DfdComparavel) }) as unknown as DfdParseado;

/** O plano compara pela MESMA régua da conferência (textos sem pontuação/caixa/acento, código só dígitos, o mesmo
 * pareamento dos itens) e aplica sobre os DFDs como estão — senão uma divergência apontada nunca era corrigida. */
export function planoCorrecao(sistema: DfdParseado, r: RetratoCenti, anoPca: number | null): PlanoCorrecao {
  const centi = marcarItensNovos(novoDaCenti(sistema, r, anoPca));
  const [ns, nc] = [comoNaConferencia(sistema), comoNaConferencia(centi)];
  const entradas = entradasEscolha(comparacaoEscolha(ns, nc));
  const divergentes = entradas.map((entrada) => ({ entrada, tipos: tiposDaEntrada(entrada, sistema, centi, r) })).filter((d) => d.tipos.length);
  const { pares } = parearItens(ns.itens, nc.itens);
  return { centi, entradas, divergentes, tolerancia: r.tolerancia, pares };
}

/** Os tipos que o plano consegue corrigir (sem repetir, na ordem em que aparecem). */
export const tiposCorrigiveis = (p: PlanoCorrecao): string[] => [...new Set(p.divergentes.flatMap((d) => d.tipos))];

const VALORES_ITEM = new Set(["quantidade", "valorUnitario", "valorTotal"]);

/** Aplica a Centi nas divergências — todas (o banner: cada escolha inteira), ou só as dos `tipos` escolhidos (a massa):
 * no ITEM que existe dos dois lados, só os CAMPOS daqueles tipos ("Valor total" = quantidade, valor unitário e total).
 * O resultado traz as marcas de origem dos itens (a tela das escolhas as usa); antes de gravar, `semMarcas`. */
export function aplicarCentiPorTipos(sistema: DfdParseado, p: PlanoCorrecao, tipos?: readonly string[] | null): DfdParseado {
  const base = marcarItensGravados(sistema);
  if (!tipos) return acertarTotal(p.divergentes.length ? aplicarTodas(p.divergentes.map((d) => d.entrada), "novo", base, base, p.centi) : base, p);
  const quer = new Set(tipos);
  const escolhidas = p.divergentes.filter((d) => d.tipos.some((t) => quer.has(t)));
  // Cabeçalho, seções e itens que só existem de um lado: a escolha inteira.
  const inteiras = escolhidas.filter((d) => !(d.entrada.tipo === "item" && d.entrada.chave.startsWith("a:"))).map((d) => d.entrada);
  let w = inteiras.length ? aplicarTodas(inteiras, "novo", base, base, p.centi) : base;
  // Item dos dois lados: só os campos escolhidos, no item do sistema.
  const patches = new Map<string, Partial<DfdParseado["itens"][number]>>();
  for (const d of escolhidas) {
    if (d.entrada.tipo !== "item" || !d.entrada.chave.startsWith("a:")) continue;
    const { g, c } = indices(d.entrada.chave);
    const x = sistema.itens[g as number];
    const y = p.centi.itens[c as number];
    if (!x || !y) continue;
    const campos = camposItemDivergentes(x, y, p.tolerancia).filter((f) => quer.has(ROTULO_CAMPO_ITEM[f]) || (VALORES_ITEM.has(f) && quer.has("Valor total")));
    if (!campos.length) continue;
    const novo: Record<string, unknown> = {};
    for (const f of campos) novo[f] = y[f as keyof typeof y];
    if ((campos.includes("quantidade") || campos.includes("valorUnitario")) && !campos.includes("valorTotal")) {
      const q = (novo.quantidade ?? x.quantidade) as number | null;
      const vu = (novo.valorUnitario ?? x.valorUnitario) as number | null;
      novo.valorTotal = q != null && vu != null ? arredondarValor(q * vu) : x.valorTotal;
    }
    patches.set(`g:${g}`, novo);
  }
  if (patches.size) {
    const itens = w.itens.map((it) => (it.ref && patches.has(it.ref) ? { ...it, ...patches.get(it.ref) } : it));
    w = { ...w, itens, valorTotal: valorDosItens(itens) };
  }
  return quer.has("Valor total") ? acertarTotal(w, p) : w;
}

/** O VALOR TOTAL do DFD ainda fora da tolerância depois das correções (os centavos de cada item dentro dela, somados,
 * passam): os itens pareados recebem quantidade e valores EXATOS da Centi — senão o "Valor total" nunca convergia. */
function acertarTotal(w: DfdParseado, p: PlanoCorrecao): DfdParseado {
  if (Math.abs((w.valorTotal ?? 0) - (p.centi.valorTotal ?? 0)) <= p.tolerancia) return w;
  const daCenti = new Map(p.pares.map(([g, c]) => [`g:${g}`, p.centi.itens[c]]));
  let mudou = false;
  const itens = w.itens.map((it) => {
    const y = it.ref ? daCenti.get(it.ref) : undefined;
    if (!y || (it.quantidade === y.quantidade && it.valorUnitario === y.valorUnitario && it.valorTotal === y.valorTotal)) return it;
    mudou = true;
    return { ...it, quantidade: y.quantidade, valorUnitario: y.valorUnitario, valorTotal: y.valorTotal };
  });
  return mudou ? { ...w, itens, valorTotal: valorDosItens(itens) } : w;
}

/** O que RESTARIA depois da correção (o DFD corrigido reconferido pelo MESMO retrato) — o resultado honesto e os testes. */
export function simularCorrecao(
  sistema: DfdParseado,
  r: RetratoCenti,
  anoPca: number | null,
  tipos?: readonly string[] | null,
): { corrigido: DfdParseado; status: "convergente" | "divergente"; motivo: string | null } {
  const corrigido = semMarcas(aplicarCentiPorTipos(sistema, planoCorrecao(sistema, r, anoPca), tipos));
  const c = conferenciaDoRetrato({ ...corrigido, numero: sistema.numero, planejamento: sistema.planejamento, tipo: corrigido.tipo, anoPca }, r);
  return { corrigido, ...c };
}

/** Os tipos de divergência que a Centi NÃO corrige no DFD (identidade, situação, órgão) — tratados um a um no painel da
 * coluna Centi. A MESMA régua na correção em massa da Mesa e na automação. */
export const NAO_CORRIGIVEIS: ReadonlySet<string> = new Set(["Situação", "Órgão", "Nº do DFD", "Não encontrado na Centi", "Outras"]);

/** Os tipos do motivo da conferência que a correção pela Centi alcança (sem repetir). */
export const tiposCorrigiveisDoMotivo = (tipos: readonly string[]): string[] => [...new Set(tipos.filter((t) => !NAO_CORRIGIVEIS.has(t)))];
