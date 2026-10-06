import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  cartoesDoTexto,
  chatLigado,
  contarNaJanela,
  conversaValida,
  horaChat,
  idDaConversa,
  juntarMensagem,
  lerConfigChat,
  lerMensagemChatAba,
  lerMensagemRecebida,
  lerResposta,
  limparTextoChat,
  MAX_TEXTO_CHAT,
  mencaoEmCurso,
  novoIdMensagem,
  quantosLeram,
  rotuloDiaChat,
  abrirBolha,
  bolhasVisiveis,
  ehConversaEmGrupo,
  lerIds,
  lerPosicaoBolhas,
  novaConversaEmGrupo,
  rotuloConversa,
} from "../src/lib/chat-core.ts";
import { chatEnviarSchema, chatSinalSchema, configChatSchema } from "../src/lib/presenca-validation.ts";

describe("chat ao vivo: configuração e conversas", () => {
  it("desligado por padrão; só true liga", () => {
    assert.deepEqual(lerConfigChat(undefined), { grupo: false, privado: false });
    assert.deepEqual(lerConfigChat({ grupo: true, privado: "sim" }), { grupo: true, privado: false });
    assert.equal(chatLigado({ grupo: false, privado: true }), true);
    assert.equal(chatLigado({ grupo: false, privado: false }), false);
  });
  it("conversa: grupo ou p<id>", () => {
    assert.equal(idDaConversa("p12"), 12);
    assert.equal(idDaConversa("grupo"), null);
    assert.equal(idDaConversa("p"), null);
    assert.equal(conversaValida("grupo"), true);
    assert.equal(conversaValida("p3"), true);
    assert.equal(conversaValida("x3"), false);
    assert.equal(conversaValida("cabc123"), true);
    assert.equal(conversaValida("cABC123"), false);
    assert.equal(conversaValida("c12"), false);
    assert.equal(ehConversaEmGrupo("cabc123"), true);
    assert.equal(ehConversaEmGrupo("p3"), false);
    const c = novaConversaEmGrupo();
    assert.equal(ehConversaEmGrupo(c), true);
  });
  it("schemas: estritos e com tetos", () => {
    assert.equal(configChatSchema.safeParse({ grupo: true, privado: false }).success, true);
    assert.equal(configChatSchema.safeParse({ grupo: true }).success, false);
    const base = { conversa: "p2", para: [2], id: "abcdefgh12", texto: "oi" };
    assert.equal(chatEnviarSchema.safeParse(base).success, true);
    assert.equal(chatEnviarSchema.safeParse({ ...base, conversa: "cabc123xyz", para: [2, 3], nome: "Compras" }).success, true);
    // O chat do GRUPO também vai pela rota (guardado 7 dias): `grupo` + o id do grupo; a lista vazia vale (a rota confere).
    assert.equal(chatEnviarSchema.safeParse({ ...base, conversa: "grupo", para: [], grupo: 7 }).success, true);
    assert.equal(chatEnviarSchema.safeParse({ ...base, conversa: "outra" }).success, false);
    assert.equal(chatEnviarSchema.safeParse({ ...base, para: Array.from({ length: 20 }, (_, i) => i + 2) }).success, false);
    assert.equal(chatEnviarSchema.safeParse({ ...base, id: "curto" }).success, false);
    assert.equal(chatEnviarSchema.safeParse({ ...base, texto: "" }).success, false);
    assert.equal(chatEnviarSchema.safeParse({ ...base, extra: 1 }).success, false);
  });
});

describe("chat ao vivo: texto e mensagens", () => {
  it("texto limpo: controles e invisíveis fora, quebras no máximo 2, teto", () => {
    assert.equal(limparTextoChat("  oi​ \u0007tudo\r\nbem?\n\n\n\nsim  "), "oi tudo\nbem?\n\nsim");
    assert.equal(limparTextoChat("   \n "), null);
    assert.equal(limparTextoChat(5), null);
    assert.equal(limparTextoChat("x".repeat(5000))?.length, MAX_TEXTO_CHAT);
  });
  it("resposta citada: id válido, autor e trecho de uma linha", () => {
    assert.deepEqual(lerResposta({ id: "abcdefgh12", de: 3, trecho: "linha 1\nlinha 2" }), { id: "abcdefgh12", de: 3, trecho: "linha 1 linha 2" });
    assert.equal(lerResposta({ id: "x", de: 3 }), null);
    assert.equal(lerResposta(null), null);
  });
  it("mensagens da aba: msg, digitando e lida; o resto é ignorado", () => {
    assert.deepEqual(lerMensagemChatAba(JSON.stringify({ t: "msg", id: "abcdefgh12", texto: " oi " })), { t: "msg", id: "abcdefgh12", texto: "oi", resp: null });
    assert.equal(lerMensagemChatAba(JSON.stringify({ t: "msg", id: "abcdefgh12", texto: "  " })), null);
    assert.deepEqual(lerMensagemChatAba('{"t":"digitando","conversa":"p4"}'), { t: "digitando", conversa: "p4" });
    assert.equal(lerMensagemChatAba('{"t":"digitando","conversa":"todos"}'), null);
    assert.deepEqual(lerMensagemChatAba('{"t":"lida","conversa":"grupo","ate":"abcdefgh12"}'), { t: "lida", conversa: "grupo", ate: "abcdefgh12" });
    assert.equal(lerMensagemChatAba("ping"), null);
    assert.equal(lerMensagemChatAba('{"t":"apagar"}'), null);
  });
  it("mensagem recebida: valida tudo; o autor só com foto interna", () => {
    const m = lerMensagemRecebida({ t: "chat", conversa: "p1", id: "abcdefgh12", de: 1, em: 10, texto: "oi", resp: null, autor: { id: 1, nome: "Ana", apelido: null, foto: "https://x.y/z.png" } });
    assert.ok(m);
    assert.equal(m.autor?.foto, null);
    assert.equal(lerMensagemRecebida({ conversa: "p1", id: "abcdefgh12", de: "1", em: 10, texto: "oi" }), null);
    assert.equal(lerMensagemRecebida({ conversa: "z", id: "abcdefgh12", de: 1, em: 10, texto: "oi" }), null);
  });
  it("limite: 30 por minuto, a janela renova", () => {
    let j: { inicio: number; n: number } | undefined;
    for (let i = 0; i < 30; i++) {
      const r = contarNaJanela(j, 1000);
      assert.equal(r.ok, true);
      j = r.janela;
    }
    assert.equal(contarNaJanela(j, 2000).ok, false);
    assert.equal(contarNaJanela(j, 62_000).ok, true);
  });
  it("juntar: a mesma (confirmação/eco) atualiza no lugar; teto tira as antigas", () => {
    let l = juntarMensagem([], { id: "a", v: 1 });
    l = juntarMensagem(l, { id: "b", v: 1 });
    l = juntarMensagem(l, { id: "a", v: 2 });
    assert.deepEqual(l, [
      { id: "a", v: 2 },
      { id: "b", v: 1 },
    ]);
    assert.deepEqual(juntarMensagem(l, { id: "c", v: 1 }, 2).map((x) => x.id), ["b", "c"]);
  });
  it("quantos leram: pela última lida de cada um, sem o autor", () => {
    const ids = ["m1", "m2", "m3"];
    const lida = new Map([
      [1, "m3"],
      [2, "m1"],
      [9, "m2"],
      [5, "saiu-da-tela"],
    ]);
    assert.equal(quantosLeram(ids, lida, 1, 9), 2); // 1 (m3) + 5 (fora da tela = leu tudo); 9 é o autor
    assert.equal(quantosLeram(ids, lida, 0, 9), 3);
  });
  it("cartões dos links do sistema (até 3, sem repetir; outro site não)", () => {
    const t = "veja https://governarv.com.br/painel/mesa?abrir=protocolo:12 e /painel/tarefas/abrir/7 e /painel/pca/3 e de novo /painel/tarefas/abrir/7";
    assert.deepEqual(
      cartoesDoTexto(t, "governarv.com.br").map((c) => c.rotulo),
      ["Protocolo #12", "Tarefa #7", "PCA #3"],
    );
    assert.deepEqual(cartoesDoTexto("https://outro.site/painel/pca/3", "governarv.com.br"), []);
    assert.equal(cartoesDoTexto("/painel/mesa?abrir=dfd:5")[0].href, "/painel/mesa?abrir=dfd:5");
  });
  it("@menção em curso", () => {
    assert.equal(mencaoEmCurso("oi @an"), "an");
    assert.equal(mencaoEmCurso("@"), "");
    assert.equal(mencaoEmCurso("email@x"), null);
    assert.equal(mencaoEmCurso("oi @ana "), null);
  });
  it("id, dia e hora (Brasília)", () => {
    assert.match(novoIdMensagem(), /^[a-z0-9]{16,24}$/);
    const agora = Date.parse("2026-10-06T15:00:00Z");
    assert.equal(rotuloDiaChat(agora - 3600_000, agora), "Hoje");
    assert.equal(rotuloDiaChat(agora - 86_400_000, agora), "Ontem");
    assert.equal(rotuloDiaChat(Date.parse("2026-10-01T15:00:00Z"), agora), "01/10");
    assert.equal(horaChat(Date.parse("2026-10-06T17:32:00Z")), "14:32");
  });
});

describe("chat ao vivo: conversas em grupo e bolhas", () => {
  it("digitando/lida da conversa em grupo levam os membros (para)", () => {
    assert.deepEqual(lerMensagemChatAba(JSON.stringify({ t: "digitando", conversa: "cabc123", para: [2, 2, 3, "x", -1] })), { t: "digitando", conversa: "cabc123", para: [2, 3] });
    assert.equal(lerMensagemChatAba(JSON.stringify({ t: "digitando", conversa: "cabc123" })), null);
    assert.equal(lerMensagemChatAba(JSON.stringify({ t: "lida", conversa: "cabc123", ate: "abcdefgh12", para: [] })), null);
    assert.deepEqual(lerMensagemChatAba(JSON.stringify({ t: "digitando", conversa: "p3", para: [9] })), { t: "digitando", conversa: "p3" });
    assert.deepEqual(lerIds(Array.from({ length: 30 }, (_, i) => i + 1))?.length, 20);
  });
  it("mensagem recebida da conversa em grupo: membros e nome", () => {
    const m = lerMensagemRecebida({ id: "abcdefgh12", conversa: "cabc123", de: 2, em: 1, texto: "oi", membros: [1, 2, 3], nome: " Compras\n " });
    assert.deepEqual([m?.membros, m?.nome], [[1, 2, 3], "Compras"]);
    assert.equal(lerMensagemRecebida({ id: "abcdefgh12", conversa: "p2", de: 2, em: 1, texto: "oi", membros: [1] })?.membros, undefined);
  });
  it("nome da conversa: o dado ou os primeiros nomes", () => {
    const nome = (id: number) => ["", "Ana", "Bruno", "Carla", "Diego", "Elisa"][id];
    assert.equal(rotuloConversa("Compras", [1, 2], 1, nome), "Compras");
    assert.equal(rotuloConversa("", [1, 2, 3], 1, nome), "Bruno e Carla");
    assert.equal(rotuloConversa(undefined, [1, 2, 3, 4], 1, nome), "Bruno, Carla e Diego");
    assert.equal(rotuloConversa(undefined, [1, 2, 3, 4, 5], 1, nome), "Bruno, Carla e mais 2");
  });
  it("bolhas: a aberta vai ao topo, até 4 à vista", () => {
    assert.deepEqual(abrirBolha(["a", "b", "c"], "c"), ["c", "a", "b"]);
    assert.deepEqual(abrirBolha(["a"], "z"), ["z", "a"]);
    assert.deepEqual(bolhasVisiveis(["a", "b", "c", "d", "e", "f"]), { visiveis: ["a", "b", "c", "d"], extras: ["e", "f"] });
  });
  it("formato antigo da pilha: lido só para a migração", () => {
    assert.deepEqual(lerPosicaoBolhas({ lado: "x", y: 7 }), { lado: "dir", y: 1 });
    assert.deepEqual(lerPosicaoBolhas(null), { lado: "dir", y: 1 });
  });
});

describe("chat ao vivo: sinal (lida/digitando) pelas caixas", () => {
  it("schema do sinal: conversa privada/em grupo, para, tipo e a mensagem lida", () => {
    assert.equal(chatSinalSchema.safeParse({ conversa: "p2", para: [2], t: "lida", ate: "abcdefgh12" }).success, true);
    assert.equal(chatSinalSchema.safeParse({ conversa: "cabc123xyz", para: [2, 3], t: "digitando" }).success, true);
    assert.equal(chatSinalSchema.safeParse({ conversa: "grupo", grupo: 7, t: "lida", ate: "abcdefgh12" }).success, true);
    assert.equal(chatSinalSchema.safeParse({ conversa: "outra", para: [2], t: "digitando" }).success, false);
    assert.equal(chatSinalSchema.safeParse({ conversa: "p2", para: [2], t: "outro" }).success, false);
    assert.equal(chatSinalSchema.safeParse({ conversa: "p2", para: [2], t: "digitando", extra: 1 }).success, false);
    assert.equal(chatSinalSchema.safeParse({ conversa: "p2", para: [2], t: "lida", ate: "x" }).success, false);
  });
});


describe("bolhas livres — arremessar", () => {
  it("velocidade dos últimos 90 ms e a projeção do arremesso (com teto)", async () => {
    const { velocidadeArrasto, projetarArremesso, ARREMESSO } = await import("../src/lib/chat-core.ts");
    assert.deepEqual(velocidadeArrasto([{ x: 0, y: 0, t: 0 }]), { vx: 0, vy: 0 });
    const v = velocidadeArrasto([
      { x: 0, y: 0, t: 0 },
      { x: 100, y: 0, t: 200 },
      { x: 150, y: 10, t: 250 },
      { x: 250, y: 30, t: 300 },
    ]);
    assert.equal(v.vx, 2);
    assert.equal(v.vy, 0.4);
    const p = projetarArremesso(900, 300, { vx: -3, vy: 0 });
    assert.equal(p.x, 900 - 3 * ARREMESSO.inercia);
    assert.equal(projetarArremesso(0, 0, { vx: 100, vy: -100 }).x, ARREMESSO.maxPx);
    assert.equal(projetarArremesso(0, 0, { vx: 100, vy: -100 }).y, -ARREMESSO.maxPx);
  });
});

describe("bolhas INDEPENDENTES — cada uma no seu lugar (v1.17.0)", () => {
  const tela = { largura: 1000, altura: 800, topo: 64, base: 16, tam: 56 };
  const passo = 56 + 10;
  const semSobrepor = (l: Record<string, { lado: string; top: number }>) => {
    const v = Object.values(l);
    for (let i = 0; i < v.length; i++)
      for (let j = i + 1; j < v.length; j++) if (v[i].lado === v[j].lado) assert.ok(Math.abs(v[i].top - v[j].top) >= passo, `${v[i].top} × ${v[j].top}`);
  };
  it("cada bolha fica onde foi deixada; mexer uma não mexe as outras", async () => {
    const { arrumarBolhas } = await import("../src/lib/chat-core.ts");
    const pos = { p1: { lado: "dir" as const, y: 1, t: 1 }, p2: { lado: "esq" as const, y: 0.2, t: 2 }, p3: { lado: "dir" as const, y: 0, t: 3 } };
    const antes = arrumarBolhas(pos, ["p1", "p2", "p3"], tela);
    const depois = arrumarBolhas({ ...pos, p2: { lado: "esq", y: 0.7, t: 9 } }, ["p1", "p2", "p3"], tela);
    assert.deepEqual(depois.p1, antes.p1);
    assert.deepEqual(depois.p3, antes.p3);
    assert.equal(depois.p2.lado, "esq");
    assert.ok(depois.p2.top > antes.p2.top);
  });
  it("a mexida por último fica; a que estava ali abre espaço (sem sobrepor, dentro da tela)", async () => {
    const { arrumarBolhas, topoDaPosicao } = await import("../src/lib/chat-core.ts");
    const pos = { p1: { lado: "dir" as const, y: 0.5, t: 1 }, p2: { lado: "dir" as const, y: 0.52, t: 5 } };
    const l = arrumarBolhas(pos, ["p1", "p2"], tela);
    assert.equal(l.p2.top, topoDaPosicao({ y: 0.52 }, tela));
    semSobrepor(l);
    // Lados diferentes nunca se empurram.
    const outro = arrumarBolhas({ ...pos, p1: { lado: "esq", y: 0.52, t: 1 } }, ["p1", "p2"], tela);
    assert.equal(outro.p1.top, outro.p2.top);
  });
  it("quatro na mesma altura se espalham, dentro da área livre; resultado estável", async () => {
    const { arrumarBolhas } = await import("../src/lib/chat-core.ts");
    const pos = Object.fromEntries(["p1", "p2", "p3", "p4"].map((k, i) => [k, { lado: "dir" as const, y: 1, t: i }]));
    const l = arrumarBolhas(pos, ["p1", "p2", "p3", "p4"], tela);
    semSobrepor(l);
    for (const x of Object.values(l)) assert.ok(x.top >= tela.topo && x.top <= tela.altura - tela.base - tela.tam);
    assert.deepEqual(arrumarBolhas(pos, ["p1", "p2", "p3", "p4"], tela), l);
    assert.equal(l.p4.top, tela.altura - tela.base - tela.tam);
  });
  it("sem posição: à direita, embaixo, empilhando para cima", async () => {
    const { arrumarBolhas } = await import("../src/lib/chat-core.ts");
    const l = arrumarBolhas({}, ["p1", "p2", "+"], tela);
    assert.equal(l.p1.top, tela.altura - tela.base - tela.tam);
    assert.equal(l.p2.top, l.p1.top - passo);
    assert.equal(l["+"].top, l.p2.top - passo);
    assert.ok(Object.values(l).every((x) => x.lado === "dir"));
  });
  it("pousar: o lado pela metade da tela; o arremesso leva ao outro lado", async () => {
    const { pousarBolha, projetarArremesso } = await import("../src/lib/chat-core.ts");
    assert.deepEqual(pousarBolha(200, 64, tela, 7), { lado: "esq", y: 0, t: 7 });
    assert.deepEqual(pousarBolha(900, 9999, tela, 7), { lado: "dir", y: 1, t: 7 });
    const p = projetarArremesso(900, 300, { vx: -3, vy: 0 });
    assert.equal(pousarBolha(p.x + 28, p.y, tela, 1).lado, "esq");
  });
  it("leitura tolerante e migração do formato antigo", async () => {
    const { lerPosicoesBolhas, migrarPosicoes, arrumarBolhas } = await import("../src/lib/chat-core.ts");
    assert.deepEqual(lerPosicoesBolhas(null), {});
    assert.deepEqual(lerPosicoesBolhas([1]), {});
    assert.deepEqual(lerPosicoesBolhas({ p2: { lado: "esq", y: 3, t: 4 }, xx: { lado: "dir", y: 0 }, p3: { lado: "?", y: 0 }, "+": { lado: "dir", y: 0.5 } }), {
      p2: { lado: "esq", y: 1, t: 4 },
      "+": { lado: "dir", y: 0.5, t: 0 },
    });
    const m = migrarPosicoes({ lado: "esq", y: 0 }, ["p1", "p2"]);
    assert.equal(m.p1.lado, "esq");
    const l = arrumarBolhas(m, ["p1", "p2"], tela);
    assert.equal(l.p1.top, tela.topo);
    assert.equal(l.p2.top, tela.topo + passo);
  });
});
