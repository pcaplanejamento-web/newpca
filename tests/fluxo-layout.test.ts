import assert from "node:assert/strict";
import { test } from "node:test";
import type { Grafo } from "../src/lib/fluxo-core.ts";
import { alturaNo, caixasDoGrafo, caminhoSvg, coresDasLigacoes, dobraDaRota, organizarGrafo, posPorta, rotaOrtogonal, rotasDoGrafo, setasDaRota } from "../src/lib/fluxo-layout.ts";
import { REGISTRO_NOS } from "../src/lib/fluxo-nos.ts";

const no = (id: string, tipo: string, x = 0, y = 0) => ({ id, tipo, config: {}, x, y });
const con = (de: string, para: string, saida = "saida", entrada = "entrada") => ({ de, saida, para, entrada });

const ortogonal = (pts: { x: number; y: number }[]) => pts.every((p, i) => !i || p.x === pts[i - 1].x || p.y === pts[i - 1].y);
const cruzaAlgum = (pts: { x: number; y: number }[], caixas: { x0: number; y0: number; x1: number; y1: number }[]) =>
  pts.some((p, i) => {
    if (!i) return false;
    const a = pts[i - 1];
    return caixas.some((c) =>
      a.y === p.y
        ? a.y > c.y0 && a.y < c.y1 && Math.max(a.x, p.x) > c.x0 && Math.min(a.x, p.x) < c.x1
        : a.x > c.x0 && a.x < c.x1 && Math.max(a.y, p.y) > c.y0 && Math.min(a.y, p.y) < c.y1,
    );
  });

test("organizar: colunas na ordem do fluxo, o laço não bagunça, nada sobreposto", () => {
  const g: Grafo = {
    v: 1,
    nos: [no("i", "gatilho.inicio", 900, 900), no("l", "logica.laco", 10, 10), no("f", "dados.filtrar", 500, 0), no("e", "erros.apontar", 0, 500), no("s", "dados.ordenar", 7, 7)],
    conexoes: [con("i", "l"), con("l", "f", "lote"), con("f", "l", "saida", "volta"), con("l", "e", "fim"), con("f", "e", "erro")],
  };
  const o = organizarGrafo(g, REGISTRO_NOS);
  const x = (id: string) => o.nos.find((n) => n.id === id)?.x ?? -1;
  assert.ok(x("i") < x("l") && x("l") < x("f") && x("f") < x("e"), "a ordem do fluxo da esquerda para a direita");
  assert.ok(x("s") > x("e"), "o nó solto vai para depois");
  const cx = [...caixasDoGrafo(o, REGISTRO_NOS).values()];
  for (const [i, a] of cx.entries())
    for (const b of cx.slice(i + 1)) assert.ok(a.x1 <= b.x0 || b.x1 <= a.x0 || a.y1 <= b.y0 || b.y1 <= a.y0, "nós não se sobrepõem");
});

test("ligações: só ângulos retos, não passam por cima de componentes, e a volta contorna por baixo", () => {
  const g: Grafo = {
    v: 1,
    nos: [no("a", "gatilho.inicio", 0, 0), no("m", "dados.ordenar", 312, 0), no("b", "dados.filtrar", 624, 0)],
    conexoes: [],
  };
  const cx = caixasDoGrafo(g, REGISTRO_NOS);
  const [a, m, b] = g.nos;
  const pa = posPorta(a, REGISTRO_NOS.get(a.tipo), "saida", "saida");
  const pb = posPorta(b, REGISTRO_NOS.get(b.tipo), "entrada", "entrada");
  const r = rotaOrtogonal(pa, pb, [cx.get("m") as never], cx.get("a"), cx.get("b"));
  assert.ok(ortogonal(r));
  assert.ok(!cruzaAlgum(r, [cx.get("m") as never]), "desvia do nó do meio");
  assert.deepEqual(r[0], pa);
  assert.deepEqual(r[r.length - 1], pb);
  // Volta (destino à esquerda): contorna por fora, entra pela esquerda do destino.
  const volta = rotaOrtogonal(posPorta(b, REGISTRO_NOS.get(b.tipo), "saida", "saida"), posPorta(a, REGISTRO_NOS.get(a.tipo), "entrada", "entrada"), [cx.get("m") as never], cx.get("b"), cx.get("a"));
  assert.ok(ortogonal(volta));
  assert.ok(!cruzaAlgum(volta, [...cx.values()]));
  assert.ok(volta[volta.length - 2].x < 0, "chega pela esquerda");
  assert.equal(m.x, 312);
  assert.match(caminhoSvg(r), /^M .* L /);
  assert.ok(alturaNo(REGISTRO_NOS.get("dados.filtrar")) > 0);
});

test("todas as ligações: sem linha sobre linha, setas no meio, cores por nó e a dobra à mão", () => {
  const g: Grafo = {
    v: 1,
    nos: [no("c", "dados.compararDfdCenti", 0, 0), no("e", "erros.apontar", 560, 0), no("m", "saida.marcarConferencia", 560, 160)],
    conexoes: [con("c", "e", "divergentes"), con("c", "m", "divergentes", "divergentes"), con("c", "m", "conformes", "conformes")],
  };
  const rs = rotasDoGrafo(g, REGISTRO_NOS);
  const vs = rs.flatMap((r, i) => (r ? (dobraDaRota(r) ? [{ i, ...(dobraDaRota(r) as { x: number; y0: number; y1: number }) }] : []) : []));
  for (const [k, a] of vs.entries())
    for (const b of vs.slice(k + 1)) assert.ok(a.x !== b.x || Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0) <= 2, "dobras em faixas diferentes");
  const cores = coresDasLigacoes(g);
  assert.equal(new Set(cores).size, 3, "cada ligação do mesmo nó numa cor");
  const longa = rs[0] as { x: number; y: number }[];
  assert.ok(setasDaRota([{ x: 0, y: 0 }, { x: 200, y: 0 }]).length === 2, "seta no meio e na chegada");
  assert.ok(longa.length >= 2);
  const manual = rotasDoGrafo({ ...g, conexoes: [{ ...g.conexoes[1], x: 320 }] }, REGISTRO_NOS)[0];
  assert.equal(dobraDaRota(manual as never)?.x, 320, "a dobra ajustada à mão vale");
  assert.equal(organizarGrafo({ ...g, conexoes: [{ ...g.conexoes[1], x: 320 }] }, REGISTRO_NOS).conexoes[0].x, undefined);
});

test("organizar: a saída erro não joga o nó para longe e a linha sai reta", () => {
  const g: Grafo = {
    v: 1,
    nos: [no("i", "gatilho.inicio"), no("c", "centi.cm002"), no("e", "erros.apontar"), no("f", "dados.filtrar")],
    conexoes: [con("i", "c"), con("c", "e", "erro"), con("c", "f")],
  };
  const o = organizarGrafo(g, REGISTRO_NOS);
  const y = (id: string) => o.nos.find((n) => n.id === id)?.y ?? 0;
  assert.ok(y("e") - y("c") < 400, "o nó do erro fica perto");
  const r = rotasDoGrafo(o, REGISTRO_NOS)[2] ?? [];
  assert.equal(r.length, 2, "linha reta, sem degrau");
});

test("ligações da mesma porta dobram no mesmo ponto e não correm uma sobre a outra", () => {
  const g: Grafo = {
    v: 1,
    nos: [no("i", "gatilho.inicio", 0, 200), no("a", "dados.filtrar", 312, 0), no("b", "dados.ordenar", 624, 400)],
    conexoes: [con("i", "a"), con("i", "b")],
  };
  const [ra, rb] = rotasDoGrafo(g, REGISTRO_NOS);
  assert.equal(dobraDaRota(ra ?? [])?.x, dobraDaRota(rb ?? [])?.x, "a mesma dobra: uma sobe, outra desce");
});
