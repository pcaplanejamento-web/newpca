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
  type DefNo,
  executarEmPool,
  executarFluxo,
  type Grafo,
  grafoComEntrada,
  interpolar,
  type Item,
  MAX_ITERACOES_LACO,
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
import { noSistemaTela } from "./automacao-tela-protocolo.ts";

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
    ajuda: "Texto fixo ou {{campo}} do próprio item.",
    quando: { campo: "operador", valores: OPERADORES.filter((o) => o.valor !== "vazio" && o.valor !== "nao_vazio").map((o) => o.valor) },
  },
];
const passa = (it: Item, c: Record<string, unknown>) =>
  comparar(resolverCaminho(it, str(c.campo)), str(c.operador, "igual"), interpolar(str(c.valor), it));

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
    descricao: "Uma TABELA no painel com os itens do componente anterior: marque os que seguem (busca, filtros, marcar todos).",
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
    executar: async (e, c) => ({ saida: selecionados(so(e), c) }),
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
    tipo: "centi.cm002",
    categoria: "centi",
    rotulo: "CM002 · planejamentos",
    descricao: "A lista INTEIRA da CM002 por entidade (ID = nº de planejamento, situação, finalidade). Pela API.",
    icone: "list",
    entradas: ["entrada"],
    saidas: ["saida"],
    campos: [{ chave: "entidades", rotulo: "Entidades", tipo: "texto", entrada: true, ajuda: "Ex.: 2; 3. Vazio = as cadastradas nos órgãos." }],
    executar: async (_e, c, ctx) => {
      const mapa = (ctx.host.mapaEntidades ?? {}) as Record<string, string>;
      const ents = [...new Set((lista(c.entidades).length ? lista(c.entidades) : Object.values(mapa)).map((x) => x.replace(/^0+(?=\d)/, "")))].filter(Boolean);
      if (!ents.length) throw new Error("Nenhuma entidade — informe no nó ou cadastre o ID da Centi nos órgãos.");
      const out: Item[] = [];
      for (const [i, ent] of ents.entries()) {
        if (ctx.cancelado()) break;
        ctx.aviso(`Entidade ${ent} (${i + 1} de ${ents.length})…`);
        const r = await ctx.centi("cm002", { entidade: ent }, 300_000);
        if (r.interrompido) throw new Error("Interrompido na extensão.");
        if (!r.ok) throw new Error(r.erro || "A extensão da Centi não respondeu.");
        for (const p of Array.isArray(r.linhas) ? r.linhas : []) out.push({ ...obj(p), planejamento: str(obj(p).id), entidade: ent });
      }
      return { saida: out };
    },
  },

  // ——— Sistema
  {
    tipo: "sistema.dfds",
    categoria: "sistema",
    rotulo: "DFDs do sistema",
    descricao: "Os DFDs com nº de planejamento (nº, planejamento, órgão, entidade da Centi e a execução gravada).",
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
      {
        chave: "falhaErro",
        rotulo: "Falha de comunicação para o fluxo",
        tipo: "booleano",
        padrao: false,
        ajuda: "Ligado (o fluxo de UM DFD): a falha vira erro — o fluxo pai a registra e a retomada tenta o DFD de novo. Desligado: só aponta “não conferido”.",
      },
    ],
    executar: async (e, c, ctx) => {
      const ler = ctx.host.lerDfdCenti as ((plan: string, entidade?: string, pdf?: boolean) => Promise<Item>) | undefined;
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
          out.push({ ...it, centi: await ler(str(it.planejamento), str(it.entidade) || undefined, c.pdf !== false) });
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
    executar: async (e, c, ctx, est): Promise<Portas> => {
      const tam = Math.min(1000, Math.max(1, numeroDe(c.tamanho) ?? 1));
      if (e.entrada) {
        est.fila = [...e.entrada];
        est.acumulado = [];
        est.voltas = 0;
      } else {
        (est.acumulado as Item[]).push(...(e[PORTA_VOLTA] ?? []));
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
    descricao: "Cada DFD (A) × a CM002 (B) pelo planejamento: fora da CM002, situação proibida/fora da esperada, valor e entidade divergentes.",
    icone: "compare",
    entradas: ["a", "b"],
    saidas: ["divergentes", "conformes"],
    rotulosPortas: { a: "DFDs", b: "CM002", divergentes: "Divergentes", conformes: "Conformes" },
    campos: [
      { chave: "proibidas", rotulo: "Situações que são erro", tipo: "texto", entrada: true, padrao: "CANCEL", ajuda: "Contém (várias por ;). Ex.: CANCEL" },
      { chave: "esperada", rotulo: "Situação esperada", tipo: "texto", entrada: true, ajuda: "Vazio = qualquer uma (menos as de erro). Várias por ;" },
      { chave: "campoValor", rotulo: "Campo do valor na CM002", tipo: "caminho", padrao: "valor", ajuda: "Vazio = não confere o valor." },
      { chave: "tolerancia", rotulo: "Tolerância do valor (R$)", tipo: "numero", entrada: true, padrao: 0.01 },
      { chave: "entidade", rotulo: "Conferir a entidade do órgão", tipo: "booleano", padrao: true },
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
      { chave: "mensagem", rotulo: "Mensagem", tipo: "texto", obrigatorio: true, ajuda: "Aceita {{campo}}. Ex.: DFD {{numero}} com situação {{b.situacao}}" },
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
    tipo: "saida.gravarExecucao",
    categoria: "saida",
    rotulo: "Gravar execução nos DFDs",
    descricao: "Grava a situação da CM002 (itens do nó CM002) nos DFDs do sistema, por entidade.",
    icone: "save",
    entradas: ["entrada"],
    saidas: ["saida"],
    campos: [],
    executar: async (e, _c, ctx) => {
      // Do "Buscar DFD na Centi": cada item JÁ é o DFD (id) com a situação lida — grava direto nesses DFDs.
      const lidos = so(e).filter((it) => it.centi && typeof it.centi === "object" && str((it.centi as Item).situacao) && Number(it.id) > 0);
      if (lidos.length) {
        const out: Item[] = [];
        for (let i = 0; i < lidos.length; i += 5000) {
          const f = lidos.slice(i, i + 5000);
          const g = await ctx.api("/api/admin/automacao/execucao-dfds", {
            method: "POST",
            body: {
              colunas: ["ID", "SITUACAO"],
              linhas: f.map((p) => ({ valores: [str(p.planejamento), str((p.centi as Item).situacao)] })),
              dfdIds: f.map((p) => Number(p.id)),
            },
          });
          if (!g.ok) throw new Error(g.error || "Falhou ao gravar a execução.");
          out.push({ lidos: g.lidos, atualizados: g.atualizados });
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
          out.push({ entidade: ent, atualizados: 0, aviso: "Nenhum DFD do sistema nesta entidade." });
          continue;
        }
        const g = await ctx.api("/api/admin/automacao/execucao-dfds", {
          method: "POST",
          body: { colunas: ["ID", "SITUACAO"], linhas: its.map((p) => ({ valores: [str(p.id ?? p.planejamento), str(p.situacao)] })), dfdIds },
        });
        if (!g.ok) throw new Error(`Entidade ${ent}: ${g.error || "falhou ao gravar"}`);
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
      "Emite cada DFD na Centi (por API, na entidade do órgão, conferido) e leva o PDF ao destino: pasta (Downloads, a escolhida ou .zip), o protocolo da Centi indicado ou o de cada DFD (anexo com autorização). Entrada: protocolos do sistema ou nºs de planejamento.",
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
    campos: [{ chave: "mensagem", rotulo: "Mensagem", tipo: "texto", obrigatorio: true, padrao: "{{quantidade}} item(ns) no fluxo" }],
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
export const NOS_POR_CATEGORIA = CATEGORIAS.map((c) => ({ ...c, nos: NOS.filter((n) => n.categoria === c.valor) }));

/** Os protocolos do sistema (um item por protocolo, ou por DFD). */
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
    if (msgs.length) for (const mensagem of msgs) out.divergentes.push({ ...d, mensagem });
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
