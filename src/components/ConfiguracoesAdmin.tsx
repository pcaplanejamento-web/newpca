"use client";

import { useRouter } from "next/navigation";
import { type ReactNode, useRef, useState } from "react";
import type { RegrasAvaliacao } from "@/lib/avaliacao-core";
import type { PcaResumo } from "@/lib/dfd";
import { dataBR, num } from "@/lib/format";
import type { Aparencia } from "@/lib/theme";
import { AvaliacaoAdmin } from "./AvaliacaoAdmin";
import { Badge } from "./Badge";
import { Button } from "./Button";
import { Callout } from "./Callout";
import { type Column, DataTable } from "./DataTable";
import { TextField } from "./Field";
import {
  IconLandmark,
  IconCheck,
  IconDatabase,
  IconImage,
  IconPalette,
  IconPencil,
  IconPlug,
  IconPlus,
  IconShield,
  IconTrash,
  IconUser,
  IconUsers,
} from "./icons";
import { LinkCard } from "./LinkCard";
import { Modal } from "./Modal";
import { ReferenciaSistema } from "./ReferenciaSistema";
import { Tabs } from "./Tabs";
import { toast } from "./Toast";

// Tela única de controle do ADM (spec): identidade do site (nome/subtítulo/favicon),
// cadastro de PCAs (nome + ano + ativo) e atalhos para as telas admin existentes.
// Só componentes do design-system; recebe os dados por props (server component da rota).

// Limite do favicon = teto do schema (theme-validation): data-URL ≤ 100 KB.
const FAVICON_MAX_BYTES = 100_000;

/** Rasteriza a imagem escolhida em um favicon PNG ≤ 64px (data-URL), garantindo o limite. */
function lerFavicon(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Falha ao ler o arquivo."));
    reader.onload = () => {
      const img = new window.Image();
      img.onerror = () => reject(new Error("Imagem inválida."));
      img.onload = () => {
        const max = 64;
        const escala = Math.min(1, max / Math.max(img.width, img.height));
        const w = Math.max(1, Math.round(img.width * escala));
        const h = Math.max(1, Math.round(img.height * escala));
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) return reject(new Error("Canvas indisponível."));
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL("image/png"));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}

export function ConfiguracoesAdmin({
  identidade,
  pcas,
  regras,
}: {
  identidade?: Aparencia["identidade"];
  pcas: PcaResumo[];
  regras: RegrasAvaliacao;
}) {
  const router = useRouter();

  // ---- Identidade do site ----
  const [nome, setNome] = useState(identidade?.nome ?? "");
  const [subtitulo, setSubtitulo] = useState(identidade?.subtitulo ?? "");
  const [favicon, setFavicon] = useState(identidade?.favicon ?? "");
  const [salvandoId, setSalvandoId] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function escolherFavicon(file: File | undefined) {
    if (!file) return;
    try {
      const dataUrl = await lerFavicon(file);
      if (dataUrl.length > FAVICON_MAX_BYTES) {
        toast.error("Favicon muito grande. Use uma imagem menor.");
        return;
      }
      setFavicon(dataUrl);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível ler a imagem.");
    }
  }

  async function salvarIdentidade() {
    setSalvandoId(true);
    try {
      const res = await fetch("/api/admin/aparencia", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          identidade: { nome: nome.trim(), subtitulo: subtitulo.trim(), favicon: favicon || "" },
        }),
      });
      const j = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !j.ok) throw new Error(j.error ?? "Erro ao salvar.");
      toast.success("Identidade do site salva — já vale para todos.");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao salvar.");
    } finally {
      setSalvandoId(false);
    }
  }

  // ---- PCAs ----
  const anoAtual = new Date().getFullYear();
  // null = modal fechado; {} = novo; { id } = editar.
  const [modalPca, setModalPca] = useState<null | { id?: number }>(null);
  const [pcaNome, setPcaNome] = useState("");
  const [pcaAno, setPcaAno] = useState(String(anoAtual));
  const [salvandoPca, setSalvandoPca] = useState(false);

  function abrirNovoPca() {
    setPcaNome("");
    setPcaAno(String(anoAtual));
    setModalPca({});
  }
  function abrirEditarPca(p: PcaResumo) {
    setPcaNome(p.nome);
    setPcaAno(p.ano ? String(p.ano) : "");
    setModalPca({ id: p.id });
  }

  async function salvarPca() {
    const nomeTrim = pcaNome.trim();
    if (!nomeTrim) {
      toast.error("Informe o nome do PCA.");
      return;
    }
    const anoNum = pcaAno.trim() ? Number(pcaAno) : null;
    const editando = modalPca?.id != null;
    setSalvandoPca(true);
    try {
      const res = await fetch(editando ? `/api/admin/pcas/${modalPca?.id}` : "/api/admin/pcas", {
        method: editando ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nome: nomeTrim, ano: anoNum }),
      });
      const j = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !j.ok) throw new Error(j.error ?? "Erro ao salvar o PCA.");
      toast.success(editando ? "PCA atualizado." : "PCA cadastrado.");
      setModalPca(null);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao salvar o PCA.");
    } finally {
      setSalvandoPca(false);
    }
  }

  async function marcarAtivo(p: PcaResumo) {
    if (p.ativo) return;
    try {
      const res = await fetch(`/api/admin/pcas/${p.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ativo: true }),
      });
      const j = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !j.ok) throw new Error(j.error ?? "Erro ao marcar ativo.");
      toast.success(`"${p.nome}" agora é o PCA ativo.`);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao marcar ativo.");
    }
  }

  async function excluirPca(p: PcaResumo) {
    if (!confirm(`Excluir o PCA "${p.nome}"? Esta ação não pode ser desfeita.`)) return;
    try {
      const res = await fetch(`/api/admin/pcas/${p.id}`, { method: "DELETE" });
      const j = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !j.ok) throw new Error(j.error ?? "Erro ao excluir.");
      toast.success("PCA excluído.");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao excluir.");
    }
  }

  const acoes = (children: ReactNode) => <div className="flex justify-end gap-1">{children}</div>;

  const cols: Column<PcaResumo>[] = [
    {
      key: "nome",
      header: "PCA",
      filter: "none",
      render: (p) => (
        <span className="flex items-center gap-2">
          <span className="font-semibold text-text">{p.nome}</span>
          {p.ativo && (
            <Badge tone="emerald" dot>
              Ativo
            </Badge>
          )}
        </span>
      ),
    },
    { key: "ano", header: "Ano", align: "right", filter: "none", render: (p) => p.ano ?? "—" },
    { key: "dfds", header: "DFDs", align: "right", filter: "none", render: (p) => num(p.totalDfds ?? 0) },
    { key: "criadoEm", header: "Criado", filter: "none", render: (p) => (p.criadoEm ? dataBR(p.criadoEm) : "—") },
    {
      key: "acoes",
      header: "",
      filter: "none",
      render: (p) =>
        acoes(
          <>
            {!p.ativo && (
              <Button variant="ghost" onClick={() => marcarAtivo(p)} icon={<IconCheck className="h-4 w-4" />}>
                Ativar
              </Button>
            )}
            <Button
              variant="ghost"
              aria-label="Editar PCA"
              onClick={() => abrirEditarPca(p)}
              icon={<IconPencil className="h-4 w-4" />}
            />
            <Button
              variant="ghost"
              aria-label="Excluir PCA"
              onClick={() => excluirPca(p)}
              icon={<IconTrash className="h-4 w-4" />}
              style={{ color: "var(--danger)" }}
            />
          </>,
        ),
    },
  ];

  const abaIdentidade = (
    <div className="max-w-xl space-y-5">
      <Callout kind="info">
        O nome, o subtítulo e o favicon valem para toda a plataforma — barra lateral, aba do
        navegador e a tela pública.
      </Callout>
      <TextField
        label="Nome do site"
        value={nome}
        onChange={(e) => setNome(e.target.value)}
        placeholder="Plataforma PCA"
        maxLength={60}
      />
      <TextField
        label="Subtítulo"
        value={subtitulo}
        onChange={(e) => setSubtitulo(e.target.value)}
        placeholder="Equipe PCA · Rio Verde"
        maxLength={80}
      />
      <div>
        <span className="mb-2 block text-[13.5px] font-bold text-text">Favicon</span>
        <div className="flex items-center gap-4">
          <div className="grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-[12px] border border-border bg-surface-2">
            {favicon ? (
              // biome-ignore lint/performance/noImgElement: favicon é data-URL base64; next/image não otimiza data-URL.
              <img src={favicon} alt="Favicon atual" className="h-full w-full object-cover" />
            ) : (
              <span className="text-[13px] font-black text-muted">RV</span>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/svg+xml,image/x-icon"
              className="hidden"
              onChange={(e) => {
                escolherFavicon(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
            <Button
              variant="secondary"
              icon={<IconImage className="h-4 w-4" />}
              onClick={() => fileRef.current?.click()}
            >
              Escolher imagem
            </Button>
            {favicon && (
              <Button variant="ghost" onClick={() => setFavicon("")} style={{ color: "var(--danger)" }}>
                Remover
              </Button>
            )}
          </div>
        </div>
        <p className="mt-1.5 text-[12px] text-muted">
          PNG, JPG, WEBP, SVG ou ICO — redimensionado para 64px.
        </p>
      </div>
      <div className="flex justify-end">
        <Button onClick={salvarIdentidade} loading={salvandoId}>
          Salvar identidade
        </Button>
      </div>
    </div>
  );

  const abaPcas = (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted">
          Cadastre os PCAs por nome e ano. Marque um como o <strong className="text-text-2">vigente</strong>.
        </p>
        <Button onClick={abrirNovoPca} icon={<IconPlus className="h-4 w-4" />}>
          Novo PCA
        </Button>
      </div>
      {pcas.length === 0 ? (
        <p className="rounded-card border border-border bg-surface p-6 text-center text-sm text-muted">
          Nenhum PCA cadastrado ainda.
        </p>
      ) : (
        <DataTable
          columns={cols}
          rows={pcas}
          getKey={(p) => p.id}
          pageSize={20}
          minWidth={640}
          resumo={(l) => `${l.length} PCA${l.length === 1 ? "" : "s"}`}
        />
      )}
    </div>
  );

  const abaMais = (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <LinkCard
        href="/painel/aparencia"
        titulo="Aparência"
        descricao="Cores, layout, densidade e ícones."
        icon={<IconPalette className="h-5 w-5" />}
      />
      <LinkCard
        href="/painel/orgaos"
        titulo="Órgãos e Unidades"
        descricao="Órgãos e, dentro de cada um, suas unidades (interessado, setor, responsáveis)."
        icon={<IconLandmark className="h-5 w-5" />}
      />
      <LinkCard
        href="/painel/grupos"
        titulo="Grupos"
        descricao="Grupos de acesso e suas unidades."
        icon={<IconUsers className="h-5 w-5" />}
      />
      <LinkCard
        href="/painel/permissoes"
        titulo="Permissões"
        descricao="Abas visíveis por grupo."
        icon={<IconShield className="h-5 w-5" />}
      />
      <LinkCard
        href="/painel/usuarios"
        titulo="Usuários"
        descricao="Contas, papéis e status de acesso."
        icon={<IconUser className="h-5 w-5" />}
      />
      <LinkCard
        href="/painel/integracoes"
        titulo="Integrações"
        descricao="APIs externas: captcha e monitoramento (Cloudflare); Google e e-mail em breve."
        icon={<IconPlug className="h-5 w-5" />}
      />
      <LinkCard
        href="/painel/armazenamento"
        titulo="Armazenamento"
        descricao="Uso do banco: tamanho por tabela e manutenção."
        icon={<IconDatabase className="h-5 w-5" />}
      />
    </div>
  );

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-text">Configurações</h1>
        <p className="mt-1 text-sm text-muted">
          Identidade do site, PCAs e atalhos de administração.
        </p>
      </div>

      <div className="rounded-card border border-border bg-surface p-4 shadow-ring sm:p-5">
        <Tabs
          tabs={[
            { key: "identidade", label: "Identidade", content: abaIdentidade },
            { key: "pcas", label: "PCAs", content: abaPcas },
            { key: "avaliacao", label: "Avaliação", content: <AvaliacaoAdmin regras={regras} /> },
            {
              key: "referencia",
              label: "Referência",
              content: <ReferenciaSistema regras={regras} pcas={pcas} identidade={identidade} />,
            },
            { key: "mais", label: "Mais", content: abaMais },
          ]}
        />
      </div>

      <Modal
        open={modalPca !== null}
        onClose={() => setModalPca(null)}
        titulo={modalPca?.id != null ? "Editar PCA" : "Novo PCA"}
        size="md"
        rodape={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setModalPca(null)}>
              Cancelar
            </Button>
            <Button onClick={salvarPca} loading={salvandoPca}>
              {modalPca?.id != null ? "Salvar" : "Cadastrar"}
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <TextField
            label="Nome do PCA"
            value={pcaNome}
            onChange={(e) => setPcaNome(e.target.value)}
            placeholder="PCA 2026"
            maxLength={120}
          />
          <TextField
            label="Ano"
            value={pcaAno}
            onChange={(e) => setPcaAno(e.target.value.replace(/\D/g, "").slice(0, 4))}
            placeholder={String(anoAtual)}
            inputMode="numeric"
          />
        </div>
      </Modal>
    </div>
  );
}
