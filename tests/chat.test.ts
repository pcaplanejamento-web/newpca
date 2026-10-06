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
} from "../src/lib/chat-core.ts";
import { chatPrivadoSchema, configChatSchema } from "../src/lib/presenca-validation.ts";

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
  });
  it("schemas: estritos e com tetos", () => {
    assert.equal(configChatSchema.safeParse({ grupo: true, privado: false }).success, true);
    assert.equal(configChatSchema.safeParse({ grupo: true }).success, false);
    assert.equal(chatPrivadoSchema.safeParse({ para: 2, id: "abcdefgh12", texto: "oi" }).success, true);
    assert.equal(chatPrivadoSchema.safeParse({ para: 2, id: "curto", texto: "oi" }).success, false);
    assert.equal(chatPrivadoSchema.safeParse({ para: 2, id: "abcdefgh12", texto: "" }).success, false);
    assert.equal(chatPrivadoSchema.safeParse({ para: 2, id: "abcdefgh12", texto: "oi", extra: 1 }).success, false);
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
