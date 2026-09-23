import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  agruparHistorico,
  alteracaoDoItem,
  contarAlteracao,
  detalheDe,
  diffCampos,
  historicoDoItem,
  interpretarAlteracao,
  passaFiltroHistorico,
  semDuplicatas,
  ROTULO_ACAO,
  ROTULO_ENTIDADE,
  ROTULO_ORIGEM,
  resumoCurtoAlteracao,
  rotuloAlvo,
} from "../src/lib/auditoria-core.ts";

describe("auditoria-core", () => {
  it("diffCampos: só os campos que mudaram + resumo legível", () => {
    const r = diffCampos<{ quantidade: number; valorUnitario: number; descricao: string }>(
      { quantidade: 20, valorUnitario: 5.11, descricao: "A" },
      { quantidade: 35, valorUnitario: 5.11, descricao: "B" },
      ["quantidade", "valorUnitario", "descricao"],
      { quantidade: "Quantidade", descricao: "Descrição" },
    );
    assert.equal(r.mudou, true);
    assert.deepEqual(r.antes, { quantidade: 20, descricao: "A" });
    assert.deepEqual(r.depois, { quantidade: 35, descricao: "B" });
    assert.ok(r.resumo.includes("Quantidade: 20 → 35"), r.resumo);
    assert.ok(r.resumo.includes("Descrição: A → B"), r.resumo);
    assert.ok(!r.resumo.includes("valorUnitario"), "campo inalterado não entra no resumo");
  });

  it("diffCampos: nada mudou → mudou=false, resumo vazio", () => {
    const r = diffCampos({ a: 1 }, { a: 1 }, ["a"]);
    assert.equal(r.mudou, false);
    assert.equal(r.resumo, "");
    assert.deepEqual(r.antes, {});
  });

  it("diffCampos: null/vazio vira — no resumo", () => {
    const r = diffCampos<{ x: string | null }>({ x: null }, { x: "novo" }, ["x"]);
    assert.equal(r.mudou, true);
    assert.ok(r.resumo.includes("— → novo"), r.resumo);
  });

  it("rótulos de ação e entidade", () => {
    assert.equal(ROTULO_ACAO.editar, "Editou");
    assert.equal(ROTULO_ACAO.importar, "Importou");
    assert.equal(ROTULO_ENTIDADE.dfd, "DFD");
    assert.equal(ROTULO_ENTIDADE.reparticao, "Unidade");
  });

  it("origem: rótulo legível de cada canal", () => {
    assert.equal(ROTULO_ORIGEM.reenvio, "Reenvio do protocolo");
    assert.equal(ROTULO_ORIGEM.massa, "Edição em massa");
    assert.equal(ROTULO_ENTIDADE.situacao_protocolo, "Situação de protocolo");
  });
});

// Linha mínima do histórico (o que a consulta devolve).
const linha = (over: Record<string, unknown> = {}) => ({
  id: 1,
  usuarioId: 7,
  usuarioNome: "Ana",
  acao: "editar",
  entidade: "dfd",
  entidadeId: 10,
  resumo: null as string | null,
  antes: null as string | null,
  depois: null as string | null,
  origem: null as string | null,
  detalhe: null as string | null,
  protocoloId: 3 as number | null,
  protocoloNumero: "P-1/2026" as string | null,
  criadoEm: "2026-09-20 12:00:00" as string | null,
  ...over,
});

describe("histórico conectado — interpretação", () => {
  it("formato novo: detalhe estruturado (alvo, campos, seções, itens)", () => {
    const det = detalheDe({
      alvo: { numero: "531", planejamento: "600" },
      campos: [{ campo: "tipo", rotulo: "Tipo", antes: "DFD-S", depois: "DFD-R" }],
      itens: [{ tipo: "alterado", item: 3, codigo: "100", descricao: "CANETA", campos: [{ campo: "quantidade", rotulo: "Quantidade", antes: "20", depois: "35" }] }],
    });
    const a = interpretarAlteracao(linha({ detalhe: JSON.stringify(det) }));
    assert.deepEqual(a.alvo, { numero: "531", planejamento: "600" });
    assert.equal(a.campos[0].rotulo, "Tipo");
    assert.equal(a.itens[0].campos[0].depois, "35");
    assert.equal(alteracaoDoItem(a, { item: 3, codigo: null })?.item, 3);
    assert.equal(alteracaoDoItem(a, { item: 4, codigo: "100" }), null, "outro nº de item não casa");
  });
  it("detalheDe corta textos longos e limita itens; vazio ⇒ null", () => {
    const longo = "x".repeat(5000);
    const d = detalheDe({ secoes: [{ campo: "s", rotulo: "Justificativa", antes: longo, depois: "curto" }] });
    assert.ok((d?.secoes?.[0].antes.length ?? 0) <= 1500);
    assert.equal(detalheDe({}), null);
    const muitos = Array.from({ length: 450 }, (_, i) => ({ tipo: "novo" as const, item: i, codigo: null, descricao: null, campos: [] }));
    const m = detalheDe({ itens: muitos });
    assert.equal(m?.itens?.length, 400);
    assert.ok(m?.obs?.[0].includes("50"), m?.obs?.[0]);
  });
  it("legado: antes/depois por chave viram campos com rótulo e R$", () => {
    const a = interpretarAlteracao(
      linha({ entidade: "protocolo", antes: JSON.stringify({ valorCapa: 100, assunto: "A" }), depois: JSON.stringify({ valorCapa: 150.5, assunto: "B" }) }),
    );
    const capa = a.campos.find((c) => c.campo === "valorCapa");
    assert.equal(capa?.rotulo, "Valor da capa");
    assert.equal(capa?.antes, "R$ 100,00");
    assert.equal(capa?.depois, "R$ 150,50");
  });
  it("legado da massa de itens (antes.itens × depois.itens) e do 'Salvar' (resumo)", () => {
    const massa = interpretarAlteracao(
      linha({
        antes: JSON.stringify({ itens: [{ item: 2, codigo: "200", quantidade: 5 }, { item: 4, codigo: "400", descricao: "X" }] }),
        depois: JSON.stringify({ itens: [{ item: 2, codigo: "200", quantidade: 8 }, { item: 4, removido: true }] }),
      }),
    );
    assert.equal(massa.itens.length, 2);
    assert.equal(massa.itens[0].campos[0].depois, "8");
    assert.equal(massa.itens[1].tipo, "removido");
    const salvar = interpretarAlteracao(
      linha({ resumo: "DFD 531: Item 3: quantidade: 20 → 35; valor total: 100 → 175 · Item 5: descrição alterada" }),
    );
    assert.deepEqual(salvar.alvo, { numero: "531", planejamento: null });
    assert.deepEqual(salvar.itens.map((i) => i.item), [3, 5]);
    assert.equal(salvar.itens[0].campos[1].depois, "175");
    assert.equal(alteracaoDoItem(salvar, { item: 5, codigo: null })?.campos[0].rotulo, "Descrição");
  });
  it("agrupa em UM evento as linhas do mesmo usuário/origem/protocolo feitas juntas", () => {
    const g = agruparHistorico([
      linha({ id: 9, origem: "banner", criadoEm: "2026-09-20 12:00:40" }),
      linha({ id: 8, origem: "banner", criadoEm: "2026-09-20 12:00:05" }),
      linha({ id: 7, origem: "massa", criadoEm: "2026-09-20 11:59:00" }),
      linha({ id: 6, origem: "massa", criadoEm: "2026-09-20 10:00:00" }), // mesma origem, mas longe no tempo
      linha({ id: 5, origem: null, criadoEm: "2026-09-20 09:59:59" }),
    ]);
    assert.deepEqual(g.map((x) => x.map((l) => l.id)), [[9, 8], [7], [6], [5]]);
  });
});

describe("histórico — exibição (resumo, alvo, filtro e histórico do item)", () => {
  const itemAlt = (tipo: "novo" | "removido" | "alterado", item: number) => ({ tipo, item, codigo: `${item}00`, descricao: null, campos: [] });
  it("resumo curto e contagem do que mudou", () => {
    const a = interpretarAlteracao(
      linha({
        detalhe: JSON.stringify({
          campos: [
            { campo: "a", rotulo: "Assunto", antes: "X", depois: "Y" },
            { campo: "b", rotulo: "Valor da capa", antes: "1", depois: "2" },
            { campo: "c", rotulo: "Unidade", antes: "1", depois: "2" },
            { campo: "d", rotulo: "Responsável", antes: "—", depois: "Ana" },
          ],
          secoes: [{ campo: "s", rotulo: "Justificativa", antes: "a", depois: "b" }],
          itens: [itemAlt("novo", 1), itemAlt("alterado", 2), itemAlt("alterado", 3)],
        }),
      }),
    );
    assert.equal(contarAlteracao(a).total, 8);
    assert.deepEqual(contarAlteracao(a).itens, { novo: 1, removido: 0, alterado: 2 });
    assert.equal(resumoCurtoAlteracao(a), "Assunto, Valor da capa, Unidade +1 · 1 seção · 3 itens (1 novo, 2 alterados)");
    const soItem = interpretarAlteracao(linha({ detalhe: JSON.stringify({ itens: [itemAlt("removido", 4)] }) }));
    assert.equal(resumoCurtoAlteracao(soItem), "1 item removido");
    assert.equal(resumoCurtoAlteracao(interpretarAlteracao(linha({}))), "", "sem detalhe ⇒ vazio (usa o resumo)");
  });
  it("rótulo do alvo: DFD com planejamento, protocolo pelo nº atual ou pelo resumo, demais entidades", () => {
    const dfd = linha({ detalhe: JSON.stringify({ alvo: { numero: "1525", planejamento: "1549" } }) });
    assert.equal(rotuloAlvo(dfd, interpretarAlteracao(dfd)), "DFD 1525 · Planej. 1549");
    const p = linha({ entidade: "protocolo", entidadeId: 3, protocoloId: 3, protocoloNumero: "P-1/2026" });
    assert.equal(rotuloAlvo(p, interpretarAlteracao(p)), "Protocolo P-1/2026");
    const legado = linha({ entidade: "protocolo", entidadeId: 8, protocoloId: null, protocoloNumero: null, resumo: "Protocolo 2025/77: Assunto" });
    assert.equal(rotuloAlvo(legado, interpretarAlteracao(legado)), "Protocolo 2025/77");
    const u = linha({ entidade: "reparticao", entidadeId: 4 });
    assert.equal(rotuloAlvo(u, interpretarAlteracao(u)), "Unidade #4");
  });
  it("filtro do histórico do protocolo: capa × DFDs × itens", () => {
    const capa = linha({ entidade: "protocolo" });
    const dfd = linha({ detalhe: JSON.stringify({ campos: [{ campo: "t", rotulo: "Tipo", antes: "a", depois: "b" }] }) });
    const itens = linha({ detalhe: JSON.stringify({ itens: [itemAlt("alterado", 2)] }) });
    const ok = (l: ReturnType<typeof linha>, f: "tudo" | "capa" | "dfds" | "itens") => passaFiltroHistorico(l, interpretarAlteracao(l), f);
    assert.deepEqual([ok(capa, "capa"), ok(dfd, "capa"), ok(itens, "capa")], [true, false, false]);
    assert.deepEqual([ok(capa, "dfds"), ok(dfd, "dfds"), ok(itens, "dfds")], [false, true, true]);
    assert.deepEqual([ok(capa, "itens"), ok(dfd, "itens"), ok(itens, "itens")], [false, false, true]);
    assert.ok(ok(capa, "tudo") && ok(dfd, "tudo"));
  });
  it("histórico do ITEM: só o que o tocou + a importação por onde entrou", () => {
    const linhas = [
      // edição no banner: item 2 alterado, item 5 não
      linha({ id: 6, detalhe: JSON.stringify({ itens: [{ ...itemAlt("alterado", 2), campos: [{ campo: "q", rotulo: "Quantidade", antes: "1", depois: "2" }] }] }) }),
      // sobrescrita (reenvio) sem mexer nos itens → fora
      linha({ id: 5, acao: "importar", origem: "reenvio", detalhe: JSON.stringify({ alvo: { numero: "1" }, campos: [{ campo: "t", rotulo: "Tipo", antes: "a", depois: "b" }] }) }),
      // sobrescrita em lotes (sem o detalhe por item) → entra como regravação
      linha({ id: 4, acao: "importar", detalhe: JSON.stringify({ alvo: { numero: "1" }, obs: ["Itens regravados em lotes (900 itens) — sem o detalhe por item."] }) }),
      // outra entidade → fora
      linha({ id: 3, entidade: "protocolo", acao: "editar" }),
      // importação (criação) do DFD → a entrada do item
      linha({ id: 2, acao: "importar", origem: "protocolacao", depois: JSON.stringify({ numero: "1" }), detalhe: JSON.stringify({ alvo: { numero: "1" } }) }),
      // legado (sem detalhe) → entra
      linha({ id: 1, acao: "importar", resumo: "DFD 1 importado — 3 itens" }),
    ];
    const h = historicoDoItem(linhas, { item: 2, codigo: "200" });
    assert.deepEqual(h.map((e) => e.linha.id), [6, 4, 2, 1]);
    assert.equal(h[0].item?.campos[0].depois, "2");
    assert.equal(h[1].item, null);
    assert.deepEqual(historicoDoItem(linhas, { item: 5, codigo: "500" }).map((e) => e.linha.id), [4, 2, 1], "item sem alteração: só as importações");
  });
  it("histórico do ITEM para onde ele ENTROU (novo) — o que vem antes é de outro item com o mesmo nº", () => {
    const linhas = [
      linha({ id: 9, acao: "importar", origem: "reenvio", detalhe: JSON.stringify({ alvo: { numero: "1" }, itens: [{ tipo: "novo", item: 7, codigo: "700", descricao: null, campos: [] }] }) }),
      linha({ id: 5, acao: "importar", origem: "reenvio", detalhe: JSON.stringify({ alvo: { numero: "1" }, itens: [{ tipo: "removido", item: 7, codigo: "999", descricao: null, campos: [] }] }) }),
      linha({ id: 4, detalhe: JSON.stringify({ itens: [{ ...itemAlt("alterado", 7), codigo: "999" }] }) }),
      linha({ id: 1, acao: "importar", depois: JSON.stringify({ numero: "1" }), detalhe: JSON.stringify({ alvo: { numero: "1" } }) }),
    ];
    assert.deepEqual(historicoDoItem(linhas, { item: 7, codigo: "700" }).map((e) => [e.linha.id, e.item?.tipo ?? null]), [[9, "novo"]]);
  });
  it("legado de vínculo ('DFD vinculado ao protocolo #3') não vira alvo 'DFD vinculado'", () => {
    const l = linha({ entidadeId: 42, resumo: "DFD vinculado ao protocolo #3" });
    assert.equal(rotuloAlvo(l, interpretarAlteracao(l)), "DFD #42");
  });
  it("detalheDe corta descrição e observações; itens além do teto ficam 'sem o detalhe por item'", () => {
    const d = detalheDe({
      itens: Array.from({ length: 450 }, (_, i) => ({ tipo: "alterado" as const, item: i + 1, codigo: null, descricao: "D".repeat(5000), campos: [] })),
      obs: ["O".repeat(5000)],
    });
    assert.ok((d?.itens?.[0].descricao?.length ?? 0) <= 500);
    assert.ok((d?.obs?.[0].length ?? 0) <= 500);
    assert.ok(JSON.stringify(d).length <= 400_000, "JSON dentro do teto");
    const nota = d?.obs?.find((o) => o.includes("sem o detalhe por item")) ?? "";
    assert.ok(nota.includes("mais"), nota);
    // O item além do teto ainda tem a linha no seu histórico (regravação sem o detalhe).
    const h = historicoDoItem([linha({ id: 3, acao: "importar", detalhe: JSON.stringify(d) })], { item: 450, codigo: null });
    assert.deepEqual(h.map((e) => e.linha.id), [3]);
  });
  it("detalheDe: textos enormes em MUITOS itens — os itens caem pela metade até caber no teto", () => {
    const campo = { campo: "descricao", rotulo: "Descrição", antes: "A".repeat(1500), depois: "B".repeat(1500) };
    const d = detalheDe({ itens: Array.from({ length: 400 }, (_, i) => ({ tipo: "alterado" as const, item: i + 1, codigo: null, descricao: null, campos: [campo, campo] })) });
    assert.ok(JSON.stringify(d).length <= 400_000);
    assert.ok((d?.itens?.length ?? 0) < 400 && (d?.itens?.length ?? 0) > 0);
  });
  it("semDuplicatas: o mesmo evento logado para os DOIS protocolos (DFD movido) vira UMA linha", () => {
    const det = JSON.stringify({ campos: [{ campo: "protocolo", rotulo: "Protocolo", antes: "A", depois: "B" }] });
    const r = semDuplicatas([
      linha({ id: 8, origem: "vinculo", resumo: "DFD 1: protocolo A → B", detalhe: det, protocoloId: 2, criadoEm: "2026-09-20 12:00:01" }),
      linha({ id: 7, origem: "vinculo", resumo: "DFD 1: protocolo A → B", detalhe: det, protocoloId: 1, criadoEm: "2026-09-20 12:00:00" }),
      linha({ id: 6, origem: "vinculo", resumo: "DFD 1: protocolo A → B", detalhe: det, protocoloId: 1, criadoEm: "2026-09-20 11:00:00" }),
    ]);
    assert.deepEqual(r.map((l) => l.id), [8, 6], "igual e junto = 1; igual mas em outro momento = outro evento");
  });
});
