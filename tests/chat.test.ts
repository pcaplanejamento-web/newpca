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
  encostarBolhas,
  lerIds,
  lerPosicaoBolhas,
  novaConversaEmGrupo,
  rotuloConversa,
  topoDasBolhas,
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
    assert.equal(chatEnviarSchema.safeParse({ ...base, conversa: "grupo" }).success, false);
    assert.equal(chatEnviarSchema.safeParse({ ...base, para: [] }).success, false);
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
  it("posição: encosta no lado mais perto, a altura dentro da área", () => {
    const tela = { largura: 1000, altura: 800, topo: 60, base: 20 };
    assert.deepEqual(encostarBolhas(200, 60, tela, 120), { lado: "esq", y: 0 });
    assert.deepEqual(encostarBolhas(900, 9999, tela, 120), { lado: "dir", y: 1 });
    assert.deepEqual(encostarBolhas(900, 360, tela, 120), { lado: "dir", y: 0.5 });
    assert.equal(topoDasBolhas({ lado: "dir", y: 0.5 }, tela, 120), 360);
    assert.equal(topoDasBolhas({ lado: "dir", y: 1 }, { ...tela, altura: 100 }, 120), 60);
    assert.deepEqual(lerPosicaoBolhas({ lado: "x", y: 7 }), { lado: "dir", y: 1 });
    assert.deepEqual(lerPosicaoBolhas(null), { lado: "dir", y: 1 });
  });
});

describe("chat ao vivo: sinal (lida/digitando) pelas caixas", () => {
  it("schema do sinal: conversa privada/em grupo, para, tipo e a mensagem lida", () => {
    assert.equal(chatSinalSchema.safeParse({ conversa: "p2", para: [2], t: "lida", ate: "abcdefgh12" }).success, true);
    assert.equal(chatSinalSchema.safeParse({ conversa: "cabc123xyz", para: [2, 3], t: "digitando" }).success, true);
    assert.equal(chatSinalSchema.safeParse({ conversa: "grupo", para: [2], t: "digitando" }).success, false);
    assert.equal(chatSinalSchema.safeParse({ conversa: "p2", para: [2], t: "outro" }).success, false);
    assert.equal(chatSinalSchema.safeParse({ conversa: "p2", para: [], t: "digitando" }).success, false);
    assert.equal(chatSinalSchema.safeParse({ conversa: "p2", para: [2], t: "lida", ate: "x" }).success, false);
  });
});
