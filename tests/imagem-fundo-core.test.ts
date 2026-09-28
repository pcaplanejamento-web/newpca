import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  AJUSTE_FUNDO_PADRAO,
  arrastarFundo,
  avaliarImagemFundo,
  estiloFundo,
  fundoUrlValida,
  imagemDaPagina,
  lerAjusteFundo,
  pareceImagem,
  urlFundoCss,
} from "../src/lib/imagem-fundo-core.ts";

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

describe("enquadramento da imagem de fundo", () => {
  it("lê o gravado com limites; inválido = padrão", () => {
    assert.deepEqual(lerAjusteFundo(null), AJUSTE_FUNDO_PADRAO);
    assert.deepEqual(lerAjusteFundo("lixo"), AJUSTE_FUNDO_PADRAO);
    assert.deepEqual(lerAjusteFundo('{"x":20,"y":130,"zoom":9}'), { x: 20, y: 100, zoom: 3 });
    assert.deepEqual(lerAjusteFundo({ x: "30", y: -5, zoom: 0.2 }), { x: 30, y: 0, zoom: 1 });
  });

  it("estilo: ponto focal e zoom a partir dele", () => {
    assert.deepEqual(estiloFundo({ x: 20, y: 70, zoom: 1 }), { objectPosition: "20% 70%", transformOrigin: "20% 70%", transform: undefined });
    assert.equal(estiloFundo({ x: 50, y: 50, zoom: 2 }).transform, "scale(2)");
  });

  it("arrastar: o conteúdo acompanha o dedo; sem sobra, o eixo não anda", () => {
    // Imagem 16:9 numa prévia 16:9 sem zoom: nenhuma sobra.
    assert.deepEqual(arrastarFundo(AJUSTE_FUNDO_PADRAO, 50, 50, { w: 320, h: 180 }, { w: 1920, h: 1080 }), AJUSTE_FUNDO_PADRAO);
    // Imagem quadrada numa prévia 16:9: sobra vertical de 140px — arrastar 70px para baixo mostra mais do TOPO.
    const a = arrastarFundo(AJUSTE_FUNDO_PADRAO, 0, 70, { w: 320, h: 180 }, { w: 1000, h: 1000 });
    assert.equal(a.x, 50);
    assert.equal(a.y, 0);
    // Com zoom 2 há sobra nos dois eixos.
    const z = arrastarFundo({ x: 50, y: 50, zoom: 2 }, -32, 0, { w: 320, h: 180 }, { w: 1920, h: 1080 });
    assert.ok(z.x > 50);
  });

  it("avisa retrato, proporção fora e resolução baixa", () => {
    assert.deepEqual(avaliarImagemFundo(1920, 1080), []);
    assert.equal(avaliarImagemFundo(2160, 3840).length, 1);
    assert.equal(avaliarImagemFundo(800, 800).length, 2);
    assert.equal(avaliarImagemFundo(0, 0).length, 0);
  });
});
