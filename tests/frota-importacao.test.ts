import assert from "node:assert/strict";
import test from "node:test";
import { cursoresLendo, frotaAoVivo, ID_FROTA_AO_VIVO, type LeituraFrotaAoVivo } from "../src/lib/frota-andamento-core.ts";
import { fracaoDaImportacao, importacoesLocais, retirarImportacao } from "../src/lib/importacoes-ao-vivo-store.ts";
import { filaDaFrota, importarFrota, TIPO_FROTA } from "../src/lib/importar-frota-cliente.ts";

// A IMPORTAÇÃO DA FROTA no armazém das importações ao vivo: a fila, a divisão, as novas tentativas e a entrada do servidor.

const C = [{ codigo: "000617000001", produto: "combustivel" as const }];
const sem = () => Promise.resolve();
const esperarArmazem = () => new Promise((ok) => setTimeout(ok, 200));

test("a fila: contrato × tipo × mês até hoje", () => {
  const f = filaDaFrota(C, 2026, "2026-03-10");
  assert.equal(f.length, 3);
  assert.deepEqual(f[2], { contrato: "000617000001", tipo: "abastecimento", inicio: "2026-03-01", fim: "2026-03-10" });
});

test("fracaoDaImportacao com o total de pedidos conhecido", () => {
  const base = { etapa: "leitura" as const, etapaMs: 0, ano: 2026, passos: [], lote: null, estado: "rodando" as const };
  const p = (fase: "concluido" | "fila") => ({ chave: fase + Math.random(), periodo: { inicio: "2026-01-01", fim: "2026-01-31" }, pagina: 1, rotuloPagina: "", fase, tentativa: 1, inicioMs: 0, faseMs: 0, bytes: 0, bytesEsperados: null, registros: 0, iguais: null, mudaram: null, partes: 0, partesFeitas: 0 });
  assert.equal(fracaoDaImportacao({ ...base, totalPedidos: 4, pedidos: [p("concluido"), p("fila"), p("fila"), p("fila")] }, 0), 0.25);
  assert.equal(fracaoDaImportacao({ ...base, totalPedidos: 0, pedidos: [] }, 0), 0);
});

test("importarFrota: divide o período grande, tenta de novo a falha passageira e publica no armazém", async () => {
  const chamadas: string[] = [];
  let falhou = false;
  const pedir = async (p: { inicio: string; fim: string }) => {
    chamadas.push(`${p.inicio}..${p.fim}`);
    if (p.inicio === "2026-01-01" && p.fim === "2026-01-31") return { estado: "dividir", partes: 2 };
    if (p.inicio === "2026-02-01" && !falhou) {
      falhou = true;
      throw Object.assign(new Error("rede"), { status: 0 });
    }
    return { estado: "ok", registros: 10, novos: 2, alterados: 1 };
  };
  const { id, fim } = importarFrota({ ano: 2026, contratos: C, hoje: "2026-02-10", pedir, esperar: sem });
  const r = await fim;
  assert.deepEqual(chamadas, ["2026-01-01..2026-01-31", "2026-01-01..2026-01-16", "2026-01-17..2026-01-31", "2026-02-01..2026-02-10", "2026-02-01..2026-02-10"]);
  assert.equal(r.registros, 30);
  assert.equal(r.falhas.length, 0);
  await esperarArmazem();
  const imp = importacoesLocais().find((i) => i.id === id);
  assert.ok(imp);
  assert.equal(imp.tipo, TIPO_FROTA);
  assert.equal(imp.cardId, null);
  assert.equal(imp.estado, "gravado");
  assert.equal(imp.totalPedidos, 4);
  assert.equal(fracaoDaImportacao(imp, Date.now()), 1);
  retirarImportacao(id);
});

test("importarFrota: erro permanente vira falha e parar interrompe", async () => {
  const pedir = async () => ({ estado: "erro", erro: "credencial" });
  const a = importarFrota({ ano: 2026, contratos: C, hoje: "2026-01-05", pedir, esperar: sem });
  const r = await a.fim;
  assert.equal(r.falhas.length, 1);
  await esperarArmazem();
  assert.equal(importacoesLocais().find((i) => i.id === a.id)?.estado, "parcial");
  retirarImportacao(a.id);

  let ida = "";
  const b = importarFrota({
    ano: 2026,
    contratos: C,
    hoje: "2026-03-05",
    esperar: sem,
    pedir: async () => {
      await esperarArmazem();
      // Pede a parada no 1º pedido: os meses seguintes não são lidos.
      for (const i of importacoesLocais()) if (i.id === ida) i.parar();
      return { estado: "ok", registros: 1 };
    },
  });
  ida = b.id;
  await esperarArmazem();
  const rb = await b.fim;
  assert.equal(rb.interrompido, true);
  retirarImportacao(b.id);
});

const leitura = (o: Partial<LeituraFrotaAoVivo>): LeituraFrotaAoVivo => ({
  id: 1,
  contrato: "000617000001",
  tipo: "abastecimento",
  inicio: "2026-10-01",
  fim: "2026-10-07",
  origem: "auto",
  estado: "ok",
  registros: 5,
  novos: 1,
  alterados: 2,
  iguais: 2,
  fora: 0,
  bytes: 100,
  ms: 10,
  erro: null,
  por: "Atualização automática",
  em: "2026-10-29 12:00:00",
  ...o,
});

test("frotaAoVivo: cursor travado = lendo; sem nada = null; leituras viram os passos", () => {
  const agora = "2026-10-29T12:00:30.000Z";
  assert.equal(frotaAoVivo([], [], agora), null);
  const travado = { contrato: "000617000001", tipo: "abastecimento", travaAte: "2026-10-29T12:01:00.000Z", cicloInicio: "2026-10-01", proximo: "2026-10-15" };
  assert.equal(cursoresLendo([travado, { ...travado, travaAte: "2026-10-29T11:00:00.000Z" }], agora).length, 1);
  const l = frotaAoVivo([travado], [leitura({ id: 2 }), leitura({ id: 3, estado: "erro", erro: "x" })], agora);
  assert.ok(l);
  assert.equal(l.id, ID_FROTA_AO_VIVO);
  assert.equal(l.estado, "lendo");
  assert.equal(l.cardId, null);
  assert.equal(l.tipo, "frotas");
  assert.equal(l.erros, 1);
  assert.equal(l.passos[0].id, 3);
  assert.ok(l.fracao > 0 && l.fracao < 1);
  const fim = frotaAoVivo([], [leitura({ id: 4 })], agora);
  assert.equal(fim?.estado, "promovido");
  assert.equal(fim?.fracao, 1);
});
