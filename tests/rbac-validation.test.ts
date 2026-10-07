import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { z } from "zod";
import "../src/lib/zod-config.ts";
import { CODIGO_GERAL, ehCodigoGeral } from "../src/lib/escopo-unidades-core.ts";
import {
  grupoAtivoSchema,
  grupoCreateSchema,
  grupoPatchSchema,
  MAX_NOME_RBAC,
  orgaoSchema,
  permissaoPatchSchema,
  pessoaResponsavelPatchSchema,
  pessoaResponsavelSchema,
  permissaoSchema,
  reparticaoAtivaSchema,
  reparticaoSchema,
  vinculoResponsavelSchema,
} from "../src/lib/rbac-validation.ts";

// Validação da administração de Grupos, Permissões e Unidades — em especial o PATCH, que NÃO pode injetar os
// valores padrão da criação (o `.partial()` mantinha o `.default([])`: um PATCH só com o nome apagava as pessoas e
// as unidades do grupo, e as telas da permissão).

describe("PATCH de grupo e permissão não injeta padrões", () => {
  it("grupo: só o nome — pessoas, unidades e permissão ficam de fora (como estão)", () => {
    const r = grupoPatchSchema.parse({ nome: "Compras" });
    assert.deepEqual(r, { nome: "Compras" });
    assert.equal("membros" in r, false);
    assert.equal("reparticoes" in r, false);
    assert.equal("permissaoId" in r, false);
  });

  it("grupo: lista vazia explícita esvazia (e é diferente de ausente)", () => {
    assert.deepEqual(grupoPatchSchema.parse({ membros: [] }), { membros: [] });
    assert.deepEqual(grupoPatchSchema.parse({ permissaoId: null }), { permissaoId: null });
  });

  it("permissão: só o nome — as telas ficam de fora", () => {
    const r = permissaoPatchSchema.parse({ nome: "Consulta" });
    assert.deepEqual(r, { nome: "Consulta" });
    assert.equal("abas" in r, false);
  });

  it("permissão: telas desconhecidas são recusadas", () => {
    assert.equal(permissaoPatchSchema.safeParse({ abas: ["dfd", "nao-existe"] }).success, false);
    assert.deepEqual(permissaoPatchSchema.parse({ abas: ["pca", "dfd"] }), { abas: ["pca", "dfd"] });
  });

  it("criação continua com os padrões (grupo sem pessoas/unidades, permissão sem telas)", () => {
    assert.deepEqual(grupoCreateSchema.parse({ nome: "Novo" }), { nome: "Novo", membros: [], reparticoes: [] });
    assert.deepEqual(permissaoSchema.parse({ nome: "Nova" }), { nome: "Nova", abas: [] });
  });
});

describe("ids e nomes", () => {
  it("ids repetidos viram um só (um repetido derrubaria o lote pela chave primária)", () => {
    assert.deepEqual(grupoCreateSchema.parse({ nome: "G", membros: [3, 1, 3, 2, 1] }).membros, [3, 1, 2]);
    assert.deepEqual(grupoPatchSchema.parse({ reparticoes: [5, 5] }).reparticoes, [5]);
  });

  it("ids inválidos são recusados", () => {
    assert.equal(grupoPatchSchema.safeParse({ membros: [0] }).success, false);
    assert.equal(grupoPatchSchema.safeParse({ membros: [1.5] }).success, false);
    assert.equal(grupoPatchSchema.safeParse({ permissaoId: -1 }).success, false);
  });

  it("nome: obrigatório, sem espaços nas pontas e até o limite", () => {
    assert.equal(grupoCreateSchema.parse({ nome: "  Planejamento  " }).nome, "Planejamento");
    assert.equal(grupoCreateSchema.safeParse({ nome: "   " }).success, false);
    const longo = "x".repeat(MAX_NOME_RBAC + 1);
    const r = permissaoSchema.safeParse({ nome: longo });
    assert.equal(r.success, false);
    assert.match(r.error?.issues[0]?.message ?? "", /Use até 60 caracteres/);
    assert.equal(permissaoSchema.safeParse({ nome: "x".repeat(MAX_NOME_RBAC) }).success, true);
  });

  it("grupo e unidade ativos do cabeçalho: número inteiro positivo", () => {
    assert.deepEqual(grupoAtivoSchema.parse({ grupoId: 4 }), { grupoId: 4 });
    assert.equal(grupoAtivoSchema.safeParse({ grupoId: "4" }).success, false);
    assert.equal(grupoAtivoSchema.safeParse({}).success, false);
    assert.equal(reparticaoAtivaSchema.safeParse({ reparticaoId: 0 }).success, false);
    assert.deepEqual(reparticaoAtivaSchema.parse({ reparticaoId: 9 }), { reparticaoId: 9 });
  });
});

describe("sigla GERAL reservada à unidade virtual", () => {
  it("ehCodigoGeral ignora caixa e espaços", () => {
    assert.equal(CODIGO_GERAL, "GERAL");
    for (const c of ["GERAL", "geral", " Geral ", "gErAl"]) assert.equal(ehCodigoGeral(c), true, c);
    for (const c of ["GERAL2", "SEMGE", "", null, undefined]) assert.equal(ehCodigoGeral(c), false, String(c));
  });

  it("unidade e órgão com a sigla GERAL são recusados (criar e editar)", () => {
    const u = reparticaoSchema.safeParse({ codigo: " geral ", nome: "Qualquer" });
    assert.equal(u.success, false);
    assert.match(u.error?.issues[0]?.message ?? "", /reservada/);
    const o = orgaoSchema.safeParse({ sigla: "Geral", nome: "Qualquer" });
    assert.equal(o.success, false);
    assert.equal(reparticaoSchema.safeParse({ codigo: "SEMGE", nome: "Educação", orgaoId: 1 }).success, true);
    // Toda unidade pertence a um órgão.
    assert.equal(reparticaoSchema.safeParse({ codigo: "SEMGE", nome: "Educação" }).success, false);
    assert.equal(reparticaoSchema.safeParse({ codigo: "SEMGE", nome: "Educação", orgaoId: null }).success, false);
    assert.equal(orgaoSchema.safeParse({ sigla: "PMRV", nome: "Prefeitura" }).success, true);
  });
});

describe("mensagens padrão do Zod em português", () => {
  it("um schema sem mensagem própria responde em pt-BR", () => {
    const r = z.object({ a: z.string() }).safeParse({ a: 1 });
    assert.equal(r.success, false);
    const msg = r.error?.issues[0]?.message ?? "";
    assert.doesNotMatch(msg, /Invalid input|expected/i);
    assert.match(msg, /inválid|esperado/i);
  });
});

describe("planilha de responsáveis (pessoa + vínculo)", () => {
  it("a pessoa exige o nome; a matrícula é opcional; o PATCH não injeta padrões", () => {
    assert.deepEqual(pessoaResponsavelSchema.parse({ nome: " Ana " }), { nome: "Ana", matricula: "" });
    assert.equal(pessoaResponsavelSchema.safeParse({ nome: "  " }).success, false);
    assert.deepEqual(pessoaResponsavelPatchSchema.parse({ matricula: "12" }), { matricula: "12" });
  });

  it("o vínculo vai a UMA unidade OU a UM órgão", () => {
    const base = { responsavelId: 1, tipo: "padrao" };
    assert.equal(vinculoResponsavelSchema.safeParse({ ...base, orgaoId: 2 }).success, true);
    assert.equal(vinculoResponsavelSchema.safeParse({ ...base, reparticaoId: 3 }).success, true);
    assert.equal(vinculoResponsavelSchema.safeParse({ ...base, orgaoId: 2, reparticaoId: 3 }).success, false);
    assert.equal(vinculoResponsavelSchema.safeParse(base).success, false);
    assert.equal(vinculoResponsavelSchema.safeParse({ ...base, tipo: "outro", orgaoId: 2 }).success, false);
  });

  it("órgão e unidade não carregam mais os responsáveis (o campo é descartado)", () => {
    const o = orgaoSchema.parse({ sigla: "PMRV", nome: "Prefeitura", responsaveis: { padroes: [], temporarios: [] } });
    assert.equal("responsaveis" in o, false);
    const u = reparticaoSchema.parse({ codigo: "SMS", nome: "Saúde", orgaoId: 1, responsaveis: { padroes: [], temporarios: [] } });
    assert.equal("responsaveis" in u, false);
  });
});
