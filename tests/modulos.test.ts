import assert from "node:assert/strict";
import { test } from "node:test";
import {
  idDoNome,
  lerModulos,
  lerModulosGrupo,
  MODULOS_PADRAO,
  modulosDasTelas,
  motivoModulosInvalidos,
  secoesDosModulos,
  telasDoGrupo,
  telasDosModulos,
  telasSemModulo,
} from "../src/lib/modulos-core.ts";
import { coerceDetalhes, compactarDetalhes, diffDetalhes } from "../src/lib/papeis-detalhes-core.ts";

const L = lerModulos([
  { id: "planejamento", nome: "Planejamento", telas: ["dfd", "pca", "verificacao"] },
  { id: "apoio", nome: "Apoio", telas: ["tarefas", "calendario", "pca"] },
]);

test("lerModulos: inválido = padrão; tela em UM módulo (o 1º vence); nome obrigatório; id único", () => {
  assert.deepEqual(lerModulos(null), MODULOS_PADRAO);
  assert.deepEqual(lerModulos([{ id: "x", nome: " ", telas: [] }]), MODULOS_PADRAO);
  assert.deepEqual(L[1].telas, ["tarefas", "calendario"]);
  assert.equal(lerModulos([{ id: "a", nome: "A", telas: [] }, { id: "a", nome: "B", telas: [] }]).length, 1);
  assert.deepEqual(telasSemModulo(L), ["catalogo", "orcamento", "documentos", "empenhos"]);
});

test("grupo pelos módulos; antigo pelas avulsas que têm módulo; módulo apagado não libera nada", () => {
  assert.deepEqual(telasDosModulos(L, ["apoio", "sumiu"]), ["tarefas", "calendario"]);
  assert.deepEqual(telasDoGrupo(L, null, ["dfd", "catalogo"]), ["dfd"]);
  assert.deepEqual(telasDoGrupo(L, [], ["dfd"]), []);
  assert.equal(lerModulosGrupo(null), null);
  assert.deepEqual(lerModulosGrupo("lixo"), []);
  assert.deepEqual(modulosDasTelas(L, ["dfd", "pca", "verificacao", "tarefas"]), ["planejamento"]);
  assert.match(motivoModulosInvalidos(["zz"], L) ?? "", /zz/);
  assert.equal(motivoModulosInvalidos(["apoio"], L), null);
});

test("seções do menu: só as abertas, na ordem do módulo; o ADM vê as sem módulo", () => {
  assert.deepEqual(secoesDosModulos(L, new Set(["pca", "tarefas"])).map((s) => [s.nome, s.telas]), [["Planejamento", ["pca"]], ["Apoio", ["tarefas"]]]);
  assert.deepEqual(secoesDosModulos(L, new Set(["catalogo"]), true).map((s) => s.nome), ["Outras telas"]);
  assert.equal(idDoNome("Planejamento e Compras", new Set(["planejamento-e-compras"])), "planejamento-e-compras-2");
});

test("papel: ver quem está online (padrão sim; desligar restringe e é compactado)", () => {
  const d = coerceDetalhes({});
  assert.equal(d.presenca.verOnline, true);
  const sem = coerceDetalhes({ presenca: { verOnline: false } });
  assert.deepEqual(compactarDetalhes(sem), { presenca: { verOnline: false } });
  assert.ok(diffDetalhes(d, sem).some((x) => x.id === "presenca.verOnline" && x.restringe));
});
