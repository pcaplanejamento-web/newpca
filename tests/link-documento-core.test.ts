import assert from "node:assert/strict";
import { test } from "node:test";
import { nomeDoLink, urlPdfDoGoogle } from "../src/lib/link-documento-core.ts";

const ID = "1AbCdEfGhIjKlMnOp_qrs-T";

test("Docs, planilhas e apresentações viram a exportação em PDF", () => {
  assert.equal(urlPdfDoGoogle(`https://docs.google.com/document/d/${ID}/edit?usp=sharing`), `https://docs.google.com/document/d/${ID}/export?format=pdf`);
  assert.equal(urlPdfDoGoogle(`https://docs.google.com/spreadsheets/d/${ID}/edit`), `https://docs.google.com/spreadsheets/d/${ID}/export?format=pdf`);
  assert.equal(urlPdfDoGoogle(`https://docs.google.com/presentation/d/${ID}`), `https://docs.google.com/presentation/d/${ID}/export?format=pdf`);
});

test("Drive vira o download direto", () => {
  const d = `https://drive.usercontent.google.com/download?id=${ID}&export=download&confirm=t`;
  assert.equal(urlPdfDoGoogle(`https://drive.google.com/file/d/${ID}/view?usp=sharing`), d);
  assert.equal(urlPdfDoGoogle(`https://drive.google.com/open?id=${ID}`), d);
  assert.equal(urlPdfDoGoogle(`https://drive.google.com/uc?id=${ID}&export=download`), d);
});

test("outros links são recusados", () => {
  assert.equal(urlPdfDoGoogle("https://exemplo.com/a.pdf"), null);
  assert.equal(urlPdfDoGoogle(`http://drive.google.com/file/d/${ID}`), null);
  assert.equal(urlPdfDoGoogle("texto"), null);
  assert.equal(urlPdfDoGoogle("https://drive.google.com/drive/folders/x"), null);
});

test("nome do documento", () => {
  assert.equal(nomeDoLink("Relatório.pdf"), "Relatório");
  assert.equal(nomeDoLink(undefined), "Documento do Google");
});
