import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { fundoUrlValida, imagemDaPagina, pareceImagem, urlFundoCss } from "../src/lib/imagem-fundo-core.ts";

describe("imagem de fundo do quadro por link", () => {
  it("só HTTPS público", () => {
    assert.equal(fundoUrlValida(" https://i.pinimg.com/736x/ab/cd/ef.jpg "), "https://i.pinimg.com/736x/ab/cd/ef.jpg");
    assert.equal(fundoUrlValida("http://i.pinimg.com/x.jpg"), null);
    assert.equal(fundoUrlValida("https://localhost/x.jpg"), null);
    assert.equal(fundoUrlValida("https://192.168.0.1/x.jpg"), null);
    assert.equal(fundoUrlValida("webcal://site.com/x.jpg"), null);
    assert.equal(fundoUrlValida("javascript:alert(1)"), null);
    assert.equal(fundoUrlValida(`https://site.com/${"a".repeat(1100)}.jpg`), null);
  });

  it("reconhece o link direto de imagem", () => {
    assert.ok(pareceImagem("https://i.pinimg.com/originals/aa/bb.png?x=1"));
    assert.ok(pareceImagem("https://i.pinimg.com/736x/aa"));
    assert.ok(pareceImagem("https://site.com/fundo.WEBP"));
    assert.ok(!pareceImagem("https://br.pinterest.com/pin/123456/"));
  });

  it("tira a imagem de capa da página (og:image) — o pin do Pinterest", () => {
    const html = `<html><head>
      <meta name="description" content="x">
      <meta property='og:image' content='https://i.pinimg.com/736x/12/34/ab.jpg?a=1&amp;b=2'>
      <meta name="twitter:image" content="https://outra.com/t.jpg">
      </head></html>`;
    assert.equal(imagemDaPagina(html, "https://br.pinterest.com/pin/1/"), "https://i.pinimg.com/736x/12/34/ab.jpg?a=1&b=2");
    assert.equal(imagemDaPagina('<meta content="/img/capa.png" property="og:image">', "https://site.com/p/1"), "https://site.com/img/capa.png");
    assert.equal(imagemDaPagina('<meta name="twitter:image" content="https://site.com/t.jpg">', "https://site.com/"), "https://site.com/t.jpg");
    assert.equal(imagemDaPagina('<meta property="og:image" content="http://site.com/x.jpg">', "https://site.com/"), null);
    assert.equal(imagemDaPagina("<p>sem capa</p>", "https://site.com/"), null);
  });

  it("url() do CSS não escapa das aspas", () => {
    assert.equal(urlFundoCss('https://a.com/x".jpg'), 'url("https://a.com/x%22.jpg")');
    assert.equal(urlFundoCss("https://a.com/x\\y.jpg"), 'url("https://a.com/x%5Cy.jpg")');
  });
});
