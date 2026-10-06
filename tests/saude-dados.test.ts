import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { describe, it } from "node:test";
import { regrasPadrao } from "../src/lib/avaliacao-core.ts";
import { avaliarSaude, type ChaveSaude, type SaudeDados } from "../src/lib/saude-dados-core.ts";
import { type ContagensSaude, consultarSaude, type EntradaSaude } from "../src/lib/saude-dados-sql.ts";
import { d1Sobre } from "./fixtures/d1-sqlite.ts";

// SAÚDE DOS DADOS: as consultas no D1 mínimo sobre `node:sqlite` (a cadeia de migrações aplicada) + a classificação pura.
// Cada cenário parte de um banco CORRETO e acrescenta UM defeito. Requer --experimental-sqlite.

const DIR = join(process.cwd(), "drizzle");
const AGORA = new Date("2026-10-06T12:00:00Z");
const link = (p: { id: number; pcaId?: number | null }) => (p.pcaId ? `pca:${p.pcaId}:protocolo:${p.id}` : `protocolo:${p.id}`);

/** Um banco com UM protocolo correto: capa = DFD = Σ itens (100 + 200), incorporado ao PCA com a numeração certa. */
function banco(): DatabaseSync {
  const db = new DatabaseSync(":memory:");
  for (const arq of readdirSync(DIR).filter((f) => f.endsWith(".sql")).sort()) db.exec(readFileSync(join(DIR, arq), "utf8"));
  db.exec(`
    INSERT INTO pcas (id, nome, ano, fonte) VALUES (1, 'PCA 2026', 2026, 'protocolo');
    INSERT INTO dfd_protocolos (id, numero, assunto, valor_capa, id_externo, pca_id, pca_incorporado_em)
      VALUES (1, '100/2026', 'INCLUSÃO DE DEMANDA', 300, 'A1', 1, '2026-10-01 10:00:00');
    INSERT INTO dfds (id, numero, planejamento, protocolo_id, total_itens, valor_total) VALUES (1, '1', '11', 1, 2, 300);
    INSERT INTO dfd_itens (id, dfd_id, valor_unitario, valor_total, pca_id, pca_sequencial) VALUES (1, 1, 100, 100, 1, 1), (2, 1, 200, 200, 1, 2);
    INSERT INTO pca_dfds (pca_id, dfd_id, acao, protocolo_id) VALUES (1, 1, 'incorporar', 1);
    INSERT INTO pca_itens (pca_id, sequencial, dfd_item_id, dfd_id, protocolo_id, ativo) VALUES (1, 1, 1, 1, 1, 1), (1, 2, 2, 1, 1, 1);
  `);
  return db;
}

/** Um protocolo com UM DFD e itens (valor unitário, total). */
function protocolo(db: DatabaseSync, id: number, capa: number | null, itens: Array<[number | null, number | null]>, assunto = "INCLUSÃO DE DEMANDA") {
  db.prepare("INSERT INTO dfd_protocolos (id, numero, assunto, valor_capa) VALUES (?, ?, ?, ?)").run(id, `${id}00/2026`, assunto, capa);
  const soma = itens.reduce((s, [, t]) => s + (t ?? 0), 0);
  db.prepare("INSERT INTO dfds (id, numero, planejamento, protocolo_id, total_itens, valor_total) VALUES (?, ?, ?, ?, ?, ?)").run(
    id,
    String(id),
    `${id}${id}`,
    id,
    itens.length,
    soma > 0 ? soma : null,
  );
  for (const [vu, t] of itens) db.prepare("INSERT INTO dfd_itens (dfd_id, valor_unitario, valor_total) VALUES (?, ?, ?)").run(id, vu, t);
}

async function verificar(db: DatabaseSync, regras = regrasPadrao()): Promise<SaudeDados> {
  return avaliarSaude(await consultarSaude(d1Sobre(db)), regras, link, AGORA);
}
const ver = (s: SaudeDados, chave: ChaveSaude) => {
  const v = s.verificacoes.find((x) => x.chave === chave);
  assert.ok(v, `verificação ${chave}`);
  return v;
};
/** O `brl` separa "R$" do número com espaço RÍGIDO (U+00A0): os textos comparam com espaço comum. */
const txt = (t: string) => t.replace(/\u00a0/g, " ");
const totais = (s: SaudeDados) => Object.fromEntries(s.verificacoes.map((v) => [v.chave, v.total]));
const TUDO_ZERO = { "dfd-itens": 0, abas: 0, pca: 0, rastro: 0, incompleta: 0, capa: 0, "sem-valor": 0, "sem-planejamento": 0 };

describe("saúde dos dados — consultas no D1 + classificação", () => {
  it("banco correto: todas as verificações zeradas e verdes, com as contagens", async () => {
    const s = await verificar(banco());
    assert.deepEqual(totais(s), TUDO_ZERO);
    assert.ok(s.verificacoes.every((v) => v.nivel === "ok" && v.linhas.length === 0));
    assert.deepEqual(s.contagens, { protocolos: 1, dfds: 1, itens: 2, numerosPca: 2 });
    assert.equal(s.verificadoEm, AGORA.toISOString());
  });

  it("DFD com valor diferente dos itens = integridade (vermelho), sem repetir o protocolo nas abas", async () => {
    const db = banco();
    protocolo(db, 5, 999, [[100, 100]]);
    db.exec("UPDATE dfds SET valor_total = 999 WHERE id = 5");
    const s = await verificar(db);
    const v = ver(s, "dfd-itens");
    assert.equal(v.total, 1);
    assert.equal(v.nivel, "alerta");
    assert.equal(txt(v.linhas[0].problema), "valor R$ 999,00 × itens R$ 100,00");
    assert.equal(v.linhas[0].href, "protocolo:5");
    assert.equal(ver(s, "abas").total, 0);
    assert.equal(ver(s, "capa").total, 0); // a capa bate com o valor gravado do DFD (999)
  });

  it("DFD com nº de itens diferente do gravado = integridade", async () => {
    const db = banco();
    protocolo(db, 5, 100, [[100, 100]]);
    db.exec("UPDATE dfds SET total_itens = 0 WHERE id = 5");
    const v = ver(await verificar(db), "dfd-itens");
    assert.equal(v.total, 1);
    assert.match(v.linhas[0].problema, /1 itens gravados × 0 no DFD/);
  });

  it("gravação pela metade = dado a tratar (âmbar), fora da integridade, da capa e das abas", async () => {
    const db = banco();
    protocolo(db, 6, 300, [[100, 100]]);
    db.exec("UPDATE dfds SET total_itens = 3, valor_total = 300 WHERE id = 6");
    const s = await verificar(db);
    const v = ver(s, "incompleta");
    assert.equal(v.total, 1);
    assert.equal(v.nivel, "atencao");
    assert.equal(v.linhas[0].problema, "1 de 3 itens gravados");
    assert.equal(ver(s, "dfd-itens").total, 0);
    assert.equal(ver(s, "abas").total, 0);
    assert.equal(ver(s, "capa").total, 0);
  });

  it("capa: vazia, zerada e 1 centavo divergem; menos de 1 centavo bate (a régua da Mesa)", async () => {
    const db = banco();
    protocolo(db, 2, null, [[50, 50]]);
    protocolo(db, 3, 0, [[50, 50]]);
    protocolo(db, 4, 100.01, [[100, 100]]);
    protocolo(db, 7, 100.004, [[100, 100]]);
    const v = ver(await verificar(db), "capa");
    assert.deepEqual(
      v.linhas.map((l) => [l.protocolo, txt(l.problema)]),
      [
        ["200/2026", "Capa sem valor · somatória R$ 50,00"],
        ["300/2026", "Capa sem valor · somatória R$ 50,00"],
        ["400/2026", "Capa R$ 100,01 × somatória R$ 100,00"],
      ],
    );
    assert.equal(v.nivel, "atencao");
  });

  it("capa: segue a importância do ADM (ignorar no ponto ou na categoria do assunto)", async () => {
    const db = banco();
    protocolo(db, 2, null, [[50, 50]]);
    protocolo(db, 3, null, [[50, 50]], "EXCLUSÃO DE DEMANDA");
    assert.equal(ver(await verificar(db, { ...regrasPadrao(), pontos: { "protocolo.valorCapa": "ignorar" } }), "capa").total, 0);
    const porCategoria = ver(await verificar(db, { ...regrasPadrao(), exProtocolo: { exclusao: { "protocolo.valorCapa": "ignorar" } } }), "capa");
    assert.deepEqual(
      porCategoria.linhas.map((l) => l.protocolo),
      ["200/2026"],
    );
  });

  it("capa: soma o rastro dos sobrescritos (o mesmo da Mesa)", async () => {
    const db = banco();
    protocolo(db, 2, 150, [[100, 100]]);
    db.exec("INSERT INTO dfd_passagens (protocolo_id, dfd_numero, valor_total) VALUES (2, '900', 50)");
    const s = await verificar(db);
    assert.equal(ver(s, "capa").total, 0);
    assert.equal(ver(s, "rastro").total, 0);
  });

  it("itens sem valor unitário (vazio, zero, negativo), com o DFD avulso aberto pelo próprio DFD", async () => {
    const db = banco();
    db.exec(`
      INSERT INTO dfds (id, numero, planejamento, total_itens, valor_total) VALUES (8, '8', '88', 4, 100);
      INSERT INTO dfd_itens (dfd_id, valor_unitario, valor_total) VALUES (8, 100, 100), (8, NULL, NULL), (8, 0, 0), (8, -1, NULL);
    `);
    const v = ver(await verificar(db), "sem-valor");
    assert.equal(v.total, 3);
    assert.equal(v.linhas.length, 1);
    assert.equal(v.linhas[0].problema, "3 itens sem valor unitário (de 4)");
    assert.equal(v.linhas[0].href, "/painel/mesa?abrir=dfd:8");
    assert.equal(v.linhas[0].protocolo, null);
    assert.equal(v.linhas[0].planejamento, "88");
    assert.match(v.descricao, /em 1 DFD:/);
  });

  it("DFD sem nº de planejamento (nulo ou só espaços)", async () => {
    const db = banco();
    protocolo(db, 2, 50, [[50, 50]]);
    protocolo(db, 3, 50, [[50, 50]]);
    db.exec("UPDATE dfds SET planejamento = NULL WHERE id = 2; UPDATE dfds SET planejamento = '   ' WHERE id = 3");
    const v = ver(await verificar(db), "sem-planejamento");
    assert.equal(v.total, 2);
    assert.deepEqual(
      v.linhas.map((l) => [l.dfd, l.planejamento]),
      [
        ["2", null],
        ["3", null],
      ],
    );
  });

  it("rastro contado em dobro e Id repetido = integridade", async () => {
    const db = banco();
    db.exec(`
      INSERT INTO dfd_passagens (protocolo_id, dfd_numero, valor_total) VALUES (1, '1', 300);
      INSERT INTO dfd_protocolos (id, numero, id_externo) VALUES (2, '200/2026', 'A1');
    `);
    const v = ver(await verificar(db), "rastro");
    assert.equal(v.total, 2);
    assert.equal(v.nivel, "alerta");
    assert.deepEqual(
      v.linhas.map((l) => l.problema),
      ["DFD contado no rastro e vivo no mesmo protocolo: 1", "Id de protocolo repetido: 1"],
    );
    assert.ok(v.linhas.every((l) => l.href === null));
  });

  it("numeração do PCA: item incorporado sem nº vivo e nº diferente do item", async () => {
    const db = banco();
    db.exec("DELETE FROM pca_itens WHERE dfd_item_id = 2");
    const v = ver(await verificar(db), "pca");
    assert.deepEqual(
      v.linhas.map((l) => l.problema),
      ["Item incorporado sem nº no PCA: 1", "Item com nº diferente da numeração do PCA: 1"],
    );
    assert.equal(v.total, 2);
  });

  it("numeração do PCA: nº baixado não conta; DFD fora do PCA aponta o vínculo que falta", async () => {
    const db = banco();
    db.exec("UPDATE pca_itens SET baixado_em = '2026-10-02' WHERE dfd_item_id = 2; UPDATE dfd_itens SET pca_id = NULL, pca_sequencial = NULL WHERE id = 2");
    assert.equal(ver(await verificar(db), "pca").total, 1); // o item 2 ficou sem nº vivo no protocolo incorporado
    const db2 = banco();
    db2.exec("DELETE FROM pca_dfds");
    const v = ver(await verificar(db2), "pca");
    assert.ok(v.linhas.some((l) => l.problema === "DFD de protocolo incorporado fora do PCA: 1"));
    assert.ok(v.linhas.some((l) => l.problema === "Nº ativo de DFD que não está mais no PCA: 2"));
  });
});

const ZERO: ContagensSaude = {
  protocolos: 0,
  dfds: 0,
  itens: 0,
  dfdsParciais: 0,
  dfdsDivergentes: 0,
  itensSemValor: 0,
  dfdsSemValor: 0,
  semPlanejamento: 0,
  numerosPca: 0,
  pcaAtivoSemVinculo: 0,
  pcaNumeroSemItem: 0,
  pcaItemSemNumero: 0,
  pcaNumeroDivergente: 0,
  pcaItemDoisNumeros: 0,
  pcaVinculoForaDoProtocolo: 0,
  pcaIncorporadoSemVinculo: 0,
  rastroEmDobro: 0,
  idsRepetidos: 0,
};
const entrada = (e: Partial<EntradaSaude>): EntradaSaude => ({ dfds: [], protocolos: [], semValor: [], semPlanejamento: [], contagens: ZERO, ...e });
const proto = (id: number, somaDfds: number, somaItens: number, extra: Partial<EntradaSaude["protocolos"][number]> = {}) => ({
  id,
  numero: `${id}/2026`,
  assunto: null,
  pcaId: null,
  valorCapa: somaDfds,
  dfds: 1,
  somaDfds,
  somaItens,
  parciais: 0,
  rastro: 0,
  somaRastro: 0,
  ...extra,
});

describe("saúde dos dados — classificação pura", () => {
  it("abas: o centavo da soma dos DFDs × a dos itens, como a tela mostra (4 casas, depois o centavo)", () => {
    const s = avaliarSaude(
      entrada({
        protocolos: [proto(1, 100, 100.02, { pcaId: 3 }), proto(2, 100, 100.00004), proto(3, 100, 100.02, { parciais: 1 }), proto(4, 0, 0, { dfds: 0 })],
      }),
      regrasPadrao(),
      link,
      AGORA,
    );
    const v = s.verificacoes.find((x) => x.chave === "abas");
    assert.ok(v);
    assert.deepEqual(
      v.linhas.map((l) => [l.protocolo, txt(l.problema), l.href]),
      [["1/2026", "DFDs R$ 100,00 × itens R$ 100,02", "pca:3:protocolo:1"]],
    );
  });

  it("listas parciais quando a contagem passa do que a consulta trouxe", () => {
    const dfd = { id: 1, numero: "1", planejamento: "11", protocoloId: null, protocolo: null, pcaId: null };
    const s = avaliarSaude(
      entrada({
        semValor: [{ ...dfd, itens: 2, declarados: 5 }],
        contagens: { ...ZERO, itensSemValor: 900, dfdsSemValor: 300 },
      }),
      regrasPadrao(),
      link,
      AGORA,
    );
    const v = s.verificacoes.find((x) => x.chave === "sem-valor");
    assert.ok(v);
    assert.equal(v.total, 900);
    assert.equal(v.parcial, true);
    assert.equal(v.linhas[0].problema, "2 itens sem valor unitário (de 5)");
  });

  it("um item = singular nos textos", () => {
    const dfd = { id: 1, numero: "1", planejamento: null, protocoloId: 4, protocolo: "4/2026", pcaId: null };
    const s = avaliarSaude(entrada({ semValor: [{ ...dfd, itens: 1, declarados: 1 }], contagens: { ...ZERO, itensSemValor: 1, dfdsSemValor: 1 } }), regrasPadrao(), link, AGORA);
    const v = s.verificacoes.find((x) => x.chave === "sem-valor");
    assert.ok(v);
    assert.equal(v.linhas[0].problema, "1 item sem valor unitário (de 1)");
    assert.equal(v.linhas[0].href, "protocolo:4");
    assert.match(v.descricao, /em 1 DFD:/);
  });
});
