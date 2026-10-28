import { brl, dataBR } from "./format.ts";

/**
 * PESQUISA DO SISTEMA — o catálogo ÚNICO dos tipos que o servidor pesquisa (o banner Ctrl+K): o título do grupo, o
 * prefixo/atalho que restringe a pesquisa a ele e o que se pode digitar. Puro (a rota e a tela usam o mesmo).
 */
export const TIPOS_PESQUISA = [
  { tipo: "protocolo", titulo: "Protocolos", prefixo: "protocolo:", curto: "p:", texto: "Protocolos (nº, Id, assunto, interessado)" },
  { tipo: "dfd", titulo: "DFDs", prefixo: "dfd:", curto: "d:", texto: "DFDs (nº, planejamento, objeto, protocolo)" },
  { tipo: "item", titulo: "Itens", prefixo: "item:", curto: "i:", texto: "Itens dos DFDs (código, descrição)" },
  { tipo: "tarefa", titulo: "Tarefas", prefixo: "tarefa:", curto: "t:", texto: "Tarefas (título, nº do ticket)" },
  { tipo: "pasta", titulo: "Pastas de quadros", prefixo: "pasta:", curto: "pa:", texto: "Pastas de quadros de Tarefas (nome)" },
  { tipo: "evento", titulo: "Calendário", prefixo: "evento:", curto: "e:", texto: "Eventos do calendário (título, local, descrição)" },
  { tipo: "orcamento", titulo: "Orçamentos", prefixo: "orcamento:", curto: "o:", texto: "Orçamentos (nome, ano)" },
  { tipo: "lancamento", titulo: "Lançamentos do orçamento", prefixo: "lancamento:", curto: "l:", texto: "Lançamentos (ficha, ação, elemento, unidade, função, programa, fonte)" },
  { tipo: "catalogo", titulo: "Catálogo", prefixo: "catalogo:", curto: "c:", texto: "Itens do catálogo (código, descrição)" },
  { tipo: "historico", titulo: "Histórico de compra", prefixo: "historico:", curto: "h:", texto: "Histórico de compra (código, produto, contrato, processo)" },
  { tipo: "empenho", titulo: "Empenhos", prefixo: "empenho:", curto: "em:", texto: "Empenhos (nº, fornecedor, CPF/CNPJ, histórico, ação, elemento)" },
  { tipo: "liquidacao", titulo: "Liquidações", prefixo: "liquidacao:", curto: "li:", texto: "Liquidações (nº, nº do empenho, credor, CPF/CNPJ, histórico)" },
  { tipo: "pagamento", titulo: "Pagamentos", prefixo: "pagamento:", curto: "pg:", texto: "Pagamentos (nº da ordem, nº do empenho, credor, CPF/CNPJ, histórico)" },
  { tipo: "declaracao", titulo: "Declarações do PCA", prefixo: "declaracao:", curto: "de:", texto: "Declarações do PCA (nº, processo, protocolo da Centi, finalidade)" },
  { tipo: "visao", titulo: "Visões do orçamento", prefixo: "visao:", curto: "vi:", texto: "Visões do orçamento (nome)" },
  { tipo: "padronizacao", titulo: "Medidas e classificações", prefixo: "medida:", curto: "me:", texto: "Medidas e classificações do Catálogo (sigla, nome, sinônimos, palavras-chave)" },
  { tipo: "documento", titulo: "Documentos", prefixo: "documento:", curto: "do:", texto: "Documentos (nome, arquivo)" },
  { tipo: "usuario", titulo: "Usuários", prefixo: "usuario:", curto: "u:", texto: "Usuários (nome, apelido, e-mail, matrícula) — administração" },
  { tipo: "orgao", titulo: "Órgãos", prefixo: "orgao:", curto: "og:", texto: "Órgãos (nome, sigla) — administração" },
  { tipo: "unidade", titulo: "Unidades", prefixo: "unidade:", curto: "un:", texto: "Unidades (nome, sigla) — administração" },
  { tipo: "responsavel", titulo: "Responsáveis por DFDs", prefixo: "responsavel:", curto: "re:", texto: "Responsáveis por DFDs (nome, matrícula, cargo) — administração" },
  { tipo: "importacao", titulo: "Importações da Centi", prefixo: "importacao:", curto: "im:", texto: "Cards de importação (nome) — administração" },
  { tipo: "grupo", titulo: "Grupos", prefixo: "grupo:", curto: "g:", texto: "Grupos de acesso — administração" },
  { tipo: "cadastro", titulo: "Cadastros", prefixo: "cadastro:", curto: "ca:", texto: "Papéis, cargos, situações e feriados — administração" },
  { tipo: "fluxo", titulo: "Automações", prefixo: "automacao:", curto: "au:", texto: "Automações (nome, descrição) — administração" },
] as const;

export type TipoPesquisa = (typeof TIPOS_PESQUISA)[number]["tipo"];
const CONHECIDOS = new Set<string>(TIPOS_PESQUISA.map((t) => t.tipo));
export const ehTipoPesquisa = (v: string): v is TipoPesquisa => CONHECIDOS.has(v);
export const tituloPesquisa = (t: string) => TIPOS_PESQUISA.find((x) => x.tipo === t)?.titulo ?? t;

/** Os tipos que a pesquisa SEM prefixo consulta (os de administração só aparecem ao ADM — a rota confere). */
export const TIPOS_PADRAO: TipoPesquisa[] = TIPOS_PESQUISA.map((t) => t.tipo);

/** Um resultado do servidor: o link já é o da tela/aba em que a pessoa pode abri-lo. */
export type ResultadoPesquisa = { id: number; rotulo: string; detalhe: string; href: string };

/** Uma linha do ÍNDICE LOCAL da pesquisa (protocolos e DFDs que a pessoa vê): o resultado + os campos em que se procura. */
export type LinhaIndice = ResultadoPesquisa & { campos: string[]; numeros: string[] };

/** Teto de linhas por tipo no índice local; acima dele o tipo segue pelo servidor (o índice estaria incompleto). */
export const MAX_INDICE = 5000;

const padraoRegex = (p: string) => new RegExp(`^${p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/%/g, ".*").replace(/_/g, ".")}$`, "is");

/**
 * A MESMA régua do `casaTermos` (SQL) no navegador: todo termo tem de casar; o termo numérico só nos campos de número.
 * Devolve o predicado (os padrões compilados uma vez para a lista inteira).
 */
export function casaLocal(q: string): (l: Pick<LinhaIndice, "campos" | "numeros">) => boolean {
  const ps = padroesLike(q).map((p) => ({ re: padraoRegex(p), num: ehTermoNumero(p) }));
  return (l) => ps.every(({ re, num }) => (num ? l.numeros : l.campos).some((c) => re.test(c)));
}

/**
 * Os padrões do `LIKE` da pesquisa: UM por termo (todos têm de casar — "secretaria saúde 2027"), até 5 termos. Sem
 * acento só onde o português o põe ao digitar sem ele — "c" antes de a/o/u (ç), "ao" (ão) e "oe" (õe): "manutencao" acha
 * "MANUTENÇÃO", "servico" acha "SERVIÇO"; nada além disso vira curinga (o termo segue preciso). O `%`/`_` digitados saem.
 */
export function padroesLike(q: string): string[] {
  return termosPesquisa(q).map((t) => `%${/^[\x20-\x7e]+$/.test(t) ? t.replace(/c(?=[aou])/g, "_").replace(/a(?=o)/g, "_").replace(/o(?=e)/g, "_") : t}%`);
}

/** Os termos digitados (minúsculos, sem curinga, até 5). */
export function termosPesquisa(q: string): string[] {
  return q
    .toLowerCase()
    .replace(/[%_\\]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 5);
}

/** O termo é um NÚMERO (nº, Id, código, "144756/2026"): casa só nos campos de número, nunca no texto livre. */
export const ehTermoNumero = (padrao: string) => /^%[\d./-]+%$/.test(padrao);

const semAcento = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/**
 * A ORDEM dos resultados de um grupo: o número/código EXATO primeiro, depois o que COMEÇA com o termo, depois o que o
 * contém (sem acento/caixa) e, por fim, o que só casou pelo padrão (as letras trocadas). Estável dentro de cada nível.
 */
export function pontuar(texto: string, q: string): number {
  const t = semAcento(texto);
  const termos = semAcento(q).split(/\s+/).filter(Boolean);
  if (!termos.length) return 0;
  const palavras = t.split(/[^a-z0-9]+/).filter(Boolean);
  let p = 0;
  for (const termo of termos) {
    if (palavras.includes(termo)) p += 3;
    else if (palavras.some((w) => w.startsWith(termo))) p += 2;
    else if (t.includes(termo)) p += 1;
  }
  return p;
}

/** O que a pessoa pode pesquisar (a régua das rotas — testada por perfil). `ve` = a tela abre; `libera` = a aba/visão. */
export type PortaoPesquisa = { admin: boolean; ve: (tela: string) => boolean; libera: (componente: string) => boolean };

export function tipoPermitido(p: PortaoPesquisa, tipo: TipoPesquisa): boolean {
  switch (tipo) {
    case "protocolo":
    case "dfd":
    case "item":
      return p.ve("dfd") || (p.ve("pca") && p.libera("pca.mesa"));
    case "tarefa":
      return p.ve("tarefas") || p.ve("calendario");
    case "pasta":
      return p.ve("tarefas");
    case "evento":
      return p.ve("calendario");
    case "orcamento":
      return p.ve("orcamento");
    case "lancamento":
      return p.ve("orcamento") && p.libera("orcamento.lancamentos");
    case "catalogo":
      return p.ve("catalogo") && p.libera("catalogo.catalogos");
    case "historico":
      return p.ve("catalogo") && p.libera("catalogo.historico");
    case "documento":
      return p.ve("documentos");
    case "declaracao":
      return p.ve("pca") && p.libera("pca.declaracoes");
    case "visao":
      return p.ve("orcamento") && p.libera("orcamento.visoes");
    case "padronizacao":
      return p.ve("catalogo") && (p.libera("catalogo.unidades") || p.libera("catalogo.classificacoes"));
    case "empenho":
      return p.ve("empenhos");
    case "liquidacao":
      return p.ve("liquidacoes");
    case "pagamento":
      return p.ve("pagamentos");
    default:
      return p.admin; // usuário, órgão, unidade, responsável, importação, grupo, cadastro, automação
  }
}

/** Os tipos da EXECUÇÃO (empenhos, liquidações, pagamentos) — o índice de texto local da pesquisa. */
export type TipoExecucaoPesquisa = "empenho" | "liquidacao" | "pagamento";
export const TIPOS_EXECUCAO_PESQUISA: TipoExecucaoPesquisa[] = ["empenho", "liquidacao", "pagamento"];

/** Teto de registros por tipo no índice de texto da execução (os MAIS RECENTES; os anteriores seguem pelo prefixo e pelo nº exato). */
export const MAX_INDICE_EXECUCAO = 20000;

/** Validade do índice da execução (na memória do Worker e da aba): fixa, não pela versão — a automática promove o dia todo. */
export const VALIDADE_INDICE_EXECUCAO_MS = 6 * 60 * 60_000;

type Txt = string | null;
/** A tupla do banco: empenho `[id, ano, nº, fornecedor, CPF/CNPJ, valor, data]`; liquidação `[id, ano, nº, nº empenho, credor, CPF/CNPJ, valor, data]`; pagamento `[id, ano, ordem, nº empenho, credor, CPF/CNPJ, valor, data]`. */
export type TuplaExecucao = (number | Txt)[];

/** O resultado de um empenho/liquidação/pagamento — o MESMO no SQL (`pesquisarExecucao`) e no índice local. */
export function resultadoEmpenho(r: { id: number; ano: number; numero: string; data: Txt; fornecedor: Txt; orgao?: Txt; valor: number | null }): ResultadoPesquisa {
  return {
    id: r.id,
    rotulo: `Empenho ${r.numero}/${r.ano} · ${(r.fornecedor ?? "Sem fornecedor").slice(0, 80)}`,
    detalhe: [r.data ? dataBR(r.data) : "", brl(r.valor), r.orgao ?? ""].filter(Boolean).join(" · "),
    href: `/painel/empenhos?ano=${r.ano}&abrir=${r.id}`,
  };
}
export function resultadoLiquidacao(r: { id: number; ano: number; numero: Txt; data: Txt; empenho: string; credor: Txt; valor: number | null }): ResultadoPesquisa {
  return {
    id: r.id,
    rotulo: `Liquidação ${r.numero ?? r.id}/${r.ano} · ${(r.credor ?? "Sem credor").slice(0, 80)}`,
    detalhe: [r.data ? dataBR(r.data) : "", brl(r.valor), `Empenho ${r.empenho}`].filter(Boolean).join(" · "),
    href: `/painel/liquidacoes?abrir=${r.id}`,
  };
}
export function resultadoPagamento(r: { id: number; ordem: string; data: Txt; empenho: string; credor: Txt; valor: number | null }): ResultadoPesquisa {
  return {
    id: r.id,
    rotulo: `Ordem de pagamento ${r.ordem} · ${(r.credor ?? "Sem credor").slice(0, 80)}`,
    detalhe: [r.data ? dataBR(r.data) : "", brl(r.valor), `Empenho ${r.empenho}`].filter(Boolean).join(" · "),
    href: `/painel/pagamentos?abrir=${r.id}`,
  };
}

const s = (v: number | Txt | undefined): Txt => (v == null ? null : String(v));
const n = (v: number | Txt | undefined): number => Number(v ?? 0) || 0;

/** As tuplas do índice da execução viram linhas do índice local (os campos de texto e os de número, como o SQL). */
export function linhasDaExecucao(tipo: TipoExecucaoPesquisa, tuplas: TuplaExecucao[]): LinhaIndice[] {
  return tuplas.map((t) => {
    if (tipo === "empenho") {
      const [id, ano, numero, forn, cpf, valor, data] = t;
      const r = resultadoEmpenho({ id: n(id), ano: n(ano), numero: s(numero) ?? "", data: s(data), fornecedor: s(forn), valor: n(valor) });
      return { ...r, campos: [s(numero), s(forn), s(cpf)].filter((x): x is string => !!x), numeros: [s(numero), s(cpf)].filter((x): x is string => !!x) };
    }
    if (tipo === "liquidacao") {
      const [id, ano, numero, emp, credor, cpf, valor, data] = t;
      const r = resultadoLiquidacao({ id: n(id), ano: n(ano), numero: s(numero), data: s(data), empenho: s(emp) ?? "", credor: s(credor), valor: n(valor) });
      return { ...r, campos: [s(numero), s(emp), s(credor), s(cpf)].filter((x): x is string => !!x), numeros: [s(numero), s(emp), s(cpf)].filter((x): x is string => !!x) };
    }
    const [id, , ordem, emp, credor, cpf, valor, data] = t;
    const r = resultadoPagamento({ id: n(id), ordem: s(ordem) ?? "", data: s(data), empenho: s(emp) ?? "", credor: s(credor), valor: n(valor) });
    return { ...r, campos: [s(ordem), s(emp), s(credor), s(cpf)].filter((x): x is string => !!x), numeros: [s(ordem), s(emp), s(cpf)].filter((x): x is string => !!x) };
  });
}

/**
 * O termo merece o índice de TEXTO da execução: sem prefixo, com letras e ao menos 3 caracteres (o número exato segue
 * pelo servidor, que acha todos os anos).
 */
export const pedeIndiceExecucao = (termo: string) => termo.trim().length >= 3 && /\p{L}/u.test(termo);
