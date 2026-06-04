'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';

const API = (process.env.NEXT_PUBLIC_API_URL||'https://pie-system-production.up.railway.app');

type Row = {
  cnpj: string;
  cnpj_basico: string;
  nome_fantasia: string;
  situacao_cadastral: string;
  cnae: string;
  uf: string;
  codigo_municipio: string;
  telefone: string;
  email: string;
  capital_social: string;
};

type TelefoneRow = {
  cnpj: string;
  telefone_formatado: string;
  telefone_e164: string;
  tipo: 'celular' | 'fixo';
};

type TelefoneStats = {
  total: number; celular: number; fixo: number;
  invalido: number; sem_telefone: number; aproveitamento: number;
};

export type LeadStatus = 'novo' | 'qualificado' | 'contato' | 'descartado' | 'convertido';

type LeadAnotacao = {
  id: number;
  cnpj: string;
  recorteId: number;
  status: LeadStatus;
  notas?: string;
  atualizadoEm: string;
};

type Estab = Record<string, string>;
type Socio = {
  identificador_socio: string;
  nome_socio: string;
  cpf_cnpj_socio: string;
  qualificacao_socio: string;
  data_entrada_sociedade: string;
  faixa_etaria: string;
};
type DetalheData = { estabelecimento: Estab; socios: Socio[] };

const STATUS_META: Record<LeadStatus, { label: string; bg: string; color: string }> = {
  novo:        { label: 'Novo',        bg: '#f3f4f6', color: '#374151' },
  qualificado: { label: 'Qualificado', bg: '#dcfce7', color: '#16a34a' },
  contato:     { label: 'Contato',     bg: '#dbeafe', color: '#0070f3' },
  descartado:  { label: 'Descartado',  bg: '#fee2e2', color: '#dc2626' },
  convertido:  { label: 'Convertido',  bg: '#f3e8ff', color: '#7c3aed' },
};

const STATUSES: LeadStatus[] = ['novo', 'qualificado', 'contato', 'descartado', 'convertido'];

const SITUACAO: Record<string, string> = {
  '02': 'Ativa', '03': 'Suspensa', '04': 'Inapta', '08': 'Baixada',
};

type DadoChip = { icon: string; label: string; color: string; bg: string };
const CHIPS: Record<string, DadoChip> = {
  celular:   { icon: '📱', label: 'Celular',    color: '#16a34a', bg: '#dcfce7' },
  fixo:      { icon: '📞', label: 'Fixo',       color: '#0070f3', bg: '#dbeafe' },
  sem_tel:   { icon: '—',  label: 'Sem tel',    color: '#9ca3af', bg: '#f3f4f6' },
  email:     { icon: '✉',  label: 'E-mail',     color: '#0891b2', bg: '#e0f2fe' },
  socios:    { icon: '👥', label: 'Sócios',     color: '#7c3aed', bg: '#f3e8ff' },
  whatsapp:  { icon: '💬', label: 'WhatsApp',   color: '#16a34a', bg: '#dcfce7' },
  instagram: { icon: '📸', label: 'Instagram',  color: '#e1306c', bg: '#fce7f3' },
  facebook:  { icon: '🔵', label: 'Facebook',   color: '#1877f2', bg: '#dbeafe' },
  linkedin:  { icon: '💼', label: 'LinkedIn',   color: '#0a66c2', bg: '#dbeafe' },
  site:      { icon: '🌐', label: 'Site',       color: '#374151', bg: '#f3f4f6' },
};

function DadosCell({ row, tel, hasTelefone, temSocios, presenca }: {
  row: Row;
  tel?: TelefoneRow;
  hasTelefone: boolean;
  temSocios: boolean;
  presenca?: {
    url?: string; instagramUrl?: string; facebookUrl?: string; linkedinUrl?: string; whatsappUrl?: string; reclameaquiUrl?: string;
    googlePhone?: string; googleRating?: number; googleRatingCount?: number; googleBusinessStatus?: string; googleAddress?: string;
  };
}) {
  const chips: DadoChip[] = [];

  // Telefone
  if (hasTelefone) {
    if (tel) chips.push(CHIPS[tel.tipo]);
    else chips.push(CHIPS.sem_tel);
  } else if (row.telefone) {
    chips.push({ ...CHIPS.fixo, label: 'Tel' });
  }

  // Email
  if (row.email) chips.push(CHIPS.email);

  // Sócios
  if (temSocios) chips.push(CHIPS.socios);

  // Presença digital
  if (presenca?.url)           chips.push(CHIPS.site);
  if (presenca?.instagramUrl)  chips.push(CHIPS.instagram);
  if (presenca?.facebookUrl)   chips.push(CHIPS.facebook);
  if (presenca?.linkedinUrl)   chips.push(CHIPS.linkedin);
  if (presenca?.whatsappUrl)   chips.push(CHIPS.whatsapp);
  if (presenca?.reclameaquiUrl) chips.push({ icon: '⭐', label: 'Reclame Aqui', color: '#ea580c', bg: '#ffedd5' });
  if (presenca?.googleRating)  chips.push({ icon: '★', label: `${presenca.googleRating.toFixed(1)} Google`, color: '#b45309', bg: '#fef3c7' });
  if (presenca?.googlePhone && !tel)   chips.push({ icon: '📞', label: 'Tel Google', color: '#0070f3', bg: '#dbeafe' });
  if (presenca?.googleBusinessStatus === 'CLOSED_PERMANENTLY') chips.push({ icon: '🚫', label: 'Encerrado', color: '#dc2626', bg: '#fee2e2' });

  return (
    <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap', alignItems: 'center' }}>
      {chips.map((c, i) => (
        <span key={i} title={c.label} style={{
          fontSize: 10, padding: '2px 6px', borderRadius: 99, fontWeight: 600,
          background: c.bg, color: c.color, whiteSpace: 'nowrap',
        }}>
          {c.icon} {c.label}
        </span>
      ))}
    </div>
  );
}

const PORTE: Record<string, string> = {
  '00': 'Não informado', '01': 'Micro empresa', '03': 'Empresa de Pequeno Porte',
  '05': 'Demais',
};

const MATRIZ_FILIAL: Record<string, string> = { '1': 'Matriz', '2': 'Filial' };

function fmt(n: number) { return n.toLocaleString('pt-BR'); }

function fmtCnpj(s: string) {
  if (!s || s.length !== 14) return s;
  return `${s.slice(0,2)}.${s.slice(2,5)}.${s.slice(5,8)}/${s.slice(8,12)}-${s.slice(12)}`;
}

function fmtCep(s: string) {
  if (!s || s.length !== 8) return s;
  return `${s.slice(0,5)}-${s.slice(5)}`;
}

function fmtDate(s: string) {
  if (!s || s.length !== 8) return s || '—';
  return `${s.slice(6,8)}/${s.slice(4,6)}/${s.slice(0,4)}`;
}

function fmtCapital(s: string) {
  const n = parseFloat(s?.replace(',', '.') ?? '');
  if (isNaN(n) || !s) return '—';
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function fmtCapitalCompact(s: string) {
  const n = parseFloat(s?.replace(',', '.') ?? '');
  if (isNaN(n) || !s) return '—';
  if (n === 0) return 'R$ 0';
  if (n >= 1_000_000) return `R$ ${(n / 1_000_000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}M`;
  if (n >= 1_000)     return `R$ ${(n / 1_000).toLocaleString('pt-BR', { maximumFractionDigits: 0 })}K`;
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function StatusBadge({ status }: { status: LeadStatus }) {
  const m = STATUS_META[status];
  return (
    <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 99, fontWeight: 600, background: m.bg, color: m.color, whiteSpace: 'nowrap' }}>
      {m.label}
    </span>
  );
}

// ── Detail Drawer ────────────────────────────────────────────────────────────

function InfoRow({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <div style={{ display: 'flex', gap: 8, padding: '5px 0', borderBottom: '1px solid #f3f4f6' }}>
      <span style={{ fontSize: 11, color: '#9ca3af', minWidth: 140, flexShrink: 0 }}>{label}</span>
      <span style={{ fontSize: 12, color: '#111', wordBreak: 'break-word' }}>{value}</span>
    </div>
  );
}

function SocialLink({ label, url, color }: { label: string; url: string; color: string }) {
  return (
    <div style={{ display: 'flex', gap: 8, padding: '5px 0', borderBottom: '1px solid #f3f4f6' }}>
      <span style={{ fontSize: 11, color: '#9ca3af', minWidth: 140, flexShrink: 0 }}>{label}</span>
      <a href={url} target="_blank" rel="noopener noreferrer"
        style={{ fontSize: 12, color, wordBreak: 'break-all', textDecoration: 'none' }}
        onMouseEnter={e => (e.currentTarget.style.textDecoration = 'underline')}
        onMouseLeave={e => (e.currentTarget.style.textDecoration = 'none')}
      >{url}</a>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
        {title}
      </div>
      {children}
    </div>
  );
}

function DetailDrawer({
  cnpj, recorteId, lead, tel, presenca, cnaeDesc, muniDesc, onClose, onLeadSave,
}: {
  cnpj: string;
  recorteId: string;
  lead?: LeadAnotacao;
  tel?: TelefoneRow;
  presenca?: {
    url?: string; instagramUrl?: string; facebookUrl?: string; linkedinUrl?: string; whatsappUrl?: string; reclameaquiUrl?: string;
    googlePhone?: string; googleRating?: number; googleRatingCount?: number; googleBusinessStatus?: string; googleAddress?: string;
  };
  cnaeDesc: Map<string, string>;
  muniDesc: Map<string, string>;
  onClose: () => void;
  onLeadSave: (updated: LeadAnotacao) => void;
}) {
  const [data, setData]         = useState<DetalheData | null>(null);
  const [loading, setLoading]   = useState(true);
  const [editStatus, setEditStatus] = useState<LeadStatus>(lead?.status ?? 'novo');
  const [editNotas, setEditNotas]   = useState(lead?.notas ?? '');
  const [saving, setSaving]         = useState(false);

  useEffect(() => {
    setLoading(true);
    fetch(`${API}/recortes/detail/${cnpj}`)
      .then(r => r.json())
      .then(async (d: DetalheData) => {
        // Fetch any CNAE/município codes not yet in the maps
        const e = d.estabelecimento;
        const missingCnaes = [e.cnae_fiscal_principal, ...(e.cnae_fiscal_secundaria ?? '').split(',')]
          .map(c => c.trim()).filter(c => c && !cnaeDesc.has(c));
        const missingMunis = [e.codigo_municipio].filter(c => c && !muniDesc.has(c));
        await Promise.all([
          missingCnaes.length
            ? fetch(`${API}/cnaes?codigos=${missingCnaes.join(',')}`)
                .then(r => r.json())
                .then((rows: { codigo: string; descricao: string }[]) => rows.forEach(r => cnaeDesc.set(r.codigo, r.descricao)))
            : Promise.resolve(),
          missingMunis.length
            ? fetch(`${API}/municipios?codigos=${missingMunis.join(',')}`)
                .then(r => r.json())
                .then((rows: { codigo: string; descricao: string }[]) => rows.forEach(r => muniDesc.set(r.codigo, r.descricao)))
            : Promise.resolve(),
        ]);
        setData(d);
      })
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [cnpj]);

  const save = async () => {
    setSaving(true);
    try {
      const res: LeadAnotacao = await fetch(`${API}/leads/recorte/${recorteId}/upsert`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cnpj, status: editStatus, notas: editNotas }),
      }).then(r => r.json());
      onLeadSave(res);
    } finally { setSaving(false); }
  };

  const e = data?.estabelecimento;
  const socios = data?.socios ?? [];

  const endereco = e
    ? [e.tipo_logradouro, e.logradouro, e.numero, e.complemento].filter(Boolean).join(' ')
    : '';

  const muniLabel = e
    ? [muniDesc.get(e.codigo_municipio) ?? e.codigo_municipio, e.uf].filter(Boolean).join(' · ')
    : '';

  const fmtCnae = (code: string) => {
    const desc = cnaeDesc.get(code.trim());
    return desc ? `${code} · ${desc}` : code;
  };

  const cnaeSecList = e?.cnae_fiscal_secundaria
    ? e.cnae_fiscal_secundaria.split(',').map(c => c.trim()).filter(Boolean)
    : [];

  return (
    <>
      {/* Backdrop */}
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.25)', zIndex: 40 }} />

      {/* Drawer */}
      <div style={{
        position: 'fixed', top: 0, right: 0, bottom: 0, width: 480, maxWidth: '95vw',
        background: '#fff', zIndex: 50, boxShadow: '-8px 0 40px rgba(0,0,0,0.15)',
        display: 'flex', flexDirection: 'column',
      }}>
        {/* Header */}
        <div style={{ padding: '18px 22px', borderBottom: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ fontSize: 13, fontFamily: 'monospace', color: '#374151', marginBottom: 2 }}>{fmtCnpj(cnpj)}</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#111' }}>
              {e?.nome_fantasia || e?.razao_social || '—'}
            </div>
            {e?.razao_social && e.nome_fantasia && (
              <div style={{ fontSize: 12, color: '#6b7280', marginTop: 1 }}>{e.razao_social}</div>
            )}
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#9ca3af', marginLeft: 12, flexShrink: 0 }}>✕</button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 22px' }}>
          {loading && <div style={{ color: '#9ca3af', fontSize: 13 }}>Carregando...</div>}

          {!loading && e && (
            <>
              {/* ── Dados Básicos ── */}
              <Section title="Dados Básicos">
                <InfoRow label="Situação"        value={SITUACAO[e.situacao_cadastral] ?? e.situacao_cadastral} />
                <InfoRow label="Tipo"            value={MATRIZ_FILIAL[e.matriz_filial] ?? e.matriz_filial} />
                <InfoRow label="Porte"           value={PORTE[e.porte ?? ''] ?? e.porte} />
                <InfoRow label="Capital Social"  value={fmtCapital(e.capital_social)} />
                <InfoRow label="Natureza Jurídica" value={e.natureza_juridica} />
                <InfoRow label="Início Atividade" value={fmtDate(e.data_inicio_atividade)} />
                <InfoRow label="CNAE Principal"  value={fmtCnae(e.cnae_fiscal_principal)} />
                {cnaeSecList.length > 0 && (
                  <InfoRow label="CNAEs Secundários" value={cnaeSecList.map(fmtCnae).join('\n')} />
                )}
              </Section>

              {/* ── Endereço ── */}
              <Section title="Endereço">
                {endereco && <InfoRow label="Logradouro" value={endereco} />}
                <InfoRow label="Bairro"     value={e.bairro} />
                <InfoRow label="Município"  value={muniLabel || undefined} />
                <InfoRow label="CEP"        value={fmtCep(e.cep)} />
              </Section>

              {/* ── Contato ── */}
              <Section title="Contato">
                {tel ? (
                  <InfoRow label="Telefone (enriquecido)" value={`${tel.telefone_formatado} · ${tel.tipo} · ${tel.telefone_e164}`} />
                ) : (
                  <>
                    {e.ddd_1 && e.telefone_1 && (
                      <InfoRow label="Telefone 1" value={`(${e.ddd_1}) ${e.telefone_1}`} />
                    )}
                    {e.ddd_2 && e.telefone_2 && (
                      <InfoRow label="Telefone 2" value={`(${e.ddd_2}) ${e.telefone_2}`} />
                    )}
                    {e.ddd_fax && e.fax && (
                      <InfoRow label="Fax" value={`(${e.ddd_fax}) ${e.fax}`} />
                    )}
                  </>
                )}
                {presenca?.googlePhone && <InfoRow label="Telefone (Google)" value={presenca.googlePhone} />}
                <InfoRow label="E-mail" value={e.correio_eletronico} />
                {presenca?.url && <SocialLink label="Site" url={presenca.url} color="#0070f3" />}
                {presenca?.instagramUrl && <SocialLink label="Instagram" url={presenca.instagramUrl} color="#e1306c" />}
                {presenca?.facebookUrl && <SocialLink label="Facebook" url={presenca.facebookUrl} color="#1877f2" />}
                {presenca?.linkedinUrl && <SocialLink label="LinkedIn" url={presenca.linkedinUrl} color="#0a66c2" />}
                {presenca?.whatsappUrl && <SocialLink label="WhatsApp" url={presenca.whatsappUrl} color="#16a34a" />}
                {presenca?.reclameaquiUrl && <SocialLink label="Reclame Aqui" url={presenca.reclameaquiUrl} color="#ea580c" />}
              </Section>

              {/* ── Google Places ── */}
              {(presenca?.googleRating || presenca?.googleAddress || presenca?.googleBusinessStatus) && (
                <Section title="Google Places">
                  {presenca.googleRating != null && (
                    <InfoRow
                      label="Avaliação"
                      value={`${presenca.googleRating.toFixed(1)} ★${presenca.googleRatingCount ? ` · ${presenca.googleRatingCount.toLocaleString('pt-BR')} avaliações` : ''}`}
                    />
                  )}
                  {presenca.googleBusinessStatus && (
                    <InfoRow
                      label="Status"
                      value={
                        presenca.googleBusinessStatus === 'OPERATIONAL'         ? 'Em operação' :
                        presenca.googleBusinessStatus === 'CLOSED_TEMPORARILY'  ? 'Fechado temporariamente' :
                        presenca.googleBusinessStatus === 'CLOSED_PERMANENTLY'  ? 'Fechado permanentemente' :
                        presenca.googleBusinessStatus
                      }
                    />
                  )}
                  {presenca.googleAddress && <InfoRow label="Endereço (Google)" value={presenca.googleAddress} />}
                </Section>
              )}

              {/* ── Sócios ── */}
              {socios.length > 0 && (
                <Section title={`Sócios (${socios.length})`}>
                  {socios.map((s, i) => (
                    <div key={i} style={{ padding: '8px 10px', borderRadius: 7, background: '#f9fafb', border: '1px solid #f3f4f6', marginBottom: 6 }}>
                      <div style={{ fontWeight: 600, fontSize: 12, color: '#111', marginBottom: 2 }}>{s.nome_socio}</div>
                      <div style={{ fontSize: 11, color: '#6b7280' }}>
                        {s.qualificacao_socio && <span>{s.qualificacao_socio} · </span>}
                        {s.faixa_etaria && <span>Faixa etária: {s.faixa_etaria} · </span>}
                        {s.data_entrada_sociedade && <span>Entrada: {fmtDate(s.data_entrada_sociedade)}</span>}
                      </div>
                    </div>
                  ))}
                </Section>
              )}

              {/* ── Situação Especial ── */}
              {e.situacao_especial && (
                <Section title="Situação Especial">
                  <InfoRow label="Situação"  value={e.situacao_especial} />
                  <InfoRow label="Data"      value={fmtDate(e.data_situacao_especial)} />
                </Section>
              )}
            </>
          )}

          {!loading && !e && (
            <div style={{ color: '#9ca3af', fontSize: 13 }}>Dados não encontrados para este CNPJ.</div>
          )}

          {/* ── Lead ── */}
          <div style={{ borderTop: '2px solid #e5e7eb', paddingTop: 18, marginTop: 4 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>
              Lead
            </div>

            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', marginBottom: 6 }}>Status</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {STATUSES.map(s => {
                  const m = STATUS_META[s];
                  const active = editStatus === s;
                  return (
                    <button key={s} onClick={() => setEditStatus(s)} style={{
                      padding: '4px 12px', borderRadius: 99, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                      background: active ? m.bg : '#f9fafb',
                      color: active ? m.color : '#6b7280',
                      border: `1.5px solid ${active ? m.color : '#e5e7eb'}`,
                    }}>
                      {m.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', marginBottom: 6 }}>Notas</div>
              <textarea
                value={editNotas}
                onChange={e => setEditNotas(e.target.value)}
                rows={3}
                placeholder="Observações sobre este lead..."
                style={{ width: '100%', padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 12, resize: 'vertical', boxSizing: 'border-box', fontFamily: 'sans-serif' }}
              />
            </div>

            <button onClick={save} disabled={saving} style={{
              width: '100%', padding: '9px 0', borderRadius: 7, fontSize: 13, fontWeight: 600,
              background: '#0070f3', color: '#fff', border: 'none', cursor: 'pointer',
            }}>
              {saving ? 'Salvando...' : 'Salvar Lead'}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

// ── Main Page ────────────────────────────────────────────────────────────────

function LeadsRecorteContent() {
  const params      = useSearchParams();
  const recorteId   = params.get('recorteId');
  const nome        = params.get('nome') ?? 'Recorte';
  const enrichments = (params.get('enrichments') ?? '').split(',').filter(Boolean);
  const hasTelefone = enrichments.includes('telefone');

  const [rows, setRows]         = useState<Row[]>([]);
  const [total, setTotal]       = useState(0);
  const [page, setPage]         = useState(1);
  const [loading, setLoading]   = useState(false);

  const [telMap, setTelMap]     = useState<Map<string, TelefoneRow>>(new Map());
  const [telStats, setTelStats] = useState<TelefoneStats | null>(null);
  const [loadingTel, setLoadingTel] = useState(false);

  const [leadMap, setLeadMap]   = useState<Map<string, LeadAnotacao>>(new Map());
  const [saving, setSaving]     = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  // Description lookup maps (mutated in-place, shared with drawer)
  const [cnaeDesc] = useState<Map<string, string>>(() => new Map());
  const [muniDesc] = useState<Map<string, string>>(() => new Map());
  const [, forceDesc] = useState(0);

  // Sócios presence per cnpj_basico
  const [sociosSet, setSociosSet] = useState<Set<string>>(() => new Set());

  // Site map: cnpj → PresencaDigital
  type PresencaDigital = {
    url?: string;
    instagramUrl?: string; facebookUrl?: string; linkedinUrl?: string; whatsappUrl?: string; reclameaquiUrl?: string;
    googlePhone?: string; googleRating?: number; googleRatingCount?: number; googleBusinessStatus?: string; googleAddress?: string;
  };
  const [siteMap, setSiteMap] = useState<Map<string, PresencaDigital>>(() => new Map());
  const hasSite = enrichments.includes('site');

  // Edit modal (inline table)
  const [editCnpj, setEditCnpj]       = useState<string | null>(null);
  const [editStatus, setEditStatus]   = useState<LeadStatus>('novo');
  const [editNotas, setEditNotas]     = useState('');

  // Detail drawer
  const [drawerCnpj, setDrawerCnpj]   = useState<string | null>(null);

  // Filters
  const [searchInput, setSearchInput] = useState('');
  const [filtroTipo, setFiltroTipo]   = useState<'todos' | 'celular' | 'fixo'>('todos');
  const [filtroStatus, setFiltroStatus] = useState<LeadStatus | 'todos'>('todos');

  const LIMIT = 50;

  const loadDescriptions = async (newRows: Row[]) => {
    const missingCnaes = [...new Set(newRows.map(r => r.cnae).filter(c => c && !cnaeDesc.has(c)))];
    const missingMunis = [...new Set(newRows.map(r => r.codigo_municipio).filter(c => c && !muniDesc.has(c)))];
    const basicos = [...new Set(newRows.map(r => r.cnpj_basico).filter(Boolean))];

    const fetches: Promise<void>[] = [];

    if (missingCnaes.length) fetches.push(
      fetch(`${API}/cnaes?codigos=${missingCnaes.join(',')}`)
        .then(r => r.json())
        .then((rows: { codigo: string; descricao: string }[]) => rows.forEach(r => cnaeDesc.set(r.codigo, r.descricao)))
        .catch(() => {}),
    );
    if (missingMunis.length) fetches.push(
      fetch(`${API}/municipios?codigos=${missingMunis.join(',')}`)
        .then(r => r.json())
        .then((rows: { codigo: string; descricao: string }[]) => rows.forEach(r => muniDesc.set(r.codigo, r.descricao)))
        .catch(() => {}),
    );
    if (basicos.length) fetches.push(
      fetch(`${API}/base-primaria/socios/check?basicos=${basicos.join(',')}`)
        .then(r => r.json())
        .then((found: string[]) => setSociosSet(new Set(found)))
        .catch(() => {}),
    );

    // These go to different backend services — safe to run in parallel
    await Promise.all(fetches);
    forceDesc(n => n + 1);
  };

  const loadPage = async (p: number) => {
    if (!recorteId) return;
    setLoading(true);
    try {
      const res = await fetch(
        `${API}/recortes/${recorteId}/executar?page=${p}&limit=${LIMIT}`,
        { method: 'POST' },
      ).then(r => r.json());
      const data: Row[] = Array.isArray(res.data) ? res.data : [];
      setRows(data);
      setTotal(res.total ?? 0);
      setPage(p);
      loadDescriptions(data);
    } finally { setLoading(false); }
  };

  const loadTelefone = async () => {
    if (!recorteId) return;
    setLoadingTel(true);
    try {
      const res = await fetch(
        `${API}/enriquecimento/${recorteId}/telefone?page=1&limit=5000`,
      ).then(r => r.json());
      const map = new Map<string, TelefoneRow>();
      for (const r of (res.data ?? [])) map.set(r.cnpj, r);
      setTelMap(map);
      if (res.stats) setTelStats(res.stats);
    } finally { setLoadingTel(false); }
  };

  const loadLeads = async () => {
    if (!recorteId) return;
    try {
      const res: LeadAnotacao[] = await fetch(`${API}/leads/recorte/${recorteId}`).then(r => r.json());
      const map = new Map<string, LeadAnotacao>();
      for (const l of (Array.isArray(res) ? res : [])) map.set(l.cnpj, l);
      setLeadMap(map);
    } catch { /* ignore */ }
  };

  useEffect(() => { loadPage(1); }, [recorteId]);
  useEffect(() => { if (hasTelefone) loadTelefone(); }, [recorteId]);
  useEffect(() => { loadLeads(); }, [recorteId]);
  useEffect(() => {
    if (!hasSite || !recorteId) return;
    fetch(`${API}/enriquecimento/${recorteId}/site/map`)
      .then(r => r.json())
      .then((obj: Record<string, PresencaDigital>) => setSiteMap(new Map(Object.entries(obj))))
      .catch(() => {});
  }, [recorteId, hasSite]);

  const handleSearch = () => { loadPage(1); };

  const openEdit = (cnpj: string) => {
    const existing = leadMap.get(cnpj);
    setEditStatus(existing?.status ?? 'novo');
    setEditNotas(existing?.notas ?? '');
    setEditCnpj(cnpj);
  };

  const saveEdit = async () => {
    if (!editCnpj || !recorteId) return;
    setSaving(editCnpj);
    try {
      const res: LeadAnotacao = await fetch(`${API}/leads/recorte/${recorteId}/upsert`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cnpj: editCnpj, status: editStatus, notas: editNotas }),
      }).then(r => r.json());
      setLeadMap(prev => new Map(prev).set(res.cnpj, res));
      setEditCnpj(null);
    } finally { setSaving(null); }
  };

  const deleteLead = async (cnpj: string) => {
    if (!recorteId) return;
    if (!confirm(`Remover anotação de ${fmtCnpj(cnpj)}?`)) return;
    setDeleting(cnpj);
    try {
      await fetch(`${API}/leads/recorte/${recorteId}/${cnpj}`, { method: 'DELETE' });
      setLeadMap(prev => { const m = new Map(prev); m.delete(cnpj); return m; });
    } finally { setDeleting(null); }
  };

  const displayRows = rows.filter(r => {
    if (filtroTipo !== 'todos' && telMap.get(r.cnpj)?.tipo !== filtroTipo) return false;
    if (filtroStatus !== 'todos') {
      const st = leadMap.get(r.cnpj)?.status ?? 'novo';
      if (st !== filtroStatus) return false;
    }
    return true;
  });

  const totalPages = Math.ceil(total / LIMIT) || 1;

  const statusCounts = rows.reduce<Record<string, number>>((acc, r) => {
    const s = leadMap.get(r.cnpj)?.status ?? 'novo';
    acc[s] = (acc[s] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <main style={{ padding: 32, fontFamily: 'sans-serif', maxWidth: 1400, margin: '0 auto' }}>

      {/* ── Breadcrumb ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <a href="/leads" style={{ fontSize: 13, color: '#0070f3', textDecoration: 'none' }}>← Leads</a>
        <span style={{ color: '#d1d5db' }}>/</span>
        <span style={{ fontSize: 13, color: '#6b7280' }}>{nome}</span>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>{nome}</h1>
          <p style={{ fontSize: 13, color: '#6b7280', margin: '4px 0 0' }}>
            {fmt(total)} registros · {enrichments.length > 0 ? enrichments.join(', ') : 'sem enriquecimento'}
          </p>
        </div>
        <a
          href={`${API}/recortes/${recorteId}/exportar`}
          target="_blank"
          style={{ padding: '8px 18px', borderRadius: 7, fontSize: 13, fontWeight: 600, background: '#fff', color: '#16a34a', border: '1px solid #bbf7d0', textDecoration: 'none' }}
        >
          ↓ Exportar CSV
        </a>
      </div>

      {/* ── Stats telefone ── */}
      {telStats && (
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 20 }}>
          {[
            { label: 'Celular',        value: telStats.celular,      color: '#16a34a' },
            { label: 'Fixo',           value: telStats.fixo,         color: '#0070f3' },
            { label: 'Sem telefone',   value: telStats.sem_telefone, color: '#9ca3af' },
            { label: 'Aproveitamento', value: `${telStats.aproveitamento}%`, color: '#7c3aed' },
          ].map(s => (
            <div key={s.label} style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, padding: '10px 16px', flex: '1 1 120px' }}>
              <div style={{ fontSize: 18, fontWeight: 700, color: s.color }}>{typeof s.value === 'number' ? fmt(s.value) : s.value}</div>
              <div style={{ fontSize: 11, color: '#6b7280' }}>{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* ── Status filter pills ── */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
        {(['todos', ...STATUSES] as const).map(s => {
          const count = s === 'todos' ? rows.length : (statusCounts[s] ?? 0);
          const meta = s !== 'todos' ? STATUS_META[s] : null;
          const active = filtroStatus === s;
          return (
            <button key={s} onClick={() => setFiltroStatus(s)} style={{
              padding: '4px 12px', borderRadius: 99, fontSize: 12, fontWeight: 600, cursor: 'pointer',
              background: active ? (meta?.bg ?? '#111') : '#f9fafb',
              color: active ? (meta?.color ?? '#fff') : '#6b7280',
              border: `1px solid ${active ? (meta?.color ?? '#111') : '#e5e7eb'}`,
            }}>
              {s === 'todos' ? 'Todos' : STATUS_META[s].label}
              {' '}<span style={{ opacity: 0.7 }}>{count}</span>
            </button>
          );
        })}
      </div>

      {/* ── Filtros ── */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          value={searchInput}
          onChange={e => setSearchInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSearch()}
          placeholder="Buscar CNPJ ou nome..."
          style={{ padding: '7px 12px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, flex: '1 1 200px', maxWidth: 300 }}
        />
        <button onClick={handleSearch} style={{ padding: '7px 16px', borderRadius: 6, fontSize: 13, fontWeight: 600, background: '#0070f3', color: '#fff', border: 'none', cursor: 'pointer' }}>
          Buscar
        </button>

        {hasTelefone && (
          <div style={{ display: 'flex', gap: 4, marginLeft: 8 }}>
            {(['todos', 'celular', 'fixo'] as const).map(t => (
              <button key={t} onClick={() => setFiltroTipo(t)} style={{
                padding: '6px 12px', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                background: filtroTipo === t ? '#0070f3' : '#fff',
                color: filtroTipo === t ? '#fff' : '#374151',
                border: `1px solid ${filtroTipo === t ? '#0070f3' : '#d1d5db'}`,
              }}>
                {t === 'todos' ? 'Todos' : t.charAt(0).toUpperCase() + t.slice(1)}
              </button>
            ))}
            {loadingTel && <span style={{ fontSize: 12, color: '#9ca3af', alignSelf: 'center', marginLeft: 4 }}>Carregando telefones...</span>}
          </div>
        )}

        <span style={{ fontSize: 12, color: '#9ca3af', marginLeft: 'auto' }}>
          Pág. {page} / {totalPages} · {fmt(total)} registros
        </span>
      </div>

      {/* ── Tabela ── */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px 0', color: '#9ca3af', fontSize: 14 }}>Consultando...</div>
      ) : (
        <>
          <div style={{ overflowX: 'auto', borderRadius: 8, border: '1px solid #e5e7eb' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: '#f8fafc' }}>
                  <th style={th}>CNPJ</th>
                  <th style={th}>Nome Fantasia</th>
                  <th style={th}>Situação</th>
                  <th style={th}>CNAE</th>
                  <th style={th}>UF</th>
                  <th style={th}>Município</th>
                  <th style={{ ...th, textAlign: 'right' }}>Capital Social</th>
                  <th style={th}>Telefone</th>
                  <th style={th}>Dados</th>
                  <th style={th}>Status</th>
                  <th style={{ ...th, textAlign: 'right' }}>Ações</th>
                </tr>
              </thead>
              <tbody>
                {displayRows.map((row, i) => {
                  const tel  = telMap.get(row.cnpj);
                  const lead = leadMap.get(row.cnpj);
                  const isDeleting = deleting === row.cnpj;
                  return (
                    <tr
                      key={i}
                      style={{ borderBottom: '1px solid #f3f4f6', opacity: isDeleting ? 0.4 : 1, cursor: 'pointer' }}
                      onClick={() => setDrawerCnpj(row.cnpj)}
                    >
                      <td style={{ ...td, fontFamily: 'monospace', whiteSpace: 'nowrap' }}>{fmtCnpj(row.cnpj)}</td>
                      <td style={td}>{row.nome_fantasia || '—'}</td>
                      <td style={td}>
                        <span style={{
                          fontSize: 11, padding: '2px 7px', borderRadius: 99, fontWeight: 500,
                          background: row.situacao_cadastral === '02' ? '#dcfce7' : '#f3f4f6',
                          color: row.situacao_cadastral === '02' ? '#16a34a' : '#6b7280',
                        }}>
                          {SITUACAO[row.situacao_cadastral] ?? row.situacao_cadastral}
                        </span>
                      </td>
                      <td style={{ ...td, fontFamily: 'monospace' }} title={cnaeDesc.get(row.cnae)}>{row.cnae}</td>
                      <td style={{ ...td, fontWeight: 600 }}>{row.uf}</td>
                      <td style={td} title={muniDesc.get(row.codigo_municipio)}>{row.codigo_municipio}</td>
                      <td style={{ ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: row.capital_social && row.capital_social !== '0,00' ? '#111' : '#d1d5db' }}>
                        {fmtCapitalCompact(row.capital_social)}
                      </td>
                      <td style={{ ...td, fontFamily: 'monospace' }}>
                        {tel?.telefone_formatado || (row.telefone ? `(${row.telefone.slice(0,2)}) ${row.telefone.slice(2)}` : '—')}
                      </td>
                      <td style={td} onClick={e => e.stopPropagation()}>
                        <DadosCell row={row} tel={tel} hasTelefone={hasTelefone} temSocios={sociosSet.has(row.cnpj_basico)} presenca={siteMap.get(row.cnpj)} />
                      </td>

                      <td style={td} onClick={e => e.stopPropagation()}>
                        <StatusBadge status={lead?.status ?? 'novo'} />
                        {lead?.notas && (
                          <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 2, maxWidth: 130, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={lead.notas}>
                            {lead.notas}
                          </div>
                        )}
                      </td>

                      <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' }} onClick={e => e.stopPropagation()}>
                        <button
                          onClick={() => openEdit(row.cnpj)}
                          style={{ ...btnAcao, color: '#0070f3', borderColor: '#bfdbfe', background: '#eff6ff', marginRight: 4 }}
                        >
                          ✎
                        </button>
                        {lead && (
                          <button
                            onClick={() => deleteLead(row.cnpj)}
                            disabled={isDeleting}
                            style={{ ...btnAcao, color: '#dc2626', borderColor: '#fecaca', background: '#fef2f2' }}
                          >
                            ✕
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {displayRows.length === 0 && (
                  <tr>
                    <td colSpan={11} style={{ textAlign: 'center', padding: '32px 0', color: '#9ca3af' }}>
                      Nenhum registro encontrado.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* ── Paginação ── */}
          <div style={{ display: 'flex', gap: 8, marginTop: 14, justifyContent: 'center', alignItems: 'center' }}>
            <button onClick={() => loadPage(1)} disabled={page === 1} style={btnPage}>«</button>
            <button onClick={() => loadPage(page - 1)} disabled={page === 1} style={btnPage}>‹ Anterior</button>
            <span style={{ fontSize: 13, color: '#6b7280', padding: '0 8px' }}>
              Página {page} de {totalPages}
            </span>
            <button onClick={() => loadPage(page + 1)} disabled={page >= totalPages} style={btnPage}>Próxima ›</button>
            <button onClick={() => loadPage(totalPages)} disabled={page >= totalPages} style={btnPage}>»</button>
          </div>
        </>
      )}

      {/* ── Modal de Edição (inline) ── */}
      {editCnpj && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: '#fff', borderRadius: 12, padding: 28, width: '100%', maxWidth: 420, boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h2 style={{ fontSize: 15, fontWeight: 700, margin: 0 }}>Editar Lead</h2>
              <button onClick={() => setEditCnpj(null)} style={{ background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: '#9ca3af' }}>✕</button>
            </div>
            <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 16, fontFamily: 'monospace' }}>{fmtCnpj(editCnpj)}</div>

            <div style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>Status</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
              {STATUSES.map(s => {
                const m = STATUS_META[s];
                const active = editStatus === s;
                return (
                  <button key={s} onClick={() => setEditStatus(s)} style={{
                    padding: '5px 12px', borderRadius: 99, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                    background: active ? m.bg : '#f9fafb',
                    color: active ? m.color : '#6b7280',
                    border: `1.5px solid ${active ? m.color : '#e5e7eb'}`,
                  }}>
                    {m.label}
                  </button>
                );
              })}
            </div>

            <div style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>Notas</div>
            <textarea
              value={editNotas}
              onChange={e => setEditNotas(e.target.value)}
              rows={3}
              placeholder="Observações..."
              style={{ width: '100%', padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, resize: 'vertical', boxSizing: 'border-box', fontFamily: 'sans-serif' }}
            />

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 }}>
              <button onClick={() => setEditCnpj(null)} style={{ padding: '8px 16px', borderRadius: 7, fontSize: 13, background: '#fff', border: '1px solid #d1d5db', cursor: 'pointer', color: '#374151' }}>
                Cancelar
              </button>
              <button onClick={saveEdit} disabled={saving === editCnpj} style={{ padding: '8px 20px', borderRadius: 7, fontSize: 13, fontWeight: 600, background: '#0070f3', color: '#fff', border: 'none', cursor: 'pointer' }}>
                {saving === editCnpj ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Detail Drawer ── */}
      {drawerCnpj && recorteId && (
        <DetailDrawer
          cnpj={drawerCnpj}
          recorteId={recorteId}
          lead={leadMap.get(drawerCnpj)}
          tel={telMap.get(drawerCnpj)}
          presenca={siteMap.get(drawerCnpj)}
          cnaeDesc={cnaeDesc}
          muniDesc={muniDesc}
          onClose={() => setDrawerCnpj(null)}
          onLeadSave={(updated) => {
            setLeadMap(prev => new Map(prev).set(updated.cnpj, updated));
            setDrawerCnpj(null);
          }}
        />
      )}
    </main>
  );
}

export default function LeadsRecortePage() {
  return <Suspense><LeadsRecorteContent /></Suspense>;
}

const th: React.CSSProperties = {
  padding: '9px 12px', textAlign: 'left', fontWeight: 700,
  color: '#6b7280', borderBottom: '2px solid #e5e7eb', whiteSpace: 'nowrap', fontSize: 11,
};
const td: React.CSSProperties = { padding: '7px 12px', fontSize: 12 };
const btnPage: React.CSSProperties = {
  padding: '6px 14px', borderRadius: 6, fontSize: 12,
  border: '1px solid #e5e7eb', background: '#fff', cursor: 'pointer', color: '#374151',
};
const btnAcao: React.CSSProperties = {
  fontSize: 11, fontWeight: 600, padding: '3px 8px', borderRadius: 5,
  border: '1px solid', cursor: 'pointer',
};
