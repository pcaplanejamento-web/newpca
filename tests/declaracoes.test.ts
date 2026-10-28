import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { describe, it } from "node:test";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "../src/db/schema.ts";
import {
  acessoDeclaracoes,
  blocosDeclaracao,
  coerceModoDeclaracoes,
  conferirPedido,
  dataPorExtenso,
  type ItemDeclaravel,
  itensParaEdicao,
  lerProtocoloCenti,
  limparObservacao,
  limparTextoDeclaracao,
  montarConteudo,
  remanescente,
  rotuloNumero,
  saldoDe,
  seloDeclaracao,
  textoDeclaracao,
} from "../src/lib/declaracoes-core.ts";
import {
  comandoCancelarDeclaracao,
  comandoExportarDeclaracao,
  comandosEditarDeclaracao,
  comandosEmitirDeclaracao,
  consultaDeclarados,
  consultaUltimoNumero,
} from "../src/lib/declaracoes-sql.ts";
import { brl } from "../src/lib/format.ts";
import { d1Sobre } from "./fixtures/d1-sqlite.ts";

// DECLARAÇÕES DO PCA: saldo, declaração parcial, conteúdo/texto/selo e o lote no driver `drizzle-orm/d1` REAL (o gatilho
// do saldo barra além dele, atômico; cancelar devolve o saldo).

const item = (sequencial: number, quantidade: number | null, declarado = 0, vu = 10): ItemDeclaravel => ({
  sequencial,
  codigo: `00${sequencial}`,
  descricao: `Item ${sequencial}`,
  unidade: "UNIDADE",
  quantidade,
  valorUnitario: vu,
  sigla: "SEMAD",
  dfdId: 1,
  dfdNumero: "1209",
  planejamento: "1509",
  tipoDfd: "DFD-O",
  protocoloNumero: "144756/2026",
  itemNumero: sequencial,
  declarado,
});

describe("declarações do PCA — núcleo", () => {
  it("saldo = quantidade − declarado (nunca negativo)", () => {
    assert.equal(saldoDe(item(1, 12)), 12);
    assert.equal(saldoDe(item(1, 12, 6)), 6);
    assert.equal(saldoDe(item(1, 12, 15)), 0);
    assert.equal(saldoDe(item(1, null)), 0);
    assert.equal(saldoDe(item(1, 0.3, 0.1)), 0.2);
  });

  it("parcial (6 de 12), além do saldo, repetido, fora do PCA e sem quantidade", () => {
    const itens = [item(1, 12), item(2, 5, 5), item(3, null), item(4, 2, 0.5)];
    const ok = conferirPedido([{ sequencial: 1, quantidade: 6 }, { sequencial: 4, quantidade: 1.5 }], itens);
    assert.deepEqual(ok.erros, []);
    assert.equal(ok.linhas[0].parcial, true);
    assert.equal(ok.linhas[0].valorTotal, 60);
    assert.equal(ok.linhas[1].parcial, true); // 1,5 de 2 (o saldo inteiro, mas menor que o item)
    const r = conferirPedido(
      [
        { sequencial: 2, quantidade: 1 },
        { sequencial: 3, quantidade: 1 },
        { sequencial: 9, quantidade: 1 },
        { sequencial: 1, quantidade: 0 },
        { sequencial: 1, quantidade: 2 },
      ],
      itens,
    );
    assert.equal(r.linhas.length, 0);
    assert.match(r.erros[0], /passa do saldo/);
    assert.match(r.erros[1], /sem quantidade/);
    assert.match(r.erros[2], /não está/);
    assert.match(r.erros[3], /maior que zero/);
    assert.match(r.erros[4], /repetido/);
    assert.deepEqual(conferirPedido([], itens).erros, ["Escolha ao menos um item."]);
    assert.equal(conferirPedido([{ sequencial: 1, quantidade: 12 }], itens).linhas[0].parcial, false);
  });

  it("conteúdo, texto, número, selo determinístico e o PDF", async () => {
    const { linhas } = conferirPedido([{ sequencial: 1, quantidade: 6 }], [item(1, 12, 0, 8.75)]);
    const c = montarConteudo({
      pca: { id: 3, nome: "PCA 2027", ano: 2027 },
      finalidade: "empenho_complementar",
      finalidadeTexto: null,
      protocoloCenti: "156844/2026",
      processo: "123/2027",
      observacao: null,
      linhas,
      emitente: { nome: "Ana Souza", matricula: "1234", cargo: "Analista" },
    });
    assert.equal(c.valorTotal, 52.5);
    assert.equal(c.totalItens, 1);
    const t = textoDeclaracao(c);
    assert.match(t, /o item relacionado abaixo consta do Plano de Contratações Anual \(PCA\) 2027/);
    assert.match(t, /emissão de empenho complementar, vinculada ao protocolo nº 156844\/2026 do sistema Centi, no âmbito do processo ou empenho nº 123\/2027\./);
    assert.match(t, /PARCIAL para 1 item/);
    assert.equal(rotuloNumero(7, 2026), "007/2026");
    assert.equal(dataPorExtenso("2026-10-28 15:00:00"), "28 de outubro de 2026");
    assert.equal(dataPorExtenso("2026-10-29 01:30:00"), "28 de outubro de 2026"); // 22h30 em Brasília
    const r = { codigo: "ABCD", ano: 2026, numero: 1, emitidoEm: "2026-10-28 15:00:00", conteudo: JSON.stringify(c) };
    assert.equal(await seloDeclaracao(r), await seloDeclaracao({ ...r }));
    assert.notEqual(await seloDeclaracao(r), await seloDeclaracao({ ...r, conteudo: r.conteudo.replace("52.5", "60") }));
    const blocos = blocosDeclaracao(c, { numero: 1, ano: 2026, codigo: "ABCD", selo: "x", emitidoEm: r.emitidoEm, urlVerificacao: "https://s/declaracao/verificar/ABCD", cancelada: null, previa: false });
    assert.equal(blocos[0].tipo, "titulo");
    assert.equal(blocos[0].tipo === "titulo" && blocos[0].alinhar, "centro");
    assert.ok(blocos.some((b) => b.tipo === "paragrafo" && b.texto === "Assinado e datado digitalmente."));
    // Títulos das colunas por EXTENSO (nada abreviado) e os dados de cada item: origem, previsto, já declarado, remanescente.
    const tabelas = blocos.filter((b) => b.tipo === "tabela");
    assert.equal(tabelas.length, 4);
    for (const tb of tabelas) for (const col of tb.tipo === "tabela" ? tb.colunas : []) assert.doesNotMatch(col.titulo, /\.|Qtd|Vlr|Seq/, col.titulo);
    const quant = tabelas[2].tipo === "tabela" ? tabelas[2] : null;
    assert.deepEqual(quant?.linhas[0].celulas.slice(2), ["12", "0", "6 (parcial)", "6"]);
    const valores = tabelas[3].tipo === "tabela" ? tabelas[3] : null;
    assert.equal(valores?.linhas[1].celulas[4], brl(52.5)); // o valor remanescente (TOTAL)
    const ident = tabelas[0].tipo === "tabela" ? tabelas[0] : null;
    assert.ok(ident?.linhas.some((l) => l.celulas[0] === "Protocolo vinculado (Centi)" && l.celulas[1] === "156844/2026"));
    const previa = blocosDeclaracao(c, { numero: 1, ano: 2026, codigo: "ABCD", selo: "x", emitidoEm: r.emitidoEm, urlVerificacao: "u", cancelada: null, previa: true });
    assert.equal(previa[0].tipo === "nota" && /PRÉVIA/.test(previa[0].texto), true);
    const cancel = blocosDeclaracao(c, { numero: 1, ano: 2026, codigo: "ABCD", selo: "x", emitidoEm: r.emitidoEm, urlVerificacao: "u", cancelada: { em: r.emitidoEm, por: "B", motivo: "erro" }, previa: false });
    assert.equal(cancel[0].tipo, "nota");
    assert.equal(limparTextoDeclaracao("  a\u0007​  b  ", 10), "a b");
    assert.equal(limparTextoDeclaracao("   ", 10), null);
  });

  it("protocolo da Centi e o remanescente (retrato antigo sem o já declarado = sem remanescente)", () => {
    assert.equal(lerProtocoloCenti(" 0156844 / 2026 "), "156844/2026");
    assert.equal(lerProtocoloCenti("156844"), "156844");
    for (const v of ["", "0", "abc", "156844/26", "1/2/3", null]) assert.equal(lerProtocoloCenti(v), null, String(v));
    assert.equal(remanescente({ quantidadePca: 12, quantidadeAntes: 4, quantidade: 6 }), 2);
    assert.equal(remanescente({ quantidadePca: 12, quantidade: 6 }), null);
    assert.equal(conferirPedido([{ sequencial: 1, quantidade: 2 }], [item(1, 12, 4)]).linhas[0].quantidadeAntes, 4);
  });

  it("observação formatada (guarda as linhas) e o saldo da EDIÇÃO sem a própria declaração", () => {
    assert.equal(limparObservacao("**Atenção**\r\n\n\n\n- item\u0007 um  "), "**Atenção**\n\n- item um");
    assert.equal(limparObservacao("  \n "), null);
    const itens = [item(1, 12, 10), item(2, 5, 0)];
    const ed = itensParaEdicao(itens, [{ sequencial: 1, quantidade: 6 }]);
    assert.equal(saldoDe(ed[0]), 8); // 12 − (10 − 6): o que ela mesma declarava volta ao saldo dela
    assert.equal(ed[1], itens[1]);
    assert.deepEqual(conferirPedido([{ sequencial: 1, quantidade: 8 }], ed).erros, []);
    assert.match(conferirPedido([{ sequencial: 1, quantidade: 9 }], ed).erros[0], /passa do saldo/);
  });
});

describe("declarações do PCA — no D1", () => {
  function banco() {
    const db = new DatabaseSync(":memory:");
    const dir = join(process.cwd(), "drizzle");
    for (const arq of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) db.exec(readFileSync(join(dir, arq), "utf8"));
    db.exec(`INSERT INTO pcas (id, nome, ano) VALUES (1, 'PCA 2027', 2027)`);
    return { db, orm: drizzle(d1Sobre(db) as never, { schema }) };
  }
  const nova = (codigo: string, numero: number, itens: { sequencial: number; quantidade: number; quantidadePca: number }[]) => ({
    pcaId: 1,
    ano: 2026,
    numero,
    codigo,
    finalidade: "inicio",
    processo: null,
    protocoloCenti: null,
    observacao: null,
    conteudo: "{}",
    selo: "s",
    totalItens: itens.length,
    valorTotal: 0,
    emitidoPor: null,
    emitidoPorNome: "Ana",
    emitidoEm: "2026-10-28 12:00:00",
    itens,
  });

  it("grava em lote (muitos itens), soma o declarado e barra além do saldo — atômico", async () => {
    const { db, orm } = banco();
    const muitos = Array.from({ length: 40 }, (_, i) => ({ sequencial: i + 1, quantidade: 6, quantidadePca: 12 }));
    await orm.batch(comandosEmitirDeclaracao(orm, nova("C1", 1, muitos)));
    assert.equal((await consultaDeclarados(orm, 1)).find((r) => r.sequencial === 1)?.total, 6);
    // 6 + 7 > 12: recusa e NADA da segunda declaração fica (nem o cabeçalho, nem o item 41 que caberia)
    await assert.rejects(
      orm.batch(comandosEmitirDeclaracao(orm, nova("C2", 2, [{ sequencial: 41, quantidade: 1, quantidadePca: 5 }, { sequencial: 1, quantidade: 7, quantidadePca: 12 }]))),
      /saldo_insuficiente/,
    );
    assert.equal((db.prepare("SELECT COUNT(*) AS n FROM declaracoes").get() as { n: number }).n, 1);
    assert.equal((db.prepare("SELECT COUNT(*) AS n FROM declaracao_itens WHERE sequencial = 41").get() as { n: number }).n, 0);
    // exatamente o saldo cabe
    await orm.batch(comandosEmitirDeclaracao(orm, nova("C3", 2, [{ sequencial: 1, quantidade: 6, quantidadePca: 12 }])));
    assert.equal((await consultaDeclarados(orm, 1)).find((r) => r.sequencial === 1)?.total, 12);
    assert.equal((await consultaUltimoNumero(orm, 2026))[0].n, 2);
    // número repetido no ano = recusado pelo índice
    await assert.rejects(orm.batch(comandosEmitirDeclaracao(orm, nova("C4", 2, [{ sequencial: 2, quantidade: 1, quantidadePca: 12 }]))), /UNIQUE/);
  });

  it("cancelar devolve o saldo (uma vez só)", async () => {
    const { orm } = banco();
    await orm.batch(comandosEmitirDeclaracao(orm, nova("C1", 1, [{ sequencial: 1, quantidade: 12, quantidadePca: 12 }])));
    await assert.rejects(orm.batch(comandosEmitirDeclaracao(orm, nova("C2", 2, [{ sequencial: 1, quantidade: 1, quantidadePca: 12 }]))), /saldo_insuficiente/);
    assert.equal((await comandoCancelarDeclaracao(orm, 1, "Bia", "emitida por engano")).length, 1);
    assert.equal((await comandoCancelarDeclaracao(orm, 1, "Bia", "de novo")).length, 0);
    assert.equal((await consultaDeclarados(orm, 1)).length, 0);
    await orm.batch(comandosEmitirDeclaracao(orm, nova("C2", 2, [{ sequencial: 1, quantidade: 12, quantidadePca: 12 }])));
  });
});

describe("declarações do PCA — editar e exportar no D1", () => {
  function banco() {
    const db = new DatabaseSync(":memory:");
    const dir = join(process.cwd(), "drizzle");
    for (const arq of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) db.exec(readFileSync(join(dir, arq), "utf8"));
    db.exec(`INSERT INTO pcas (id, nome, ano) VALUES (1, 'PCA 2027', 2027)`);
    return { db, orm: drizzle(d1Sobre(db) as never, { schema }) };
  }
  type Orm = Parameters<typeof comandosEditarDeclaracao>[0];
  const emitir = (orm: Orm, codigo: string, numero: number, itens: { sequencial: number; quantidade: number; quantidadePca: number }[]) =>
    comandosEmitirDeclaracao(orm, {
      pcaId: 1, ano: 2026, numero, codigo, finalidade: "inicio", processo: null, protocoloCenti: null, observacao: null, conteudo: "{}", selo: "s",
      totalItens: itens.length, valorTotal: 0, emitidoPor: null, emitidoPorNome: "Ana", emitidoEm: "2026-10-28 12:00:00", itens,
    });
  const editar = (orm: Orm, id: number, itens: { sequencial: number; quantidade: number; quantidadePca: number }[]) =>
    comandosEditarDeclaracao(orm, { id, pcaId: 1, finalidade: "aditivo", processo: "9", protocoloCenti: "77/2026", observacao: "obs", conteudo: `{"e":${id}}`, selo: "s2", totalItens: itens.length, valorTotal: 1, editadaPorNome: "Bia", itens });

  it("edita (troca os itens, o saldo conta sem os dela), barra além do saldo e trava depois de exportar", async () => {
    const { db, orm } = banco();
    await orm.batch(emitir(orm, "C1", 1, [{ sequencial: 1, quantidade: 6, quantidadePca: 12 }]));
    await orm.batch(editar(orm, 1, [{ sequencial: 1, quantidade: 12, quantidadePca: 12 }, { sequencial: 2, quantidade: 3, quantidadePca: 5 }]));
    const r = db.prepare("SELECT finalidade, editada_por_nome AS por, total_itens AS n FROM declaracoes WHERE id = 1").get() as { finalidade: string; por: string; n: number };
    assert.deepEqual({ ...r }, { finalidade: "aditivo", por: "Bia", n: 2 });
    assert.equal((await consultaDeclarados(orm, 1)).find((x) => x.sequencial === 1)?.total, 12);
    // além do saldo: o lote inteiro volta (os itens ficam os de antes)
    await assert.rejects(orm.batch(editar(orm, 1, [{ sequencial: 1, quantidade: 13, quantidadePca: 12 }])), /saldo_insuficiente/);
    assert.equal((db.prepare("SELECT COUNT(*) AS n FROM declaracao_itens WHERE declaracao_id = 1").get() as { n: number }).n, 2);
    // exportar: uma vez; depois, editar é recusado pelo gatilho e nada muda
    assert.equal((await comandoExportarDeclaracao(orm, 1, "Bia")).length, 1);
    assert.equal((await comandoExportarDeclaracao(orm, 1, "Bia")).length, 0);
    await assert.rejects(orm.batch(editar(orm, 1, [{ sequencial: 1, quantidade: 1, quantidadePca: 12 }])), /declaracao_travada/);
    assert.equal((await consultaDeclarados(orm, 1)).find((x) => x.sequencial === 1)?.total, 12);
    // cancelada: não exporta nem edita
    await orm.batch(emitir(orm, "C2", 2, [{ sequencial: 3, quantidade: 1, quantidadePca: 2 }]));
    await comandoCancelarDeclaracao(orm, 2, "Bia", "engano");
    assert.equal((await comandoExportarDeclaracao(orm, 2, "Bia")).length, 0);
    await assert.rejects(orm.batch(editar(orm, 2, [{ sequencial: 3, quantidade: 1, quantidadePca: 2 }])), /declaracao_travada/);
  });
});

it("modo do PCA: quem emite (todos · só ADM · desligado)", () => {
  assert.equal(acessoDeclaracoes("todos", false), "total");
  assert.equal(acessoDeclaracoes("adm", false), "nenhum");
  assert.equal(acessoDeclaracoes("adm", true), "total");
  assert.equal(acessoDeclaracoes("desligado", false), "nenhum");
  assert.equal(acessoDeclaracoes("desligado", true), "leitura");
  assert.equal(coerceModoDeclaracoes("qualquer"), "todos");
  assert.equal(coerceModoDeclaracoes("adm"), "adm");
});
