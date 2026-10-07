/**
 * O REGISTRO dos nós dos fluxos — cada tipo é UMA entrada (novo nó = acrescentar aqui). Puro: o que depende do navegador
 * (ler PDF, a extensão) chega pelo `ctx` (testado com um ctx falso em `tests/fluxo-core.test.ts`).
 *
 * Convenção dos tipos: `<categoria>.<nome>`. As saídas de LISTA são "saida"; os de decisão, "verdadeiro"/"falso"; o
 * Comparar, "iguais"/"diferentes"/"soEmA"/"soEmB"; o Laço, "lote"/"fim" (com a entrada "volta").
 */
import {
  type CampoNo,
  type CategoriaNo,
  chaveJuncao,
  comparar,
  chaveDoItem,
  type ContextoNo,
  type DefNo,
  executarEmPool,
  executarFluxo,
  type Grafo,
  grafoComEntrada,
  interpolar,
  type Item,
  esperar,
  MAX_ESPERA_S,
  MAX_ITERACOES_LACO,
  nomeVariavel,
  variaveis,
  normTexto,
  numeroDe,
  OPERADORES,
  PORTA_VOLTA,
  PORTA_APONTADOS,
  PORTA_RETORNO,
  PROFUNDIDADE_MAX,
  type Portas,
  type Registro,
  type ResultadoExec,
  resolverCaminho,
  TIPO_LACO,
} from "./fluxo-core.ts";
import { lerIdsCenti, MAX_IDS_CENTI, TIPO_DOCUMENTO_DFD } from "./automacao-centi-core.ts";
import { BUSCAS, buscaEfetiva, type FontesSistema, lerDoSistema, marcarExecutado, type ObjetoLeitura, valoresProcurados } from "./fluxo-ler-sistema.ts";
import { noSistemaTela } from "./automacao-tela-protocolo.ts";
import { aplicarRegra, escolherColunas, lerColunas, lerRegras, MAX_LINHAS_TABELA, operarVariavel, procurarNaTabela, recorteTabela } from "./fluxo-dados.ts";
import { ENTIDADES_COLUNA, type EntidadeColuna, ROTULO_ENTIDADE_COLUNA, valorParaColuna } from "./mesa-colunas-core.ts";

export const CATEGORIAS: { valor: CategoriaNo; rotulo: string; cor: string }[] = [
  { valor: "gatilho", rotulo: "Início", cor: "var(--serie-1)" },
  { valor: "entrada", rotulo: "Entrada de dados", cor: "var(--serie-7)" },
  { valor: "centi", rotulo: "Busca na Centi", cor: "var(--serie-2)" },
  { valor: "sistema", rotulo: "Dados do sistema", cor: "var(--serie-3)" },
  { valor: "leitura", rotulo: "Leitura", cor: "var(--serie-4)" },
  { valor: "logica", rotulo: "Lógica", cor: "var(--serie-5)" },
  { valor: "fluxo", rotulo: "Fluxos (reutilizar)", cor: "var(--accent)" },
  { valor: "dados", rotulo: "Transformar dados", cor: "var(--serie-6)" },
  { valor: "erros", rotulo: "Erros", cor: "var(--danger)" },
  { valor: "saida", rotulo: "Saída", cor: "var(--serie-8)" },
];
export const corCategoria = (c: CategoriaNo) => CATEGORIAS.find((x) => x.valor === c)?.cor ?? "var(--accent)";

const so = (entradas: Portas, porta = "entrada") => entradas[porta] ?? [];
const str = (v: unknown, padrao = "") => (typeof v === "string" ? v : v == null ? padrao : String(v));
const lista = (v: unknown) =>
  str(v)
    .split(/[;\n]/)
    .map((x) => x.trim())
    .filter(Boolean);
const obj = (v: unknown): Item => (v && typeof v === "object" && !Array.isArray(v) ? (v as Item) : { valor: v });

/** As automações são SÓ API: a consulta é reconhecida quando a própria Centi a faz (a extensão observa, sem tocar na tela). */
const COMO_ENSINAR_TELA =
  "Na Centi, abra a Tela Protocolo (PO011) e pesquise uma vez — a extensão reconhece a consulta e daí em diante tudo vai só pela API.";

const CAMPO_CONDICAO: CampoNo[] = [
  { chave: "campo", rotulo: "Campo", tipo: "caminho", obrigatorio: true, ajuda: "O dado de cada item (ex.: situacao)." },
  { chave: "operador", rotulo: "Condição", tipo: "selecao", opcoes: OPERADORES.map((o) => ({ valor: o.valor, rotulo: o.rotulo })), padrao: "igual" },
  {
    chave: "valor",
    rotulo: "Valor",
    tipo: "texto",
    aceitaCampo: true,
    ajuda: "Um valor fixo ou um campo do item que chega (escolha a origem).",
    quando: { campo: "operador", valores: OPERADORES.filter((o) => o.valor !== "vazio" && o.valor !== "nao_vazio").map((o) => o.valor) },
  },
];
/** Um item da "volta" marcado pelo "Parar o laço" encerra o iterador (entrega o fim com o que acumulou). */
const pedeParar = (itens: Item[] | undefined) => (itens ?? []).some((it) => it.pararLaco === true);

const passa = (it: Item, c: Record<string, unknown>) =>
  comparar(resolverCaminho(it, str(c.campo)), str(c.operador, "igual"), interpolar(str(c.valor), it));

/** O próximo lote do "Órgão na Centi" (um por vez): troca o órgão em análise na Centi; no fim, volta ao da tela. */
async function proximoOrgao(est: Record<string, unknown>, ctx: ContextoNo): Promise<Portas> {
  const fila = (est.fila ?? []) as Item[][];
  const lote = fila.shift();
  if (!lote) {
    await ctx.centi("trocarOrgao", { entidade: null }, 30_000).catch(() => null);
    return { fim: marcarExecutado(est.acumulado as Item[], est.total as number) };
  }
  const o = str(lote[0]?.entidade);
  const r = await ctx.centi("trocarOrgao", { entidade: o }, 30_000);
  if (r.interrompido) throw new Error("Interrompido na extensão.");
  if (!r.ok) throw new Error(`Não deu para trocar para o órgão ${o} na Centi: ${r.erro || "a extensão não respondeu"}.`);
  ctx.aviso(`Órgão ${o} (${(est.total as number) - fila.length} de ${est.total as number}) — ${lote.length} item(ns)`);
  return { lote };
}

// ———————————————————————————————————————————————— os nós

const NOS: DefNo[] = [
  {
    tipo: "gatilho.inicio",
    categoria: "gatilho",
    rotulo: "Início",
    descricao: "Começa o fluxo — manual ou pela frequência do fluxo.",
    icone: "play",
    entradas: [],
    saidas: ["saida"],
    campos: [],
    unico: true,
    // Usado dentro de outro fluxo, o Início entrega o item que o fluxo pai mandou.
    executar: async (_e, _c, ctx) => {
      const ent = ctx.host.__entrada;
      return { saida: Array.isArray(ent) ? (ent as Item[]) : [{ iniciadoEm: new Date().toISOString() }] };
    },
  },

  // ——— Entrada de dados
  {
    tipo: "entrada.selecionar",
    categoria: "entrada",
    rotulo: "Selecionar itens",
    descricao: "Uma TABELA no painel com os itens do componente anterior: marque os que seguem (busca, filtros, marcar todos). Rodando pela Mesa, vale a seleção feita lá.",
    icone: "list",
    entradas: ["entrada"],
    saidas: ["saida"],
    campos: [
      { chave: "chave", rotulo: "Campo que identifica o item", tipo: "caminho", padrao: "id", obrigatorio: true },
      {
        chave: "semMarcar",
        rotulo: "Sem nada marcado",
        tipo: "selecao",
        entrada: true,
        opcoes: [
          { valor: "nenhum", rotulo: "Não segue nenhum" },
          { valor: "todos", rotulo: "Seguem todos" },
        ],
        padrao: "nenhum",
      },
    ],
    // Vindo da MESA (`__daMesa`), a seleção já foi feita lá: seguem todos os que chegam.
    executar: async (e, c, ctx) => ({ saida: ctx.host.__daMesa ? so(e) : selecionados(so(e), c) }),
  },
  {
    tipo: "entrada.ids",
    categoria: "entrada",
    rotulo: "Nºs de planejamento",
    descricao: "Os nºs de planejamento digitados (separados por “:”) — um item por planejamento.",
    icone: "edit",
    entradas: ["entrada"],
    saidas: ["saida"],
    campos: [{ chave: "ids", rotulo: "Nºs de planejamento", tipo: "texto", entrada: true, ajuda: `Ex.: 1154:1155:1160 (até ${MAX_IDS_CENTI}).` }],
    previa: (c) => lerIdsCenti(str(c.ids)).ids.map((id) => ({ id, planejamento: id })),
    executar: async (_e, c) => {
      const { ids } = lerIdsCenti(str(c.ids));
      if (!ids.length) throw new Error("Informe os nºs de planejamento (separados por “:”).");
      return { saida: ids.map((id) => ({ id, planejamento: id })) };
    },
  },

  // ——— Centi (só leitura, pela extensão)
  {
    tipo: "entrada.tabela",
    categoria: "entrada",
    rotulo: "Ler tabela salva",
    descricao: "Os dados de uma tabela salva por uma automação — escolha as colunas e as linhas que seguem (um item por linha).",
    icone: "list",
    entradas: ["entrada"],
    saidas: ["saida"],
    campos: [
      { chave: "nome", rotulo: "Nome da tabela", tipo: "texto", obrigatorio: true, entrada: true },
      { chave: "colunas", rotulo: "Colunas", tipo: "textoLongo", ajuda: "Opcional — uma por linha: coluna => nome. Vazio = todas." },
      { chave: "de", rotulo: "Da linha", tipo: "numero", ajuda: "1 = a primeira. Vazio = desde o início." },
      { chave: "ate", rotulo: "Até a linha", tipo: "numero", ajuda: "Vazio = até o fim." },
    ],
    rodaSemItens: true,
    executar: async (_e, c, ctx) => {
      const nome = str(c.nome).trim();
      if (!nome) throw new Error("Informe o nome da tabela.");
      const r = await ctx.api(`/api/admin/automacao/tabelas?nome=${encodeURIComponent(nome)}`);
      const t = r.tabela as { linhas?: unknown } | undefined;
      if (!r.ok || !t) throw new Error(r.error || `Tabela “${nome}” não encontrada.`);
      const linhas = (Array.isArray(t.linhas) ? t.linhas : []).map(obj);
      return { saida: recorteTabela(linhas, lerColunas(str(c.colunas)), numeroDe(c.de) ?? undefined, numeroDe(c.ate) ?? undefined) };
    },
  },
  {
    tipo: "centi.reparticoes",
    categoria: "centi",
    rotulo: "Repartições (Tela Protocolo)",
    descricao: "Lê as repartições do seletor Departamentos da PO011. Filtro opcional por texto.",
    icone: "building",
    entradas: ["entrada"],
    saidas: ["saida"],
    campos: [{ chave: "filtro", rotulo: "Só as que contêm", tipo: "texto", entrada: true, ajuda: "Ex.: PCA (vazio = todas). Separe vários por ;" }],
    executar: async (_e, c, ctx) => {
      ctx.aviso("Lendo as repartições na Centi…");
      const r = await ctx.centi("reparticoesApi", null, 30_000);
      if (r.interrompido) throw new Error("Interrompido na extensão.");
      if (!r.ok) throw new Error(`${r.erro || "A Centi não respondeu."}${r.semConsulta ? ` ${COMO_ENSINAR_TELA}` : ""}`);
      const filtros = lista(c.filtro).map(normTexto);
      const deps = (Array.isArray(r.departamentos) ? r.departamentos : []).filter((d): d is string => typeof d === "string" && !!d.trim());
      return { saida: deps.filter((d) => !filtros.length || filtros.some((f) => normTexto(d).includes(f))).map((reparticao) => ({ reparticao })) };
    },
  },
  {
    tipo: "centi.protocolos",
    categoria: "centi",
    rotulo: "Protocolos (Tela Protocolo)",
    descricao: "Os protocolos da PO011 pela API (todas as páginas). Situação: Em análise, Analisado, Todas ou outra.",
    icone: "inbox",
    entradas: ["entrada"],
    saidas: ["saida"],
    campos: [
      {
        chave: "situacao",
        rotulo: "Situação",
        tipo: "selecao",
        entrada: true,
        opcoes: [
          { valor: "", rotulo: "Em análise" },
          { valor: "ANALISADO", rotulo: "Analisado" },
          { valor: "*", rotulo: "Todas" },
          { valor: "outra", rotulo: "Outra (escrever)" },
        ],
        padrao: "",
      },
      { chave: "outra", rotulo: "Situação (texto)", tipo: "texto", entrada: true, obrigatorio: true, quando: { campo: "situacao", valores: ["outra"] } },
      {
        chave: "campoReparticao",
        rotulo: "Repartições vindas do item (campo)",
        tipo: "caminho",
        ajuda: "Ligue o nó Repartições antes e use “reparticao” — só os protocolos delas. Vazio = todas.",
      },
      { chave: "reparticao", rotulo: "Repartições", tipo: "reparticoesCenti", entrada: true, ajuda: "Ex.: DEP. PLANEJAMENTO - PCA (várias separadas por ;). Soma às vindas do item." },
    ],
    executar: async (e, c, ctx) => {
      const sit = str(c.situacao) === "outra" ? str(c.outra).trim() : str(c.situacao);
      const reps = [
        ...lista(c.reparticao),
        ...(str(c.campoReparticao) ? so(e).map((it) => str(resolverCaminho(it, str(c.campoReparticao)))).filter(Boolean) : []),
      ];
      ctx.aviso("Lendo os protocolos na Centi…");
      const r = await ctx.centi("telaApi", { situacao: sit, reparticoes: reps }, 180_000);
      if (r.interrompido) throw new Error("Interrompido na extensão.");
      if (!r.ok) {
        throw new Error(
          `${r.erro || "A Centi não respondeu."}${r.semConsulta ? ` ${COMO_ENSINAR_TELA}` : ""}`,
        );
      }
      if (sit && r.filtro !== sit) throw new Error("A extensão da Centi está desatualizada (1.15.0 ou maior filtra por situação) — baixe a nova.");
      const linhas = normalizar(r.protocolos);
      const alvo = reps.map(normTexto);
      // A Centi já filtrou pelas repartições no próprio pedido (Data.Reparticoes).
      if (!alvo.length || (Array.isArray(r.porReparticao) && r.porReparticao.length)) return { saida: linhas };
      // Filtro SEGURO: sem o departamento nas linhas não dá para saber a repartição — para (nunca passa todas).
      if (linhas.length && !linhas.some((l) => str(l.departamento)))
        throw new Error("A Centi não devolveu o departamento dos protocolos — não dá para filtrar pela repartição. Liste os protocolos uma vez na Tela Protocolo (PO011) com a coluna Departamento.");
      return { saida: linhas.filter((l) => alvo.some((a) => normTexto(l.departamento).includes(a) || a.includes(normTexto(l.departamento)))) };
    },
  },
  {
    tipo: "centi.orgao",
    categoria: "centi",
    rotulo: "Órgão na Centi",
    descricao:
      "Define em que órgão da Centi cada item é analisado: o do próprio item (o ID da Centi cadastrado no órgão do sistema) ou órgãos fixos. Um por vez troca o órgão em análise na Centi a cada lote.",
    icone: "building",
    entradas: ["entrada"],
    saidas: ["saida", "semOrgao", "lote", "fim"],
    rotulosPortas: { saida: "Com órgão", semOrgao: "Sem órgão", lote: "Lote do órgão", fim: "Fim" },
    campos: [
      {
        chave: "origem",
        rotulo: "Órgão",
        tipo: "selecao",
        padrao: "itens",
        opcoes: [
          { valor: "itens", rotulo: "O de cada item (cadastro do órgão)" },
          { valor: "fixo", rotulo: "Órgãos fixos" },
        ],
      },
      { chave: "campo", rotulo: "Campo do órgão no item", tipo: "caminho", padrao: "entidade", ajuda: "O campo do item que traz o ID do órgão na Centi (o padrão “entidade” vem do cadastro do órgão).", quando: { campo: "origem", valores: ["itens"] } },
      {
        chave: "orgaos",
        rotulo: "Órgãos (ID na Centi)",
        tipo: "orgaosCenti",
        entrada: true,
        ajuda: "Ex.: 2; 3. Fixos: todos os itens são analisados nestes órgãos. No “de cada item”, trava a análise só nestes (vazio = todos).",
      },
      {
        chave: "entrega",
        rotulo: "Entregar",
        tipo: "selecao",
        padrao: "todos",
        opcoes: [
          { valor: "todos", rotulo: "Todos de uma vez (cada item com o órgão)" },
          { valor: "umPorVez", rotulo: "Um órgão por vez (Lote → Volta)" },
        ],
      },
    ],
    rodaSemItens: true,
    entregaParcial: true,
    iterador: true,
    executar: async (e, c, ctx, est): Promise<Portas> => {
      const soNum = (v: unknown) => str(v).trim().replace(/^0+(?=\d)/, "");
      if (e.entrada) {
        const fixos = [...new Set(lista(c.orgaos).map(soNum))].filter(Boolean);
        const itens = e.entrada;
        const com: Item[] = [];
        const sem: Item[] = [];
        if (str(c.origem, "itens") === "fixo") {
          if (!fixos.length) throw new Error("Informe os órgãos fixos (ID na Centi).");
          for (const o of fixos) for (const it of itens) com.push({ ...it, entidade: o });
        } else {
          const campo = str(c.campo, "entidade") || "entidade";
          for (const it of itens) {
            const o = soNum(resolverCaminho(it, campo));
            if (!o) sem.push(it);
            else if (!fixos.length || fixos.includes(o)) com.push({ ...it, entidade: o });
          }
        }
        const orgaos = [...new Set(com.map((it) => str(it.entidade)))];
        ctx.aviso(`${com.length} item(ns) em ${orgaos.length} órgão(s) da Centi: ${orgaos.join(", ") || "—"}${sem.length ? ` · ${sem.length} sem órgão` : ""}`);
        if (str(c.entrega, "todos") !== "umPorVez") return { saida: com, semOrgao: sem, fim: marcarExecutado([], com.length) };
        est.fila = orgaos.map((o) => com.filter((it) => str(it.entidade) === o));
        est.total = orgaos.length;
        est.acumulado = [];
        if (sem.length) return { semOrgao: sem, ...(await proximoOrgao(est, ctx)) };
      } else {
        (est.acumulado as Item[]).push(...(e[PORTA_VOLTA] ?? []));
        if (pedeParar(e[PORTA_VOLTA])) est.fila = [];
      }
      return proximoOrgao(est, ctx);
    },
  },
  {
    tipo: "centi.cm002",
    categoria: "centi",
    rotulo: "CM002 · planejamentos",
    descricao: "A lista INTEIRA da CM002 por órgão (ID = nº de planejamento, situação, finalidade). Pela API.",
    icone: "list",
    entradas: ["entrada"],
    saidas: ["saida"],
    campos: [
      { chave: "entidades", rotulo: "Órgãos (ID na Centi)", tipo: "orgaosCenti", entrada: true, ajuda: "Marque os órgãos a ler. Nenhum marcado = todos os cadastrados em Órgãos e Unidades com o ID na Centi." },
      { chave: "colunas", rotulo: "Trazer todas as colunas da Centi", tipo: "booleano", padrao: false, ajuda: "Em “centi.<coluna>” — escolha as que analisa no nó “Escolher colunas”." },
      {
        chave: "dosItens",
        rotulo: "Só os órgãos dos itens que chegam",
        tipo: "booleano",
        padrao: false,
        ajuda: "Ligue a entrada aos DFDs: lê só os órgãos deles, um por vez — nada além do necessário.",
      },
    ],
    executar: async (e, c, ctx) => {
      const mapa = (ctx.host.mapaEntidades ?? {}) as Record<string, string>;
      const doItens = c.dosItens === true ? so(e).map((it) => str(it.entidade)).filter(Boolean) : [];
      if (c.dosItens === true && !doItens.length) throw new Error("Nenhum item com o órgão da Centi — cadastre o ID da Centi nos órgãos (Órgãos e Unidades).");
      const base = lista(c.entidades).length ? lista(c.entidades) : doItens.length ? doItens : Object.values(mapa);
      const ents = [...new Set(base.map((x) => x.replace(/^0+(?=\d)/, "")))].filter(Boolean);
      if (!ents.length) throw new Error("Nenhum órgão — informe no nó ou cadastre o ID da Centi nos órgãos.");
      const out: Item[] = [];
      // Uma entidade que falha não derruba as outras: segue e avisa; só falha quando NENHUMA respondeu.
      const falhas: string[] = [];
      const resumo: string[] = [];
      for (const [i, ent] of ents.entries()) {
        if (ctx.cancelado()) break;
        ctx.aviso(`Órgão ${ent} (${i + 1} de ${ents.length})…`);
        const r = await ctx.centi("cm002", { entidade: ent, colunas: c.colunas === true }, 300_000);
        if (r.interrompido) throw new Error("Interrompido na extensão.");
        if (!r.ok) {
          falhas.push(`órgão ${ent}: ${r.erro || "a extensão da Centi não respondeu"}`);
          continue;
        }
        const linhas = Array.isArray(r.linhas) ? r.linhas.map(obj) : [];
        const total = typeof r.total === "number" ? r.total : null;
        resumo.push(`órgão ${ent}: ${linhas.length}${total != null ? ` de ${total}` : ""} lidas${typeof r.paginas === "number" ? ` (${r.paginas} pág.)` : ""}`);
        // Leitura INCOMPLETA: para (nunca marca "não encontrado" um DFD que só não foi lido).
        if (total != null && linhas.length < total)
          throw new Error(`A CM002 do órgão ${ent} veio incompleta: ${linhas.length} de ${total} planejamentos — atualize a extensão da Centi e clique em Pesquisar UMA vez na CM002.`);
        // Nenhum planejamento dos DFDs deste órgão na lista = a consulta está filtrada (outra referência/PCA): para.
        const pedidos = new Set(so(e).filter((it) => str(it.entidade).replace(/^0+(?=\d)/, "") === ent).map((it) => str(it.planejamento).replace(/\D/g, "").replace(/^0+/, "")).filter(Boolean));
        const ids = new Set(linhas.map((p) => str(p.id)));
        if (c.dosItens === true && pedidos.size && linhas.length && ![...pedidos].some((x) => ids.has(x)))
          throw new Error(
            `Nenhum dos ${pedidos.size} planejamentos do órgão ${ent} veio na CM002 (${linhas.length} linhas lidas, IDs ${[...ids].slice(0, 3).join(", ") || "—"}…). A consulta aprendida está filtrada — na CM002 da Centi, limpe os filtros (Referência/Finalidade) e clique em Pesquisar UMA vez.`,
          );
        for (const p of linhas) out.push({ ...p, planejamento: str(p.id), entidade: ent });
      }
      if (falhas.length && falhas.length === ents.length) throw new Error(falhas.join(" · "));
      if (falhas.length) ctx.aviso(`Sem a lista de ${falhas.length} órgão(s) — ${falhas.join(" · ")}`);
      if (resumo.length) ctx.aviso(`CM002 — ${resumo.join(" · ")}`);
      return { saida: out };
    },
  },

  // ——— Sistema
  {
    tipo: "sistema.dfds",
    categoria: "sistema",
    rotulo: "DFDs do sistema",
    descricao: "Os DFDs com nº de planejamento (nº, planejamento, órgão (ID na Centi) e a execução gravada). Substituído por “Ler do sistema” (DFDs · Todos).",
    legado: true,
    icone: "file",
    entradas: ["entrada"],
    saidas: ["saida"],
    campos: [],
    executar: async (_e, _c, ctx) => {
      const r = await ctx.api("/api/admin/automacao/execucao-dfds");
      if (!r.ok || !Array.isArray(r.dfds)) throw new Error(r.error || "Não consegui ler os DFDs.");
      const mapa = (ctx.host.mapaEntidades ?? {}) as Record<string, string>;
      const chave = ctx.host.chaveOrgao as ((id: number | null, ent: string | null) => string | null) | undefined;
      return {
        saida: r.dfds.map((d) => {
          const x = obj(d);
          const k = chave ? chave((x.orgaoId as number | null) ?? null, (x.orgaoEntidade as string | null) ?? null) : null;
          return { ...x, entidade: (k && mapa[k]?.replace(/^0+(?=\d)/, "")) || "" };
        }),
      };
    },
  },
  {
    tipo: "sistema.ler",
    categoria: "sistema",
    rotulo: "Ler do sistema",
    descricao:
      "Identifica protocolos, DFDs ou itens do sistema: todos (geral) ou um recorte (os DFDs de um protocolo, os itens de um DFD, um produto). Entrega em lista ou UM POR VEZ (ligue o fim do corpo à “volta”); ao terminar, “fim” leva executado = sim.",
    icone: "file",
    entradas: ["entrada", PORTA_VOLTA],
    saidas: ["saida", "item", "fim"],
    rotulosPortas: { saida: "Todos", item: "Próximo", volta: "Volta", fim: "Fim (executado)" },
    campos: [
      {
        chave: "objeto",
        rotulo: "Ler",
        tipo: "selecao",
        padrao: "dfds",
        opcoes: [
          { valor: "protocolos", rotulo: "Protocolos" },
          { valor: "dfds", rotulo: "DFDs" },
          { valor: "itens", rotulo: "Itens (produtos)" },
        ],
      },
      { chave: "buscaProtocolos", rotulo: "Quais", tipo: "selecao", padrao: "todos", opcoes: BUSCAS.protocolos, quando: { campo: "objeto", valores: ["protocolos"] } },
      { chave: "buscaDfds", rotulo: "Quais", tipo: "selecao", padrao: "todos", opcoes: BUSCAS.dfds, quando: { campo: "objeto", valores: ["dfds"] } },
      { chave: "buscaItens", rotulo: "Quais", tipo: "selecao", padrao: "todos", opcoes: BUSCAS.itens, quando: { campo: "objeto", valores: ["itens"] } },
      {
        chave: "valor",
        rotulo: "Valor procurado",
        tipo: "texto",
        entrada: true,
        aceitaCampo: true,
        ajuda:
          "Do nó anterior: o campo de cada item que chega (ex.: o planejamento). Rodando sozinho — sem esse campo nos itens —, lê TODOS e a seleção mostra tudo. Valor fixo: vários separados por ;",
      },
      {
        chave: "entrega",
        rotulo: "Entregar",
        tipo: "selecao",
        padrao: "lista",
        opcoes: [
          { valor: "lista", rotulo: "Tudo de uma vez (Todos)" },
          { valor: "umPorVez", rotulo: "Um por vez (Próximo → Volta)" },
        ],
      },
    ],
    rodaSemItens: true,
    entregaParcial: true,
    iterador: true,
    executar: async (e, c, ctx, est): Promise<Portas> => {
      if (e.entrada) {
        const objeto = (str(c.objeto, "dfds") as ObjetoLeitura) in BUSCAS ? (str(c.objeto, "dfds") as ObjetoLeitura) : "dfds";
        const pedida = str(objeto === "protocolos" ? c.buscaProtocolos : objeto === "dfds" ? c.buscaDfds : c.buscaItens, "todos");
        const valores = valoresProcurados(str(c.valor), e.entrada);
        const busca = buscaEfetiva(pedida, str(c.valor), valores);
        if (!busca) throw new Error("Informe o valor procurado (ou {{campo}} do item que chega).");
        const lidos = lerDoSistema(await fontesDoSistema(ctx, objeto), objeto, busca, valores);
        if (str(c.entrega, "lista") !== "umPorVez") return { saida: lidos, fim: marcarExecutado([], lidos.length) };
        est.fila = [...lidos];
        est.total = lidos.length;
        est.acumulado = [];
      } else {
        (est.acumulado as Item[]).push(...(e[PORTA_VOLTA] ?? []));
        if (pedeParar(e[PORTA_VOLTA])) est.fila = [];
      }
      const fila = (est.fila ?? []) as Item[];
      const proximo = fila.shift();
      if (!proximo) return { fim: marcarExecutado(est.acumulado as Item[], est.total as number) };
      ctx.aviso(`${(est.total as number) - fila.length} de ${est.total as number}`);
      return { item: [proximo] };
    },
  },
  {
    tipo: "sistema.completarDfd",
    categoria: "sistema",
    rotulo: "Completar com o DFD do sistema",
    descricao:
      "Para cada item, o DFD do sistema pelo nº de planejamento (o item que já é um DFD passa direto). Rodando sozinho, use o planejamento informado.",
    icone: "file",
    entradas: ["entrada"],
    saidas: ["saida", "naoEncontrados"],
    rotulosPortas: { saida: "DFDs", naoEncontrados: "Não encontrados" },
    campos: [{ chave: "planejamento", rotulo: "Planejamento (rodando sozinho)", tipo: "texto", entrada: true, ajuda: "Usado quando o item que chega não traz o planejamento." }],
    executar: async (e, c, ctx) => {
      const itens = so(e).map((it) => (str(it.planejamento) ? it : { ...it, planejamento: str(c.planejamento) }));
      const prontos = itens.filter((it) => it.id != null && str(it.numero) && str(it.planejamento));
      const faltam = itens.filter((it) => !prontos.includes(it));
      if (!faltam.length) return { saida: prontos, naoEncontrados: [] };
      // Os DFDs do sistema são lidos UMA vez por execução (o cache vive no host — vale para todos os subfluxos).
      const cache = ctx.host.__cache as Map<string, unknown> | undefined;
      let dfds = cache?.get("dfds") as Promise<Item[]> | undefined;
      if (!dfds) {
        dfds = (async () => (await (REGISTRO_NOS.get("sistema.dfds") as DefNo).executar({ entrada: [{}] }, {}, ctx, {})).saida ?? [])();
        cache?.set("dfds", dfds);
      }
      const porPlan = new Map<string, Item>();
      for (const d of await dfds.catch((x) => {
        cache?.delete("dfds");
        throw x;
      }))
        if (str(d.planejamento)) porPlan.set(str(d.planejamento).replace(/^0+(?=\d)/, ""), d);
      const saida = [...prontos];
      const naoEncontrados: Item[] = [];
      for (const it of faltam) {
        const d = porPlan.get(str(it.planejamento).replace(/^0+(?=\d)/, ""));
        if (d) saida.push({ ...d, ...Object.fromEntries(Object.entries(it).filter(([k]) => !(k in d))) });
        else naoEncontrados.push(it);
      }
      return { saida, naoEncontrados };
    },
  },
  {
    tipo: "sistema.protocolos",
    categoria: "sistema",
    rotulo: "Protocolos do sistema",
    descricao: "Os protocolos cadastrados (nº, Id da capa, unidade, PCA, DFDs com planejamento).",
    icone: "folder",
    entradas: ["entrada"],
    saidas: ["saida"],
    campos: [{ chave: "dfds", rotulo: "Um item por DFD (em vez de por protocolo)", tipo: "booleano", padrao: false }],
    previa: (c, host) => protocolosDoSistema(c, host),
    executar: async (_e, c, ctx) => ({ saida: protocolosDoSistema(c, ctx.host) }),
  },

  {
    tipo: "sistema.naoCadastrados",
    categoria: "sistema",
    rotulo: "Só os não cadastrados",
    descricao: "Separa os protocolos que JÁ estão no sistema (pelo Id da capa ou nº/ano) — evita emitir e ler o PDF de novo.",
    icone: "filter",
    entradas: ["entrada"],
    saidas: ["novos", "cadastrados"],
    rotulosPortas: { novos: "Novos", cadastrados: "Já cadastrados" },
    campos: [],
    executar: async (e, _c, ctx) => separarCadastrados(so(e), (ctx.host.protocolos ?? []) as Item[]),
  },

  // ——— Leitura
  {
    tipo: "leitura.protocolo",
    categoria: "leitura",
    rotulo: "Ler protocolo (PDF)",
    descricao: "Emite o PDF do protocolo na Centi POR CÓDIGO e lê capa + DFDs. Cada item precisa de protocolo, ano e Id.",
    icone: "scan",
    entradas: ["entrada"],
    saidas: ["saida"],
    campos: [{ chave: "limite", rotulo: "Máximo de protocolos", tipo: "numero", padrao: 50, ajuda: "Proteção — até 500." }],
    executar: async (e, c, ctx) => {
      const ler = ctx.host.lerProtocolo as ((it: Item) => Promise<Item>) | undefined;
      if (!ler) throw new Error("A leitura de PDF só funciona na tela da Automação.");
      const max = Math.min(500, Math.max(1, numeroDe(c.limite) ?? 50));
      const itens = so(e).slice(0, max);
      const out: Item[] = [];
      for (const [i, it] of itens.entries()) {
        if (ctx.cancelado()) break;
        ctx.aviso(`Protocolo ${str(it.protocolo)} (${i + 1} de ${itens.length})…`);
        try {
          out.push({ ...it, ...(await ler(it)) });
          ctx.parcial?.([out[out.length - 1]]);
        } catch (x) {
          const msg = x instanceof Error ? x.message : String(x);
          // O lote acabou na extensão (interrompido, tela recarregada): para o fluxo — os demais DFDs falhariam igual.
          if (/interrompido|lote foi encerrado/i.test(msg)) throw x;
          // Um protocolo que não lê não para os outros: segue marcado como falha (o relatório e a importação o apontam).
          out.push({ ...it, leitura: "falha", leituraTexto: msg });
          ctx.parcial?.([out[out.length - 1]]);
        }
      }
      return { saida: out };
    },
  },

  {
    tipo: "leitura.dfdCenti",
    categoria: "leitura",
    rotulo: "Buscar DFD na Centi",
    descricao: "Para cada DFD, emite o DFD da Centi pelo nº de planejamento (o mesmo do “Baixar DFDs”, por API) e lê o PDF → campo “centi”.",
    icone: "scan",
    entradas: ["entrada"],
    saidas: ["saida"],
    campos: [
      { chave: "limite", rotulo: "Máximo de DFDs", tipo: "numero", padrao: 5000, ajuda: "Proteção — até 20000." },
      { chave: "pdf", rotulo: "Emitir e ler o PDF do DFD", tipo: "booleano", entrada: true, padrao: true, ajuda: "Desligado = só o planejamento (situação) — bem mais rápido." },
      { chave: "completo", rotulo: "Guardar o DFD inteiro", tipo: "booleano", padrao: false, ajuda: "Ligado: o DFD lido completo vai em “centi.dfd” — a base do “Substituir DFD pela Centi”." },
      {
        chave: "falhaErro",
        rotulo: "Falha de comunicação para o fluxo",
        tipo: "booleano",
        padrao: false,
        ajuda: "Ligado (o fluxo de UM DFD): a falha vira erro — o fluxo pai a registra e a retomada tenta o DFD de novo. Desligado: só aponta “não conferido”.",
      },
    ],
    executar: async (e, c, ctx) => {
      const ler = ctx.host.lerDfdCenti as ((plan: string, entidade?: string, pdf?: boolean, completo?: boolean) => Promise<Item>) | undefined;
      if (!ler) throw new Error("A busca do DFD na Centi só funciona na tela da Automação.");
      const max = Math.min(20000, Math.max(1, numeroDe(c.limite) ?? 5000));
      const itens = so(e).slice(0, max);
      const out: Item[] = [];
      const mapa = (ctx.host.mapaEntidades ?? {}) as Record<string, string>;
      const chave = ctx.host.chaveOrgao as ((id: number | null, ent: string | null) => string | null) | undefined;
      // A entidade da Centi do DFD: a dele; senão a do órgão (cadastro/mapa) — o load e a emissão vão nela.
      const entidadeDe = (d: Item) => {
        if (str(d.entidade)) return str(d.entidade);
        const k = chave?.((d.orgaoId as number | null) ?? null, str(d.orgaoEntidade ?? d.orgao) || null);
        return (k && mapa[k]?.replace(/^0+(?=\d)/, "")) || "";
      };
      for (const [i, it0] of itens.entries()) {
        const it: Item = { ...it0, entidade: entidadeDe(it0) };
        if (ctx.cancelado()) break;
        ctx.aviso(`DFD ${str(it.numero)} · planejamento ${str(it.planejamento)} (${i + 1} de ${itens.length})…`);
        try {
          out.push({ ...it, centi: await ler(str(it.planejamento), str(it.entidade) || undefined, c.pdf !== false, c.completo === true) });
          ctx.parcial?.([out[out.length - 1]]);
        } catch (x) {
          const msg = x instanceof Error ? x.message : String(x);
          if (/interrompido/i.test(msg)) throw x;
          // A Centi recusou a OPERAÇÃO: os demais também falhariam — para já, com o que fazer.
          if (/recusou o Emitir DFD|Interrompido/i.test(msg)) throw x;
          // "Não encontrado" só quando a Centi respondeu sem o planejamento; o resto é falha de comunicação (não conferido).
          const nao = msg.startsWith("NAO_ENCONTRADO: ");
          if (!nao && c.falhaErro === true) throw new Error(`DFD ${str(it.numero)} (planejamento ${str(it.planejamento)}) não conferido: ${msg}`);
          out.push({ ...it, centi: null, centiErro: nao ? msg.slice(16) : msg, centiFalha: !nao });
          ctx.parcial?.([out[out.length - 1]]);
        }
      }
      return { saida: out };
    },
  },

  // ——— Lógica
  {
    tipo: "logica.se",
    categoria: "logica",
    rotulo: "SE (condição)",
    descricao: "Separa os itens em verdadeiro/falso por uma condição.",
    icone: "branch",
    entradas: ["entrada"],
    saidas: ["verdadeiro", "falso"],
    campos: CAMPO_CONDICAO,
    executar: async (e, c) => {
      const v: Item[] = [];
      const f: Item[] = [];
      for (const it of so(e)) (passa(it, c) ? v : f).push(it);
      return { verdadeiro: v, falso: f };
    },
  },
  {
    tipo: "logica.comparar",
    categoria: "logica",
    rotulo: "Comparar A × B",
    descricao: "Casa os itens de A e B por uma chave e compara um dado: iguais, diferentes, só em A, só em B.",
    icone: "compare",
    entradas: ["a", "b"],
    saidas: ["iguais", "diferentes", "soEmA", "soEmB"],
    rotulosPortas: { a: "A", b: "B", iguais: "Iguais", diferentes: "Diferentes", soEmA: "Só em A", soEmB: "Só em B" },
    campos: [
      { chave: "chaveA", rotulo: "Chave em A", tipo: "caminho", obrigatorio: true, ajuda: "Ex.: planejamento" },
      { chave: "chaveB", rotulo: "Chave em B", tipo: "caminho", obrigatorio: true, ajuda: "Ex.: id" },
      { chave: "campoA", rotulo: "Dado de A a comparar", tipo: "caminho", ajuda: "Vazio = só casa pela chave." },
      { chave: "campoB", rotulo: "Dado de B a comparar", tipo: "caminho" },
      { chave: "operador", rotulo: "Iguais quando", tipo: "selecao", opcoes: OPERADORES.map((o) => ({ valor: o.valor, rotulo: o.rotulo })), padrao: "igual" },
    ],
    rodaSemItens: true,
    executar: async (e, c) => {
      const b = new Map<string, Item[]>();
      for (const it of so(e, "b")) {
        const k = chaveJuncao(resolverCaminho(it, str(c.chaveB)));
        if (k) b.set(k, [...(b.get(k) ?? []), it]);
      }
      const usadas = new Set<string>();
      const out: Portas = { iguais: [], diferentes: [], soEmA: [], soEmB: [] };
      for (const a of so(e, "a")) {
        const k = chaveJuncao(resolverCaminho(a, str(c.chaveA)));
        const par = k ? b.get(k)?.[0] : undefined;
        if (!par) {
          out.soEmA.push(a);
          continue;
        }
        usadas.add(k);
        const juntos = { ...a, b: par };
        const ok = !str(c.campoA) || comparar(resolverCaminho(a, str(c.campoA)), str(c.operador, "igual"), resolverCaminho(par, str(c.campoB) || str(c.campoA)));
        (ok ? out.iguais : out.diferentes).push(juntos);
      }
      for (const [k, its] of b) if (!usadas.has(k)) out.soEmB.push(...its);
      return out;
    },
  },
  {
    tipo: TIPO_LACO,
    categoria: "logica",
    rotulo: "Laço (até o fim)",
    descricao: "Entrega os itens em lotes; ligue o fim do corpo à porta “volta”. Repete até acabar e entrega tudo em “fim”.",
    icone: "repeat",
    entradas: ["entrada", PORTA_VOLTA],
    saidas: ["lote", "fim"],
    rotulosPortas: { volta: "Volta", lote: "Lote", fim: "Fim" },
    campos: [{ chave: "tamanho", rotulo: "Itens por lote", tipo: "numero", padrao: 1 }],
    rodaSemItens: true,
    entregaParcial: true,
    iterador: true,
    executar: async (e, c, ctx, est): Promise<Portas> => {
      const tam = Math.min(1000, Math.max(1, numeroDe(c.tamanho) ?? 1));
      if (e.entrada) {
        est.fila = [...e.entrada];
        est.acumulado = [];
        est.voltas = 0;
      } else {
        (est.acumulado as Item[]).push(...(e[PORTA_VOLTA] ?? []));
        if (pedeParar(e[PORTA_VOLTA])) est.fila = [];
        est.voltas = (est.voltas as number) + 1;
        if ((est.voltas as number) > MAX_ITERACOES_LACO) throw new Error(`O laço passou de ${MAX_ITERACOES_LACO} voltas.`);
      }
      const fila = est.fila as Item[];
      if (!fila.length) return { fim: est.acumulado as Item[] };
      const lote = fila.splice(0, tam);
      ctx.aviso(`Lote ${(est.voltas as number) + 1} · faltam ${fila.length}`);
      return { lote };
    },
  },
  {
    tipo: "logica.juntar",
    categoria: "logica",
    rotulo: "Juntar",
    descricao: "Une os itens que chegam pelas duas entradas numa lista só.",
    icone: "merge",
    entradas: ["a", "b"],
    saidas: ["saida"],
    rotulosPortas: { a: "A", b: "B" },
    campos: [],
    rodaSemItens: true,
    executar: async (e) => ({ saida: [...so(e, "a"), ...so(e, "b")] }),
  },

  {
    tipo: "logica.procurar",
    categoria: "logica",
    rotulo: "Procurar nas linhas",
    descricao:
      "Procura o valor de cada item que chega (ex.: {{planejamento}}) nas linhas da TABELA (ex.: a CM002): numa coluna ou em TODAS as colunas da linha. Encontrado leva a linha em “encontrado”.",
    icone: "search",
    entradas: ["entrada", "tabela"],
    saidas: ["encontrados", "naoEncontrados"],
    rotulosPortas: { entrada: "Itens", tabela: "Tabela", encontrados: "Encontrados", naoEncontrados: "Não encontrados" },
    campos: [
      { chave: "valor", rotulo: "Valor procurado", tipo: "texto", obrigatorio: true, entrada: true, aceitaCampo: true, padrao: "{{planejamento}}", ajuda: "Do nó anterior: o campo de cada item. Valor fixo: o texto como está." },
      { chave: "onde", rotulo: "Onde procurar", tipo: "selecao", padrao: "coluna", opcoes: [{ valor: "coluna", rotulo: "Numa coluna" }, { valor: "tudo", rotulo: "Em todas as colunas (ler tudo)" }] },
      { chave: "coluna", rotulo: "Coluna da tabela", tipo: "caminho", obrigatorio: true, quando: { campo: "onde", valores: ["coluna"] }, ajuda: "Ex.: planejamento ou centi.Id" },
      { chave: "operador", rotulo: "Casa quando a coluna", tipo: "selecao", opcoes: OPERADORES.map((o) => ({ valor: o.valor, rotulo: o.rotulo })), padrao: "igual" },
      { chave: "resultado", rotulo: "Resultado", tipo: "selecao", padrao: "primeiro", opcoes: [{ valor: "primeiro", rotulo: "A primeira linha que casa" }, { valor: "todas", rotulo: "Todas as linhas (lista)" }] },
      { chave: "extraCampo", rotulo: "E também igual: campo do item", tipo: "caminho", ajuda: "Opcional. Ex.: entidade = o órgão (o mesmo nº pode existir em outro órgão)." },
      { chave: "extraColuna", rotulo: "… à coluna da tabela", tipo: "caminho", ajuda: "Ex.: entidade" },
    ],
    rodaSemItens: true,
    executar: async (e, c) =>
      procurarNaTabela(so(e), so(e, "tabela"), {
        valor: str(c.valor),
        coluna: str(c.onde, "coluna") === "tudo" ? "" : str(c.coluna),
        operador: str(c.operador, "igual"),
        resultado: c.resultado === "todas" ? "todas" : "primeiro",
        extra: { campo: str(c.extraCampo), coluna: str(c.extraColuna) },
      }),
  },
  {
    tipo: "logica.parar",
    categoria: "logica",
    rotulo: "Parar o laço quando",
    descricao: "Ligado antes da “volta” de um laço (ou do Ler do sistema um por vez): quando algum item passa na condição, o laço termina e entrega o fim.",
    icone: "stop",
    entradas: ["entrada"],
    saidas: ["saida"],
    campos: CAMPO_CONDICAO,
    executar: async (e, c, ctx) => {
      const itens = so(e).map((it) => (passa(it, c) ? { ...it, pararLaco: true } : it));
      if (pedeParar(itens)) ctx.aviso("Condição atingida — o laço termina.");
      return { saida: itens };
    },
  },
  {
    tipo: "logica.esperar",
    categoria: "logica",
    rotulo: "Esperar",
    descricao: "Espera os segundos informados e repassa os itens (dar tempo à Centi entre pedidos, por exemplo).",
    icone: "clock",
    entradas: ["entrada"],
    saidas: ["saida"],
    campos: [{ chave: "segundos", rotulo: "Segundos", tipo: "numero", padrao: 5, obrigatorio: true, ajuda: `1 a ${MAX_ESPERA_S}.` }],
    rodaSemItens: true,
    executar: async (e, c, ctx) => {
      const seg = Math.min(MAX_ESPERA_S, Math.max(1, numeroDe(c.segundos) ?? 5));
      ctx.aviso(`Esperando ${seg} s…`);
      if (!(await esperar(seg * 1000, ctx.cancelado))) throw new Error("Interrompido.");
      return { saida: so(e) };
    },
  },
  // ——— Dados
  {
    tipo: "dados.filtrar",
    categoria: "dados",
    rotulo: "Filtrar",
    descricao: "Mantém só os itens que passam na condição.",
    icone: "filter",
    entradas: ["entrada"],
    saidas: ["saida"],
    campos: CAMPO_CONDICAO,
    executar: async (e, c) => ({ saida: so(e).filter((it) => passa(it, c)) }),
  },
  {
    tipo: "dados.campos",
    categoria: "dados",
    rotulo: "Definir campos",
    descricao: "Cria ou renomeia campos. Uma linha por campo: nome = valor (aceita {{campo}}).",
    icone: "edit",
    entradas: ["entrada"],
    saidas: ["saida"],
    campos: [
      { chave: "linhas", rotulo: "Campos", tipo: "textoLongo", obrigatorio: true, ajuda: "Ex.: chave = {{planejamento}}" },
      { chave: "manter", rotulo: "Manter os outros campos", tipo: "booleano", padrao: true },
    ],
    executar: async (e, c) => {
      const regras = str(c.linhas)
        .split("\n")
        .map((l) => l.split("="))
        .filter((p) => p.length >= 2 && p[0].trim())
        .map((p) => [p[0].trim(), p.slice(1).join("=").trim()] as const);
      return { saida: so(e).map((it) => ({ ...(c.manter === false ? {} : it), ...Object.fromEntries(regras.map(([k, v]) => [k, interpolar(v, it)])) })) };
    },
  },
  {
    tipo: "dados.colunas",
    categoria: "dados",
    rotulo: "Escolher colunas",
    descricao: "Escolhe as colunas que seguem (ex.: as da Centi em centi.<coluna>) e o nome de cada uma. Uma por linha: coluna => novo nome.",
    icone: "columns",
    entradas: ["entrada"],
    saidas: ["saida"],
    campos: [
      { chave: "colunas", rotulo: "Colunas", tipo: "textoLongo", obrigatorio: true, ajuda: "Ex.: centi.Situacao => situacao (sem “=>” fica o último nome do caminho)." },
      { chave: "manter", rotulo: "Manter as outras colunas", tipo: "booleano", padrao: false },
    ],
    executar: async (e, c) => {
      const colunas = lerColunas(str(c.colunas));
      if (!colunas.length) throw new Error("Informe ao menos uma coluna.");
      return { saida: escolherColunas(so(e), colunas, c.manter === true) };
    },
  },
  {
    tipo: "dados.regra",
    categoria: "dados",
    rotulo: "Regra: se encontrar, grava",
    descricao: "Lê um campo e grava no destino o valor da 1ª regra que casa (X => Y); sem regra que case, o “senão”. Ex.: EXECUTADO => Executado.",
    icone: "edit",
    entradas: ["entrada"],
    saidas: ["saida", "semRegra"],
    rotulosPortas: { saida: "Com valor", semRegra: "Nenhuma regra casou" },
    campos: [
      { chave: "origem", rotulo: "Campo lido", tipo: "caminho", obrigatorio: true, ajuda: "Ex.: encontrado.situacao" },
      { chave: "operador", rotulo: "A regra casa quando o campo", tipo: "selecao", opcoes: OPERADORES.map((o) => ({ valor: o.valor, rotulo: o.rotulo })), padrao: "contem" },
      { chave: "regras", rotulo: "Regras (X => Y)", tipo: "textoLongo", obrigatorio: true, entrada: true, ajuda: "Uma por linha, na ordem. Y aceita {{campo}}. Ex.: CANCEL => Cancelado" },
      {
        chave: "senao",
        rotulo: "Senão",
        tipo: "selecao",
        padrao: "valor",
        opcoes: [
          { valor: "valor", rotulo: "Gravar o próprio valor lido" },
          { valor: "fixo", rotulo: "Gravar um valor fixo" },
          { valor: "vazio", rotulo: "Gravar vazio" },
          { valor: "manter", rotulo: "Não gravar nada" },
        ],
      },
      { chave: "senaoValor", rotulo: "Valor fixo", tipo: "texto", quando: { campo: "senao", valores: ["fixo"] } },
      { chave: "destino", rotulo: "Gravar no campo", tipo: "texto", padrao: "valor", ajuda: "O campo do item que recebe (ex.: valor — o “Gravar na coluna da Mesa” lê este)." },
    ],
    executar: async (e, c) => {
      const regras = lerRegras(str(c.regras));
      if (!regras.length) throw new Error("Informe ao menos uma regra (X => Y).");
      const senao = (["valor", "fixo", "vazio", "manter"] as const).find((x) => x === c.senao) ?? "valor";
      const itens = aplicarRegra(so(e), { origem: str(c.origem), regras, operador: str(c.operador, "contem"), senao, senaoValor: str(c.senaoValor), destino: str(c.destino, "valor") });
      return { saida: itens.filter((it) => it.regra !== "" || senao !== "manter"), semRegra: itens.filter((it) => it.regra === "") };
    },
  },
  {
    tipo: "dados.variavel",
    categoria: "dados",
    rotulo: "Variável",
    descricao:
      "Guarda um valor durante a execução (definir, somar, contar, acrescentar) ou o lê nos itens — também o estado que um nó guardou (“Guardar o estado do nó”), ex.: {{minhaVar.executado}}.",
    icone: "variable",
    entradas: ["entrada"],
    saidas: ["saida"],
    campos: [
      {
        chave: "acao",
        rotulo: "Ação",
        tipo: "selecao",
        padrao: "definir",
        opcoes: [
          { valor: "definir", rotulo: "Definir" },
          { valor: "somar", rotulo: "Somar (o valor de cada item)" },
          { valor: "contar", rotulo: "Contar os itens" },
          { valor: "acrescentar", rotulo: "Acrescentar à lista" },
          { valor: "ler", rotulo: "Ler nos itens" },
          { valor: "limpar", rotulo: "Limpar" },
        ],
      },
      { chave: "nome", rotulo: "Nome da variável", tipo: "texto", obrigatorio: true, ajuda: "Letras, números e _ (ex.: total_lido)." },
      { chave: "valor", rotulo: "Valor", tipo: "texto", aceitaCampo: true, ajuda: "Um valor fixo ou um campo do item que chega.", quando: { campo: "acao", valores: ["definir", "somar", "acrescentar"] } },
      { chave: "destino", rotulo: "Gravar no campo", tipo: "texto", ajuda: "Vazio = o nome da variável.", quando: { campo: "acao", valores: ["ler"] } },
    ],
    rodaSemItens: true,
    executar: async (e, c, ctx) => {
      const nome = nomeVariavel(c.nome);
      if (!nome) throw new Error("Nome de variável inválido (letras, números e _).");
      const vars = variaveis(ctx.host);
      const acao = (["definir", "somar", "contar", "acrescentar", "ler", "limpar"] as const).find((x) => x === c.acao) ?? "definir";
      if (acao !== "ler") vars[nome] = operarVariavel(vars[nome], acao, str(c.valor), so(e));
      const campo = str(c.destino).trim() || nome;
      const itens = so(e);
      // Sem itens que chegam, um item com a variável (o laço segue com ela).
      return { saida: (itens.length ? itens : [{}]).map((it) => ({ ...it, [campo]: vars[nome] ?? "" })) };
    },
  },
  {
    tipo: "dados.ordenar",
    categoria: "dados",
    rotulo: "Ordenar e limitar",
    descricao: "Ordena por um campo e (opcional) fica só com os primeiros.",
    icone: "sort",
    entradas: ["entrada"],
    saidas: ["saida"],
    campos: [
      { chave: "campo", rotulo: "Campo", tipo: "caminho", obrigatorio: true },
      { chave: "ordem", rotulo: "Ordem", tipo: "selecao", opcoes: [{ valor: "asc", rotulo: "Crescente" }, { valor: "desc", rotulo: "Decrescente" }], padrao: "asc" },
      { chave: "limite", rotulo: "Limite (0 = todos)", tipo: "numero", padrao: 0 },
    ],
    executar: async (e, c) => {
      const s = str(c.ordem) === "desc" ? -1 : 1;
      const col = new Intl.Collator("pt-BR", { numeric: true, sensitivity: "base" });
      const v = (it: Item) => resolverCaminho(it, str(c.campo));
      const out = [...so(e)].sort((a, b) => {
        const na = numeroDe(v(a));
        const nb = numeroDe(v(b));
        return s * (na != null && nb != null ? na - nb : col.compare(str(v(a)), str(v(b))));
      });
      const lim = numeroDe(c.limite) ?? 0;
      return { saida: lim > 0 ? out.slice(0, lim) : out };
    },
  },
  {
    tipo: "dados.unicos",
    categoria: "dados",
    rotulo: "Remover duplicados",
    descricao: "Fica com o primeiro item de cada valor do campo.",
    icone: "copy",
    entradas: ["entrada"],
    saidas: ["saida"],
    campos: [{ chave: "campo", rotulo: "Campo", tipo: "caminho", obrigatorio: true }],
    executar: async (e, c) => {
      const vistos = new Set<string>();
      return {
        saida: so(e).filter((it) => {
          const k = chaveJuncao(resolverCaminho(it, str(c.campo)));
          if (vistos.has(k)) return false;
          vistos.add(k);
          return true;
        }),
      };
    },
  },
  {
    tipo: "dados.agrupar",
    categoria: "dados",
    rotulo: "Agrupar e somar",
    descricao: "Um item por valor do campo, com a contagem e a soma de outro campo.",
    icone: "sum",
    entradas: ["entrada"],
    saidas: ["saida"],
    campos: [
      { chave: "campo", rotulo: "Agrupar por", tipo: "caminho", obrigatorio: true },
      { chave: "somar", rotulo: "Somar o campo", tipo: "caminho" },
    ],
    executar: async (e, c) => {
      const m = new Map<string, { grupo: string; quantidade: number; soma: number }>();
      for (const it of so(e)) {
        const g = str(resolverCaminho(it, str(c.campo))) || "—";
        const x = m.get(g) ?? { grupo: g, quantidade: 0, soma: 0 };
        x.quantidade++;
        if (str(c.somar)) x.soma += numeroDe(resolverCaminho(it, str(c.somar))) ?? 0;
        m.set(g, x);
      }
      return { saida: [...m.values()].sort((a, b) => b.quantidade - a.quantidade) };
    },
  },

  {
    tipo: "dados.desdobrar",
    categoria: "dados",
    rotulo: "Desdobrar lista",
    descricao: "Um item por elemento de um campo de lista (ex.: dfds do protocolo lido), levando o protocolo, o ano e o Id do pai.",
    icone: "list",
    entradas: ["entrada"],
    saidas: ["saida"],
    campos: [{ chave: "campo", rotulo: "Campo de lista", tipo: "caminho", obrigatorio: true, padrao: "dfds" }],
    executar: async (e, c) => ({ saida: desdobrar(so(e), str(c.campo, "dfds")) }),
  },

  {
    tipo: "dados.conferirCm002",
    categoria: "dados",
    rotulo: "Conferir DFDs na CM002",
    descricao: "Cada DFD (A) × a CM002 (B) pelo planejamento: fora da CM002, situação proibida/fora da esperada, valor e órgão divergentes.",
    icone: "compare",
    entradas: ["a", "b"],
    saidas: ["divergentes", "conformes"],
    rotulosPortas: { a: "DFDs", b: "CM002", divergentes: "Divergentes", conformes: "Conformes" },
    campos: [
      { chave: "proibidas", rotulo: "Situações que são erro", tipo: "texto", entrada: true, padrao: "CANCEL", ajuda: "Contém (várias por ;). Ex.: CANCEL" },
      { chave: "esperada", rotulo: "Situação esperada", tipo: "texto", entrada: true, ajuda: "Vazio = qualquer uma (menos as de erro). Várias por ;" },
      { chave: "campoValor", rotulo: "Campo do valor na CM002", tipo: "caminho", padrao: "valor", ajuda: "Vazio = não confere o valor." },
      { chave: "tolerancia", rotulo: "Tolerância do valor (R$)", tipo: "numero", entrada: true, padrao: 0.01 },
      { chave: "entidade", rotulo: "Conferir o órgão", tipo: "booleano", padrao: true },
    ],
    executar: async (e, c, ctx) => {
      const mapa = (ctx.host.mapaEntidades ?? {}) as Record<string, string>;
      const chave = ctx.host.chaveOrgao as ((id: number | null, ent: string | null) => string | null) | undefined;
      const entidadeDe = (d: Item) => {
        if (str(d.entidade)) return str(d.entidade);
        const k = chave?.(null, str(d.orgao) || null);
        return (k && mapa[k]?.replace(/^0+(?=\d)/, "")) || "";
      };
      return conferirCm002(so(e, "a"), so(e, "b"), {
        proibidas: lista(c.proibidas ?? "CANCEL"),
        esperada: lista(c.esperada),
        campoValor: str(c.campoValor ?? "valor"),
        tolerancia: numeroDe(c.tolerancia) ?? 0.01,
        entidade: c.entidade !== false ? entidadeDe : null,
      });
    },
  },

  {
    tipo: "dados.compararDfdCenti",
    categoria: "dados",
    rotulo: "Comparar DFD × Centi",
    descricao: "O DFD do sistema × o lido na Centi (nó “Buscar DFD na Centi”): nº do DFD, tipo, objeto, valor total e nº de itens.",
    icone: "compare",
    entradas: ["entrada"],
    saidas: ["divergentes", "conformes"],
    rotulosPortas: { divergentes: "Divergentes", conformes: "Conformes" },
    campos: [
      { chave: "tolerancia", rotulo: "Tolerância do valor (R$)", tipo: "numero", entrada: true, padrao: 0.01 },
      { chave: "objeto", rotulo: "Comparar o objeto", tipo: "booleano", entrada: true, padrao: true },
    ],
    executar: async (e, c) => compararDfdCenti(so(e), { tolerancia: numeroDe(c.tolerancia) ?? 0.01, objeto: c.objeto !== false }),
  },

  // ——— Fluxos: reutilizar um fluxo salvo dentro deste
  {
    tipo: "fluxo.executar",
    categoria: "fluxo",
    rotulo: "Executar fluxo",
    descricao:
      "Roda outro fluxo salvo como um componente: para CADA item (em paralelo, com retomada de onde parou) ou uma vez com todos. O que ele devolve segue adiante.",
    icone: "fluxo",
    entradas: ["entrada"],
    saidas: ["saida", "falhas"],
    rotulosPortas: { saida: "Concluídos", falhas: "Falhas" },
    campos: [
      { chave: "fluxoId", rotulo: "Fluxo", tipo: "fluxo", obrigatorio: true },
      {
        chave: "modo",
        rotulo: "Como executar",
        tipo: "selecao",
        opcoes: [
          { valor: "porItem", rotulo: "Uma vez para cada item" },
          { valor: "lote", rotulo: "Uma vez com todos os itens" },
        ],
        padrao: "porItem",
      },
      { chave: "paralelo", rotulo: "Execuções ao mesmo tempo", tipo: "numero", entrada: true, padrao: 3, ajuda: "1 a 6.", quando: { campo: "modo", valores: ["porItem"] } },
      { chave: "retomar", rotulo: "Retomar de onde parou", tipo: "booleano", entrada: true, padrao: true, ajuda: "Pula os itens já concluídos numa execução interrompida.", quando: { campo: "modo", valores: ["porItem"] } },
      { chave: "chave", rotulo: "Campo que identifica o item", tipo: "caminho", padrao: "id", quando: { campo: "modo", valores: ["porItem"] } },
      { chave: "limite", rotulo: "Máximo de itens", tipo: "numero", padrao: 20000, quando: { campo: "modo", valores: ["porItem"] } },
    ],
    rodaSemItens: false,
    executar: async (e, c, ctx) => {
      const id = Number(c.fluxoId);
      const filho = await subfluxo(id, ctx);
      const itens = so(e);
      if (str(c.modo, "porItem") === "lote") {
        const r = await rodarFilho(filho, itens, ctx);
        if (r.estado !== "concluido") throw new Error(`${filho.nome}: ${r.erro ?? r.estado}`);
        return { saida: r.retorno, falhas: [], [PORTA_APONTADOS]: comOrigem(r.apontados, filho.nome) };
      }
      const max = Math.min(20000, Math.max(1, numeroDe(c.limite) ?? 20000));
      const lista = itens.slice(0, max);
      const campo = str(c.chave, "id") || "id";
      const prog = c.retomar !== false ? (ctx.host.progresso as ProgressoHost | undefined) : undefined;
      const noProg = [...pilhaDe(ctx), str(ctx.no)].join("/");
      const feitos = prog ? new Set(await prog.ler(noProg)) : new Set<string>();
      const fila = lista.filter((it) => !feitos.has(chaveDoItem(it, campo)));
      const pulados = lista.length - fila.length;
      const saida: Item[] = [];
      const falhas: Item[] = [];
      const apontados: Item[] = [];
      const gravar: { chave: string; estado: "ok" | "falha" }[] = [];
      const descarregar = async () => {
        if (!prog || !gravar.length) return;
        await prog.gravar(noProg, gravar.splice(0)).catch(() => undefined);
      };
      let feitosAgora = 0;
      let emCurso = 0;
      const avisar = () =>
        ctx.aviso(`${filho.nome}: ${feitosAgora} de ${fila.length}${emCurso ? ` · ${emCurso} em andamento` : ""}${pulados ? ` · ${pulados} já feitos antes` : ""}`);
      avisar();
      try {
        await executarEmPool(
          fila,
          numeroDe(c.paralelo) ?? 3,
          async (it) => {
            emCurso++;
            avisar();
            try {
              const r = await rodarFilho(filho, [it], ctx);
              if (r.estado === "cancelado") return;
              const erroTxt = r.estado === "falhou" ? (r.erro ?? "falhou") : "";
              // A Centi recusou a operação / o lote foi encerrado: os demais falhariam igual — para tudo.
              if (erroTxt && /interrompido|lote foi encerrado|recusou o Emitir DFD/i.test(erroTxt)) throw new Error(`${filho.nome}: ${erroTxt}`);
              apontados.push(...comOrigem(r.apontados, filho.nome));
              const k = chaveDoItem(it, campo);
              if (erroTxt) {
                const f = { ...it, subfluxo: { estado: "falhou", erro: erroTxt } };
                falhas.push(f);
                apontados.push({ mensagem: `${filho.nome}${k ? ` (${k})` : ""}: ${erroTxt}`, nivel: "erro", item: it });
                if (k) gravar.push({ chave: k, estado: "falha" });
                ctx.parcial?.([f]);
              } else {
                const volta = r.retorno.length ? r.retorno.map((x) => ({ ...x, subfluxo: { estado: "concluido" } })) : [{ ...it, subfluxo: { estado: "concluido" } }];
                saida.push(...volta);
                if (k) gravar.push({ chave: k, estado: "ok" });
                ctx.parcial?.(volta);
              }
              feitosAgora++;
              await descarregar(); // cada DFD já gravado: parar não perde nada
            } finally {
              emCurso--;
              avisar();
            }
          },
          ctx.cancelado,
        );
      } finally {
        await descarregar();
      }
      // Tudo concluído sem falha: a próxima execução recomeça do zero.
      if (prog && !ctx.cancelado() && !falhas.length && fila.length + pulados === lista.length) await prog.limpar(noProg).catch(() => undefined);
      return { saida, falhas, [PORTA_APONTADOS]: apontados };
    },
  },
  {
    tipo: "fluxo.paralelo",
    categoria: "fluxo",
    rotulo: "Executar vários fluxos",
    descricao: "Roda vários fluxos salvos AO MESMO TEMPO com os mesmos itens; cada um devolve um resultado.",
    icone: "layers",
    entradas: ["entrada"],
    saidas: ["saida", "falhas"],
    rotulosPortas: { saida: "Concluídos", falhas: "Falhas" },
    campos: [{ chave: "fluxoIds", rotulo: "Fluxos", tipo: "fluxos", obrigatorio: true, ajuda: "Até 6, todos ao mesmo tempo." }],
    rodaSemItens: true,
    executar: async (e, c, ctx) => {
      const ids = [...new Set(str(c.fluxoIds).split(/[;,\s]+/).map(Number).filter((n) => Number.isInteger(n) && n > 0))].slice(0, 6);
      if (!ids.length) throw new Error("Escolha os fluxos.");
      const itens = so(e).length ? so(e) : [{ iniciadoEm: new Date().toISOString() }];
      const res = await Promise.allSettled(
        ids.map(async (id) => {
          const f = await subfluxo(id, ctx);
          ctx.aviso(`Rodando ${ids.length} fluxo(s) ao mesmo tempo…`);
          return { f, r: await rodarFilho(f, itens, ctx) };
        }),
      );
      const saida: Item[] = [];
      const falhas: Item[] = [];
      const apontados: Item[] = [];
      for (const [i, x] of res.entries()) {
        if (x.status === "rejected") {
          const msg = x.reason instanceof Error ? x.reason.message : String(x.reason);
          falhas.push({ fluxoId: ids[i], erro: msg });
          apontados.push({ mensagem: msg, nivel: "erro", item: { fluxoId: ids[i] } });
          continue;
        }
        const { f, r } = x.value;
        apontados.push(...comOrigem(r.apontados, f.nome));
        const linha = { fluxoId: f.id, fluxo: f.nome, estado: r.estado, erro: r.erro ?? "", itens: r.retorno.length, retorno: r.retorno };
        if (r.estado === "concluido") saida.push(linha);
        else {
          falhas.push(linha);
          apontados.push({ mensagem: `${f.nome}: ${r.erro ?? r.estado}`, nivel: "erro", item: linha });
        }
        ctx.parcial?.([linha]);
      }
      return { saida, falhas, [PORTA_APONTADOS]: apontados };
    },
  },

  // ——— Erros
  {
    tipo: "erros.apontar",
    categoria: "erros",
    rotulo: "Apontar erros",
    descricao: "Marca como ERRO os itens que passam na condição (ou todos) — vão ao relatório da execução.",
    icone: "alert",
    entradas: ["entrada"],
    saidas: ["saida"],
    campos: [
      { chave: "todos", rotulo: "Todos os itens que chegam são erros", tipo: "booleano", padrao: true },
      ...CAMPO_CONDICAO.map((x) => ({ ...x, obrigatorio: false, quando: x.quando ?? { campo: "todos", valores: ["false"] } })),
      { chave: "mensagem", rotulo: "Mensagem", tipo: "texto", obrigatorio: true, aceitaCampo: "inserir", ajuda: "O texto do apontamento. Use “Inserir campo” para pôr um dado do item (ex.: DFD {{numero}})." },
      { chave: "nivel", rotulo: "Nível", tipo: "selecao", opcoes: [{ valor: "erro", rotulo: "Erro" }, { valor: "atencao", rotulo: "Atenção" }], padrao: "erro" },
    ],
    executar: async (e, c) => {
      const todos = c.todos !== false;
      const err = so(e)
        .filter((it) => todos || passa(it, c))
        .map((it) => ({ mensagem: interpolar(str(c.mensagem), it), nivel: str(c.nivel, "erro"), item: it }));
      return { saida: err, __apontados: err };
    },
  },

  // ——— Saída
  {
    tipo: "saida.substituirDfd",
    categoria: "saida",
    rotulo: "Substituir DFD pela Centi",
    descricao:
      "Substitui os dados de cada DFD gravado (id) pelos do DFD lido na Centi (“Buscar DFD na Centi” com “Guardar o DFD inteiro”) — a mesma sobrescrita do banner, com o histórico.",
    icone: "save",
    entradas: ["entrada"],
    saidas: ["substituidos", "erros"],
    campos: [],
    executar: async (e, _c, ctx) => {
      const subst = ctx.host.substituirDfd as ((id: number, dfd: Item) => Promise<{ numero: string; itens: number }>) | undefined;
      if (!subst) throw new Error("A substituição do DFD só funciona na tela da Automação.");
      const ok: Item[] = [];
      const erros: Item[] = [];
      const itens = so(e);
      for (const [i, it] of itens.entries()) {
        if (ctx.cancelado()) break;
        const dfd = (it.centi as Item | null | undefined)?.dfd as Item | undefined;
        const id = Number(it.id);
        if (!(id > 0) || !dfd) {
          erros.push({ ...it, erro: !dfd ? str(it.centiErro) || "Sem o DFD lido na Centi (ligue “Guardar o DFD inteiro”)." : "Item sem o id do DFD." });
          continue;
        }
        ctx.aviso(`Substituindo o DFD ${str(it.numero)} (${i + 1} de ${itens.length})…`);
        // O DFD inteiro não segue adiante (pesado): fica só o resumo da Centi.
        const leve = { ...it, centi: { ...(it.centi as Item), dfd: undefined } };
        let feito: Item;
        try {
          const r = await subst(id, dfd);
          feito = { ...leve, substituido: true, itensGravados: r.itens };
          ok.push(feito);
        } catch (x) {
          const msg = x instanceof Error ? x.message : String(x);
          if (/interrompido/i.test(msg)) throw x;
          feito = { ...leve, erro: msg };
          erros.push(feito);
        }
        ctx.parcial?.([feito]);
      }
      return { substituidos: ok, erros };
    },
  },
  {
    tipo: "saida.gravarExecucao",
    categoria: "saida",
    rotulo: "Gravar execução nos DFDs",
    descricao: "Grava a situação da CM002 (itens do nó CM002) nos DFDs do sistema, por órgão.",
    icone: "save",
    entradas: ["entrada"],
    saidas: ["saida"],
    campos: [
      {
        chave: "campoSituacao",
        rotulo: "Campo da situação",
        tipo: "caminho",
        padrao: "centi.situacao",
        ajuda: "Onde está a situação em cada DFD que chega. Ex.: encontrado.situacao (a linha achada na CM002).",
      },
      {
        chave: "situacaoFixa",
        rotulo: "Texto fixo",
        tipo: "texto",
        ajuda: "Grava este texto em todos os DFDs que chegam (ex.: Não encontrado na CM002). Vazio = o campo da situação.",
      },
    ],
    executar: async (e, c, ctx) => {
      // Cada item JÁ é o DFD (id) com a situação lida (do "Buscar DFD na Centi" ou da linha achada na CM002) — grava direto.
      const campo = str(c.campoSituacao, "centi.situacao") || "centi.situacao";
      const fixa = str(c.situacaoFixa).trim();
      const situacao = (it: Item) => fixa || str(resolverCaminho(it, campo)).trim();
      const lidos = so(e).filter((it) => situacao(it) && Number(it.id) > 0);
      if (lidos.length) {
        const out: Item[] = [];
        for (let i = 0; i < lidos.length; i += 5000) {
          const f = lidos.slice(i, i + 5000);
          const g = await ctx.api("/api/admin/automacao/execucao-dfds", {
            method: "POST",
            body: {
              colunas: ["ID", "SITUACAO"],
              linhas: f.map((p) => ({ valores: [str(p.planejamento), situacao(p)] })),
              dfdIds: f.map((p) => Number(p.id)),
            },
          });
          if (!g.ok) throw new Error(g.error || "Falhou ao gravar a execução.");
          out.push({ lidos: g.lidos, atualizados: g.atualizados });
          ctx.aviso(`Gravados ${Math.min(i + 5000, lidos.length)} de ${lidos.length}…`);
        }
        return { saida: out };
      }
      const r = await ctx.api("/api/admin/automacao/execucao-dfds");
      if (!r.ok || !Array.isArray(r.dfds)) throw new Error(r.error || "Não consegui ler os DFDs.");
      const mapa = (ctx.host.mapaEntidades ?? {}) as Record<string, string>;
      const chave = ctx.host.chaveOrgao as ((id: number | null, ent: string | null) => string | null) | undefined;
      const porEnt = new Map<string, Item[]>();
      for (const it of so(e)) {
        const ent = str(it.entidade);
        if (ent) porEnt.set(ent, [...(porEnt.get(ent) ?? []), it]);
      }
      const out: Item[] = [];
      for (const [ent, its] of porEnt) {
        const dfdIds = r.dfds
          .map(obj)
          .filter((d) => {
            const k = chave?.((d.orgaoId as number | null) ?? null, (d.orgaoEntidade as string | null) ?? null);
            return k && mapa[k]?.replace(/^0+(?=\d)/, "") === ent;
          })
          .map((d) => d.id as number);
        if (!dfdIds.length) {
          out.push({ entidade: ent, atualizados: 0, aviso: "Nenhum DFD do sistema neste órgão." });
          continue;
        }
        const g = await ctx.api("/api/admin/automacao/execucao-dfds", {
          method: "POST",
          body: { colunas: ["ID", "SITUACAO"], linhas: its.map((p) => ({ valores: [str(p.id ?? p.planejamento), str(p.situacao)] })), dfdIds },
        });
        if (!g.ok) throw new Error(`Órgão ${ent}: ${g.error || "falhou ao gravar"}`);
        out.push({ entidade: ent, lidos: g.lidos, atualizados: g.atualizados });
      }
      return { saida: out };
    },
  },
  {
    tipo: "saida.importarProtocolo",
    categoria: "saida",
    rotulo: "Importar protocolo na Mesa",
    descricao:
      "Importa cada protocolo LIDO na Mesa (como a importação manual), com os apontamentos na observação. Não importa o que já está no sistema nem o protocolo com DFD em erro.",
    icone: "save",
    entradas: ["entrada", "apontamentos"],
    saidas: ["importados", "naoImportados"],
    rotulosPortas: { apontamentos: "Apontamentos", importados: "Importados", naoImportados: "Não importados" },
    campos: [{ chave: "limite", rotulo: "Máximo de protocolos", tipo: "numero", padrao: 50, ajuda: "Proteção — até 500." }],
    executar: async (e, c, ctx) => {
      const imp = ctx.host.importarProtocolo as ((it: Item, apontamentos: string[]) => Promise<Item>) | undefined;
      if (!imp) throw new Error("A importação só funciona na tela da Automação.");
      const max = Math.min(500, Math.max(1, numeroDe(c.limite) ?? 50));
      const porProto = apontamentosPorProtocolo(so(e, "apontamentos"));
      const out: Portas = { importados: [], naoImportados: [] };
      for (const [i, it] of so(e).slice(0, max).entries()) {
        if (ctx.cancelado()) break;
        if (str(it.leitura) === "falha") {
          out.naoImportados.push({ ...it, motivo: str(it.leituraTexto, "Leitura do PDF falhou.") });
          continue;
        }
        ctx.aviso(`Importando o protocolo ${str(it.protocolo)} (${i + 1})…`);
        const ap = porProto.get(chaveProto(it)) ?? [];
        const r = obj(await imp(it, ap));
        const linha = { protocolo: it.protocolo, ano: it.ano, id: it.id, apontamentos: ap.length, ...r, erros: Array.isArray(r.erros) ? r.erros.join(" | ") : r.erros };
        (r.importado === true ? out.importados : out.naoImportados).push(linha);
      }
      (ctx.host.relatorio as ((l: Item[]) => void) | undefined)?.([
        ...out.importados.map((x) => ({ ...x, status: "importado" })),
        ...out.naoImportados.map((x) => ({ ...x, status: "nao-importado" })),
      ]);
      return out;
    },
  },
  {
    tipo: "saida.dfdsCenti",
    categoria: "saida",
    rotulo: "Baixar/anexar DFDs",
    descricao:
      "Emite cada DFD na Centi (por API, no órgão de cada um, conferido) e leva o PDF ao destino: pasta (Downloads, a escolhida ou .zip), o protocolo da Centi indicado ou o de cada DFD (anexo com autorização). Entrada: protocolos do sistema ou nºs de planejamento.",
    icone: "save",
    entradas: ["entrada"],
    saidas: ["saida"],
    campos: [
      {
        chave: "destino",
        rotulo: "Destino",
        tipo: "selecao",
        entrada: true,
        opcoes: [
          { valor: "pasta", rotulo: "Pasta" },
          { valor: "protocolo", rotulo: "Protocolo indicado (Centi)" },
          { valor: "proprio", rotulo: "Protocolo de cada DFD (Centi)" },
        ],
        padrao: "pasta",
      },
      { chave: "alvoId", rotulo: "Id do protocolo (Centi)", tipo: "texto", entrada: true, obrigatorio: true, quando: { campo: "destino", valores: ["protocolo"] } },
      { chave: "alvoNumero", rotulo: "Nº do protocolo", tipo: "texto", entrada: true, obrigatorio: true, ajuda: "Ex.: 156844/2026", quando: { campo: "destino", valores: ["protocolo"] } },
      { chave: "tipoDocumento", rotulo: "Tipo do documento", tipo: "texto", entrada: true, padrao: TIPO_DOCUMENTO_DFD, quando: { campo: "destino", valores: ["protocolo", "proprio"] } },
      {
        chave: "formato",
        rotulo: "PDFs",
        tipo: "selecao",
        entrada: true,
        opcoes: [
          { valor: "separados", rotulo: "Separados" },
          { valor: "protocolo", rotulo: "Um por protocolo" },
          { valor: "unidade", rotulo: "Um por unidade" },
          { valor: "unico", rotulo: "Um único" },
        ],
        padrao: "separados",
      },
      { chave: "pastaPca", rotulo: "Pasta “PCA ano”", tipo: "booleano", entrada: true, padrao: true, quando: { campo: "destino", valores: ["pasta"] } },
      { chave: "escolherPasta", rotulo: "Escolher a pasta de destino", tipo: "booleano", entrada: true, padrao: false, quando: { campo: "destino", valores: ["pasta"] } },
      { chave: "ordenarPlanejamento", rotulo: "Ordenar pelo planejamento", tipo: "booleano", entrada: true, padrao: true },
      { chave: "conferir", rotulo: "Conferir o conteúdo de cada PDF", tipo: "booleano", entrada: true, padrao: true },
    ],
    executar: async (e, c, ctx) => {
      const baixar = ctx.host.baixarDfds as ((itens: Item[], config: Record<string, unknown>) => Promise<{ linhas: Item[]; erro?: string }>) | undefined;
      if (!baixar) throw new Error("Baixar/anexar DFDs só funciona na tela da Automação.");
      if (!so(e).length) throw new Error("Nada a baixar — marque os protocolos (ou informe os nºs de planejamento).");
      const r = await baixar(so(e), c);
      if (r.erro) throw new Error(r.erro);
      const falhas = r.linhas.filter((l) => l.estado === "falha");
      return {
        saida: r.linhas,
        __apontados: falhas.map((l) => ({ mensagem: `Planej. ${str(l.id) || "—"}${l.dfd ? ` · DFD ${str(l.dfd)}` : ""}: ${str(l.erro, "falhou")}`, nivel: "erro", item: { ...l, planejamento: l.id, numero: l.dfd } })),
      };
    },
  },
  {
    tipo: "saida.marcarConferencia",
    categoria: "saida",
    rotulo: "Marcar DFDs × Centi",
    descricao: "Marca cada DFD do sistema como DIVERGENTE (com o motivo) ou CONVERGENTE em relação à CM002 — a coluna “Centi” da Mesa.",
    icone: "save",
    entradas: ["divergentes", "conformes"],
    saidas: ["saida"],
    rotulosPortas: { divergentes: "Divergentes", conformes: "Convergentes" },
    campos: [],
    rodaSemItens: true,
    executar: async (e, _c, ctx) => {
      const itens = marcacoesConferencia(so(e, "divergentes"), so(e, "conformes"));
      if (!itens.length) return { saida: [] };
      const out: Item[] = [];
      for (let i = 0; i < itens.length; i += 2000) {
        if (ctx.cancelado()) break;
        ctx.aviso(`Marcando os DFDs (${Math.min(i + 2000, itens.length)} de ${itens.length})…`);
        const r = await ctx.api("/api/admin/automacao/conferencia-dfds", { method: "POST", body: { itens: itens.slice(i, i + 2000) } });
        if (!r.ok) throw new Error(r.error || "Não consegui marcar os DFDs.");
        out.push({ marcados: r.marcados, convergentes: r.convergentes, divergentes: r.divergentes });
      }
      return { saida: out };
    },
  },
  {
    tipo: "saida.gravarColuna",
    categoria: "saida",
    rotulo: "Gravar na coluna da Mesa",
    descricao:
      "Grava o valor de cada item numa COLUNA da Mesa (protocolos, DFDs ou itens) — a cadastrada com esse nome ou uma nova, criada sozinha. O registro é achado pelo id do item.",
    icone: "columns",
    entradas: ["entrada"],
    saidas: ["saida", "ignorados"],
    rotulosPortas: { saida: "Gravados", ignorados: "Sem id/valor" },
    campos: [
      {
        chave: "entidade",
        rotulo: "Tabela da Mesa",
        tipo: "selecao",
        padrao: "dfd",
        opcoes: ENTIDADES_COLUNA.map((x) => ({ valor: x, rotulo: ROTULO_ENTIDADE_COLUNA[x] })),
      },
      { chave: "coluna", rotulo: "Coluna", tipo: "texto", obrigatorio: true, entrada: true, ajuda: "O nome (a existente é usada; senão, criada). Ex.: Situação na Centi" },
      { chave: "campoValor", rotulo: "Campo do valor", tipo: "caminho", padrao: "valor", ajuda: "Ex.: valor (o da Regra) ou encontrado.situacao" },
      { chave: "campoId", rotulo: "Campo do id do registro", tipo: "caminho", padrao: "id", ajuda: "O id do protocolo, DFD ou item no sistema." },
      { chave: "apagar", rotulo: "Valor vazio apaga o da coluna", tipo: "booleano", padrao: false },
    ],
    executar: async (e, c, ctx) => {
      const entidade = (ENTIDADES_COLUNA as readonly string[]).includes(str(c.entidade)) ? (str(c.entidade) as EntidadeColuna) : "dfd";
      const nome = str(c.coluna).trim();
      if (!nome) throw new Error("Informe o nome da coluna.");
      const gravar: { alvoId: number; valor: string | null }[] = [];
      const saida: Item[] = [];
      const ignorados: Item[] = [];
      for (const it of so(e)) {
        const alvoId = Number(resolverCaminho(it, str(c.campoId, "id") || "id"));
        const valor = valorParaColuna(resolverCaminho(it, str(c.campoValor, "valor") || "valor"));
        if (!Number.isInteger(alvoId) || alvoId <= 0 || (valor == null && c.apagar !== true)) ignorados.push(it);
        else {
          gravar.push({ alvoId, valor });
          saida.push({ ...it, colunaGravada: nome });
        }
      }
      if (!gravar.length) return { saida, ignorados };
      const r = await ctx.api("/api/admin/automacao/colunas", { method: "POST", body: { entidade, nome } });
      const id = (r.coluna as { id?: number } | undefined)?.id;
      if (!r.ok || !id) throw new Error(r.error || "Não consegui criar/achar a coluna.");
      for (let i = 0; i < gravar.length; i += 500) {
        if (ctx.cancelado()) throw new Error("Interrompido.");
        ctx.aviso(`Gravando ${Math.min(i + 500, gravar.length)} de ${gravar.length}…`);
        const g = await ctx.api(`/api/admin/automacao/colunas/${id}`, { method: "POST", body: { valores: gravar.slice(i, i + 500) } });
        if (!g.ok) throw new Error(g.error || "Não consegui gravar os valores da coluna.");
      }
      if (ignorados.length) ctx.aviso(`${ignorados.length} item(ns) sem id ou valor — não gravados.`);
      return { saida, ignorados };
    },
  },
  {
    tipo: "saida.tabela",
    categoria: "saida",
    rotulo: "Salvar em tabela",
    descricao: "Guarda os itens que chegam numa TABELA com nome — para ver no painel e usar em outras automações (nó “Ler tabela salva”).",
    icone: "list",
    entradas: ["entrada"],
    saidas: ["saida"],
    campos: [
      { chave: "nome", rotulo: "Nome da tabela", tipo: "texto", obrigatorio: true, entrada: true, ajuda: "Ex.: CM002 sem DFD no sistema" },
      { chave: "colunas", rotulo: "Colunas a guardar", tipo: "textoLongo", ajuda: "Opcional — uma por linha: campo => nome. Vazio = todas." },
      {
        chave: "modo",
        rotulo: "Ao gravar",
        tipo: "selecao",
        padrao: "substituir",
        opcoes: [
          { valor: "substituir", rotulo: "Substituir as linhas" },
          { valor: "acrescentar", rotulo: "Acrescentar às linhas" },
        ],
      },
    ],
    rodaSemItens: true,
    executar: async (e, c, ctx) => {
      const nome = str(c.nome).trim();
      if (!nome) throw new Error("Informe o nome da tabela.");
      const colunas = lerColunas(str(c.colunas));
      const linhas = colunas.length ? escolherColunas(so(e), colunas, false) : so(e);
      const r = await ctx.api("/api/admin/automacao/tabelas", { method: "POST", body: { nome, modo: c.modo === "acrescentar" ? "acrescentar" : "substituir", linhas: linhas.slice(0, MAX_LINHAS_TABELA) } });
      if (!r.ok) throw new Error(r.error || "Não consegui gravar a tabela.");
      const cortadas = Number(r.cortadas) || 0;
      ctx.aviso(`Tabela “${nome}”: ${Number(r.total) || 0} linha(s)${cortadas ? ` — ${cortadas} não couberam` : ""}.`);
      return { saida: linhas };
    },
  },
  {
    tipo: "saida.retornar",
    categoria: "saida",
    rotulo: "Retornar ao fluxo pai",
    descricao: "O que este fluxo DEVOLVE quando usado dentro de outro (sem este nó, devolve o que os nós finais produziram).",
    icone: "check",
    entradas: ["entrada"],
    saidas: ["saida"],
    campos: [],
    rodaSemItens: true,
    executar: async (e) => ({ saida: so(e), [PORTA_RETORNO]: so(e) }),
  },
  {
    tipo: "saida.notificar",
    categoria: "saida",
    rotulo: "Avisar no sino",
    descricao: "Mostra um aviso ao terminar (com a quantidade de itens).",
    icone: "bell",
    entradas: ["entrada"],
    saidas: ["saida"],
    campos: [
      {
        chave: "mensagem",
        rotulo: "Mensagem",
        tipo: "texto",
        obrigatorio: true,
        aceitaCampo: "inserir",
        padrao: "{{quantidade}} item(ns) no fluxo",
        ajuda: "O texto do aviso. Use “Inserir campo” para pôr um dado (ex.: {{quantidade}} = quantos itens chegaram).",
      },
    ],
    rodaSemItens: true,
    executar: async (e, c, ctx) => {
      const n = so(e).length;
      const msg = interpolar(str(c.mensagem), { quantidade: n, ...(so(e)[0] ?? {}) });
      (ctx.host.avisar as ((t: string) => void) | undefined)?.(msg);
      return { saida: so(e) };
    },
  },
];

// ———————————————————————————————————————————————— subfluxos (apoio)

/** O fluxo salvo usado como componente. */
export type FluxoFilho = { id: number; nome: string; grafo: Grafo };
/** A retomada (o host grava no servidor por fluxo de topo + caminho do nó). */
export type ProgressoHost = {
  ler: (no: string) => Promise<string[]>;
  gravar: (no: string, itens: { chave: string; estado: "ok" | "falha" }[]) => Promise<void>;
  limpar: (no: string) => Promise<void>;
};
const pilhaDe = (ctx: { host: Record<string, unknown> }) => (Array.isArray(ctx.host.__pilha) ? (ctx.host.__pilha as number[]) : []);

async function subfluxo(id: number, ctx: { host: Record<string, unknown> }): Promise<FluxoFilho> {
  if (!Number.isInteger(id) || id <= 0) throw new Error("Escolha o fluxo.");
  const pilha = pilhaDe(ctx);
  if (pilha.includes(id)) throw new Error("Um fluxo não pode usar a si mesmo (direta ou indiretamente).");
  if (pilha.length >= PROFUNDIDADE_MAX) throw new Error(`Fluxos dentro de fluxos: no máximo ${PROFUNDIDADE_MAX} níveis.`);
  const carregar = ctx.host.carregarFluxo as ((id: number) => Promise<FluxoFilho>) | undefined;
  if (!carregar) throw new Error("Executar outro fluxo só funciona na tela da Automação.");
  return carregar(id);
}

async function rodarFilho(f: FluxoFilho, itens: Item[], ctx: Parameters<DefNo["executar"]>[2]): Promise<ResultadoExec> {
  const grafo = itens.length === 1 ? grafoComEntrada(f.grafo, REGISTRO_NOS, itens[0]) : f.grafo;
  // O filho roda com o MESMO host (extensão, cache, carregar) — sem os ganchos do painel do pai.
  return executarFluxo(grafo, REGISTRO_NOS, {
    centi: ctx.centi,
    api: ctx.api,
    cancelado: ctx.cancelado,
    host: { ...ctx.host, __entrada: itens, __pilha: [...pilhaDe(ctx), f.id] },
  });
}
const comOrigem = (aps: Item[], nome: string) => aps.map((a) => ({ ...a, subfluxo: nome }));

export const REGISTRO_NOS: Registro = new Map(NOS.map((n) => [n.tipo, n]));
export const NOS_POR_CATEGORIA = CATEGORIAS.map((c) => ({ ...c, nos: NOS.filter((n) => n.categoria === c.valor && !n.legado) }));

/** Os protocolos do sistema (um item por protocolo, ou por DFD). */
/** As fontes do "Ler do sistema" — cada uma lida UMA vez por execução (o cache do host vale para os subfluxos). */
async function fontesDoSistema(ctx: ContextoNo, objeto: ObjetoLeitura): Promise<FontesSistema> {
  const cache = ctx.host.__cache as Map<string, unknown> | undefined;
  const uma = async (k: string, ler: () => Promise<Item[]>) => {
    let p = cache?.get(k) as Promise<Item[]> | undefined;
    if (!p) {
      p = ler();
      cache?.set(k, p);
    }
    return p.catch((x) => {
      cache?.delete(k);
      throw x;
    });
  };
  const protocolos = protocolosDoSistema({}, ctx.host);
  const dfds = objeto === "dfds" ? await uma("dfds", async () => (await (REGISTRO_NOS.get("sistema.dfds") as DefNo).executar({ entrada: [{}] }, {}, ctx, {})).saida ?? []) : [];
  const itens =
    objeto === "itens"
      ? await uma("itens", async () => {
          const r = await ctx.api("/api/admin/automacao/itens-sistema");
          if (!r.ok || !Array.isArray(r.itens)) throw new Error(r.error || "Não consegui ler os itens do sistema.");
          return r.itens.map(obj);
        })
      : [];
  return { protocolos, dfds, itens };
}

function protocolosDoSistema(c: Record<string, unknown>, host: Record<string, unknown>): Item[] {
  const ps = (host.protocolos ?? []) as Item[];
  if (c.dfds !== true) return ps.map((p) => ({ ...p, totalDfds: Array.isArray(p.dfds) ? p.dfds.length : 0 }));
  return ps.flatMap((p) => (Array.isArray(p.dfds) ? p.dfds : []).map((d) => ({ ...obj(d), protocolo: p.numero, protocoloId: p.id, idExterno: p.idExterno, sigla: p.sigla })));
}

/** A chave de um item no "Selecionar itens" (o campo escolhido, como texto). */
export const chaveSelecao = (it: Item, campo: unknown) => str(resolverCaminho(it, str(campo, "id") || "id"));
/** Os itens MARCADOS no painel (`config.marcados`); sem marcação, todos ou nenhum. */
export function selecionados(itens: Item[], c: Record<string, unknown>): Item[] {
  const m = new Set((Array.isArray(c.marcados) ? c.marcados : []).map((x) => str(x)));
  if (!m.size) return c.semMarcar === "todos" ? itens : [];
  return itens.filter((it) => m.has(chaveSelecao(it, c.chave)));
}

const chaveProto = (it: Item) => `${str(it.protocolo ?? it.numero).split("/")[0].trim()}/${str(it.ano).trim()}`;

/** Um item por elemento da lista do campo, com o protocolo/ano/Id do pai (o elemento vence em conflito de nome). */
export function desdobrar(itens: Item[], campo: string): Item[] {
  return itens.flatMap((p) => {
    const l = resolverCaminho(p, campo);
    return (Array.isArray(l) ? l : []).map((x) => ({ protocolo: p.protocolo, ano: p.ano, id: p.id, ...obj(x) }));
  });
}

/** As mensagens dos itens apontados, por protocolo (o item apontado leva protocolo + ano — o do Desdobrar). */
export function apontamentosPorProtocolo(apontados: Item[]): Map<string, string[]> {
  const m = new Map<string, string[]>();
  for (const a of apontados) {
    const it = obj(a.item ?? a);
    const k = chaveProto(it);
    const msg = str(a.mensagem).trim();
    if (!msg) continue;
    const l = m.get(k) ?? [];
    if (!l.includes(msg)) l.push(msg);
    m.set(k, l);
  }
  return m;
}

/** Os protocolos que chegam × os do sistema: a MESMA régua da coluna "No sistema" (o Id da capa decide; senão nº + ano). */
export function separarCadastrados(itens: Item[], sistema: Item[]): { novos: Item[]; cadastrados: Item[] } {
  const casa = noSistemaTela(sistema.map((p) => ({ numero: str(p.numero), idExterno: p.idExterno == null ? null : str(p.idExterno) })));
  const out = { novos: [] as Item[], cadastrados: [] as Item[] };
  for (const it of itens) (casa({ protocolo: str(it.protocolo ?? it.numero).split("/")[0], ano: str(it.ano), id: str(it.id) }) ? out.cadastrados : out.novos).push(it);
  return out;
}

const brl = (n: number) => n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const tipoCurto = (t: unknown) => (/DFD-?\s*([SROE])\b/i.exec(str(t))?.[1] ?? normTexto(t).slice(0, 1)).toUpperCase();

/** O DFD do sistema × o lido na Centi (`centi`): um item DIVERGENTE por diferença (com a `mensagem`). Pura. */
export function compararDfdCenti(itens: Item[], o: { tolerancia: number; objeto: boolean }): { divergentes: Item[]; conformes: Item[] } {
  const out = { divergentes: [] as Item[], conformes: [] as Item[] };
  for (const d of itens) {
    const ref = `DFD ${str(d.numero)} (Planej. ${str(d.planejamento)})`;
    const x = d.centi && typeof d.centi === "object" ? (d.centi as Item) : null;
    const msgs: string[] = [];
    if (!x && d.centiFalha) {
      // Falha de comunicação: aponta, mas NÃO marca o DFD (não foi conferido).
      out.divergentes.push({ ...d, naoMarcar: true, mensagem: `${ref}: não conferido — ${str(d.centiErro)}` });
      continue;
    }
    if (!x) msgs.push(`${ref}: não encontrado na Centi${d.centiErro ? ` — ${str(d.centiErro)}` : ""}`);
    else {
      if (/CANCEL/.test(normTexto(x.situacao))) msgs.push(`${ref}: situação ${str(x.situacao)} na Centi`);
      if (str(x.numero) && str(x.numero).replace(/^0+/, "") !== str(d.numero).replace(/^0+/, "")) msgs.push(`${ref}: na Centi é o DFD ${str(x.numero)}`);
      if (str(d.tipo) && str(x.tipo) && tipoCurto(d.tipo) !== tipoCurto(x.tipo)) msgs.push(`${ref}: tipo ${str(d.tipo)} no sistema × ${str(x.tipo)} na Centi`);
      const vs = numeroDe(d.valor);
      const vc = numeroDe(x.valor);
      if (vs != null && vc != null && Math.abs(vs - vc) > o.tolerancia) msgs.push(`${ref}: valor R$ ${brl(vs)} no sistema × R$ ${brl(vc)} na Centi`);
      const is = numeroDe(d.totalItens ?? d.itens);
      const ic = numeroDe(x.totalItens);
      if (is != null && ic != null && is !== ic) msgs.push(`${ref}: ${is} item(ns) no sistema × ${ic} na Centi`);
      if (o.objeto && str(d.objeto) && str(x.objeto) && normTexto(d.objeto).replace(/[^A-Z0-9]/g, "") !== normTexto(x.objeto).replace(/[^A-Z0-9]/g, ""))
        msgs.push(`${ref}: objeto diferente da Centi`);
    }
    // UM item por DFD (as mensagens juntas): a análise ao vivo e o apontamento não repetem o DFD.
    if (msgs.length) out.divergentes.push({ ...d, mensagem: msgs.join("; ") });
    else out.conformes.push(d);
  }
  return out;
}

/** Um status por DFD (pelo id do sistema): divergente vence; o motivo = as mensagens únicas, unidas por "; ". */
export function marcacoesConferencia(divergentes: Item[], conformes: Item[]): { dfdId: number; status: "convergente" | "divergente"; motivo?: string }[] {
  const m = new Map<number, { dfdId: number; status: "convergente" | "divergente"; msgs: string[] }>();
  const idDe = (it: Item) => {
    const n = Number(it.dfdId ?? it.id);
    return Number.isInteger(n) && n > 0 ? n : null;
  };
  for (const it of divergentes) {
    if (it.naoMarcar === true) continue;
    const id = idDe(it);
    if (id == null) continue;
    const x = m.get(id) ?? { dfdId: id, status: "divergente" as const, msgs: [] };
    x.status = "divergente";
    const msg = str(it.mensagem).trim();
    if (msg && !x.msgs.includes(msg)) x.msgs.push(msg);
    m.set(id, x);
  }
  for (const it of conformes) {
    const id = idDe(it);
    if (id != null && !m.has(id)) m.set(id, { dfdId: id, status: "convergente", msgs: [] });
  }
  return [...m.values()].map((x) => (x.status === "divergente" ? { dfdId: x.dfdId, status: x.status, motivo: x.msgs.join("; ").slice(0, 2000) } : { dfdId: x.dfdId, status: x.status }));
}

export type OpcoesCm002 = { proibidas: string[]; esperada: string[]; campoValor: string; tolerancia: number; entidade: ((d: Item) => string) | null };

/** A conferência DFD × CM002 (pura): cada DFD divergente sai com a `mensagem` (um item por problema). */
export function conferirCm002(dfds: Item[], cm: Item[], o: OpcoesCm002): { divergentes: Item[]; conformes: Item[] } {
  const porPlan = new Map<string, Item[]>();
  for (const l of cm) {
    const k = str(l.planejamento ?? l.id).trim();
    if (k) porPlan.set(k, [...(porPlan.get(k) ?? []), l]);
  }
  const out = { divergentes: [] as Item[], conformes: [] as Item[] };
  for (const d of dfds) {
    const ref = `DFD ${str(d.numero)} (Planej. ${str(d.planejamento)})`;
    const linhas = porPlan.get(str(d.planejamento).trim()) ?? [];
    const msgs: string[] = [];
    const entD = o.entidade?.(d) ?? "";
    const b = (entD && linhas.find((l) => str(l.entidade) === entD)) || linhas[0];
    if (!b) msgs.push(`${ref} não está na CM002`);
    else {
      const sit = str(b.situacao);
      const ns = normTexto(sit);
      if (o.proibidas.some((p) => ns.includes(normTexto(p)))) msgs.push(`${ref}: situação ${sit} na CM002`);
      else if (o.esperada.length && !o.esperada.some((p) => ns.includes(normTexto(p)))) msgs.push(`${ref}: situação ${sit} na CM002 (esperada ${o.esperada.join(" ou ")})`);
      const vb = o.campoValor ? numeroDe(resolverCaminho(b, o.campoValor)) : null;
      const vd = numeroDe(d.valor);
      if (vb != null && vd != null && Math.abs(vb - vd) > o.tolerancia)
        msgs.push(`${ref}: valor ${vd.toFixed(2).replace(".", ",")} no DFD × ${vb.toFixed(2).replace(".", ",")} na CM002`);
      if (entD && str(b.entidade) && str(b.entidade) !== entD) msgs.push(`${ref}: na CM002 está na entidade ${str(b.entidade)}, o órgão do DFD é da ${entD}`);
    }
    if (msgs.length) for (const mensagem of msgs) out.divergentes.push({ ...d, b, mensagem });
    else out.conformes.push({ ...d, b });
  }
  return out;
}

function normalizar(v: unknown): Item[] {
  return (Array.isArray(v) ? v : []).map(obj).map((p) => ({
    ...p,
    protocolo: str(p.protocolo ?? p.numero),
    ano: str(p.ano),
    id: str(p.id),
  }));
}
