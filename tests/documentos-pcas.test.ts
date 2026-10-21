import assert from "node:assert/strict";
import { test } from "node:test";
import {
  alternarPcaDocumento,
  documentoNoPca,
  documentoVisivel,
  gravarPcasDocumento,
  lerPcasDocumento,
  mesclarPcasDoGrupo,
  passaFiltroPca,
} from "../src/lib/documentos-core.ts";
import { tipoPermitido } from "../src/lib/pesquisa-core.ts";

test("ler/gravar os PCAs do documento", () => {
  assert.deepEqual(lerPcasDocumento(null), []);
  assert.equal(lerPcasDocumento("todos"), "todos");
  assert.deepEqual(lerPcasDocumento("[3,1,3,\"x\",-2]"), [3, 1]);
  assert.deepEqual(lerPcasDocumento("lixo"), []);
  assert.equal(gravarPcasDocumento([]), null);
  assert.equal(gravarPcasDocumento([3, 1, 3]), "[1,3]");
  assert.equal(gravarPcasDocumento("todos"), "todos");
});

test("vínculo, filtro e alternância", () => {
  assert.ok(documentoNoPca("todos", 9));
  assert.ok(documentoNoPca([9], 9) && !documentoNoPca([], 9));
  assert.ok(passaFiltroPca([], "sem") && !passaFiltroPca("todos", "sem") && passaFiltroPca([2], "2") && passaFiltroPca([], ""));
  assert.deepEqual(alternarPcaDocumento([1], 2, true, [1, 2, 3]), [1, 2]);
  assert.equal(alternarPcaDocumento("todos", 2, true, [1, 2]), "todos");
  assert.deepEqual(alternarPcaDocumento("todos", 2, false, [1, 2, 3]), [1, 3]);
});

test("grupos: o documento de PCAs de fora some; a edição só mexe nos do grupo", () => {
  const g = new Set([1, 2]);
  assert.ok(documentoVisivel([], g) && documentoVisivel("todos", g) && documentoVisivel([2, 9], g));
  assert.ok(!documentoVisivel([9], g));
  assert.ok(documentoVisivel([9], null));
  assert.deepEqual(mesclarPcasDoGrupo([1, 9], [2], g), [9, 2]);
  assert.equal(mesclarPcasDoGrupo([1], "todos", g), null);
  assert.equal(mesclarPcasDoGrupo("todos", [1], g), null);
  assert.equal(mesclarPcasDoGrupo([1], "todos", null), "todos");
});

test("pesquisa: documentos só para quem abre a tela", () => {
  const p = (telas: string[]) => ({ admin: false, ve: (t: string) => telas.includes(t), libera: () => true });
  assert.ok(tipoPermitido(p(["documentos"]), "documento"));
  assert.ok(!tipoPermitido(p(["dfd"]), "documento"));
});
