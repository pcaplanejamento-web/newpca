import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  chaveTentativa,
  JANELA_RECUPERACAO_MS,
  LIMITES_FALHA,
  lerTentativa,
  podeTentarDeNovo,
  recuperavelSozinho,
  relatorioDaFalha,
  TEXTO_FALHA,
  TIPOS_FALHA,
  textoDetalhes,
  tipoDaFalha,
} from "../src/lib/erro-tela-core.ts";
import { falhaTelaSchema } from "../src/lib/erro-tela-validation.ts";

describe("falha na tela — tipo", () => {
  it("o digest (erro do servidor) vale primeiro", () => {
    assert.equal(tipoDaFalha({ message: "Connection closed.", digest: "123" }), "servidor");
    assert.equal(tipoDaFalha({ message: "qualquer", digest: "  " }), "tela");
  });
  it("versão nova publicada (pedaço do sistema que não carregou)", () => {
    assert.equal(tipoDaFalha({ name: "ChunkLoadError", message: "Loading chunk 4821 failed." }), "versao");
    assert.equal(tipoDaFalha({ message: "Loading CSS chunk app/painel/page failed" }), "versao");
    assert.equal(tipoDaFalha({ message: "Failed to fetch dynamically imported module: https://x/_next/a.js" }), "versao");
    assert.equal(tipoDaFalha({ message: "Importing a module script failed." }), "versao");
  });
  it("resposta cortada ou rede", () => {
    assert.equal(tipoDaFalha({ message: "Connection closed." }), "conexao");
    assert.equal(tipoDaFalha({ name: "TypeError", message: "Failed to fetch" }), "conexao");
    assert.equal(tipoDaFalha({ message: "Load failed" }), "conexao");
    assert.equal(tipoDaFalha({ message: "NetworkError when attempting to fetch resource." }), "conexao");
  });
  it("o resto é da própria tela; entrada estranha não quebra", () => {
    assert.equal(tipoDaFalha({ name: "TypeError", message: "Cannot read properties of undefined (reading 'map')" }), "tela");
    assert.equal(tipoDaFalha(null), "tela");
    assert.equal(tipoDaFalha(undefined), "tela");
    assert.equal(tipoDaFalha({ message: 42, name: {}, digest: 7 }), "tela");
  });
  it("só a da própria tela não se recupera sozinha", () => {
    assert.deepEqual(
      TIPOS_FALHA.filter((t) => recuperavelSozinho(t)),
      ["servidor", "versao", "conexao"],
    );
    for (const t of TIPOS_FALHA) assert.ok(TEXTO_FALHA[t].titulo && TEXTO_FALHA[t].explicacao);
  });
});

describe("falha na tela — recuperação automática (uma por minuto)", () => {
  it("sem tentativa anterior, pode", () => {
    assert.equal(podeTentarDeNovo(null, 1000), true);
    assert.equal(podeTentarDeNovo(Number.NaN, 1000), true);
  });
  it("dentro da janela, não (a 2ª falha seguida mostra a tela)", () => {
    assert.equal(podeTentarDeNovo(1000, 1000 + JANELA_RECUPERACAO_MS - 1), false);
    assert.equal(podeTentarDeNovo(1000, 1000 + JANELA_RECUPERACAO_MS), true);
  });
  it("relógio voltado não trava para sempre", () => {
    assert.equal(podeTentarDeNovo(5000, 1000), true);
  });
  it("chave por tela (a busca conta) e leitura tolerante", () => {
    assert.equal(chaveTentativa("/painel/pca/1?aba=mesa"), "falha-tela:/painel/pca/1?aba=mesa");
    assert.notEqual(chaveTentativa("/painel/pca/1?aba=mesa"), chaveTentativa("/painel/pca/1?aba=dashboard"));
    assert.equal(chaveTentativa("x".repeat(500)).length, "falha-tela:".length + 200);
    assert.equal(lerTentativa("1700000000000"), 1700000000000);
    assert.equal(lerTentativa(null), null);
    assert.equal(lerTentativa(""), null);
    assert.equal(lerTentativa("abc"), null);
  });
});

describe("falha na tela — relatório", () => {
  it("campos cortados nos limites e aceitos pelo Zod", () => {
    const r = relatorioDaFalha(
      { name: "E".repeat(200), message: "m".repeat(900), digest: "d".repeat(200), stack: "s".repeat(5000) },
      { caminho: `/painel/${"p".repeat(400)}`, automatica: true, instante: "2026-10-01T12:00:00.000Z" },
    );
    assert.equal(r.nome.length, LIMITES_FALHA.nome);
    assert.equal(r.mensagem.length, LIMITES_FALHA.mensagem);
    assert.equal(r.digest.length, LIMITES_FALHA.digest);
    assert.equal(r.pilha.length, LIMITES_FALHA.pilha);
    assert.equal(r.caminho.length, LIMITES_FALHA.caminho);
    assert.equal(r.automatica, true);
    const p = falhaTelaSchema.safeParse(r);
    assert.ok(p.success);
  });
  it("o Zod recusa o que passa dos limites e o tipo desconhecido", () => {
    assert.equal(falhaTelaSchema.safeParse({ tipo: "outro", caminho: "/" }).success, false);
    assert.equal(falhaTelaSchema.safeParse({ tipo: "tela", caminho: "/", mensagem: "m".repeat(301) }).success, false);
    const min = falhaTelaSchema.parse({ tipo: "conexao", caminho: "/painel/mesa" });
    assert.equal(min.mensagem, "");
    assert.equal(min.automatica, false);
  });
  it("detalhes: o que o administrador precisa para achar nos Logs", () => {
    const r = relatorioDaFalha(
      { message: "Connection closed." },
      { caminho: "/painel/pca/1?aba=mesa", automatica: false, instante: "2026-10-01T12:00:00.000Z" },
    );
    const t = textoDetalhes(r);
    assert.match(t, /Tipo: resposta interrompida/);
    assert.match(t, /Mensagem: Connection closed\./);
    assert.match(t, /Tela: \/painel\/pca\/1\?aba=mesa/);
    assert.doesNotMatch(t, /Ref\./);
    assert.match(textoDetalhes(relatorioDaFalha({ digest: "99" }, { caminho: "/", automatica: false, instante: "" })), /Ref\.: 99/);
  });
});
