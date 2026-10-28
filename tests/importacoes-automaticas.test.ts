import assert from "node:assert/strict";
import test from "node:test";
import {
  anosAutomaticos,
  type CardEmpenho,
  cardAutomatico,
  cardsDaAutomatica,
  contagemAutomaticas,
  estadoCard,
  IMPORTACOES_PADRAO,
  lerAutomaticas,
  lerConfigImportacoes,
  lotesForaDaEscolha,
  MAX_CARDS_AUTOMATICOS,
  motivoConfigImportacoes,
  motivoEscolhaAutomaticas,
  textoDiffAutomaticas,
} from "../src/lib/empenho-cards-core.ts";
import { anoDaVez, cardNaHora } from "../src/lib/empenhos-core.ts";
import { configImportacoesSchema } from "../src/lib/empenho-cards-validation.ts";

// Quais importações (card × ano) atualizam sozinhas — Configurações → Importações.

type C = Pick<CardEmpenho, "id" | "tipo" | "anos" | "nome">;
const card = (id: number, tipo: CardEmpenho["tipo"], anos: number[], nome = `Card ${id}`): C => ({ id, tipo, anos, nome });
const cfg = (automaticas: Record<string, number[]> | null, ativa = true) => ({ ...IMPORTACOES_PADRAO, ativa, automaticas });

test("leitura tolerante da escolha: legado null, ids e anos inválidos saem, tetos", () => {
  assert.equal(lerConfigImportacoes({}).automaticas, null);
  assert.equal(lerConfigImportacoes({ automaticas: [1, 2] }).automaticas, null);
  assert.equal(lerConfigImportacoes({ automaticas: "x" }).automaticas, null);
  assert.deepEqual(lerConfigImportacoes({ automaticas: {} }).automaticas, {});
  assert.deepEqual(lerAutomaticas({ "3": [2025, 2025, 0, 1999, "2026", -5], abc: [2025], "0": [2025], "7": "x" }), { "3": [2025, 0, 2026] });
  const muitos = Object.fromEntries(Array.from({ length: MAX_CARDS_AUTOMATICOS + 50 }, (_, i) => [String(i + 1), [0]]));
  assert.equal(Object.keys(lerAutomaticas(muitos) ?? {}).length, MAX_CARDS_AUTOMATICOS);
  // A volta pelo blob gravado (JSON) é igual.
  const c = lerConfigImportacoes(JSON.parse(JSON.stringify(cfg({ "1": [0], "2": [] }))));
  assert.deepEqual(c.automaticas, { "1": [0], "2": [] });
});

test("validação: o ano inválido ou repetido é recusado; o schema aceita, ausente e null", () => {
  assert.equal(motivoConfigImportacoes(cfg({ "1": [2025, 0] })), null);
  assert.match(motivoConfigImportacoes(cfg({ "1": [1990] })) ?? "", /Ano inválido/);
  assert.match(motivoConfigImportacoes(cfg({ "1": [2025, 2025] })) ?? "", /Ano inválido/);
  assert.match(motivoConfigImportacoes(cfg({ x: [2025] })) ?? "", /inválida/);
  const base = { ativa: true, frequenciaMin: 120, diasUteis: true, horaInicio: "07:00", horaFim: "19:00", quedaSoma: 80, quedaRegistros: 90, removidos: "marcar" as const };
  assert.equal(configImportacoesSchema.safeParse(base).success, true);
  assert.equal(configImportacoesSchema.safeParse({ ...base, automaticas: null }).success, true);
  assert.equal(configImportacoesSchema.safeParse({ ...base, automaticas: { "4": [2025] } }).success, true);
  assert.equal(configImportacoesSchema.safeParse({ ...base, automaticas: { abc: [2025] } }).success, false);
});

test("anos automáticos: só os escolhidos que estão no card, relativos resolvidos, sem futuro", () => {
  const c = card(1, "empenhos", [0, -1, 2024]);
  // Legado: todos os anos do card (o comportamento de antes).
  assert.deepEqual(anosAutomaticos(cfg(null), c, 2026), [2026, 2025, 2024]);
  // Escolha: só o ano atual; o "Ano atual" acompanha a virada.
  assert.deepEqual(anosAutomaticos(cfg({ "1": [0] }), c, 2026), [2026]);
  assert.deepEqual(anosAutomaticos(cfg({ "1": [0] }), c, 2027), [2027]);
  // Ano escolhido que saiu do card não vale; card fora da escolha = manual.
  assert.deepEqual(anosAutomaticos(cfg({ "1": [2023, 2024] }), c, 2026), [2024]);
  assert.deepEqual(anosAutomaticos(cfg({ "2": [0] }), c, 2026), []);
  assert.deepEqual(anosAutomaticos(cfg({ "1": [] }), c, 2026), []);
  // Futuro nunca: um ano fixo à frente.
  assert.deepEqual(anosAutomaticos(cfg({ "5": [2030] }), card(5, "empenhos", [2030]), 2026), []);
});

test("selo e contagem: Automática só com a central ligada E algum ano escolhido", () => {
  const a = card(1, "empenhos", [2025]);
  const b = card(2, "empenhos", [2026]);
  const escolha = cfg({ "2": [2026] });
  assert.equal(cardAutomatico(escolha, a, 2026), false);
  assert.equal(cardAutomatico(escolha, b, 2026), true);
  assert.equal(cardAutomatico({ ...escolha, ativa: false }, b, 2026), false);
  const pronto = { ultimoStatus: "completo", configuradoEm: "2026-01-01 00:00:00", vinculos: 1, tipo: "empenhos" as const };
  assert.equal(estadoCard(pronto, false, cardAutomatico(escolha, a, 2026)).rotulo, "Manual");
  assert.equal(estadoCard(pronto, false, cardAutomatico(escolha, b, 2026)).rotulo, "Automática");
  assert.deepEqual(contagemAutomaticas(escolha, [a, b], 2026), { auto: 1, total: 2 });
  assert.deepEqual(contagemAutomaticas(cfg(null), [a, b], 2026), { auto: 2, total: 2 });
});

test("a escolha confere com os cards de verdade e a auditoria diz o que mudou", () => {
  const cards = [card(1, "empenhos", [2025], "Empenhos 2025"), card(2, "empenhos", [0], "Empenhos 2026")];
  assert.equal(motivoEscolhaAutomaticas(null, cards), null);
  assert.equal(motivoEscolhaAutomaticas({ "1": [2025], "2": [0] }, cards), null);
  assert.match(motivoEscolhaAutomaticas({ "9": [2025] }, cards) ?? "", /não existe/);
  assert.match(motivoEscolhaAutomaticas({ "1": [2024] }, cards) ?? "", /2024 não está no card "Empenhos 2025"/);
  assert.equal(textoDiffAutomaticas(null, { "2": [0] }, cards), "Empenhos 2025: 2025 → manual");
  assert.equal(textoDiffAutomaticas({ "1": [2025] }, { "1": [2025] }, cards), "");
});

test("o cron só percorre os escolhidos e cancela os lotes que saíram da escolha", () => {
  const cards = [card(3, "pagamentos", [0]), card(1, "empenhos", [2025]), card(2, "empenhos", [0, -1]), card(4, "liquidacoes", [0])];
  const escolha = cfg({ "2": [0], "4": [0] });
  assert.deepEqual(cardsDaAutomatica(cards, escolha, 2026).map((c) => c.id), [2, 4]);
  assert.deepEqual(cardsDaAutomatica(cards, cfg(null), 2026).map((c) => c.id), [1, 2, 4, 3]);
  assert.deepEqual(cardsDaAutomatica(cards, { ...escolha, ativa: false }, 2026), []);
  const lotes = [
    { id: 10, cardId: 1, ano: 2025 }, // card fora da escolha
    { id: 11, cardId: 2, ano: 2026 }, // escolhido
    { id: 12, cardId: 2, ano: 2025 }, // ano desmarcado
    { id: 13, cardId: 99, ano: 2026 }, // card que não está mais pronto
    { id: 14, cardId: null, ano: 2026 },
  ];
  assert.deepEqual(lotesForaDaEscolha(lotes, cards, escolha, 2026).map((l) => l.id), [10, 12, 13, 14]);
  assert.deepEqual(lotesForaDaEscolha(lotes, cards, cfg(null), 2026).map((l) => l.id), [13, 14]);
});

test("simulação de um dia de cron: só o card e o ano escolhidos recebem importações", () => {
  // Dois cards: Empenhos 2025 (manual) e Empenhos (atual + anterior) só com o ano atual na automática.
  const cards = [card(1, "empenhos", [2025]), card(2, "empenhos", [0, -1])];
  const c = cfg({ "2": [0] });
  const ultimaPorCard = new Map<number, string | null>([
    [1, null],
    [2, null],
  ]);
  const ultimaPorAno = new Map<number, Map<number, string>>([
    [1, new Map()],
    [2, new Map()],
  ]);
  const criados: { card: number; ano: number; hora: string }[] = [];
  const inicio = Date.parse("2026-10-28T10:00:00Z"); // 07:00 em Brasília, quarta-feira
  for (let min = 0; min < 13 * 60; min++) {
    const ms = inicio + min * 60_000;
    const hora = new Date(ms - 3 * 3600_000).toISOString().slice(11, 16);
    for (const k of cardsDaAutomatica(cards, c, 2026)) {
      if (!cardNaHora({ ...c, ultimaExecucao: ultimaPorCard.get(k.id) ?? null }, { ms, hora, diaUtil: true })) continue;
      const ano = anoDaVez(anosAutomaticos(c, k, 2026), ultimaPorAno.get(k.id) ?? new Map());
      const sql = new Date(ms).toISOString().replace("T", " ").slice(0, 19);
      criados.push({ card: k.id, ano, hora });
      ultimaPorCard.set(k.id, sql);
      ultimaPorAno.get(k.id)?.set(ano, sql);
      break; // uma tarefa por execução
    }
  }
  assert.ok(criados.length >= 6, `esperava uma importação a cada 2 h, veio ${criados.length}`);
  assert.ok(criados.every((x) => x.card === 2 && x.ano === 2026), JSON.stringify(criados));
  assert.ok(criados.every((x) => x.hora >= "07:00" && x.hora <= "19:00"));
  // O legado lê os dois cards e todos os anos.
  const legado = cardsDaAutomatica(cards, cfg(null), 2026).flatMap((k) => anosAutomaticos(cfg(null), k, 2026).map((a) => `${k.id}:${a}`));
  assert.deepEqual(legado, ["1:2025", "2:2026", "2:2025"]);
});
