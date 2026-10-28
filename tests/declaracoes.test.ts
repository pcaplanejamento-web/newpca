import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { describe, it } from "node:test";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "../src/db/schema.ts";
import {
  blocosDeclaracao,
  conferirPedido,
  dataPorExtenso,
  type ItemDeclaravel,
  limparTextoDeclaracao,
  montarConteudo,
  rotuloNumero,
  saldoDe,
  seloDeclaracao,
  textoDeclaracao,
} from "../src/lib/declaracoes-core.ts";
import { comandoCancelarDeclaracao, comandosEmitirDeclaracao, consultaDeclarados, consultaUltimoNumero } from "../src/lib/declaracoes-sql.ts";
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
      processo: "123/2027",
      observacao: null,
      linhas,
      emitente: { nome: "Ana Souza", matricula: "1234", cargo: "Analista" },
    });
    assert.equal(c.valorTotal, 52.5);
    assert.equal(c.totalItens, 1);
    const t = textoDeclaracao(c);
    assert.match(t, /o item relacionado abaixo consta do Plano de Contratações Anual \(PCA\) 2027/);
    assert.match(t, /emissão de empenho complementar, no âmbito do processo nº 123\/2027\./);
    assert.match(t, /PARCIAL para 1 item/);
    assert.equal(rotuloNumero(7, 2026), "007/2026");
    assert.equal(dataPorExtenso("2026-10-28 15:00:00"), "28 de outubro de 2026");
    assert.equal(dataPorExtenso("2026-10-29 01:30:00"), "28 de outubro de 2026"); // 22h30 em Brasília
    const r = { codigo: "ABCD", ano: 2026, numero: 1, emitidoEm: "2026-10-28 15:00:00", conteudo: JSON.stringify(c) };
    assert.equal(await seloDeclaracao(r), await seloDeclaracao({ ...r }));
    assert.notEqual(await seloDeclaracao(r), await seloDeclaracao({ ...r, conteudo: r.conteudo.replace("52.5", "60") }));
    const blocos = blocosDeclaracao(c, { numero: 1, ano: 2026, codigo: "ABCD", selo: "x", emitidoEm: r.emitidoEm, urlVerificacao: "https://s/declaracao/verificar/ABCD", cancelada: null });
    assert.equal(blocos[0].tipo, "titulo");
    const cancel = blocosDeclaracao(c, { numero: 1, ano: 2026, codigo: "ABCD", selo: "x", emitidoEm: r.emitidoEm, urlVerificacao: "u", cancelada: { em: r.emitidoEm, por: "B", motivo: "erro" } });
    assert.equal(cancel[0].tipo, "nota");
    assert.equal(limparTextoDeclaracao("  a\u0007​  b  ", 10), "a b");
    assert.equal(limparTextoDeclaracao("   ", 10), null);
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
