import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { ROTULO_ENTIDADE } from "../src/lib/auditoria-core.ts";
import { areaDaRota, contaNosDados, DA_AGENDA, DA_EXECUCAO, DAS_TAREFAS, FORA_DOS_DADOS, versaoDaRota } from "../src/lib/versao-dados-core.ts";

test("versão dados: só tarefas, agenda, o acesso da conta e os cards de empenhos e a frota ficam fora; o resto (e o desconhecido) conta", () => {
  for (const e of Object.keys(ROTULO_ENTIDADE)) {
    const fora = (FORA_DOS_DADOS as readonly string[]).includes(e);
    assert.equal(contaNosDados(e), !fora, e);
    if (fora) assert.match(e, /^(tarefa|agenda_externa|trello_integracao|feriado|termo_uso|aparelho|centi_api|empenho_card|frota|veiculo)/, e);
  }
  for (const e of ["dfd", "dfd_item", "protocolo", "catalogo", "configuracao", "orcamento", "pca", "edicao_tabela", "automacao", "inventada"]) {
    assert.equal(contaNosDados(e), true, e);
  }
  // Toda entidade excluída existe na auditoria (nada de nome digitado errado).
  for (const e of FORA_DOS_DADOS) assert.ok(e in ROTULO_ENTIDADE, e);
});

test("areaDaRota: cada tela acompanha só a versão do que mostra", () => {
  for (const p of ["/painel/mesa", "/painel/pca", "/painel/pca/3", "/painel/orcamento/2", "/painel/catalogo", "/painel/catalogo/pasta/1", "/painel/verificacao"]) {
    assert.equal(areaDaRota(p), "dados", p);
  }
  assert.equal(areaDaRota("/painel/tarefas/4"), "tarefas");
  assert.equal(areaDaRota("/painel/calendario"), "calendario");
  for (const p of ["/painel/empenhos", "/painel/liquidacoes", "/painel/pagamentos", "/painel/execucao"]) assert.equal(areaDaRota(p), "execucao", p);
  for (const p of ["/painel/perfil", "/painel/usuarios", "/painel/mesas", "/painel/pcax", "/", "", null, undefined]) {
    assert.equal(areaDaRota(p), "completa", String(p));
  }
  const v = { completa: "9.1.1.1", dados: "5.1.1.1", tarefas: "7", agenda: "2", execucao: "8" };
  assert.equal(versaoDaRota(v, "/painel/mesa"), "5.1.1.1");
  assert.equal(versaoDaRota(v, "/painel/tarefas"), "7");
  assert.equal(versaoDaRota(v, "/painel/calendario"), "7|2|5.1.1.1");
  assert.equal(versaoDaRota(v, "/painel/empenhos"), "8");
  assert.equal(versaoDaRota(v, "/painel/perfil"), "9.1.1.1");
  // A importação automática (empenho_card) muda só a execução: a Mesa e as Tarefas não recarregam.
  const depois = { ...v, completa: "10.1.1.1", execucao: "10" };
  assert.equal(versaoDaRota(depois, "/painel/mesa"), versaoDaRota(v, "/painel/mesa"));
  assert.equal(versaoDaRota(depois, "/painel/tarefas"), versaoDaRota(v, "/painel/tarefas"));
  assert.notEqual(versaoDaRota(depois, "/painel/execucao"), versaoDaRota(v, "/painel/execucao"));
  for (const e of [...DAS_TAREFAS, ...DA_AGENDA, ...DA_EXECUCAO]) {
    assert.ok(e in ROTULO_ENTIDADE, e);
    assert.equal(contaNosDados(e), false, e);
  }
});

const ESPACOS_COM_ESQUELETO = ["pca/[id]", "orcamento/[id]", "tarefas/[id]", "catalogo/pasta/[id]"];

test("loading.tsx: compõe os esqueletos dos componentes (arquivos leves), nunca em página que só redireciona; em [id], só os ESPAÇOS", () => {
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
    const origens = [...s.matchAll(/^import .* from "([^"]+)";$/gm)].map((m) => m[1]);
    // Sempre a moldura (o atraso de 450 ms) e só esqueletos de componentes, em arquivos SEM "use client": o esqueleto vem no
    // HTML do servidor na hora, sem baixar o código das telas.
    assert.ok(origens.includes("@/components/EsqueletoTela"), p);
    for (const o of origens) {
      assert.match(o, /^@\/components\/[A-Za-z]+$/, `${p}: ${o}`);
      const fonte = readFileSync(`src/components/${o.slice("@/components/".length)}.tsx`, "utf8");
      assert.doesNotMatch(fonte, /^"use client"/, `${p}: ${o} é "use client"`);
    }
    // Em [id], só os espaços (sem o deles, valeria o da LISTA de cima — a grade de cartões no lugar do espaço).
    if (/\[/.test(p)) assert.ok(ESPACOS_COM_ESQUELETO.some((e) => p === join(raiz, e, "loading.tsx")), p);
  }
  // Páginas que só redirecionam e as que carregam os dados no próprio navegador (já têm o esqueleto delas) ficam sem.
  for (const r of ["dfds", "protocolos", "permissoes", "design-system", "usuarios", "grupos", "auditoria", "armazenamento", "orgaos"]) {
    assert.ok(!achados.includes(join(raiz, r, "loading.tsx")), r);
  }
  assert.ok(!achados.includes(join(raiz, "loading.tsx")));
});
