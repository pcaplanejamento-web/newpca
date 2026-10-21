import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { ROTULO_ENTIDADE } from "../src/lib/auditoria-core.ts";
import { areaDaRota, contaNosDados, FORA_DOS_DADOS, versaoDaRota } from "../src/lib/versao-dados-core.ts";

test("versão dados: só tarefas e agenda ficam fora; o resto (e o desconhecido) conta", () => {
  for (const e of Object.keys(ROTULO_ENTIDADE)) {
    const fora = (FORA_DOS_DADOS as readonly string[]).includes(e);
    assert.equal(contaNosDados(e), !fora, e);
    if (fora) assert.match(e, /^(tarefa|agenda_externa|trello_integracao|feriado)/, e);
  }
  for (const e of ["dfd", "dfd_item", "protocolo", "catalogo", "configuracao", "orcamento", "pca", "edicao_tabela", "automacao", "inventada"]) {
    assert.equal(contaNosDados(e), true, e);
  }
  // Toda entidade excluída existe na auditoria (nada de nome digitado errado).
  for (const e of FORA_DOS_DADOS) assert.ok(e in ROTULO_ENTIDADE, e);
});

test("areaDaRota: telas dos dados × completa", () => {
  for (const p of ["/painel/mesa", "/painel/pca", "/painel/pca/3", "/painel/orcamento/2", "/painel/catalogo", "/painel/catalogo/pasta/1", "/painel/verificacao"]) {
    assert.equal(areaDaRota(p), "dados", p);
  }
  for (const p of ["/painel/tarefas", "/painel/tarefas/4", "/painel/calendario", "/painel/perfil", "/painel/usuarios", "/painel/mesas", "/painel/pcax", "/", "", null, undefined]) {
    assert.equal(areaDaRota(p), "completa", String(p));
  }
  const v = { completa: "9.1.1.1", dados: "5.1.1.1" };
  assert.equal(versaoDaRota(v, "/painel/mesa"), "5.1.1.1");
  assert.equal(versaoDaRota(v, "/painel/tarefas"), "9.1.1.1");
});

test("loading.tsx: só o EsqueletoTela, nunca em página que só redireciona nem em [id]", () => {
  const raiz = "src/app/painel";
  const achados: string[] = [];
  const andar = (d: string) => {
    for (const n of readdirSync(d)) {
      const p = join(d, n);
      if (statSync(p).isDirectory()) andar(p);
      else if (n === "loading.tsx") achados.push(p);
    }
  };
  andar(raiz);
  assert.ok(achados.length >= 10);
  for (const p of achados) {
    const s = readFileSync(p, "utf8");
    const imports = s.match(/^import .*$/gm) ?? [];
    assert.deepEqual(imports, ['import { EsqueletoTela } from "@/components/EsqueletoTela";'], p);
    assert.doesNotMatch(p, /\[/, p);
  }
  for (const r of ["dfds", "protocolos", "permissoes", "design-system"]) {
    assert.ok(!achados.includes(join(raiz, r, "loading.tsx")), r);
  }
  assert.ok(!achados.includes(join(raiz, "loading.tsx")));
});
