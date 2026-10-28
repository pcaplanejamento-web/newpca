import assert from "node:assert/strict";
import test from "node:test";
import { lerPaginaEmpenhos } from "../src/lib/empenhos-core.ts";
import { corteUtf8, type EstadoJanela, hexDe, janelaDosPedacos, MAX_RESTO, processarJanela, ultimoCorte } from "../src/lib/fragmentos-centi-core.ts";
import { lerPaginaPagamentos } from "../src/lib/pagamentos-core.ts";

/** Um empenho como a Centi devolve (o histórico com ASPAS SEM ESCAPE, chaves e quebras dentro do texto). */
const emp = (n: number, historico = `PAGAMENTO "ESPECIAL" {item ${n}}, PARCELA ${n}`) =>
  `{\r\n    "$type": "ServerAppWCF.Service.Portal.Controllers.EmpenhoItem, Wcf",\r\n    "Id": ${n},\r\n    "Numero": "${n}",\r\n    "Data": "05/03/2026",\r\n    "OrgaoGestor": "PMRV",\r\n    "Fornecedor": "FORNECEDOR ${n} LTDA — ÁGUA",\r\n    "ValorEmpenhado": "1.021,070",\r\n    "Historico": "${historico}",\r\n    "TotalRegistros": 0\r\n  }`;

/** A lista no formato da Centi (indentada, com CRLF). */
const lista = (regs: string[]) => (regs.length ? `[\r\n  ${regs.join(",\r\n  ")}\r\n]` : "[]");

/** Lê a resposta INTEIRA janela por janela (como a automática) e junta o que cada janela leu. */
function porJanelas(texto: string, janela: number, ler = lerPaginaEmpenhos) {
  let estado: EstadoJanela = { pos: 0, tamanho: texto.length, forma: null, resto: "" };
  const chaves: string[] = [];
  let recebidos = 0;
  let janelas = 0;
  for (;;) {
    const r = processarJanela(estado, texto.slice(estado.pos, estado.pos + janela));
    if (!r.ok) return { erro: r.erro, chaves, recebidos, janelas };
    janelas++;
    if (r.registros) {
      const l = ler(r.registros, 2026);
      recebidos += l.recebidos;
      for (const x of l.linhas) chaves.push(x.chave);
    }
    estado = r.estado;
    if (r.fim) return { chaves, recebidos, janelas, maxResto: 0 };
    assert.ok(janelas < 100_000, "nunca fica parada");
  }
}

test("fragmentos: a lista da Centi lida em janelas pequenas = a leitura inteira (aspas sem escape, chaves e acentos no texto)", () => {
  const texto = lista(Array.from({ length: 40 }, (_, i) => emp(i + 1)));
  const inteira = lerPaginaEmpenhos(texto, 2026);
  for (const janela of [180, 333, 1000, 5000, texto.length]) {
    const r = porJanelas(texto, janela);
    assert.equal(r.erro, undefined, `janela ${janela}`);
    assert.equal(r.recebidos, inteira.recebidos, `janela ${janela}`);
    assert.deepEqual(r.chaves, inteira.linhas.map((l) => l.chave), `janela ${janela}`);
  }
});

test("fragmentos: a resposta que vem como TEXTO com o JSON dentro — nunca corta no meio de um escape", () => {
  const regs = Array.from({ length: 25 }, (_, i) => emp(i + 1, `NOTA \\u00e9 "${i}"`.replace(/\\u00e9/, "é")));
  const texto = JSON.stringify(lista(regs));
  assert.ok(texto.startsWith('"['), "o JSON dentro de um texto");
  const inteira = lerPaginaEmpenhos(texto, 2026);
  assert.equal(inteira.recebidos, 25);
  // Todo tamanho de janela entre 50 e 260: algum cai em cima de um \" ou de um \r\n.
  for (let janela = 50; janela < 260; janela += 7) {
    const r = porJanelas(texto, janela);
    assert.equal(r.erro, undefined, `janela ${janela}`);
    assert.deepEqual(r.chaves, inteira.linhas.map((l) => l.chave), `janela ${janela}`);
  }
  // O \uXXXX também não é cortado ao meio.
  const comU = `"${lista([emp(1, "A\\\\u00e9B")]).replace(/\r\n/g, "\\r\\n").replace(/"/g, '\\"')}"`;
  for (let janela = 20; janela < 80; janela++) assert.equal(porJanelas(comU, janela).erro, undefined, `\\u janela ${janela}`);
});

test("fragmentos: registro maior que a janela acumula no resto; lista vazia; JSON compacto (reserva); pagamentos", () => {
  const grande = lista([emp(1, "X".repeat(5000)), emp(2)]);
  const r = porJanelas(grande, 300);
  assert.deepEqual(r.chaves, ["2026|PMRV|1", "2026|PMRV|2"]);
  assert.deepEqual(porJanelas("[]", 1).chaves, []);
  assert.deepEqual(porJanelas("  \r\n[ ]\r\n", 3).chaves, []);
  const compacto = `[${Array.from({ length: 10 }, (_, i) => emp(i + 1).replace(/\r\n\s*/g, "")).join(",")}]`;
  assert.equal(porJanelas(compacto, 120).chaves.length, 10);
  const pag = (id: number) => `{\r\n    "IdOrdemPagamento": ${id},\r\n    "IdNotaEmpenho": 9,\r\n    "Orgao": "P",\r\n    "ValorLiquido": 10.5,\r\n    "PossuiAnulacao": false\r\n  }`;
  const p = porJanelas(lista(Array.from({ length: 30 }, (_, i) => pag(i + 1))), 97, lerPaginaPagamentos as never);
  assert.equal(p.recebidos, 30);
});

test("fragmentos: o que não é lista, a lista incompleta e o registro gigante param com o motivo", () => {
  const obj = processarJanela({ pos: 0, tamanho: 30, forma: null, resto: "" }, '{"mensagem":"Campo obrigatório"}');
  assert.ok(!obj.ok && /não é uma lista/.test(obj.erro));
  const corta = `[\r\n  ${emp(1)},\r\n  ${emp(2)}`;
  assert.match(porJanelas(corta, 200).erro ?? "", /incompleta/);
  const gigante = `[\r\n  {"Historico": "${"Y".repeat(MAX_RESTO + 500_000)}"}]`;
  assert.match(porJanelas(gigante, 400_000).erro ?? "", /passa de 1 MB/);
});

test("fragmentos: o corte do registro, o corte UTF-8, a cauda e a janela dos pedaços", () => {
  assert.deepEqual(ultimoCorte('{"a":1},\r\n  {"b":2},\r\n  {"c"'), { fecha: 18, abre: 24 });
  assert.equal(ultimoCorte('{"a":"x'), null);
  const b = new TextEncoder().encode("aé€b"); // a(1) é(2) €(3) b(1)
  assert.equal(corteUtf8(b, 2), 1, "não corta o é");
  assert.equal(corteUtf8(b, 4), 3, "não corta o €");
  assert.equal(corteUtf8(b, 6), 6);
  assert.equal(corteUtf8(b, 99), b.length);
  // O fragmento que acaba NO MEIO de um caractere: o corte fica antes dele (o resto vem no próximo).
  const partido = new TextEncoder().encode("aç€");
  assert.equal(corteUtf8(partido.subarray(0, 2), 2), 1, "o ç partido não entra");
  assert.equal(corteUtf8(partido.subarray(0, 5), 5), 3, "o € partido (2 de 3 bytes) não entra");
  assert.equal(corteUtf8(partido, partido.length), partido.length, "inteiro fica inteiro");
  assert.equal(hexDe(new Uint8Array([0, 15, 255])), "000fff");
  assert.equal(janelaDosPedacos(5, 8, [{ ini: 10, texto: "KLMNOP" }, { ini: 0, texto: "FGHIJ" }]), "FGHIJKLM");
  assert.equal(janelaDosPedacos(0, 4, [{ ini: 2, texto: "CD" }]), "", "buraco no começo = nada");
});

test("fragmentos: o registro repetido em DUAS janelas conta como repetido (a mesma conta da leitura inteira)", async () => {
  const { semRepetidos } = await import("../src/lib/fragmentos-centi-core.ts");
  const a = semRepetidos("", [{ chave: "1" }, { chave: "2" }]);
  assert.deepEqual(a, { linhas: [{ chave: "1" }, { chave: "2" }], repetidos: 0, vistas: "1\n2" });
  const b = semRepetidos(a.vistas, [{ chave: "2" }, { chave: "3" }, { chave: "3" }]);
  assert.deepEqual(b, { linhas: [{ chave: "3" }], repetidos: 2, vistas: "1\n2\n3" });
  assert.deepEqual(semRepetidos(b.vistas, []), { linhas: [], repetidos: 0, vistas: "1\n2\n3" });
  // A leitura janela a janela com repetição entre janelas = a leitura inteira.
  const regs = [emp(1), emp(2), emp(3), emp(2)];
  const texto = lista(regs);
  const inteira = lerPaginaEmpenhos(texto, 2026);
  let estado: EstadoJanela = { pos: 0, tamanho: texto.length, forma: null, resto: "" };
  let vistas = "";
  let linhas = 0;
  let repetidos = 0;
  for (;;) {
    const r = processarJanela(estado, texto.slice(estado.pos, estado.pos + 300));
    assert.ok(r.ok);
    if (r.registros) {
      const l = lerPaginaEmpenhos(r.registros, 2026);
      const s = semRepetidos(vistas, l.linhas);
      vistas = s.vistas;
      linhas += s.linhas.length;
      repetidos += l.repetidos + s.repetidos;
    }
    estado = r.estado;
    if (r.fim) break;
  }
  assert.equal(linhas, inteira.linhas.length);
  assert.equal(repetidos, inteira.repetidos);
});
