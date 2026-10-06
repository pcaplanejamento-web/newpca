// A TELA PROTOCOLO da Centi operada pela interface (extensao-centi/centi-tela.js, em vm) sobre um DOM FALSO montado como
// nos prints: o seletor "Departamentos" (multi, com chips), a lupa, o PROTOCOLAR (que NUNCA pode ser tocado), as abas e a
// grade de "Em Análise".
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

type Ev = { type: string; key?: string; clientX?: number; clientY?: number };
class El {
  tagName: string;
  children: El[] = [];
  parentElement: El | null = null;
  attrs: Record<string, string>;
  className = "";
  id = "";
  value = "";
  type = "";
  disabled = false;
  hidden = false;
  offsetWidth = 10;
  /** A caixa na tela (para a leitura pela posição). */
  _rect: { left: number; right: number; top: number; bottom: number; width: number; height?: number } | null = null;
  proprio: string;
  ouvintes: Record<string, ((e: Ev) => void)[]> = {};
  constructor(tag: string, o: { texto?: string; attrs?: Record<string, string>; className?: string; id?: string } = {}) {
    this.tagName = tag.toUpperCase();
    this.proprio = o.texto ?? "";
    this.attrs = o.attrs ?? {};
    this.className = o.className ?? "";
    this.id = o.id ?? "";
  }
  add(...filhos: El[]) {
    for (const f of filhos) {
      f.parentElement = this;
      this.children.push(f);
    }
    return this;
  }
  remover(f: El) {
    this.children = this.children.filter((c) => c !== f);
    f.parentElement = null;
  }
  get textContent(): string {
    return [this.proprio, ...this.children.map((c) => c.textContent)].filter(Boolean).join(" ");
  }
  getAttribute(n: string) {
    return this.attrs[n] ?? null;
  }
  querySelectorAll(_: string): El[] {
    const r: El[] = [];
    const ir = (e: El) => {
      for (const c of e.children) {
        r.push(c);
        ir(c);
      }
    };
    ir(this);
    return r;
  }
  contains(o: El) {
    for (let n: El | null = o; n; n = n.parentElement) if (n === this) return true;
    return false;
  }
  on(tipo: string, fn: (e: Ev) => void) {
    if (!this.ouvintes[tipo]) this.ouvintes[tipo] = [];
    this.ouvintes[tipo].push(fn);
    return this;
  }
  focus() {}
  getBoundingClientRect() {
    return this._rect ?? { left: 0, right: 0, top: 0, bottom: 0, width: 0 };
  }
  /** Os eventos SOBEM (como no navegador): o clique no rótulo chega à aba que o contém. */
  dispatchEvent(e: Ev) {
    for (let n: El | null = this; n; n = n.parentElement) for (const f of n.ouvintes[e.type] ?? []) f(e);
    return true;
  }
}

const DEPARTAMENTOS = ["DEP. PLANEJAMENTO - PCA", "PCA – MARIA FERNANDA", "PCA - CRISTIANE", "PCA - COORDENADOR (JHONE)", "NÚCLEO PLANEJAMENTO - EM ANÁLISE"];
type Protocolo = [string, string, string, string];

/** A página da Centi como nos prints. `telaAberta` = a PO011 já está na tela; senão, só a aba "PO011" no topo. */
function centi(
  o: { telaAberta?: boolean; emAnalise?: Record<string, Protocolo[]>; porPagina?: number; escolhidos?: string[]; semEspaco?: boolean; semClasses?: boolean; semGrade?: boolean; wijmo?: boolean; visiveis?: number; varios?: boolean; xQuebrado?: boolean } = {},
) {
  const body = new El("body");
  const cliques: string[] = [];
  const escolhidos: string[] = [...(o.escolhidos ?? [])];
  let menu: El | null = null;
  let aba = "A RECEBER";
  let pesquisados: string[] = [];
  let pagina = 0;
  const porPagina = o.porPagina ?? 100;

  const controle = new El("div", { className: "css-13cymwt-control" });
  const valores = new El("div", { className: "css-1dyz3mf-ValueContainer" });
  const campo = new El("input", { attrs: { role: "combobox", "aria-autocomplete": "list" } });
  const placeholder = new El("div", { texto: "Departamentos", className: "css-placeholder" });
  function desenharChips() {
    valores.children = [];
    for (const n of escolhidos)
      valores.add(
        o.semClasses
          ? new El("div", { className: "css-1p3m7a8" }).add(new El("div", { texto: n, className: "css-9jq23d" }), new El("div", { className: "css-v7duua", attrs: { role: "button", "aria-label": `Remove ${n}` } }))
          : new El("div", { className: "css-1p3m7a8-multiValue" }).add(new El("div", { texto: n, className: "css-9jq23d-MultiValueLabel" }), new El("div", { texto: "×", className: "css-v7duua-MultiValueRemove" })),
      );
    if (!escolhidos.length) valores.add(placeholder);
    valores.add(campo);
  }
  desenharChips();
  controle.add(valores);
  const abrirMenu = () => {
    if (menu) return;
    const m = new El("div", { className: "css-menu" });
    for (const [i, d] of DEPARTAMENTOS.filter((x) => !escolhidos.includes(x)).entries())
      m.add(
        new El("div", { texto: d, id: `react-select-3-option-${i}`, attrs: { role: "option" } }).on("click", () => {
          escolhidos.push(d);
          desenharChips();
          fecharMenu();
        }),
      );
    menu = m;
    body.add(m);
  };
  const fecharMenu = () => {
    if (menu) body.remover(menu);
    menu = null;
  };
  campo.on("mousedown", abrirMenu).on("keydown", (e) => {
    if (e.key === "ArrowDown") abrirMenu();
    if (e.key === "Escape") fecharMenu();
    if (e.key === "Backspace") {
      escolhidos.pop();
      desenharChips();
    }
  });

  const lupa = new El("button").on("click", () => {
    cliques.push("lupa");
    pesquisados = [...escolhidos];
    pagina = 0;
    desenharAbas();
    desenharGrade();
  });
  const protocolar = new El("button", { texto: "PROTOCOLAR" }).on("click", () => cliques.push("PROTOCOLAR"));
  const abas = new El("div");
  const grade = new El("div");
  const doAnalise = () => pesquisados.flatMap((d) => o.emAnalise?.[d] ?? []);
  function desenharAbas() {
    abas.children = [];
    const n = doAnalise().length;
    for (const [rot, k] of [
      ["A Receber", "A RECEBER"],
      [`Em Análise${pesquisados.length && n ? `${o.semEspaco ? "" : " "}(${n})` : ""}`, "EM ANALISE"],
      ["Analisado", "ANALISADO"],
      ["Em Transito", "EM TRANSITO"],
    ])
      abas.add(
        new El("div", { attrs: { role: "tab" } }).add(new El("span", { texto: rot })).on("click", () => {
          aba = k;
          pagina = 0;
          desenharGrade();
        }),
      );
  }
  function desenharGrade() {
    grade.children = [];
    const tabela = new El("table");
    if (aba === "EM ANALISE" && o.semGrade) {
      grade.add(new El("div", { texto: "carregando…" }));
    } else if (aba === "EM ANALISE") {
      const cab = new El("tr");
      // Cada célula do cabeçalho: o rótulo + os ícones de ordenar e filtrar (3 filhos — como na Centi).
      for (const h of ["", "PROTOCOLO", "ANO", "DEPARTAMENTO", "INTERESSADO", "SOLICITANTE", "NATUREZA"]) cab.add(new El("th").add(new El("span", { texto: h }), new El("i"), new El("i")));
      tabela.add(new El("thead").add(cab));
      const todos = doAnalise();
      const daPagina = todos.slice(pagina * porPagina, (pagina + 1) * porPagina);
      // Como a grade da Centi (Wijmo): a linha só abre no duplo clique que CAI sobre ela (pelas coordenadas) e, com
      // `visiveis`, só as linhas à vista existem — o corpo rola por dentro.
      const ALT = 30;
      const corpo = new El("tbody");
      let topo = 0;
      const desenharLinhas = () => {
        corpo.children = [];
        const de = o.visiveis ? Math.floor(topo / ALT) : 0;
        const ate = o.visiveis ? de + o.visiveis : daPagina.length;
        for (const [i, p] of daPagina.slice(de, ate).entries()) {
          const y = 100 + i * ALT;
          const tr = new El("tr").on("dblclick", (e) => {
            if (!o.wijmo || ((e.clientY ?? -1) >= y && (e.clientY ?? -1) < y + ALT)) abrirCadastro(p[0]);
          });
          tr._rect = { left: 0, right: 700, top: y, bottom: y + ALT, width: 700, height: ALT };
          for (const [k, v] of ["", p[0], p[1], p[2], p[3], "", "INCLUSÃO - PCA"].entries()) {
            const td = new El("td", { texto: v });
            td._rect = { left: k * 100, right: k * 100 + 100, top: y, bottom: y + ALT, width: 100, height: ALT };
            tr.add(td);
          }
          corpo.add(tr);
        }
      };
      if (o.visiveis) {
        const alto = daPagina.length * ALT;
        const janela = o.visiveis * ALT;
        Object.defineProperty(corpo, "clientHeight", { value: janela });
        Object.defineProperty(corpo, "scrollHeight", { value: alto });
        Object.defineProperty(corpo, "scrollTop", {
          get: () => topo,
          set: (v: number) => {
            topo = Math.max(0, Math.min(v, alto - janela));
          },
        });
        corpo.on("scroll", desenharLinhas);
      }
      desenharLinhas();
      tabela.add(corpo);
      grade.add(tabela);
      const rodape = new El("div", { texto: todos.length ? `Exibindo ${todos.length} registro(s)` : "Nenhum resultado encontrado." });
      if ((pagina + 1) * porPagina < todos.length)
        rodape.add(
          new El("button", { attrs: { "aria-label": "Próxima página" } }).on("click", () => {
            pagina++;
            desenharGrade();
          }),
        );
      grade.add(rodape);
    } else {
      const cab = new El("tr");
      for (const h of ["", "ID", "USUARIO ORIGEM", "DATA", "PROCES...", "DEPARTAMENTO DESTINO"]) cab.add(new El("th", { texto: h }));
      tabela.add(new El("thead").add(cab));
      grade.add(tabela, new El("div", { texto: "Nenhum resultado encontrado." }));
    }
  }
  // O CADASTRO do protocolo (o duplo clique na linha): Novo/Excluir/Salvar (nunca tocados), Operações → Emitir documentos
  // → uma janela com "Emitir" → o PDF (`emitido`).
  const estado = { emitido: false, modal: null as El | null };
  const botao = (t: string) => new El("button", { texto: t }).on("click", () => cliques.push(t));
  const entrada = (v: string, a: Record<string, string> = {}) => {
    const i = new El("input", { attrs: a });
    i.value = v;
    return i;
  };
  const linhaCad = (rot: string, ...cs: El[]) => new El("div").add(new El("div", { texto: rot }).add(new El("span", { texto: "*" })), ...cs.map((c) => new El("div").add(c)));
  function abrirCadastro(n: string) {
    if (estado.modal && !o.varios) return;
    const m = new El("div", { className: "modal" });
    const menu = new El("div");
    const obs = new El("textarea");
    obs.value = "REFERE-SE AOS DFD PARA O PCA DE 2027.";
    const rep = new El("div").add(new El("div").add(new El("div", { texto: "PCA - NATYELLE" }), new El("div").add(entrada("", { role: "combobox" }))));
    const operacoes = new El("button", { texto: "Operações" }).on("click", () => {
      cliques.push("Operações");
      if (menu.children.length) return;
      menu.add(
        botao("Alterar dados financeiros"),
        new El("div", { texto: "Emitir documentos" }).on("click", () => {
          cliques.push("Emitir documentos");
          body.add(new El("div", { className: "dialogo" }).add(new El("button", { texto: "Emitir" }).on("click", () => (estado.emitido = true)), botao("Anexar")));
        }),
      );
    });
    m.add(
      new El("div").add(new El("span", { texto: "Protocolo" }), new El("button", { texto: "×" }).on("click", () => {
        cliques.push("fechar");
        if (o.xQuebrado) return;
        body.remover(m);
        estado.modal = null;
      })),
      new El("div").add(new El("i"), new El("span", { texto: "Protocolo - 2273524" })),
      new El("div").add(botao("Novo"), botao("Excluir"), botao("Salvar"), operacoes),
      linhaCad("Id", entrada("2273524")),
      linhaCad("Protocolo", entrada(n)),
      linhaCad("Ano protocolo", entrada("2026")),
      linhaCad("Interessado/Beneficiário", entrada("9488"), entrada("FUNDO MUNICIPAL DE SAÚDE")),
      linhaCad("Observação", obs),
      linhaCad("Repartição", rep),
      menu,
    );
    estado.modal = m;
    body.add(m);
  }
  desenharAbas();
  desenharGrade();
  // O bloco dos filtros (título + seletor + lupa) e, AO LADO dele (fora), as abas e a grade — como na Centi.
  const painel = new El("div").add(new El("div", { texto: "Tela Protocolo" }), new El("div").add(controle, lupa, protocolar));
  const corpoTela = new El("div").add(abas, grade);

  const busca = new El("input", { attrs: { placeholder: "Pesquisar..." } });
  const sidebar = new El("aside").add(busca, new El("span", { texto: "Protocolo" }));
  const topo = new El("div");
  const conteudo = new El("main");
  const abrirTelaNaPagina = () => {
    if (!conteudo.children.length) conteudo.add(painel, corpoTela);
  };
  topo.add(new El("span", { texto: "PO011 - Tela Protocolo" }).on("click", abrirTelaNaPagina));
  busca.on("input", () => {
    if (busca.value === "PO011") sidebar.add(new El("a", { texto: "PO011 - Tela Protocolo" }).on("click", abrirTelaNaPagina));
  });
  if (o.telaAberta) conteudo.add(painel, corpoTela);
  body.add(sidebar, topo, conteudo);
  const doc = { body, querySelectorAll: (s: string) => body.querySelectorAll(s) };
  return { doc, cliques, escolhidos, estado, abrir: abrirCadastro };
}

function peca() {
  const ctx: Record<string, unknown> = {};
  vm.runInNewContext(readFileSync("extensao-centi/centi-tela.js", "utf8"), ctx);
  const t = ctx.__pcaCentiTela as {
    executar: (a: string, d: unknown, c: unknown) => Promise<unknown>;
    seguro: (e: unknown) => boolean;
    lerGrade: (doc: unknown) => { registros: Record<string, string>[] } | null;
  };
  // O resultado volta por JSON (outro "realm" do vm): compara-se como dado puro.
  return { seguro: t.seguro, lerGrade: (d: unknown) => JSON.parse(JSON.stringify(t.lerGrade(d)?.registros ?? null)), executar: async (a: string, d: unknown, c: unknown) => JSON.parse(JSON.stringify(await t.executar(a, d, c))) as Record<string, unknown> };
}
const evento = class {
  type: string;
  key?: string;
  clientX?: number;
  clientY?: number;
  constructor(type: string, o?: { key?: string; clientX?: number; clientY?: number }) {
    this.type = type;
    this.key = o?.key;
    this.clientX = o?.clientX;
    this.clientY = o?.clientY;
  }
};
const win = { setTimeout, Event: evento, MouseEvent: evento, KeyboardEvent: evento, getComputedStyle: () => ({ overflowY: "auto" }) };
const ctx = (doc: unknown) => ({ doc, win, passo: 5, prazo: 800 });

test("tela protocolo: abre a PO011 pela aba do topo e lista as repartições do seletor", async () => {
  const c = centi();
  const r = await peca().executar("telaDepartamentos", null, ctx(c.doc));
  assert.equal(r.ok, true, String(r.erro));
  assert.deepEqual(r.departamentos, DEPARTAMENTOS);
});

test("tela protocolo: escolhe as repartições pelo nome (sem acento/caixa), pesquisa e lê “Em Análise (N)” — nunca toca no PROTOCOLAR", async () => {
  const c = centi({
    telaAberta: true,
    escolhidos: ["DEP. PLANEJAMENTO - PCA"], // uma escolha anterior, que deve sair
    emAnalise: {
      "PCA - COORDENADOR (JHONE)": [["156844", "2026", "PCA - COORDENADOR (JHO…", "SECRETARIA DE PLANEJAMENTO E …"]],
      "PCA - CRISTIANE": [["157001", "2026", "PCA - CRISTIANE", "SECRETARIA DE SAÚDE"]],
    },
  });
  const r = await peca().executar("telaEmAnalise", { departamentos: ["pca - coordenador (jhone)", "PCA - CRISTIANE"] }, ctx(c.doc));
  assert.equal(r.ok, true, String(r.erro));
  assert.deepEqual(c.escolhidos, ["PCA - COORDENADOR (JHONE)", "PCA - CRISTIANE"]);
  const ps = r.protocolos as { protocolo: string; ano: string; interessado: string; natureza: string }[];
  assert.deepEqual(
    ps.map((p) => `${p.protocolo}/${p.ano}`),
    ["156844/2026", "157001/2026"],
  );
  assert.equal(ps[0].natureza, "INCLUSÃO - PCA");
  assert.equal(r.total, 2);
  assert.deepEqual(c.cliques, ["lupa", "lupa"]);
});

test("tela protocolo: pela busca do menu quando a PO011 não está aberta; percorre as páginas da grade", async () => {
  const c = centi({ emAnalise: { "PCA - CRISTIANE": Array.from({ length: 25 }, (_, i): Protocolo => [String(150000 + i), "2026", "PCA - CRISTIANE", "X"]) }, porPagina: 10 });
  // Sem a aba do topo: só a busca do menu.
  const topo = c.doc.body.children[1];
  topo.children = [];
  const r = await peca().executar("telaEmAnalise", { departamentos: ["PCA - CRISTIANE"] }, ctx(c.doc));
  assert.equal(r.ok, true, String(r.erro));
  assert.equal((r.protocolos as unknown[]).length, 25);
});

test("tela protocolo: repartição que não existe = erro claro; nada vazio; o PROTOCOLAR é bloqueado", async () => {
  const c = centi({ telaAberta: true });
  const r = await peca().executar("telaEmAnalise", { departamentos: ["NÃO EXISTE"] }, ctx(c.doc));
  assert.equal(r.ok, false);
  assert.match(String(r.erro), /não está mais na lista/);
  assert.equal((await peca().executar("telaEmAnalise", { departamentos: [] }, ctx(c.doc))).ok, false);
  const vazio = await peca().executar("telaEmAnalise", { departamentos: ["PCA - CRISTIANE"] }, ctx(c.doc));
  assert.equal(vazio.ok, true, String(vazio.erro));
  assert.deepEqual(vazio.protocolos, []);
  assert.equal(peca().seguro(new El("button", { texto: "PROTOCOLAR" })), false);
  assert.equal(peca().seguro(new El("button", { attrs: { title: "Operações" } })), false);
  assert.equal(peca().seguro(new El("div", { texto: "Em Análise (1)" })), true);
  assert.ok(!c.cliques.includes("PROTOCOLAR"));
});

test("tela protocolo: aba “Em Análise(1)” sem espaço e chips só com o aria-label “Remove …” (build sem classes)", async () => {
  const c = centi({
    telaAberta: true,
    semEspaco: true,
    semClasses: true,
    escolhidos: ["PCA - COORDENADOR (JHONE)"], // já escolhida: nada a mexer
    emAnalise: { "PCA - COORDENADOR (JHONE)": [["156844", "2026", "PCA - COORDENADOR (JHO…", "SECRETARIA DE PLANEJAMENTO E …"]] },
  });
  const r = await peca().executar("telaEmAnalise", { departamentos: ["PCA - COORDENADOR (JHONE)"] }, ctx(c.doc));
  assert.equal(r.ok, true, String(r.erro));
  assert.deepEqual(
    (r.protocolos as { protocolo: string }[]).map((p) => p.protocolo),
    ["156844"],
  );
  assert.deepEqual(c.escolhidos, ["PCA - COORDENADOR (JHONE)"]);
  assert.deepEqual(c.cliques, ["lupa", "lupa"]);
});

test("tela protocolo: grade de DIVs sem a forma do cabeçalho = leitura pela POSIÇÃO na tela", () => {
  const caixa = (el: El, left: number, top: number, w = 100, h = 30) => {
    el._rect = { left, right: left + w, top, bottom: top + h, width: w };
    return el;
  };
  const rot = ["", "PROTOCOLO", "ANO", "DEPARTAMENTO", "INTERESSADO", "SOLICITANTE", "NATUREZA"];
  const cab = new El("div");
  for (const [i, h] of rot.entries()) cab.add(caixa(new El("div").add(new El("span", { texto: h }), new El("i")), i * 100, 0));
  // As células numa lista única (grade virtualizada), cada uma posicionada; + o rodapé.
  const corpo = new El("div");
  const linhas = [
    ["156844", "2026", "PCA - JHONE", "SEC. PLANEJAMENTO", "", "INCLUSÃO - PCA"],
    ["157001", "2026", "PCA - CRISTIANE", "SEC. SAÚDE", "", "INCLUSÃO - PCA"],
  ];
  for (const [j, l] of linhas.entries())
    for (const [i, v] of l.entries()) if (v) corpo.add(caixa(new El("span", { texto: v }), (i + 1) * 100 + 5, 40 + j * 35, 90, 20));
  corpo.add(caixa(new El("span", { texto: "Exibindo 2 registro(s)" }), 150, 200, 200, 20));
  const body = new El("body").add(new El("aside").add(new El("span", { texto: "Protocolo" })), cab, corpo);
  const doc = { body, querySelectorAll: (s: string) => body.querySelectorAll(s) };
  const regs = peca().lerGrade(doc) as { protocolo: string; ano: string; interessado: string }[];
  assert.deepEqual(
    regs.map((r) => `${r.protocolo}/${r.ano} ${r.interessado}`),
    ["156844/2026 SEC. PLANEJAMENTO", "157001/2026 SEC. SAÚDE"],
  );
});

test("tela protocolo: sem a grade, o erro traz o DIAGNÓSTICO da forma da tela", async () => {
  // A aba diz 1 protocolo, mas a grade não tem o cabeçalho (a Centi mudou).
  const c = centi({ telaAberta: true, semGrade: true, emAnalise: { "PCA - CRISTIANE": [["157001", "2026", "PCA - CRISTIANE", "X"]] } });
  const r = await peca().executar("telaEmAnalise", { departamentos: ["PCA - CRISTIANE"] }, { ...ctx(c.doc), prazo: 300 });
  assert.equal(r.ok, false);
  assert.match(String(r.diagnostico), /etapa: ler a grade/);
  assert.match(String(r.diagnostico), /aba Em Análise: 1/);
  assert.match(String(r.diagnostico), /cabeçalho: não achado/);
  assert.ok(!c.cliques.includes("PROTOCOLAR"));
});

test("tela protocolo: abre o protocolo, lê TODO o cadastro e emite pelo Operações → Emitir documentos (só esses cliques)", async () => {
  const c = centi({ telaAberta: true, emAnalise: { "PCA - CRISTIANE": [["97608", "2026", "PCA - CRISTIANE", "FUNDO MUNICIPAL DE SAÚDE"]] } });
  const capturas: string[] = [];
  const pagina = async (acao: string, d: { acao: string }) => {
    if (acao === "grade") return { ok: false };
    assert.equal(acao, "captura");
    capturas.push(d.acao);
    if (d.acao === "ler")
      return c.estado.emitido ? { ok: true, pronto: true, resposta: { status: 200, b64: "e30=" }, operacao: { ModuleKey: 7, Guid: "g", Params: [] } } : { ok: true, pronto: false };
    return { ok: true };
  };
  const r = await peca().executar("telaEmitir", { protocolo: "97608", ano: "2026", departamentos: ["PCA - CRISTIANE"] }, { ...ctx(c.doc), pagina });
  assert.equal(r.ok, true, `${r.erro}\n${r.diagnostico}`);
  const dados = r.dados as { id: string; campos: { rotulo: string; valor: string }[] };
  assert.equal(dados.id, "2273524");
  assert.deepEqual(dados.campos, [
    { rotulo: "Id", valor: "2273524" },
    { rotulo: "Protocolo", valor: "97608" },
    { rotulo: "Ano protocolo", valor: "2026" },
    { rotulo: "Interessado/Beneficiário", valor: "9488 FUNDO MUNICIPAL DE SAÚDE" },
    { rotulo: "Observação", valor: "REFERE-SE AOS DFD PARA O PCA DE 2027." },
    { rotulo: "Repartição", valor: "PCA - NATYELLE" },
  ]);
  assert.deepEqual(r.arquivo, { resposta: { status: 200, b64: "e30=" } });
  assert.deepEqual(r.operacao, { ModuleKey: 7, Guid: "g", Params: [] });
  // Só lupa, Operações, Emitir documentos e fechar — nunca Novo, Excluir, Salvar, Anexar nem PROTOCOLAR.
  assert.deepEqual(c.cliques, ["lupa", "lupa", "Operações", "Emitir documentos", "fechar"]);
  assert.equal(capturas[0], "iniciar");
  assert.equal(capturas.at(-1), "parar");
});

test("tela protocolo: emissão sem PDF = erro com o diagnóstico da janela; a captura é sempre desligada", async () => {
  const c = centi({ telaAberta: true, emAnalise: { "PCA - CRISTIANE": [["97608", "2026", "PCA - CRISTIANE", "X"]] } });
  const capturas: string[] = [];
  const pagina = async (_a: string, d: { acao: string }) => {
    capturas.push(d.acao);
    return d.acao === "ler" ? { ok: true, pronto: false, vistos: { operacoes: 1 } } : { ok: true };
  };
  const r = await peca().executar("telaEmitir", { protocolo: "97608", ano: "2026", departamentos: ["PCA - CRISTIANE"] }, { ...ctx(c.doc), pagina, prazoEmissao: 200 });
  assert.equal(r.ok, false);
  assert.match(String(r.erro), /Emitir documentos/);
  assert.match(String(r.diagnostico), /etapa: emitir documentos/);
  assert.match(String(r.diagnostico), /capturado: \{"operacoes":1\}/);
  assert.equal(capturas.at(-1), "parar");
  assert.ok(!c.cliques.includes("Anexar") && !c.cliques.includes("Salvar"));
});

test("tela protocolo: grade Wijmo — o duplo clique vai no CENTRO da célula (pelas coordenadas) e abre o protocolo certo", async () => {
  const c = centi({
    telaAberta: true,
    wijmo: true,
    emAnalise: {
      "PCA - CRISTIANE": [
        ["156497", "2026", "PCA - CRISTIANE", "SMAUSP"],
        ["136836", "2026", "PCA - CRISTIANE", "SMPG"],
      ],
    },
  });
  const pagina = async (_a: string, d: { acao: string }) => (d.acao === "ler" ? (c.estado.emitido ? { ok: true, pronto: true, pdf: "JVBERi0=" } : { ok: true, pronto: false }) : { ok: true });
  const r = await peca().executar("telaEmitir", { protocolo: "136836", ano: "2026", departamentos: ["PCA - CRISTIANE"] }, { ...ctx(c.doc), pagina });
  assert.equal(r.ok, true, `${r.erro}\n${r.diagnostico}`);
  assert.equal((r.dados as { campos: { rotulo: string; valor: string }[] }).campos.find((x) => x.rotulo === "Protocolo")?.valor, "136836");
  assert.deepEqual(r.arquivo, { pdf: "JVBERi0=" });
});

test("tela protocolo: grade que desenha só as linhas VISÍVEIS — rola por dentro e lê todas (e acha a do fim)", async () => {
  const lista = Array.from({ length: 25 }, (_, i): Protocolo => [String(150000 + i), "2026", "PCA - CRISTIANE", "X"]);
  const c = centi({ telaAberta: true, visiveis: 6, emAnalise: { "PCA - CRISTIANE": lista } });
  const r = await peca().executar("telaEmAnalise", { departamentos: ["PCA - CRISTIANE"] }, ctx(c.doc));
  assert.equal(r.ok, true, `${r.erro}\n${r.diagnostico}`);
  assert.equal((r.protocolos as unknown[]).length, 25);
  const pagina = async (_a: string, d: { acao: string }) => (d.acao === "ler" ? (c.estado.emitido ? { ok: true, pronto: true, pdf: "JVBERi0=" } : { ok: true, pronto: false }) : { ok: true });
  const e = await peca().executar("telaEmitir", { protocolo: "150024", ano: "2026", departamentos: ["PCA - CRISTIANE"] }, { ...ctx(c.doc), pagina });
  assert.equal(e.ok, true, `${e.erro}\n${e.diagnostico}`);
});

test("tela protocolo: os DADOS do controle da grade (Wijmo) — todas as linhas, com o Id e a data de entrada", async () => {
  // A tela mostra 3 linhas; o controle tem as 25 (e o Id de cada uma). Pedido "mostrar" = a linha à vista.
  const lista = Array.from({ length: 25 }, (_, i): Protocolo => [String(150000 + i), "2026", "PCA - CRISTIANE", "X"]);
  const c = centi({ telaAberta: true, visiveis: 3, emAnalise: { "PCA - CRISTIANE": lista } });
  const mostrados: string[] = [];
  const pagina = async (acao: string, d: { mostrar?: string; acao?: string } | null) => {
    if (acao === "grade") {
      if (d?.mostrar) mostrados.push(d.mostrar);
      return {
        ok: true,
        colunas: ["", "PROTOCOLO", "ANO", "DEPARTAMENTO", "INTERESSADO", "SOLICITANTE", "NATUREZA", "DATA DE ENTRADA"],
        linhas: lista.map((p, i) => ({ valores: ["", p[0], p[1], p[2], p[3], "", "INCLUSÃO - PCA", "24/09/2026"], id: String(2300000 + i) })),
        chaves: ["Id", "Protocolo"],
      };
    }
    return { ok: true };
  };
  const r = await peca().executar("telaEmAnalise", { departamentos: ["PCA - CRISTIANE"] }, { ...ctx(c.doc), pagina });
  assert.equal(r.ok, true, `${r.erro}\n${r.diagnostico}`);
  const ps = r.protocolos as { protocolo: string; id: string; entrada: string }[];
  assert.equal(ps.length, 25);
  assert.deepEqual(ps[24], { ...ps[24], protocolo: "150024", id: "2300024", entrada: "24/09/2026" });
});

test("tela protocolo: um cadastro de OUTRO protocolo deixado aberto é fechado antes — o lote não para depois de alguns", async () => {
  const c = centi({ telaAberta: true, emAnalise: { "PCA - CRISTIANE": [["97608", "2026", "PCA - CRISTIANE", "FUNDO MUNICIPAL DE SAÚDE"]] } });
  // O cadastro de um protocolo anterior ficou aberto (a Centi não abre outro com ele na frente).
  c.abrir("152688");
  const pagina = async (acao: string, d: { acao: string }) => {
    if (acao === "grade") return { ok: false };
    if (d.acao === "ler") return c.estado.emitido ? { ok: true, pronto: true, resposta: { status: 200, b64: "e30=" }, operacao: null } : { ok: true, pronto: false };
    return { ok: true };
  };
  const r = await peca().executar("telaEmitir", { protocolo: "97608", ano: "2026", departamentos: ["PCA - CRISTIANE"] }, { ...ctx(c.doc), pagina });
  assert.equal(r.ok, true, `${r.erro}\n${r.diagnostico}`);
  assert.equal((r.dados as { campos: { rotulo: string; valor: string }[] }).campos.find((x) => x.rotulo === "Protocolo")?.valor, "97608");
  assert.equal(c.cliques[0], "fechar");
  assert.equal(c.cliques.at(-1), "fechar");
  assert.equal(c.estado.modal, null);
});

test("tela protocolo: com VÁRIOS cadastros abertos (um que não fecha), acha o do protocolo pedido pelo campo Protocolo", async () => {
  const c = centi({ telaAberta: true, varios: true, xQuebrado: true, emAnalise: { "PCA - CRISTIANE": [["97608", "2026", "PCA - CRISTIANE", "FUNDO MUNICIPAL DE SAÚDE"]] } });
  c.abrir("152688");
  const pagina = async (acao: string, d: { acao: string }) => {
    if (acao === "grade") return { ok: false };
    if (d.acao === "ler") return c.estado.emitido ? { ok: true, pronto: true, resposta: { status: 200, b64: "e30=" }, operacao: null } : { ok: true, pronto: false };
    return { ok: true };
  };
  const r = await peca().executar("telaEmitir", { protocolo: "97608", ano: "2026", departamentos: ["PCA - CRISTIANE"] }, { ...ctx(c.doc), pagina });
  assert.equal(r.ok, true, `${r.erro}\n${r.diagnostico}`);
  assert.equal((r.dados as { campos: { rotulo: string; valor: string }[] }).campos.find((x) => x.rotulo === "Protocolo")?.valor, "97608");
});
