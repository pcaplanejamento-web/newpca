"use client";

import { TextosAcessoAdmin } from "./TextosAcessoAdmin";
import { useRouter } from "next/navigation";
import { type ReactNode, useRef, useState } from "react";
import type { RegrasAvaliacao } from "@/lib/avaliacao-core";
import type { PcaResumo } from "@/lib/dfd";
import { dataBR, num } from "@/lib/format";
import { type Aparencia, LINHAS_TABELA, type LinhasTabela } from "@/lib/theme";
import { AvaliacaoAdmin } from "./AvaliacaoAdmin";
import { Ajuda } from "./Ajuda";
import { Badge } from "./Badge";
import { Button } from "./Button";
import { useConfirmacao } from "./Confirmacao";
import { type Column, DataTable } from "./DataTable";
import { TextField } from "./Field";
import {
  IconAvaliacao,
  IconBell,
  IconCalendar,
  IconLayers,
  IconLinhas,
  IconMais,
  IconReferencia,
  IconSituacoes,
  IconTelaAcesso,
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
import { PapeisAdmin } from "./PapeisAdmin";
import { ReferenciaSistema } from "./ReferenciaSistema";
import { Segmented } from "./Segmented";
import { SituacoesAdmin } from "./SituacoesAdmin";
import { FeriadosAdmin } from "./FeriadosAdmin";
import { NotificacoesAdmin } from "./NotificacoesAdmin";
import { PresencaAdmin } from "./PresencaAdmin";
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
  acesso,
  linhasTabela,
  pcas,
  regras,
  abaInicial,
}: {
  /** Aba aberta de início (`?aba=` — ex.: "situacoes", atalho da Configuração do PCA). */
  abaInicial?: string;
  identidade?: Aparencia["identidade"];
  /** Os textos da tela de acesso gravados (Configurações → Tela de acesso). */
  acesso?: Aparencia["acesso"];
  /** Linhas por página com que as tabelas de rolagem interna abrem (a escolha atual do ADM). */
  linhasTabela: LinhasTabela;
  pcas: PcaResumo[];
  regras: RegrasAvaliacao;
}) {
  const router = useRouter();
  const { confirmar, confirmacao } = useConfirmacao();

  // ---- Tabelas: linhas por página iniciais ----
  const [linhas, setLinhas] = useState<LinhasTabela>(linhasTabela);
  const [salvandoLinhas, setSalvandoLinhas] = useState(false);
  async function salvarTabelas() {
    setSalvandoLinhas(true);
    try {
      const res = await fetch("/api/admin/aparencia", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tabelas: { linhas } }),
      });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !j.ok) throw new Error(j.error ?? "Erro ao salvar.");
      toast.success(`As tabelas abrem com ${linhas} linhas — já vale para todos.`);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao salvar.");
    } finally {
      setSalvandoLinhas(false);
    }
  }

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
    if (!(await confirmar({ titulo: `Excluir o PCA "${p.nome}"?`, texto: "Esta ação não pode ser desfeita.", confirmar: "Excluir", perigo: true }))) return;
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
    { key: "ano", header: "Ano", align: "center", filter: "none", render: (p) => p.ano ?? "—" },
    { key: "dfds", header: "DFDs", align: "center", filter: "none", render: (p) => num(p.totalDfds ?? 0) },
    { key: "criadoEm", header: "Criado", filter: "none", render: (p) => (p.criadoEm ? dataBR(p.criadoEm) : "—") },
    {
      key: "acoes",
      header: "",
      filter: "none",
      render: (p) =>
        acoes(
          <>
            {!p.ativo && (
              <Button variant="ghost" size="xs" onClick={() => marcarAtivo(p)} icon={<IconCheck className="h-4 w-4" />} title="Marcar como o PCA vigente">
                Ativar
              </Button>
            )}
            <Button
              variant="ghost"
              size="xs"
              aria-label="Editar PCA"
              title="Editar o nome e o ano"
              onClick={() => abrirEditarPca(p)}
              icon={<IconPencil className="h-4 w-4" />}
            />
            <Button
              variant="ghost"
              size="xs"
              aria-label="Excluir PCA"
              title="Excluir o PCA"
              onClick={() => excluirPca(p)}
              icon={<IconTrash className="h-4 w-4" />}
              style={{ color: "var(--danger)" }}
            />
          </>,
        ),
    },
  ];

  const abaIdentidade = (
    <div className="max-w-xl space-y-[var(--gap-block)]">
      <div className="flex items-center gap-2">
        <h2 className="text-[15px] font-bold text-text">Identidade do site</h2>
        <Ajuda titulo="Identidade">
          <p>O nome, o subtítulo e o favicon valem para toda a plataforma — barra lateral, aba do navegador e a tela pública.</p>
        </Ajuda>
      </div>
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
        <Button size="sm" onClick={salvarIdentidade} loading={salvandoId} title="Salvar o nome, o subtítulo e o favicon">
          Salvar identidade
        </Button>
      </div>
    </div>
  );

  const abaTabelas = (
    <div className="max-w-xl space-y-[var(--gap-block)]">
      <div className="flex items-center gap-2">
        <h2 className="text-[15px] font-bold text-text">Linhas por página ao abrir</h2>
        <Ajuda titulo="Tabelas">
          <p>
            Quantas linhas as tabelas da Mesa (protocolos, DFDs e itens — também na Mesa de cada PCA) mostram ao abrir. Cada
            pessoa ainda pode trocar no seletor "Linhas" do rodapé da tabela.
          </p>
        </Ajuda>
      </div>
      <div>
        <Segmented<string>
          value={String(linhas)}
          onChange={(v) => setLinhas(Number(v) as LinhasTabela)}
          ariaLabel="Linhas por página ao abrir as tabelas"
          options={LINHAS_TABELA.map((n) => ({ value: String(n), label: String(n) }))}
        />
      </div>
      <div className="flex justify-end">
        <Button size="sm" onClick={salvarTabelas} loading={salvandoLinhas} disabled={linhas === linhasTabela} title="Salvar as linhas por página">
          Salvar
        </Button>
      </div>
    </div>
  );

  const abaPcas = (
    <div className="space-y-[var(--gap-block)]">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-[15px] font-bold text-text">PCAs</h2>
        <Ajuda titulo="PCAs">
          <p>
            Cadastre os PCAs por nome e ano e marque um como o <strong>vigente</strong> (o que abre por padrão). A capa, a fonte e
            a publicação ficam na Configuração de cada PCA.
          </p>
        </Ajuda>
        <Button className="ml-auto" size="sm" onClick={abrirNovoPca} icon={<IconPlus className="h-4 w-4" />} title="Cadastrar um PCA">
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
        descricao="Telas que cada grupo abre (o papel diz o que a pessoa faz nelas)."
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
        descricao="Captcha, monitoramento, login com Google, e-mail (Resend) e Trello."
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
    <div className="space-y-[var(--gap-block)]">
      {confirmacao}
      <h1 className="text-xl font-bold text-text">Configurações</h1>

      <div>
        <Tabs
          inicial={abaInicial}
          layout="lateral"
          separado
          alturaTela
          url="aba"
          tabs={[
            { key: "identidade", label: "Identidade", icon: <IconImage />, dica: "Nome, subtítulo e favicon do site", content: abaIdentidade },
            { key: "papeis", label: "Papéis", icon: <IconShield />, dica: "O que cada papel pode fazer em cada tela", content: <PapeisAdmin /> },
            { key: "acesso", label: "Tela de acesso", icon: <IconTelaAcesso />, dica: "Os textos da tela de login e cadastro", content: <TextosAcessoAdmin gravado={acesso} identidade={identidade} /> },
            { key: "tabelas", label: "Tabelas", icon: <IconLinhas />, dica: "Quantas linhas as tabelas mostram ao abrir", content: abaTabelas },
            { key: "pcas", label: "PCAs", icon: <IconLayers />, dica: "Os PCAs cadastrados e o vigente", content: abaPcas },
            { key: "situacoes", label: "Situações", icon: <IconSituacoes />, dica: "As situações do protocolo (nome, cor, ordem)", content: <SituacoesAdmin /> },
            { key: "feriados", label: "Feriados", icon: <IconCalendar />, dica: "Feriados e pontos facultativos do Calendário", content: <FeriadosAdmin /> },
            { key: "presenca", label: "Presença e chat", icon: <IconUsers />, dica: "Quem do grupo está online e o chat ao vivo", content: <PresencaAdmin /> },
            { key: "notificacoes", label: "Notificações", icon: <IconBell />, dica: "Avisos, e-mail, limpeza, comunicado e alcance", content: <NotificacoesAdmin /> },
            { key: "avaliacao", label: "Avaliação", icon: <IconAvaliacao />, dica: "O rigor de cada conferência de Protocolo, DFD e Item", content: <AvaliacaoAdmin regras={regras} /> },
            {
              key: "referencia",
              label: "Referência",
              icon: <IconReferencia />,
              dica: "Como o sistema está configurado (consulta)",
              content: <ReferenciaSistema regras={regras} pcas={pcas} identidade={identidade} />,
            },
            { key: "mais", label: "Mais", icon: <IconMais />, dica: "Aparência, órgãos, grupos, permissões, usuários, integrações", content: abaMais },
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
        <div className="space-y-[var(--gap-block)]">
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
