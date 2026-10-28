import assert from "node:assert/strict";
import test from "node:test";
import { fracaoDoAno, type PassoLote, type Periodo, periodoDoAno } from "../src/lib/empenhos-core.ts";
import { estadoDoPedido, fracaoDaLeitura, fracaoDoPedido, fracaoGeral, ordenarPedidos, type PedidoAndamento, resumoPedidos, textoBytes, textoPedido } from "../src/lib/importacao-progresso.ts";
import { fracaoDaImportacao, type ImportacaoLocal, importacoesLocais, lotesDestaAba, mudarImportacao, mudarPedido, publicarImportacao, retirarImportacao } from "../src/lib/importacoes-ao-vivo-store.ts";

// O ANDAMENTO AO VIVO das importações: a fração de cada pedido, da leitura do ano e da importação inteira, e os textos.

const MB = 1024 * 1024;
const ped = (periodo: Periodo, pagina: number, o: Partial<PedidoAndamento> = {}): PedidoAndamento => ({
  chave: `${periodo.inicio}|${periodo.fim}|${pagina}`,
  periodo,
  pagina,
  rotuloPagina: `órgão ${pagina}`,
  fase: "fila",
  tentativa: 1,
  inicioMs: 0,
  faseMs: 0,
  bytes: 0,
  bytesEsperados: null,
  registros: null,
  iguais: null,
  mudaram: null,
  partes: 0,
  partesFeitas: 0,
  ...o,
});
const ano = periodoDoAno(2025);
const passo = (p: Periodo, fimPeriodo = true): PassoLote =>
  ({ id: 1, inicio: p.inicio, fim: p.fim, pagina: 1, estado: "ok", fimPeriodo, status: 200, bytes: 10, ms: 1, recebidos: 1, novos: 0, recusados: 0, repetidos: 0, total: 1, soma: 0, resNovos: 0, resAlterados: 0, resIguais: 0, resSemVinculo: 0, mensagem: null, corpo: null, em: "2025-01-01 00:00:00" }) as PassoLote;

test("cada pedido anda pela fase, sem passar de 1 nem voltar ao avançar", () => {
  const fases: PedidoAndamento["fase"][] = ["fila", "pedindo", "baixando", "lendo", "comparando", "gravando", "concluido"];
  let antes = -1;
  for (const f of fases) {
    const v = fracaoDoPedido(ped(ano, 1, { fase: f, bytes: 5 * MB, bytesEsperados: 5 * MB, partes: 4, partesFeitas: 4 }));
    assert.ok(v >= antes && v <= 1, `${f}: ${v}`);
    antes = v;
  }
  // O download com o tamanho esperado é EXATO; sem ele, a curva nunca chega ao fim da fase.
  assert.equal(fracaoDoPedido(ped(ano, 1, { fase: "baixando", bytes: 2 * MB, bytesEsperados: 4 * MB })), 0.02 + 0.53 * 0.5);
  assert.ok(fracaoDoPedido(ped(ano, 1, { fase: "baixando", bytes: 500 * MB })) < 0.02 + 0.53);
  // Gravando: parte a parte.
  assert.equal(fracaoDoPedido(ped(ano, 1, { fase: "gravando", partes: 4, partesFeitas: 2 })), 0.62 + 0.37 * 0.5);
  // Esperando a nova tentativa: recomeça.
  assert.equal(fracaoDoPedido(ped(ano, 1, { fase: "esperando" })), 0);
});

test("a leitura do ano = a régua dos passos (dias) + o que cada pedido em curso já fez, sem contar duas vezes", () => {
  const s1 = { inicio: "2025-01-01", fim: "2025-06-30" };
  const s2 = { inicio: "2025-07-01", fim: "2025-12-31" };
  // Nada em curso: igual ao `fracaoDoAno`.
  assert.equal(fracaoDaLeitura(2025, [s1], [], null), fracaoDoAno(2025, [passo(s1)]));
  // O pedido do 2º semestre na metade do download (com o esperado): a metade do semestre × a fração do pedido.
  const emCurso = ped(s2, 1, { fase: "baixando", bytes: MB, bytesEsperados: 2 * MB });
  const f = fracaoDaLeitura(2025, [s1], [emCurso], null);
  assert.ok(f > fracaoDoAno(2025, [passo(s1)]) && f < 1);
  // O período concluído não conta o pedido de novo.
  assert.equal(fracaoDaLeitura(2025, [s1, s2], [ped(s2, 1, { fase: "concluido" })], null), 1);
  // Por órgão: 2 de 4 órgãos lidos de um período aberto = metade dele.
  const pe = [ped(ano, 1, { fase: "concluido" }), ped(ano, 2, { fase: "concluido" }), ped(ano, 3), ped(ano, 4)];
  assert.ok(Math.abs(fracaoDaLeitura(2025, [], pe, 4) - 0.5) < 1e-9);
  assert.equal(fracaoDaLeitura(2025, [ano], pe, 4), 1);
});

test("a fração geral anda por etapa e a conclusão nunca chega sozinha a 100%", () => {
  assert.equal(fracaoGeral("preparando", 0), 0);
  assert.ok(fracaoGeral("assinaturas", 0) < fracaoGeral("leitura", 0));
  assert.ok(fracaoGeral("leitura", 1) <= fracaoGeral("conclusao", 1, 0));
  assert.ok(fracaoGeral("conclusao", 1, 600_000) < 1);
  assert.equal(fracaoGeral("fim", 0), 1);
});

test("os textos dizem o que acontece agora", () => {
  assert.equal(textoBytes(1.5 * MB), "1,5 MB");
  assert.equal(textoBytes(300 * 1024), "300 KB");
  assert.match(textoPedido(ped(ano, 1, { fase: "pedindo", faseMs: 0 }), 12_000), /Aguardando a Centi responder há 12 s/);
  assert.match(textoPedido(ped(ano, 1, { fase: "baixando", faseMs: 0, bytes: 4 * MB, bytesEsperados: 8 * MB }), 2000), /Baixando 4,0 MB de ≈ 8,0 MB · 2,0 MB\/s/);
  assert.match(textoPedido(ped(ano, 1, { fase: "gravando", partes: 9, partesFeitas: 2, mudaram: 30, iguais: 1000 }), 0), /parte 3 de 9 · 30 com mudança, 1\.000 iguais/);
  assert.match(textoPedido(ped(ano, 1, { fase: "concluido", registros: 1234, novos: 3, alterados: 1, inicioMs: 0, fimMs: 4000 }), 0), /1\.234 registros · 3 novos, 1 alterados em 4 s/);
  assert.match(textoPedido(ped(ano, 1, { fase: "esperando", faseMs: 0, espera: 8000, mensagem: "500" }), 3000), /nova tentativa em 5 s/);
  assert.equal(estadoDoPedido("gravando"), "rodando");
  assert.equal(estadoDoPedido("dividido"), "ok");
});

test("a ordem e o resumo da lista de pedidos", () => {
  const l = [ped(ano, 1, { fase: "concluido", fimMs: 10, registros: 5, bytes: 100 }), ped(ano, 2), ped(ano, 3, { fase: "baixando", inicioMs: 5, bytes: 50 }), ped(ano, 4, { fase: "erro" })];
  assert.deepEqual(
    ordenarPedidos(l).map((p) => p.pagina),
    [4, 3, 2, 1],
  );
  assert.deepEqual(resumoPedidos(l), { emCurso: 1, fila: 1, concluidos: 1, erros: 1, registros: 5, bytes: 150 });
});

test("o armazém desta aba: publicar, mudar pedidos, os lotes em curso e a fração da importação", async () => {
  const base: ImportacaoLocal = {
    id: "x",
    cardId: 7,
    titulo: "Empenhos · 2025",
    ano: 2025,
    rota: "/",
    lote: null,
    etapa: "leitura",
    etapaMs: 0,
    inicioMs: 0,
    fimMs: null,
    pedidos: [],
    passos: [],
    assinaturas: 10,
    estado: "rodando",
    texto: null,
    aguardandoConfirmacao: false,
    parar: () => {},
  };
  publicarImportacao(base);
  mudarPedido("x", "a", () => ped(ano, 1, { chave: "a", fase: "baixando", bytes: MB, bytesEsperados: 2 * MB }));
  mudarPedido("x", "a", (p) => ({ ...(p as PedidoAndamento), bytes: 2 * MB }));
  mudarImportacao("x", (i) => ({ ...i, lote: { id: 99 } as ImportacaoLocal["lote"] }));
  await new Promise((ok) => setTimeout(ok, 150));
  const [i] = importacoesLocais();
  assert.equal(i.pedidos.length, 1);
  assert.equal(i.pedidos[0].bytes, 2 * MB);
  assert.deepEqual([...lotesDestaAba()], [99]);
  const f = fracaoDaImportacao(i, 0);
  assert.ok(f > fracaoGeral("leitura", 0) && f < fracaoGeral("leitura", 1));
  assert.equal(fracaoDaImportacao({ ...i, estado: "gravado" }, 0), 1);
  retirarImportacao("x");
  await new Promise((ok) => setTimeout(ok, 150));
  assert.equal(importacoesLocais().length, 0);
});

test("D1 real: o tamanho esperado vem do mesmo pedido da última importação promovida; o painel lista os lendo e os recentes", async () => {
  const { drizzle } = await import("drizzle-orm/d1");
  const schema = await import("../src/db/schema.ts");
  const { consultaBytesEsperados, consultaLotesAoVivo } = await import("../src/lib/empenhos-sql.ts");
  const { bancoMigrado } = await import("./fixtures/banco-migrado.ts");
  const { d1Sobre } = await import("./fixtures/d1-sqlite.ts");
  const raw = bancoMigrado();
  raw.exec("INSERT INTO empenho_cards (id, nome) VALUES (1, 'Empenhos')");
  raw.exec(`INSERT INTO centi_lotes (id, card_id, ano, estado, modo, concluido_em) VALUES
    (1, 1, 2025, 'promovido', 'dados', '2025-01-01 10:00:00'),
    (2, 1, 2025, 'promovido', 'dados', '2025-02-01 10:00:00'),
    (3, 1, 2025, 'lendo', 'dados', NULL),
    (4, 1, 2025, 'falhou', 'dados', '2025-02-01 09:00:00')`);
  // O PARADO há mais de 30 min não aparece como lendo (é abandonado).
  raw.exec("INSERT INTO empenho_cards (id, nome) VALUES (2, 'Outro'); INSERT INTO centi_lotes (id, card_id, ano, estado, modo, visto_em) VALUES (5, 2, 2024, 'lendo', 'dados', '2000-01-01 00:00:00')");
  raw.exec(`INSERT INTO centi_lote_passos (lote_id, inicio, fim, pagina, estado, bytes) VALUES
    (1, '2025-01-01', '2025-12-31', 1, 'ok', 111),
    (2, '2025-01-01', '2025-12-31', 1, 'ok', 222),
    (2, '2025-01-01', '2025-12-31', 2, 'erro', 999),
    (3, '2025-01-01', '2025-12-31', 1, 'ok', 333)`);
  const db = drizzle(d1Sobre(raw) as never, { schema });
  // A ÚLTIMA promovida (a 2), o mesmo período e página, só passo lido.
  assert.equal(await consultaBytesEsperados(db, 1, 2025, "dados", "2025-01-01", "2025-12-31", 1), 222);
  assert.equal(await consultaBytesEsperados(db, 1, 2025, "dados", "2025-01-01", "2025-12-31", 2), null);
  assert.equal(await consultaBytesEsperados(db, 1, 2025, "liquidacoes", "2025-01-01", "2025-12-31", 1), null);
  assert.equal(await consultaBytesEsperados(db, 1, 2024, "dados", "2025-01-01", "2025-12-31", 1), null);
  // O painel: o lendo sempre; os concluídos só depois de `desde`; o mais novo primeiro.
  const l = await consultaLotesAoVivo(db, "2025-01-15 00:00:00");
  assert.deepEqual(
    l.map((x) => x.id),
    [4, 3, 2],
  );
});
