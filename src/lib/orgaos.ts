import { asc } from "drizzle-orm";
import { orgaos } from "@/db/schema";
import { getDb } from "./db";

/**
 * Acesso aos ÓRGÃOS (entidade organizacional ACIMA da unidade). Só escopo de request
 * (`getDb`). `listarOrgaos` alimenta o seletor de Órgão no cadastro de unidades E o match
 * do "Órgão/Entidade" do DFD (threadado ao cliente como `pcas`/`regras`).
 */
export type OrgaoResumo = {
  id: number;
  sigla: string;
  nome: string;
  orgaoEntidade: string | null;
  ordem: number;
};

export async function listarOrgaos(): Promise<OrgaoResumo[]> {
  return getDb()
    .select({
      id: orgaos.id,
      sigla: orgaos.sigla,
      nome: orgaos.nome,
      orgaoEntidade: orgaos.orgaoEntidade,
      ordem: orgaos.ordem,
    })
    .from(orgaos)
    .orderBy(asc(orgaos.ordem), asc(orgaos.id));
}
