import assert from "node:assert/strict";
import { test } from "node:test";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "../src/db/schema.ts";
import { MSG_INTERROMPIDA, passoEfetivo, proximoTrabalho } from "../src/lib/frota-config-core.ts";
import { comandoTravarCursor } from "../src/lib/frota-sql.ts";
import { BYTES_CAPTURA, capturaDaTentativa, JANELA, janelaDaTentativa, processarJanela } from "../src/lib/fragmentos-centi-core.ts";
import { comandosRegistrarCron, situacaoComErro, situacoesDaCenti } from "../src/lib/importacoes-cron-sql.ts";
import { bancoMigrado } from "./fixtures/banco-migrado.ts";
import { d1Sobre } from "./fixtures/d1-sqlite.ts";

// IMPORTAÇÕES SEM TRAVA (v1.262.0): a execução cortada pelo limite de CPU (ou por uma exceção) vira uma tentativa CONTADA —
// o trecho pesado encolhe e, sem avançar, a leitura é descartada com o erro; e a situação de cada importação fica à vista.

test("centi: a janela e o fragmento encolhem a cada execução que não avançou (até 1/8)", () => {
  assert.equal(janelaDaTentativa(1), JANELA);
  assert.equal(janelaDaTentativa(2), JANELA / 2);
  assert.equal(janelaDaTentativa(4), JANELA / 8);
  assert.equal(janelaDaTentativa(20), JANELA / 8);
  assert.equal(capturaDaTentativa(0), BYTES_CAPTURA);
  assert.equal(capturaDaTentativa(3), BYTES_CAPTURA / 4);
});

test("centi: a janela MENOR lê os MESMOS registros (em mais passos)", () => {
  const regs = Array.from({ length: 200 }, (_, i) => `{\r\n    "Numero": "${i}",\r\n    "Historico": "${"x".repeat(i % 50)}"\r\n  }`);
  const texto = `[\r\n  ${regs.join(",\r\n  ")}\r\n]`;
  const ler = (n: number) => {
    const lidos: string[] = [];
    let e = { pos: 0, tamanho: texto.length, forma: null as "lista" | "texto" | null, resto: "" };
    for (;;) {
      const r = processarJanela(e, texto.slice(e.pos, e.pos + n));
      assert.ok(r.ok);
      if (r.registros) for (const x of JSON.parse(r.registros) as { Numero: string }[]) lidos.push(x.Numero);
      e = r.estado;
      if (r.fim) return lidos;
    }
  };
  const cheia = ler(janelaDaTentativa(1));
  assert.equal(cheia.length, 200);
  assert.deepEqual(ler(janelaDaTentativa(4)), cheia);
  assert.deepEqual(ler(700), cheia);
});

test("frota: depois de execuções INTERROMPIDAS o período encolhe até 1 dia (nunca o mesmo para sempre)", () => {
  const k = { passoDias: 24, falhas: 0, ultimoErro: null };
  assert.equal(passoEfetivo(k), 24);
  assert.equal(passoEfetivo({ ...k, falhas: 1, ultimoErro: MSG_INTERROMPIDA }), 12);
  assert.equal(passoEfetivo({ ...k, falhas: 3, ultimoErro: MSG_INTERROMPIDA }), 3);
  assert.equal(passoEfetivo({ ...k, falhas: 9, ultimoErro: MSG_INTERROMPIDA }), 1);
  // Um erro registrado (a Vólus respondeu) não encolhe por aqui — a régua do `lento` cuida dele.
  assert.equal(passoEfetivo({ ...k, falhas: 3, ultimoErro: "Vólus respondeu 500" }), 24);
  const cfg = { frequenciaMin: 60, diasRecentes: 30 } as never;
  const t = proximoTrabalho([{ contrato: "1", tipo: "abastecimento", cicloInicio: "2026-10-01", proximo: "2026-10-06", passoDias: 24, falhas: 2, esperaAte: null, travaAte: null, cicloConcluidoEm: null, ultimoErro: MSG_INTERROMPIDA }], cfg, new Date("2026-10-29T15:00:00Z"));
  assert.deepEqual(t && [t.inicio, t.fim], ["2026-10-06", "2026-10-11"]);
});

test("frota (D1 real): a trava CONTA a falha e marca INTERROMPIDA antes da leitura", async () => {
  const raw = bancoMigrado();
  raw.exec(`INSERT INTO frota_contratos (codigo, nome, sigla, produto) VALUES ('C1', 'X', 'X', 'combustivel'); INSERT INTO frota_cursores (contrato, tipo, proximo) VALUES ('C1', 'abastecimento', '2026-10-20')`);
  const db = drizzle(d1Sobre(raw) as never, { schema });
  const t = { contrato: "C1", tipo: "abastecimento", inicio: "2026-10-20", novoCiclo: false };
  const [a] = await comandoTravarCursor(db, t, { proximo: "2026-10-20", cicloConcluidoEm: null }, "2026-10-29T12:00:00.000Z", "2026-10-29T12:02:30.000Z");
  assert.equal(a.falhas, 1);
  const k = raw.prepare("SELECT falhas, ultimo_erro FROM frota_cursores").get() as { falhas: number; ultimo_erro: string };
  assert.deepEqual([k.falhas, k.ultimo_erro], [1, MSG_INTERROMPIDA]);
  // Cortada (a trava venceu sem o fim): a próxima conta de novo.
  const [b] = await comandoTravarCursor(db, t, { proximo: "2026-10-20", cicloConcluidoEm: null }, "2026-10-29T12:03:00.000Z", "2026-10-29T12:05:30.000Z");
  assert.equal(b.falhas, 2);
});

test("situação da automática (D1 real): grava na mudança e só confirma a mesma depois de 10 min", async () => {
  const raw = bancoMigrado();
  const db = drizzle(d1Sobre(raw) as never, { schema });
  const gravar = (itens: { chave: string; situacao: string; erro: boolean }[], iso: string) => db.batch(comandosRegistrarCron(db, itens, iso) as never);
  const ler = () => ({ ...(raw.prepare("SELECT situacao, erro, em, desde FROM importacoes_cron WHERE chave = 'centi:7'").get() as Record<string, string | number>) });
  await gravar(situacoesDaCenti([{ card: 7, situacao: "fora da hora" }, { card: 0, situacao: "Ligada" }]), "2026-10-29T12:00:00.000Z");
  assert.deepEqual(ler(), { situacao: "fora da hora", erro: 0, em: "2026-10-29 12:00:00", desde: "2026-10-29 12:00:00" });
  // A MESMA situação 5 min depois: nada escrito.
  await gravar(situacoesDaCenti([{ card: 7, situacao: "fora da hora" }]), "2026-10-29T12:05:00.000Z");
  assert.equal(ler().em, "2026-10-29 12:00:00");
  // 11 min depois: confirma (em), o "desde" fica.
  await gravar(situacoesDaCenti([{ card: 7, situacao: "fora da hora" }]), "2026-10-29T12:11:00.000Z");
  assert.deepEqual([ler().em, ler().desde], ["2026-10-29 12:11:00", "2026-10-29 12:00:00"]);
  // Situação nova: escreve na hora e reinicia o "desde".
  await gravar(situacoesDaCenti([{ card: 7, situacao: "erro de rede — tenta na próxima execução" }]), "2026-10-29T12:12:00.000Z");
  assert.deepEqual(ler(), { situacao: "erro de rede — tenta na próxima execução", erro: 1, em: "2026-10-29 12:12:00", desde: "2026-10-29 12:12:00" });
  assert.equal((raw.prepare("SELECT situacao FROM importacoes_cron WHERE chave = 'centi:geral'").get() as { situacao: string }).situacao, "Ligada");
});

test("situação com erro: falha, erro e espera depois de um erro", () => {
  assert.ok(situacaoComErro("falhou (erros seguidos)"));
  assert.ok(situacaoComErro("Erro em 000617 abastecimento: tempo esgotado"));
  assert.ok(situacaoComErro("esperando depois de um erro na leitura"));
  assert.ok(situacaoComErro("leitura descartada (sem avançar)"));
  assert.ok(!situacaoComErro("fora da hora"));
  assert.ok(!situacaoComErro("2026: página lida"));
});
