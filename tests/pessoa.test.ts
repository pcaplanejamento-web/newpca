import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { decodificarFoto, nomeExibicao, normalizarApelido, rotuloOpcaoPessoa, urlFoto } from "../src/lib/pessoa.ts";

describe("pessoa — nome de exibição (apelido)", () => {
  it("usa o apelido quando houver; senão o nome", () => {
    assert.equal(nomeExibicao({ nome: "Jhone Eduardo Costa", apelido: "Jhone" }), "Jhone");
    assert.equal(nomeExibicao({ nome: "Ana Souza", apelido: null }), "Ana Souza");
    assert.equal(nomeExibicao({ nome: "Ana Souza", apelido: "   " }), "Ana Souza");
    assert.equal(nomeExibicao(null), "");
  });

  it("normaliza o apelido para gravar (espaços colapsados; vazio = null)", () => {
    assert.equal(normalizarApelido("  Zé   da  Silva "), "Zé da Silva");
    assert.equal(normalizarApelido("   "), null);
    assert.equal(normalizarApelido(undefined), null);
  });

  it("rótulo de opção: apelido — nome completo (quando diferem) e (eu)", () => {
    assert.equal(rotuloOpcaoPessoa({ id: 1, nome: "Jhone Eduardo Costa", apelido: "Jhone" }), "Jhone — Jhone Eduardo Costa");
    assert.equal(rotuloOpcaoPessoa({ id: 2, nome: "Ana Souza", apelido: null }), "Ana Souza");
    assert.equal(rotuloOpcaoPessoa({ id: 2, nome: "Ana Souza", apelido: null }, 2), "Ana Souza (eu)");
  });
});

describe("pessoa — foto", () => {
  it("URL com a versão (só dígitos) e null sem foto", () => {
    assert.equal(urlFoto(7, true, "2026-09-23 15:04:05"), "/api/usuarios/7/foto?v=20260923150405");
    assert.equal(urlFoto(7, true, null), "/api/usuarios/7/foto");
    assert.equal(urlFoto(7, false, "2026-09-23"), null);
  });

  it("decodifica o data-URL gravado em bytes + tipo; recusa o que não é imagem", () => {
    const png = decodificarFoto("data:image/png;base64,iVBORw0KGgo=");
    assert.equal(png?.tipo, "image/png");
    assert.deepEqual([...(png?.bytes ?? [])].slice(0, 4), [0x89, 0x50, 0x4e, 0x47]);
    assert.equal(decodificarFoto("data:image/jpg;base64,/9j/4A==")?.tipo, "image/jpeg");
    assert.equal(decodificarFoto("data:text/html;base64,PGI+"), null);
    assert.equal(decodificarFoto(""), null);
    assert.equal(decodificarFoto(null), null);
    assert.equal(decodificarFoto("data:image/png;base64,***"), null);
  });
});
