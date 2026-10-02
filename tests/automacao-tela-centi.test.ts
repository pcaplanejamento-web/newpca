// A TELA PROTOCOLO da Centi operada pela interface (extensao-centi/centi-tela.js, em vm) sobre um DOM FALSO montado como
// nos prints: o seletor "Departamentos" (multi, com chips), a lupa, o PROTOCOLAR (que NUNCA pode ser tocado), as abas e a
// grade de "Em Análise".
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

type Ev = { type: string; key?: string };
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
  /** Os eventos SOBEM (como no navegador): o clique no rótulo chega à aba que o contém. */
  dispatchEvent(e: Ev) {
    for (let n: El | null = this; n; n = n.parentElement) for (const f of n.ouvintes[e.type] ?? []) f(e);
    return true;
  }
}

const DEPARTAMENTOS = ["DEP. PLANEJAMENTO - PCA", "PCA – MARIA FERNANDA", "PCA - CRISTIANE", "PCA - COORDENADOR (JHONE)", "NÚCLEO PLANEJAMENTO - EM ANÁLISE"];
type Protocolo = [string, string, string, string];

/** A página da Centi como nos prints. `telaAberta` = a PO011 já está na tela; senão, só a aba "PO011" no topo. */
function centi(o: { telaAberta?: boolean; emAnalise?: Record<string, Protocolo[]>; porPagina?: number; escolhidos?: string[] } = {}) {
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
    for (const n of escolhidos) valores.add(new El("div", { className: "css-1p3m7a8-multiValue" }).add(new El("div", { texto: n, className: "css-9jq23d-MultiValueLabel" }), new El("div", { texto: "×", className: "css-v7duua-MultiValueRemove" })));
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
      [`Em Análise${pesquisados.length && n ? ` (${n})` : ""}`, "EM ANALISE"],
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
    if (aba === "EM ANALISE") {
      const cab = new El("tr");
      for (const h of ["", "PROTOCOLO", "ANO", "DEPARTAMENTO", "INTERESSADO", "SOLICITANTE", "NATUREZA"]) cab.add(new El("th").add(new El("span", { texto: h })));
      tabela.add(new El("thead").add(cab));
      const todos = doAnalise();
      const corpo = new El("tbody");
      for (const p of todos.slice(pagina * porPagina, (pagina + 1) * porPagina)) {
        const tr = new El("tr");
        for (const v of ["", p[0], p[1], p[2], p[3], "", "INCLUSÃO - PCA"]) tr.add(new El("td", { texto: v }));
        corpo.add(tr);
      }
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
  desenharAbas();
  desenharGrade();
  const painel = new El("div").add(new El("div", { texto: "Tela Protocolo" }), new El("div").add(controle, lupa, protocolar), abas, grade);

  const busca = new El("input", { attrs: { placeholder: "Pesquisar..." } });
  const sidebar = new El("aside").add(busca);
  const topo = new El("div");
  const conteudo = new El("main");
  const abrirTelaNaPagina = () => {
    if (!conteudo.children.length) conteudo.add(painel);
  };
  topo.add(new El("span", { texto: "PO011 - Tela Protocolo" }).on("click", abrirTelaNaPagina));
  busca.on("input", () => {
    if (busca.value === "PO011") sidebar.add(new El("a", { texto: "PO011 - Tela Protocolo" }).on("click", abrirTelaNaPagina));
  });
  if (o.telaAberta) conteudo.add(painel);
  body.add(sidebar, topo, conteudo);
  const doc = { body, querySelectorAll: (s: string) => body.querySelectorAll(s) };
  return { doc, cliques, escolhidos };
}

function peca() {
  const ctx: Record<string, unknown> = {};
  vm.runInNewContext(readFileSync("extensao-centi/centi-tela.js", "utf8"), ctx);
  const t = ctx.__pcaCentiTela as { executar: (a: string, d: unknown, c: unknown) => Promise<unknown>; seguro: (e: unknown) => boolean };
  // O resultado volta por JSON (outro "realm" do vm): compara-se como dado puro.
  return { seguro: t.seguro, executar: async (a: string, d: unknown, c: unknown) => JSON.parse(JSON.stringify(await t.executar(a, d, c))) as Record<string, unknown> };
}
const evento = class {
  type: string;
  key?: string;
  constructor(type: string, o?: { key?: string }) {
    this.type = type;
    this.key = o?.key;
  }
};
const win = { setTimeout, Event: evento, MouseEvent: evento, KeyboardEvent: evento };
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
  assert.deepEqual(c.cliques, ["lupa"]);
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
