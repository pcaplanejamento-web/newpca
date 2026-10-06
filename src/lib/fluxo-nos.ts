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
  type ContextoNo,
  type DefNo,
  interpolar,
  type Item,
  MAX_ITERACOES_LACO,
  normTexto,
  numeroDe,
  OPERADORES,
  PORTA_VOLTA,
  type Portas,
  type Registro,
  resolverCaminho,
  TIPO_LACO,
} from "./fluxo-core.ts";

export const CATEGORIAS: { valor: CategoriaNo; rotulo: string; cor: string }[] = [
  { valor: "gatilho", rotulo: "Início", cor: "var(--serie-1)" },
  { valor: "centi", rotulo: "Busca na Centi", cor: "var(--serie-2)" },
  { valor: "sistema", rotulo: "Dados do sistema", cor: "var(--serie-3)" },
  { valor: "leitura", rotulo: "Leitura", cor: "var(--serie-4)" },
  { valor: "logica", rotulo: "Lógica", cor: "var(--serie-5)" },
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

async function pedirCenti(ctx: ContextoNo, acao: string, dados: unknown, ms: number) {
  const r = await ctx.centi(acao, dados, ms);
  if (r.interrompido) throw new Error("Interrompido na extensão.");
  if (!r.ok) throw new Error(r.erro || "A extensão da Centi não respondeu.");
  return r;
}

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
    executar: async () => ({ saida: [{ iniciadoEm: new Date().toISOString() }] }),
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
    campos: [{ chave: "filtro", rotulo: "Só as que contêm", tipo: "texto", ajuda: "Ex.: PCA (vazio = todas). Separe vários por ;" }],
    executar: async (_e, c, ctx) => {
      ctx.aviso("Lendo as repartições na Centi…");
      const r = await pedirCenti(ctx, "telaDepartamentos", null, 90_000);
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
        opcoes: [
          { valor: "", rotulo: "Em análise" },
          { valor: "ANALISADO", rotulo: "Analisado" },
          { valor: "*", rotulo: "Todas" },
          { valor: "outra", rotulo: "Outra (escrever)" },
        ],
        padrao: "",
      },
      { chave: "outra", rotulo: "Situação (texto)", tipo: "texto", obrigatorio: true, quando: { campo: "situacao", valores: ["outra"] } },
      {
        chave: "campoReparticao",
        rotulo: "Repartições vindas do item (campo)",
        tipo: "caminho",
        ajuda: "Ligue o nó Repartições antes e use “reparticao” — só os protocolos delas. Vazio = todas.",
      },
    ],
    executar: async (e, c, ctx) => {
      const sit = str(c.situacao) === "outra" ? str(c.outra).trim() : str(c.situacao);
      const reps = str(c.campoReparticao) ? so(e).map((it) => str(resolverCaminho(it, str(c.campoReparticao)))).filter(Boolean) : [];
      ctx.aviso("Lendo os protocolos na Centi…");
      const r = await ctx.centi("telaApi", { situacao: sit }, 180_000);
      if (r.interrompido) throw new Error("Interrompido na extensão.");
      if (!r.ok) {
        if (!sit && reps.length) {
          // Em análise sem a consulta aprendida: pela tela (uma vez — a próxima vai pela API).
          ctx.aviso("Ensinando a consulta pela tela da Centi…");
          const t = await pedirCenti(ctx, "telaEmAnalise", { departamentos: reps }, 180_000);
          return { saida: normalizar(t.protocolos) };
        }
        throw new Error(
          `${r.erro || "A Centi não respondeu."}${r.semConsulta ? " Leia uma vez pela tarefa “Ler a Tela Protocolo” para a extensão aprender a consulta." : ""}`,
        );
      }
      if (sit && r.filtro !== sit) throw new Error("A extensão da Centi está desatualizada (1.15.0 ou maior filtra por situação) — baixe a nova.");
      const linhas = normalizar(r.protocolos);
      const alvo = reps.map(normTexto);
      const temDep = linhas.some((l) => str(l.departamento));
      return {
        saida: alvo.length && temDep ? linhas.filter((l) => alvo.some((a) => normTexto(l.departamento).includes(a) || a.includes(normTexto(l.departamento)))) : linhas,
      };
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
    campos: [{ chave: "entidades", rotulo: "Entidades", tipo: "texto", ajuda: "Ex.: 2; 3. Vazio = as cadastradas nos órgãos." }],
    executar: async (_e, c, ctx) => {
      const mapa = (ctx.host.mapaEntidades ?? {}) as Record<string, string>;
      const ents = [...new Set((lista(c.entidades).length ? lista(c.entidades) : Object.values(mapa)).map((x) => x.replace(/^0+(?=\d)/, "")))].filter(Boolean);
      if (!ents.length) throw new Error("Nenhuma entidade — informe no nó ou cadastre o ID da Centi nos órgãos.");
      const out: Item[] = [];
      for (const [i, ent] of ents.entries()) {
        if (ctx.cancelado()) break;
        ctx.aviso(`Entidade ${ent} (${i + 1} de ${ents.length})…`);
        const r = await pedirCenti(ctx, "cm002", { entidade: ent }, 300_000);
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
    tipo: "sistema.protocolos",
    categoria: "sistema",
    rotulo: "Protocolos do sistema",
    descricao: "Os protocolos cadastrados (nº, Id da capa, unidade, PCA, DFDs com planejamento).",
    icone: "folder",
    entradas: ["entrada"],
    saidas: ["saida"],
    campos: [{ chave: "dfds", rotulo: "Um item por DFD (em vez de por protocolo)", tipo: "booleano", padrao: false }],
    executar: async (_e, c, ctx) => {
      const ps = (ctx.host.protocolos ?? []) as Item[];
      if (c.dfds !== true) return { saida: ps.map((p) => ({ ...p, dfds: undefined, totalDfds: Array.isArray(p.dfds) ? p.dfds.length : 0 })) };
      return {
        saida: ps.flatMap((p) =>
          (Array.isArray(p.dfds) ? p.dfds : []).map((d) => ({ ...obj(d), protocolo: p.numero, protocoloId: p.id, idExterno: p.idExterno, sigla: p.sigla })),
        ),
      };
    },
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
        out.push({ ...it, ...(await ler(it)) });
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

export const REGISTRO_NOS: Registro = new Map(NOS.map((n) => [n.tipo, n]));
export const NOS_POR_CATEGORIA = CATEGORIAS.map((c) => ({ ...c, nos: NOS.filter((n) => n.categoria === c.valor) }));

function normalizar(v: unknown): Item[] {
  return (Array.isArray(v) ? v : []).map(obj).map((p) => ({
    ...p,
    protocolo: str(p.protocolo ?? p.numero),
    ano: str(p.ano),
    id: str(p.id),
  }));
}
