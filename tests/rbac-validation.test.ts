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
  pessoaResponsavelPatchSchema,
  pessoaResponsavelSchema,
  reparticaoAtivaSchema,
  reparticaoSchema,
  vinculoResponsavelPatchSchema,
  vinculoResponsavelSchema,
} from "../src/lib/rbac-validation.ts";

// Validação da administração de Grupos e Unidades — em especial o PATCH, que NÃO pode injetar os valores padrão da
// criação (o `.partial()` mantinha o `.default([])`: um PATCH só com o nome apagava as pessoas, as unidades e as telas).

describe("PATCH de grupo não injeta padrões", () => {
  it("grupo: só o nome — telas, PCAs, pessoas e unidades ficam de fora (como estão)", () => {
    const r = grupoPatchSchema.parse({ nome: "Compras" });
    assert.deepEqual(r, { nome: "Compras" });
    for (const k of ["membros", "reparticoes", "abas", "pcas"]) assert.equal(k in r, false);
  });

  it("grupo: lista vazia explícita esvazia (e é diferente de ausente); PCAs null = todos", () => {
    assert.deepEqual(grupoPatchSchema.parse({ membros: [] }), { membros: [] });
    assert.deepEqual(grupoPatchSchema.parse({ pcas: null }), { pcas: null });
    assert.deepEqual(grupoPatchSchema.parse({ pcas: [] }), { pcas: [] });
  });

  it("telas: só as conhecidas, sem repetir", () => {
    assert.equal(grupoPatchSchema.safeParse({ abas: ["dfd", "nao-existe"] }).success, false);
    assert.deepEqual(grupoPatchSchema.parse({ abas: ["pca", "dfd", "pca"] }), { abas: ["pca", "dfd"] });
  });

  it("criação com os padrões: sem telas, todos os PCAs, sem pessoas/unidades", () => {
    assert.deepEqual(grupoCreateSchema.parse({ nome: "Novo" }), { nome: "Novo", abas: [], pcas: null, membros: [], reparticoes: [] });
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
    assert.equal(grupoPatchSchema.safeParse({ pcas: [-1] }).success, false);
  });

  it("nome: obrigatório, sem espaços nas pontas e até o limite", () => {
    assert.equal(grupoCreateSchema.parse({ nome: "  Planejamento  " }).nome, "Planejamento");
    assert.equal(grupoCreateSchema.safeParse({ nome: "   " }).success, false);
    const longo = "x".repeat(MAX_NOME_RBAC + 1);
    const r = grupoCreateSchema.safeParse({ nome: longo });
    assert.equal(r.success, false);
    assert.match(r.error?.issues[0]?.message ?? "", /Use até 60 caracteres/);
    assert.equal(grupoCreateSchema.safeParse({ nome: "x".repeat(MAX_NOME_RBAC) }).success, true);
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
  it("a pessoa exige o nome; matrícula, cargo e usuário são opcionais; o PATCH não injeta padrões", () => {
    assert.deepEqual(pessoaResponsavelSchema.parse({ nome: " Ana " }), { nome: "Ana", matricula: "", cargo: "", usuarioId: null, externo: false });
    assert.equal(pessoaResponsavelSchema.safeParse({ nome: "  " }).success, false);
    assert.deepEqual(pessoaResponsavelSchema.parse({ nome: "Ana", cargo: "Secretário", usuarioId: 7 }), { nome: "Ana", matricula: "", cargo: "Secretário", usuarioId: 7, externo: false });
    assert.equal(pessoaResponsavelSchema.parse({ nome: "Ana", externo: true }).externo, true);
    assert.deepEqual(pessoaResponsavelPatchSchema.parse({ externo: true }), { externo: true });
    assert.equal(pessoaResponsavelSchema.safeParse({ nome: "Ana", usuarioId: 0 }).success, false);
    assert.equal(pessoaResponsavelSchema.safeParse({ nome: "Ana", cargo: "x".repeat(81) }).success, false);
    assert.deepEqual(pessoaResponsavelPatchSchema.parse({ matricula: "12" }), { matricula: "12" });
    assert.deepEqual(pessoaResponsavelPatchSchema.parse({ usuarioId: null }), { usuarioId: null });
    assert.deepEqual(pessoaResponsavelPatchSchema.parse({ exoneradoEm: "2026-03-15" }), { exoneradoEm: "2026-03-15" });
    assert.deepEqual(pessoaResponsavelPatchSchema.parse({ exoneradoEm: null }), { exoneradoEm: null });
    assert.equal(pessoaResponsavelPatchSchema.safeParse({ exoneradoEm: "2026-02-30" }).success, false);
    assert.equal(pessoaResponsavelPatchSchema.safeParse({ exoneradoEm: "15/03/2026" }).success, false);
  });

  it("editar o vínculo: onde responde é opcional e, quando vem, UM só", () => {
    const base = { responsavelId: 1, tipo: "padrao", inicio: "2026-01-01" };
    assert.equal(vinculoResponsavelPatchSchema.safeParse(base).success, true, "sem alvo = fica o de antes");
    assert.equal(vinculoResponsavelPatchSchema.safeParse({ ...base, orgaoId: 2, reparticaoId: null }).success, true);
    assert.equal(vinculoResponsavelPatchSchema.safeParse({ ...base, reparticaoId: 5 }).success, true);
    assert.equal(vinculoResponsavelPatchSchema.safeParse({ ...base, orgaoId: 2, reparticaoId: 5 }).success, false);
    assert.equal(vinculoResponsavelPatchSchema.safeParse({ ...base, orgaoId: null, reparticaoId: null }).success, false);
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
