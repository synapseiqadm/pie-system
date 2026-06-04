'use client';

import { useEffect, useState, useCallback, useRef, type CSSProperties } from 'react';
import { useRouter } from 'next/navigation';

const API = (process.env.NEXT_PUBLIC_API_URL||'https://pie-system-production.up.railway.app');

// ─── Types ───────────────────────────────────────────────────────────────────

type Filtros = {
  ufs?: string[];
  cnaes?: string[];
  situacoes?: string[];
  municipios?: string[];
  bairros?: string[];
  portes?: string[];
  naturezas?: string[];
  capitalMin?: number;
  capitalMax?: number;
  enrichLimit?: number;
};

type SugestaoFiltros = {
  cnaes:      { codigo: string; descricao: string; justificativa: string }[];
  ufs:        string[];
  municipios: { codigo: string; descricao: string }[];
  bairros:    string[];
  situacoes:  string[];
};

type Recorte = {
  id: number;
  nome: string;
  descricao?: string;
  filtros: Filtros;
  totalCached?: number;
  criadoEm: string;
  executadoEm?: string;
};

type CnaeOpt = { codigo: string; descricao: string };
type MuniOpt = { codigo: string; descricao: string };
type NatOpt  = { codigo: string; descricao: string };

type PreviewRow = {
  cnpj: string; cnpj_basico: string; nome_fantasia: string;
  situacao_cadastral: string; cnae: string; uf: string;
  codigo_municipio: string; telefone: string; email: string;
  capital_social: string;
};

type Analise = {
  total:     number;
  ufs:       { uf: string; total: number }[];
  cnaes:     { cnae: string; total: number }[];
  portes:    { porte: string; total: number }[];
  capital:   { faixa: string; total: number }[];
  naturezas: { natureza: string; total: number }[];
};

// ─── Constantes ──────────────────────────────────────────────────────────────

const UFS = ['AC','AL','AM','AP','BA','CE','DF','ES','GO','MA','MG','MS','MT',
             'PA','PB','PE','PI','PR','RJ','RN','RO','RR','RS','SC','SE','SP','TO'];

const SITUACOES = [
  { code: '02', label: 'Ativa' }, { code: '03', label: 'Suspensa' },
  { code: '04', label: 'Inapta' }, { code: '08', label: 'Baixada' },
];
const SITUACAO_LABEL: Record<string, string> = { '02': 'Ativa', '03': 'Suspensa', '04': 'Inapta', '08': 'Baixada' };

const PORTES = [
  { code: 'MEI', label: 'MEI (Emp. Individual)' },
  { code: '01',  label: 'Micro Empresa (ME)' },
  { code: '03',  label: 'Empresa de Pequeno Porte (EPP)' },
  { code: '05',  label: 'Demais' },
];
const PORTE_LABEL: Record<string, string> = { '00': 'N/I', 'MEI': 'MEI', '01': 'ME', '03': 'EPP', '05': 'Demais', '10': 'Grande' };

const FAIXA_LABEL: Record<string, string> = {
  zero:     'Sem capital',
  ate_10k:  'Até R$ 10K',
  '10k_100k': 'R$ 10K–100K',
  '100k_1m':  'R$ 100K–1M',
  acima_1m:   'Acima de R$ 1M',
};
const FAIXA_COLOR: Record<string, string> = {
  zero:       '#e5e7eb',
  ate_10k:    '#bfdbfe',
  '10k_100k': '#a5f3fc',
  '100k_1m':  '#6ee7b7',
  acima_1m:   '#86efac',
};

const emptyFiltros: Filtros = { situacoes: ['02'] };

function toggle<T>(arr: T[] | undefined, val: T): T[] {
  const a = arr ?? [];
  return a.includes(val) ? a.filter((x) => x !== val) : [...a, val];
}

function fmtDate(iso?: string) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('pt-BR');
}

function fmt(n: number) { return n.toLocaleString('pt-BR'); }

// ─── Styles ──────────────────────────────────────────────────────────────────

const btnPrimary: CSSProperties    = { padding: '9px 18px', background: '#0070f3', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13, fontWeight: 600 };
const btnSecondary: CSSProperties  = { padding: '9px 18px', background: '#fff', color: '#333', border: '1px solid #ccc', borderRadius: 6, cursor: 'pointer', fontSize: 13 };
const btnSmall: CSSProperties     = { padding: '5px 10px', fontSize: 12, background: '#fff', border: '1px solid #e5e7eb', borderRadius: 5, cursor: 'pointer' };
const card: CSSProperties         = { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, padding: 16 };
const inputS: CSSProperties       = { padding: '7px 10px', border: '1px solid #ccc', borderRadius: 6, fontSize: 13, width: '100%', boxSizing: 'border-box' };
const labelS: CSSProperties       = { display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, fontWeight: 600 };
const sectionLabel: CSSProperties = { fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 };
const tdS: CSSProperties          = { padding: '7px 10px', fontSize: 12 };

function fmtCapital(s: string) {
  const n = parseFloat(s?.replace(',', '.') ?? '');
  if (isNaN(n) || !s) return '—';
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

// ─── Analytics Panel ─────────────────────────────────────────────────────────

function MiniBar({ label, value, max, color, sub }: { label: string; value: number; max: number; color: string; sub?: string }) {
  const pct = max > 0 ? (value / max) * 100 : 0;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
      <div style={{ minWidth: 90, maxWidth: 90, fontSize: 11, color: '#374151', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={label}>{label}</div>
      <div style={{ flex: 1, background: '#f3f4f6', borderRadius: 99, height: 8, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 99 }} />
      </div>
      <div style={{ fontSize: 11, color: '#6b7280', whiteSpace: 'nowrap', minWidth: 64, textAlign: 'right' }}>
        {fmt(value)}{sub && <span style={{ color: '#d1d5db' }}> · {sub}</span>}
      </div>
    </div>
  );
}

function AnalyticsPanel({ analise, cnaeDesc, natDesc }: { analise: Analise; cnaeDesc: Record<string, string>; natDesc: Record<string, string> }) {
  const [showAllUfs, setShowAllUfs]     = useState(false);
  const [showAllCnaes, setShowAllCnaes] = useState(false);

  const maxUf    = analise.ufs[0]?.total  ?? 1;
  const maxCnae  = analise.cnaes[0]?.total ?? 1;
  const maxPorte = analise.portes[0]?.total ?? 1;
  const maxCap   = Math.max(...analise.capital.map(c => c.total), 1);

  const ufsShown   = showAllUfs   ? analise.ufs   : analise.ufs.slice(0, 8);
  const cnaesShown = showAllCnaes ? analise.cnaes : analise.cnaes.slice(0, 8);

  const UF_COLORS  = ['#3b82f6','#8b5cf6','#10b981','#f59e0b','#ef4444','#06b6d4','#ec4899','#84cc16'];

  return (
    <div style={{ background: '#f8fafc', border: '1px solid #e5e7eb', borderRadius: 10, padding: '18px 20px', marginTop: 8, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 20 }}>

      {/* UF */}
      <div>
        <div style={sectionLabel}>Distribuição por Estado</div>
        {ufsShown.map((r, i) => (
          <MiniBar key={r.uf} label={r.uf} value={r.total} max={maxUf}
            color={UF_COLORS[i % UF_COLORS.length]}
            sub={`${((r.total / analise.total) * 100).toFixed(1)}%`} />
        ))}
        {analise.ufs.length > 8 && (
          <button onClick={() => setShowAllUfs(v => !v)} style={{ fontSize: 11, color: '#0070f3', background: 'none', border: 'none', cursor: 'pointer', marginTop: 2, padding: 0 }}>
            {showAllUfs ? 'Mostrar menos' : `+ ${analise.ufs.length - 8} estados`}
          </button>
        )}
      </div>

      {/* CNAE */}
      <div>
        <div style={sectionLabel}>Top CNAEs</div>
        {cnaesShown.map(r => (
          <MiniBar key={r.cnae} label={cnaeDesc[r.cnae] ?? r.cnae} value={r.total} max={maxCnae}
            color="#8b5cf6"
            sub={`${((r.total / analise.total) * 100).toFixed(1)}%`} />
        ))}
        {analise.cnaes.length > 8 && (
          <button onClick={() => setShowAllCnaes(v => !v)} style={{ fontSize: 11, color: '#0070f3', background: 'none', border: 'none', cursor: 'pointer', marginTop: 2, padding: 0 }}>
            {showAllCnaes ? 'Mostrar menos' : `+ ${analise.cnaes.length - 8} CNAEs`}
          </button>
        )}
      </div>

      {/* Porte */}
      {analise.portes.length > 0 && (
        <div>
          <div style={sectionLabel}>Porte</div>
          {analise.portes.map(r => (
            <MiniBar key={r.porte} label={PORTE_LABEL[r.porte] ?? r.porte} value={r.total} max={maxPorte}
              color={r.porte === 'MEI' ? '#6366f1' : '#f59e0b'}
              sub={`${((r.total / analise.total) * 100).toFixed(1)}%`} />
          ))}
        </div>
      )}

      {/* Capital Social */}
      {analise.capital.length > 0 && (
        <div>
          <div style={sectionLabel}>Capital Social</div>
          <div style={{ fontSize: 10, color: '#9ca3af', marginBottom: 6 }}>
            MEI e ME frequentemente não informam capital
          </div>
          {analise.capital.map(r => (
            <MiniBar key={r.faixa} label={FAIXA_LABEL[r.faixa] ?? r.faixa} value={r.total} max={maxCap}
              color={FAIXA_COLOR[r.faixa] ?? '#e5e7eb'}
              sub={`${((r.total / analise.total) * 100).toFixed(1)}%`} />
          ))}
        </div>
      )}

      {/* Natureza Jurídica */}
      {(analise.naturezas ?? []).length > 0 && (
        <div>
          <div style={sectionLabel}>Natureza Jurídica</div>
          {(() => {
            const maxNat = analise.naturezas[0]?.total ?? 1;
            return analise.naturezas.map(r => (
              <MiniBar key={r.natureza}
                label={natDesc[r.natureza] ? `${r.natureza} · ${natDesc[r.natureza]}` : r.natureza}
                value={r.total} max={maxNat} color="#8b5cf6"
                sub={`${((r.total / analise.total) * 100).toFixed(1)}%`} />
            ));
          })()}
        </div>
      )}

    </div>
  );
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function SegmentosPage() {
  const [recortes, setRecortes]   = useState<Recorte[]>([]);
  const [showBuilder, setShowBuilder] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);

  // Form
  const [nome, setNome]       = useState('');
  const [desc, setDesc]       = useState('');
  const [filtros, setFiltros] = useState<Filtros>(emptyFiltros);

  // CNAE selector
  const [cnaeInput, setCnaeInput]       = useState('');
  const [cnaeSuggs, setCnaeSuggs]       = useState<CnaeOpt[]>([]);
  const [showCnaeSuggs, setShowCnaeSuggs] = useState(false);
  const cnaeRef = useRef<HTMLDivElement>(null);

  // Município selector
  const [muniInput, setMuniInput]       = useState('');
  const [muniSuggs, setMuniSuggs]       = useState<MuniOpt[]>([]);
  const [showMuniSuggs, setShowMuniSuggs] = useState(false);
  const muniRef = useRef<HTMLDivElement>(null);

  // Natureza Jurídica selector
  const [natInput, setNatInput]         = useState('');
  const [natSuggs, setNatSuggs]         = useState<NatOpt[]>([]);
  const [showNatSuggs, setShowNatSuggs] = useState(false);
  const natRef = useRef<HTMLDivElement>(null);

  // Bairro input
  const [bairroInput, setBairroInput]   = useState('');

  // Capital inputs (strings para facilitar input do usuário)
  const [capMinInput, setCapMinInput]   = useState('');
  const [capMaxInput, setCapMaxInput]   = useState('');

  // IA
  const [showAiPanel, setShowAiPanel]   = useState(false);
  const [aiQuery, setAiQuery]           = useState('');
  const [aiLoading, setAiLoading]       = useState(false);
  const [aiResult, setAiResult]         = useState<SugestaoFiltros | null>(null);

  // Execução / preview
  const [preview, setPreview]       = useState<{ total: number; data: PreviewRow[] } | null>(null);
  const [previewId, setPreviewId]   = useState<number | null>(null);
  const [previewPage, setPreviewPage] = useState(1);
  const [executing, setExecuting]   = useState(false);
  const [saving, setSaving]         = useState(false);
  const [saveError, setSaveError]   = useState('');
  const [cnaeDesc, setCnaeDesc]     = useState<Record<string, string>>({});
  const [muniDesc, setMuniDesc]     = useState<Record<string, string>>({});
  const [natDesc, setNatDesc]       = useState<Record<string, string>>({});

  // Analytics (cards inline)
  const [analiseMap, setAnaliseMap]     = useState<Record<number, Analise>>({});
  const [loadingAnalise, setLoadingAnalise] = useState<number | null>(null);
  const [openAnalise, setOpenAnalise]   = useState<number | null>(null);

  // Wizard
  const [wizardStep, setWizardStep]         = useState(0);
  const [wizardAnalise, setWizardAnalise]   = useState<Analise | null>(null);
  const [wizardLoading, setWizardLoading]   = useState(false);

  const reload = useCallback(async () => {
    const d = await fetch(`${API}/recortes`).then(r => r.json());
    const list: Recorte[] = Array.isArray(d) ? d : [];
    setRecortes(list);

    const allCnaes = [...new Set(list.flatMap(r => r.filtros.cnaes ?? []))];
    const allMunis = [...new Set(list.flatMap(r => r.filtros.municipios ?? []))];

    if (allCnaes.length) {
      const rows: CnaeOpt[] = await fetch(`${API}/cnaes?codigos=${allCnaes.join(',')}`).then(r => r.json()).catch(() => []);
      setCnaeDesc(prev => ({ ...prev, ...Object.fromEntries(rows.map(r => [r.codigo, r.descricao])) }));
    }
    if (allMunis.length) {
      const rows: MuniOpt[] = await fetch(`${API}/municipios?codigos=${allMunis.join(',')}`).then(r => r.json()).catch(() => []);
      setMuniDesc(prev => ({ ...prev, ...Object.fromEntries(rows.map(r => [r.codigo, r.descricao])) }));
    }
    // Naturezas é tabela pequena — carrega tudo de uma vez para uso nos tags e dropdown
    const natRows: NatOpt[] = await fetch(`${API}/naturezas`).then(r => r.json()).catch(() => []);
    if (natRows.length) setNatDesc(Object.fromEntries(natRows.map(r => [r.codigo, r.descricao])));
  }, []);

  useEffect(() => { reload(); }, [reload]);

  useEffect(() => {
    if (cnaeInput.length < 2) { setCnaeSuggs([]); setShowCnaeSuggs(false); return; }
    const t = setTimeout(() => {
      fetch(`${API}/cnaes?q=${encodeURIComponent(cnaeInput)}&limit=8`)
        .then(r => r.json()).then(d => { setCnaeSuggs(Array.isArray(d) ? d : []); setShowCnaeSuggs(true); });
    }, 250);
    return () => clearTimeout(t);
  }, [cnaeInput]);

  useEffect(() => {
    if (muniInput.length < 2) { setMuniSuggs([]); setShowMuniSuggs(false); return; }
    const t = setTimeout(() => {
      fetch(`${API}/municipios?q=${encodeURIComponent(muniInput)}&limit=8`)
        .then(r => r.json()).then(d => { setMuniSuggs(Array.isArray(d) ? d : []); setShowMuniSuggs(true); });
    }, 250);
    return () => clearTimeout(t);
  }, [muniInput]);

  useEffect(() => {
    if (natInput.length < 2) { setNatSuggs([]); setShowNatSuggs(false); return; }
    const t = setTimeout(() => {
      fetch(`${API}/naturezas?q=${encodeURIComponent(natInput)}`)
        .then(r => r.json()).then(d => { setNatSuggs(Array.isArray(d) ? d : []); setShowNatSuggs(true); });
    }, 200);
    return () => clearTimeout(t);
  }, [natInput]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (cnaeRef.current && !cnaeRef.current.contains(e.target as Node)) setShowCnaeSuggs(false);
      if (muniRef.current && !muniRef.current.contains(e.target as Node)) setShowMuniSuggs(false);
      if (natRef.current  && !natRef.current.contains(e.target as Node))  setShowNatSuggs(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // ─── Router ───────────────────────────────────────────────────────────────

  const router = useRouter();

  // ─── Wizard helpers ───────────────────────────────────────────────────────

  const fetchWizardAnalise = useCallback(async (f: Filtros, capMin?: string, capMax?: string) => {
    setWizardLoading(true);
    try {
      const filtrosBody = {
        ...f,
        capitalMin: capMin?.trim() ? Number(capMin) : undefined,
        capitalMax: capMax?.trim() ? Number(capMax) : undefined,
      };
      const data: Analise = await fetch(`${API}/recortes/analise-preview`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filtros: filtrosBody }),
      }).then(r => r.json());
      setWizardAnalise(data);
      // cache any CNAE descriptions returned
      const unknownCnaes = data.cnaes.map(c => c.cnae).filter(c => !cnaeDesc[c]);
      if (unknownCnaes.length) {
        const rows: CnaeOpt[] = await fetch(`${API}/cnaes?codigos=${unknownCnaes.join(',')}`).then(r => r.json()).catch(() => []);
        setCnaeDesc(prev => ({ ...prev, ...Object.fromEntries(rows.map(r => [r.codigo, r.descricao])) }));
      }
    } catch { /* ignore */ } finally { setWizardLoading(false); }
  }, [cnaeDesc]);

  // Auto-refresh analysis on step 1 when filters change (debounced)
  useEffect(() => {
    if (!showBuilder || wizardStep !== 1) return;
    const t = setTimeout(() => fetchWizardAnalise(filtros, capMinInput, capMaxInput), 800);
    return () => clearTimeout(t);
  }, [filtros, capMinInput, capMaxInput, showBuilder, wizardStep, fetchWizardAnalise]);

  function openCreate() {
    setEditingId(null); setNome(''); setDesc(''); setFiltros(emptyFiltros);
    setCnaeInput(''); setBairroInput(''); setNatInput(''); setAiResult(null); setShowAiPanel(false);
    setCapMinInput(''); setCapMaxInput(''); setWizardStep(0); setWizardAnalise(null);
    setPreview(null); setShowBuilder(true);
  }

  function openEdit(r: Recorte) {
    setEditingId(r.id); setNome(r.nome); setDesc(r.descricao ?? '');
    setFiltros(r.filtros ?? emptyFiltros);
    setCnaeInput(''); setBairroInput(''); setNatInput(''); setAiResult(null); setShowAiPanel(false);
    setCapMinInput(r.filtros.capitalMin != null ? String(r.filtros.capitalMin) : '');
    setCapMaxInput(r.filtros.capitalMax != null ? String(r.filtros.capitalMax) : '');
    setWizardStep(0); setWizardAnalise(null);
    setPreview(null); setShowBuilder(true);
  }

  function goToStep(step: number) {
    setWizardStep(step);
    if (step === 1) fetchWizardAnalise(filtros, capMinInput, capMaxInput);
  }

  function addBairro(b: string) {
    const norm = b.trim().toLowerCase();
    if (!norm) return;
    if (!(filtros.bairros ?? []).includes(norm))
      setFiltros(f => ({ ...f, bairros: [...(f.bairros ?? []), norm] }));
    setBairroInput('');
  }
  function removeBairro(b: string) { setFiltros(f => ({ ...f, bairros: (f.bairros ?? []).filter(x => x !== b) })); }

  async function runAi() {
    if (!aiQuery.trim()) return;
    setAiLoading(true); setAiResult(null);
    try {
      const res: SugestaoFiltros = await fetch(`${API}/recortes/ai/sugerir`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: aiQuery }),
      }).then(r => r.json());
      setAiResult(res);
    } catch { /* ignore */ } finally { setAiLoading(false); }
  }

  function applyAiAll() {
    if (!aiResult) return;
    setFiltros(f => ({
      ...f,
      cnaes:      [...new Set([...(f.cnaes ?? []), ...aiResult.cnaes.map(c => c.codigo)])],
      ufs:        [...new Set([...(f.ufs ?? []),   ...aiResult.ufs])],
      municipios: [...new Set([...(f.municipios ?? []), ...aiResult.municipios.map(m => m.codigo)])],
      bairros:    [...new Set([...(f.bairros ?? []), ...aiResult.bairros])],
      situacoes:  aiResult.situacoes.length ? aiResult.situacoes : f.situacoes,
    }));
    setAiResult(null); setShowAiPanel(false); setAiQuery('');
  }

  function selectCnae(codigo: string) {
    if (!(filtros.cnaes ?? []).includes(codigo))
      setFiltros(f => ({ ...f, cnaes: [...(f.cnaes ?? []), codigo] }));
    setCnaeInput(''); setCnaeSuggs([]); setShowCnaeSuggs(false);
  }
  function removeCnae(c: string) { setFiltros(f => ({ ...f, cnaes: (f.cnaes ?? []).filter(x => x !== c) })); }

  function selectMuni(codigo: string) {
    if (!(filtros.municipios ?? []).includes(codigo))
      setFiltros(f => ({ ...f, municipios: [...(f.municipios ?? []), codigo] }));
    setMuniInput(''); setMuniSuggs([]); setShowMuniSuggs(false);
  }
  function removeMuni(c: string) { setFiltros(f => ({ ...f, municipios: (f.municipios ?? []).filter(x => x !== c) })); }

  function selectNat(codigo: string, descricao: string) {
    setNatDesc(prev => ({ ...prev, [codigo]: descricao }));
    if (!(filtros.naturezas ?? []).includes(codigo))
      setFiltros(f => ({ ...f, naturezas: [...(f.naturezas ?? []), codigo] }));
    setNatInput(''); setNatSuggs([]); setShowNatSuggs(false);
  }
  function removeNat(c: string) { setFiltros(f => ({ ...f, naturezas: (f.naturezas ?? []).filter(x => x !== c) })); }

  async function handleSave(andEnrich = false) {
    if (!nome.trim()) return;
    setSaving(true); setSaveError('');
    const capMin = capMinInput.trim() ? Number(capMinInput) : undefined;
    const capMax = capMaxInput.trim() ? Number(capMaxInput) : undefined;
    const body = { nome, descricao: desc || undefined, filtros: { ...filtros, capitalMin: capMin, capitalMax: capMax } };
    try {
      const res = editingId !== null
        ? await fetch(`${API}/recortes/${editingId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
        : await fetch(`${API}/recortes`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setSaveError(Array.isArray(err?.message) ? err.message.join(', ') : (err?.message ?? `Erro ${res.status}`));
        return;
      }
      const saved = await res.json();
      await reload();
      setShowBuilder(false);
      if (andEnrich) router.push(`/enriquecimento?recorteId=${saved.id ?? editingId}`);
    } catch (e: any) {
      setSaveError(e?.message ?? 'Erro de conexão');
    } finally { setSaving(false); }
  }

  async function handleDelete(id: number, nome: string) {
    if (!confirm(`Excluir segmento "${nome}"?`)) return;
    await fetch(`${API}/recortes/${id}`, { method: 'DELETE' });
    reload();
  }

  async function executar(id: number, page = 1) {
    setExecuting(true); setPreviewId(id); setPreviewPage(page);
    try {
      const res = await fetch(`${API}/recortes/${id}/executar?page=${page}&limit=50`, { method: 'POST' }).then(r => r.json());
      setPreview(res);
      await reload();
    } finally { setExecuting(false); }
  }

  async function toggleAnalise(id: number) {
    if (openAnalise === id) { setOpenAnalise(null); return; }
    setOpenAnalise(id);
    if (analiseMap[id]) return; // já carregado
    setLoadingAnalise(id);
    try {
      const data: Analise = await fetch(`${API}/recortes/${id}/analise`).then(r => r.json());
      // batch-fetch CNAE descriptions not yet known
      const unknownCnaes = data.cnaes.map(c => c.cnae).filter(c => !cnaeDesc[c]);
      if (unknownCnaes.length) {
        const rows: CnaeOpt[] = await fetch(`${API}/cnaes?codigos=${unknownCnaes.join(',')}`).then(r => r.json()).catch(() => []);
        setCnaeDesc(prev => ({ ...prev, ...Object.fromEntries(rows.map(r => [r.codigo, r.descricao])) }));
      }
      // Naturezas: if any unknowns, reload all (table is small)
      const unknownNats = (data.naturezas ?? []).map(n => n.natureza).filter(c => !natDesc[c]);
      if (unknownNats.length) {
        const rows: NatOpt[] = await fetch(`${API}/naturezas`).then(r => r.json()).catch(() => []);
        setNatDesc(Object.fromEntries(rows.map(r => [r.codigo, r.descricao])));
      }
      setAnaliseMap(prev => ({ ...prev, [id]: data }));
    } finally { setLoadingAnalise(null); }
  }

  function exportar(id: number) { window.open(`${API}/recortes/${id}/exportar`, '_blank'); }

  // ─── Render ───────────────────────────────────────────────────────────────

  const totalPages = preview ? Math.ceil(preview.total / 50) : 1;

  return (
    <main style={{ padding: 32, fontFamily: 'sans-serif', maxWidth: 1200, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>Segmentos</h1>
          <p style={{ color: '#6b7280', fontSize: 13, margin: '4px 0 0' }}>
            Segmentos de mercado definidos para prospecção e enriquecimento
          </p>
        </div>
        <button onClick={openCreate} style={btnPrimary}>+ Novo segmento</button>
      </div>

      {/* ── Lista de segmentos ───────────────────────────────────────────── */}
      {recortes.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 0', color: '#9ca3af', fontSize: 14 }}>
          Nenhum segmento criado ainda. Clique em "Novo segmento" para começar.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 32 }}>
          {recortes.map((r) => (
            <div key={r.id}>
              <div style={card}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                      <span style={{ fontWeight: 700, fontSize: 15 }}>{r.nome}</span>
                      {r.totalCached != null && (
                        <span style={{ fontSize: 13, fontWeight: 700, color: '#0070f3' }}>
                          {fmt(r.totalCached)} empresas
                        </span>
                      )}
                    </div>
                    {r.descricao && <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 6 }}>{r.descricao}</div>}

                    {/* Tags de filtros */}
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 8 }}>
                      {r.filtros.situacoes?.map(s => <Tag key={s} label={SITUACAO_LABEL[s] ?? s} color="#dcfce7" text="#166534" />)}
                      {r.filtros.ufs?.map(u => <Tag key={u} label={u} color="#dbeafe" text="#1e40af" />)}
                      {r.filtros.cnaes?.slice(0, 3).map(c => (
                        <Tag key={c} label={cnaeDesc[c] ?? c} color="#f3e8ff" text="#6b21a8" />
                      ))}
                      {(r.filtros.cnaes?.length ?? 0) > 3 && (
                        <Tag label={`+${r.filtros.cnaes!.length - 3} CNAEs`} color="#f3e8ff" text="#6b21a8" />
                      )}
                      {r.filtros.municipios?.slice(0, 2).map(m => (
                        <Tag key={m} label={muniDesc[m] ?? m} color="#e0f2fe" text="#0369a1" />
                      ))}
                      {(r.filtros.municipios?.length ?? 0) > 2 && (
                        <Tag label={`+${r.filtros.municipios!.length - 2} municípios`} color="#e0f2fe" text="#0369a1" />
                      )}
                      {r.filtros.portes?.map(p => <Tag key={p} label={PORTE_LABEL[p] ?? p} color="#fef3c7" text="#92400e" />)}
                      {r.filtros.naturezas?.slice(0, 3).map(c => (
                        <Tag key={c} label={natDesc[c] ? `${c} · ${natDesc[c]}` : c} color="#ede9fe" text="#5b21b6" />
                      ))}
                      {(r.filtros.naturezas?.length ?? 0) > 3 && (
                        <Tag label={`+${r.filtros.naturezas!.length - 3} naturezas`} color="#ede9fe" text="#5b21b6" />
                      )}
                      {r.filtros.capitalMin != null && (
                        <Tag label={`Capital ≥ ${fmtCapital(String(r.filtros.capitalMin).replace('.', ','))}`} color="#d1fae5" text="#065f46" />
                      )}
                      {r.filtros.capitalMax != null && (
                        <Tag label={`Capital ≤ ${fmtCapital(String(r.filtros.capitalMax).replace('.', ','))}`} color="#d1fae5" text="#065f46" />
                      )}
                      {r.filtros.enrichLimit != null && (
                        <Tag label={`Limite ${fmt(r.filtros.enrichLimit)}`} color="#fce7f3" text="#9d174d" />
                      )}
                    </div>

                    <div style={{ fontSize: 11, color: '#9ca3af' }}>
                      Criado {fmtDate(r.criadoEm)}
                      {r.executadoEm && ` · Executado ${fmtDate(r.executadoEm)}`}
                    </div>
                  </div>

                  {/* Ações */}
                  <div style={{ display: 'flex', gap: 5, flexShrink: 0, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                    <button onClick={() => executar(r.id)} style={btnSmall} disabled={executing && previewId === r.id}>
                      {executing && previewId === r.id ? 'Executando...' : '▶ Executar'}
                    </button>
                    <button
                      onClick={() => toggleAnalise(r.id)}
                      disabled={loadingAnalise === r.id}
                      style={{ ...btnSmall,
                        color: openAnalise === r.id ? '#7c3aed' : '#374151',
                        borderColor: openAnalise === r.id ? '#c4b5fd' : '#e5e7eb',
                        background: openAnalise === r.id ? '#f3e8ff' : '#fff',
                      }}>
                      {loadingAnalise === r.id ? '...' : '◈ Analisar'}
                    </button>
                    {r.totalCached != null && (
                      <button onClick={() => exportar(r.id)} style={{ ...btnSmall, color: '#16a34a', borderColor: '#bbf7d0' }}>
                        ↓ CSV
                      </button>
                    )}
                    <button onClick={() => openEdit(r)} style={btnSmall}>Editar</button>
                    <button onClick={() => handleDelete(r.id, r.nome)} style={{ ...btnSmall, color: '#dc2626', borderColor: '#fecaca' }}>Excluir</button>
                  </div>
                </div>
              </div>

              {/* Analytics panel (inline, abaixo do card) */}
              {openAnalise === r.id && analiseMap[r.id] && (
                <AnalyticsPanel analise={analiseMap[r.id]} cnaeDesc={cnaeDesc} natDesc={natDesc} />
              )}
              {openAnalise === r.id && loadingAnalise === r.id && (
                <div style={{ textAlign: 'center', padding: '18px 0', color: '#9ca3af', fontSize: 13 }}>Analisando dados...</div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ── Preview de execução ──────────────────────────────────────────── */}
      {preview && previewId !== null && (
        <div style={{ marginBottom: 32 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <div style={{ fontWeight: 700, fontSize: 15 }}>
              Resultado: {fmt(preview.total)} registros
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              {totalPages > 1 && (
                <>
                  <button onClick={() => executar(previewId, previewPage - 1)} disabled={previewPage === 1} style={btnSmall}>‹</button>
                  <span style={{ fontSize: 12, color: '#6b7280' }}>Pág. {previewPage} / {totalPages}</span>
                  <button onClick={() => executar(previewId, previewPage + 1)} disabled={previewPage >= totalPages} style={btnSmall}>›</button>
                </>
              )}
              <button onClick={() => exportar(previewId)} style={{ ...btnSmall, color: '#16a34a', borderColor: '#bbf7d0' }}>↓ Exportar CSV</button>
              <button onClick={() => setPreview(null)} style={{ ...btnSmall, color: '#6b7280' }}>✕</button>
            </div>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: '#f8fafc' }}>
                  {['CNPJ','Nome Fantasia','Situação','CNAE','UF','Município','Capital Social','Telefone','E-mail'].map(h => (
                    <th key={h} style={{ padding: '8px 10px', textAlign: 'left', fontWeight: 600, color: '#6b7280', whiteSpace: 'nowrap', borderBottom: '2px solid #e5e7eb' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {preview.data.map((row, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid #f3f4f6' }}>
                    <td style={{ ...tdS, fontFamily: 'monospace' }}>{formatCnpj(row.cnpj)}</td>
                    <td style={tdS}>{row.nome_fantasia || '—'}</td>
                    <td style={tdS}>{SITUACAO_LABEL[row.situacao_cadastral] ?? row.situacao_cadastral}</td>
                    <td style={{ ...tdS, fontFamily: 'monospace' }}>{row.cnae}</td>
                    <td style={tdS}>{row.uf}</td>
                    <td style={tdS}>{row.codigo_municipio}</td>
                    <td style={{ ...tdS, textAlign: 'right' }}>{fmtCapital(row.capital_social)}</td>
                    <td style={tdS}>{row.telefone || '—'}</td>
                    <td style={tdS}>{row.email || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Builder (fullscreen) ─────────────────────────────────────────── */}
      {showBuilder && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: '#f8fafc', borderRadius: 14, width: '95vw', maxWidth: 1140, height: '92vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.25)', overflow: 'hidden' }}>

            {/* Header */}
            <div style={{ background: '#fff', borderBottom: '1px solid #e5e7eb', padding: '14px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
                <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>
                  {editingId !== null ? 'Editar segmento' : 'Novo segmento'}
                </h2>
                {/* Step indicator */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
                  {['Construir', 'Analisar', 'Confirmar'].map((label, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center' }}>
                      <button
                        onClick={() => { if (i < wizardStep || (i === 1 && nome.trim())) goToStep(i); }}
                        disabled={i > wizardStep && !(i === 1 && nome.trim())}
                        style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderRadius: 20, border: 'none', cursor: i <= wizardStep ? 'pointer' : 'default',
                          background: wizardStep === i ? '#0070f3' : i < wizardStep ? '#e0f2fe' : '#f3f4f6',
                          color: wizardStep === i ? '#fff' : i < wizardStep ? '#0369a1' : '#9ca3af',
                          fontWeight: wizardStep === i ? 700 : 500, fontSize: 12 }}>
                        <span style={{ width: 18, height: 18, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700,
                          background: wizardStep === i ? 'rgba(255,255,255,0.25)' : i < wizardStep ? '#0369a1' : '#d1d5db',
                          color: wizardStep === i ? '#fff' : i < wizardStep ? '#fff' : '#6b7280' }}>
                          {i < wizardStep ? '✓' : i + 1}
                        </span>
                        {label}
                      </button>
                      {i < 2 && <div style={{ width: 24, height: 1, background: i < wizardStep ? '#0369a1' : '#e5e7eb', margin: '0 2px' }} />}
                    </div>
                  ))}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                {wizardStep === 0 && (
                  <button onClick={() => { setShowAiPanel(v => !v); setAiResult(null); setAiQuery(''); }}
                    style={{ padding: '6px 14px', fontSize: 12, fontWeight: 600, borderRadius: 6, cursor: 'pointer',
                      background: showAiPanel ? '#fef3c7' : '#fffbeb', color: '#92400e',
                      border: `1px solid ${showAiPanel ? '#fcd34d' : '#fde68a'}` }}>
                    ✨ {showAiPanel ? 'Fechar IA' : 'Sugerir com IA'}
                  </button>
                )}
                <button onClick={() => setShowBuilder(false)} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#9ca3af', padding: '0 4px' }}>✕</button>
              </div>
            </div>

            {/* Painel IA */}
            {showAiPanel && (
              <div style={{ background: '#fffbeb', borderBottom: '1px solid #fde68a', padding: '16px 24px', flexShrink: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#92400e', marginBottom: 8 }}>✨ Descreva o perfil de empresa que você quer encontrar</div>
                <div style={{ display: 'flex', gap: 8, marginBottom: aiResult ? 14 : 0 }}>
                  <input value={aiQuery} onChange={e => setAiQuery(e.target.value)} onKeyDown={e => e.key === 'Enter' && runAi()}
                    placeholder="ex: restaurantes e bares no Itaim Bibi, São Paulo, ativos"
                    style={{ ...inputS, flex: 1, background: '#fff' }} />
                  <button onClick={runAi} disabled={aiLoading || !aiQuery.trim()}
                    style={{ padding: '7px 20px', fontSize: 12, fontWeight: 600, borderRadius: 6, cursor: 'pointer', background: '#f59e0b', color: '#fff', border: 'none', whiteSpace: 'nowrap' }}>
                    {aiLoading ? 'Buscando...' : '✨ Sugerir'}
                  </button>
                </div>
                {aiResult && (
                  <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-start' }}>
                    {aiResult.cnaes.length > 0 && (
                      <div style={{ flex: '2 1 320px' }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: '#6b21a8', marginBottom: 6 }}>CNAEs sugeridos</div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 220, overflowY: 'auto', paddingRight: 4 }}>
                          {aiResult.cnaes.map(c => (
                            <div key={c.codigo} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '6px 10px', background: '#faf5ff', borderRadius: 6, border: '1px solid #e9d5ff' }}>
                              <div style={{ flex: 1 }}>
                                <span style={{ fontFamily: 'monospace', fontWeight: 700, color: '#6b21a8', fontSize: 12 }}>{c.codigo}</span>
                                <span style={{ fontSize: 12, color: '#374151', marginLeft: 6 }}>{c.descricao}</span>
                                {c.justificativa && <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 1 }}>{c.justificativa}</div>}
                              </div>
                              <button onMouseDown={() => selectCnae(c.codigo)}
                                style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, cursor: 'pointer', background: '#f3e8ff', color: '#6b21a8', border: '1px solid #c4b5fd', whiteSpace: 'nowrap' }}>
                                + Add
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    <div style={{ flex: '1 1 200px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {aiResult.ufs.length > 0 && (
                        <div>
                          <div style={{ fontSize: 11, fontWeight: 700, color: '#1e40af', marginBottom: 4 }}>Estados</div>
                          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                            {aiResult.ufs.map(uf => (
                              <button key={uf} onMouseDown={() => setFiltros(f => ({ ...f, ufs: [...new Set([...(f.ufs ?? []), uf])] }))}
                                style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, cursor: 'pointer', background: '#dbeafe', color: '#1e40af', border: '1px solid #93c5fd' }}>+ {uf}</button>
                            ))}
                          </div>
                        </div>
                      )}
                      {aiResult.municipios.length > 0 && (
                        <div>
                          <div style={{ fontSize: 11, fontWeight: 700, color: '#0369a1', marginBottom: 4 }}>Municípios</div>
                          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                            {aiResult.municipios.map(m => (
                              <button key={m.codigo} onMouseDown={() => selectMuni(m.codigo)}
                                style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, cursor: 'pointer', background: '#e0f2fe', color: '#0369a1', border: '1px solid #7dd3fc' }}>+ {m.descricao || m.codigo}</button>
                            ))}
                          </div>
                        </div>
                      )}
                      {aiResult.bairros.length > 0 && (
                        <div>
                          <div style={{ fontSize: 11, fontWeight: 700, color: '#065f46', marginBottom: 4 }}>Bairros</div>
                          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                            {aiResult.bairros.map(b => (
                              <button key={b} onMouseDown={() => addBairro(b)}
                                style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, cursor: 'pointer', background: '#d1fae5', color: '#065f46', border: '1px solid #6ee7b7' }}>+ {b}</button>
                            ))}
                          </div>
                        </div>
                      )}
                      <button onClick={applyAiAll}
                        style={{ padding: '7px 0', fontSize: 12, fontWeight: 700, borderRadius: 6, cursor: 'pointer', background: '#f59e0b', color: '#fff', border: 'none' }}>
                        Aplicar todos
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Body */}
            <div style={{ flex: 1, overflow: 'hidden', display: 'flex' }}>

            {/* ── Step 0: Construir ─────────────────────────────────────── */}
            {wizardStep === 0 && <>

              {/* Coluna esquerda */}
              <div style={{ width: 360, flexShrink: 0, borderRight: '1px solid #e5e7eb', background: '#fff', overflowY: 'auto', padding: '20px 20px' }}>

                <div style={sectionLabel}>Identificação</div>
                <label style={{ ...labelS, marginBottom: 10 }}>
                  Nome *
                  <input value={nome} onChange={e => setNome(e.target.value)} style={inputS} placeholder="Ex: Restaurantes SP ativos" />
                </label>
                <label style={labelS}>
                  Descrição
                  <input value={desc} onChange={e => setDesc(e.target.value)} style={inputS} placeholder="Opcional" />
                </label>

                <div style={{ borderTop: '1px solid #f3f4f6', margin: '18px 0' }} />

                {/* Situação */}
                <div style={sectionLabel}>Situação Cadastral</div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 18 }}>
                  {SITUACOES.map(s => {
                    const sel = (filtros.situacoes ?? []).includes(s.code);
                    return (
                      <label key={s.code} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 13, cursor: 'pointer',
                        padding: '4px 10px', borderRadius: 99, border: '1px solid', userSelect: 'none',
                        background: sel ? '#dcfce7' : '#f9fafb', borderColor: sel ? '#86efac' : '#e5e7eb', color: sel ? '#166534' : '#374151', fontWeight: sel ? 600 : 400 }}>
                        <input type="checkbox" checked={sel} style={{ display: 'none' }}
                          onChange={() => setFiltros(f => ({ ...f, situacoes: toggle(f.situacoes, s.code) }))} />
                        {s.label}
                      </label>
                    );
                  })}
                </div>

                <div style={{ borderTop: '1px solid #f3f4f6', margin: '18px 0' }} />

                {/* UFs */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <div style={sectionLabel}>Estados (UF)</div>
                  {(filtros.ufs?.length ?? 0) > 0 && (
                    <button onClick={() => setFiltros(f => ({ ...f, ufs: [] }))} style={{ fontSize: 11, color: '#9ca3af', background: 'none', border: 'none', cursor: 'pointer' }}>limpar</button>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 18 }}>
                  {UFS.map(uf => {
                    const sel = (filtros.ufs ?? []).includes(uf);
                    return (
                      <button key={uf} onClick={() => setFiltros(f => ({ ...f, ufs: toggle(f.ufs, uf) }))} style={{ padding: '4px 9px', fontSize: 12, borderRadius: 5, cursor: 'pointer', border: '1px solid', fontWeight: sel ? 700 : 400,
                        background: sel ? '#dbeafe' : '#f8fafc', borderColor: sel ? '#93c5fd' : '#e5e7eb', color: sel ? '#1e40af' : '#374151' }}>
                        {uf}
                      </button>
                    );
                  })}
                </div>

                <div style={{ borderTop: '1px solid #f3f4f6', margin: '18px 0' }} />

                {/* Porte */}
                <div style={sectionLabel}>Porte da Empresa</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 18 }}>
                  {PORTES.map(p => {
                    const sel = (filtros.portes ?? []).includes(p.code);
                    return (
                      <label key={p.code} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer',
                        padding: '6px 10px', borderRadius: 7, border: '1px solid', userSelect: 'none',
                        background: sel ? '#fef3c7' : '#f9fafb', borderColor: sel ? '#fcd34d' : '#e5e7eb', color: sel ? '#92400e' : '#374151', fontWeight: sel ? 600 : 400 }}>
                        <input type="checkbox" checked={sel} style={{ margin: 0, accentColor: '#f59e0b' }}
                          onChange={() => setFiltros(f => ({ ...f, portes: toggle(f.portes, p.code) }))} />
                        {p.label}
                      </label>
                    );
                  })}
                  {(filtros.portes?.length ?? 0) > 0 && (
                    <button onClick={() => setFiltros(f => ({ ...f, portes: [] }))} style={{ fontSize: 11, color: '#9ca3af', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}>limpar seleção</button>
                  )}
                </div>

                <div style={{ borderTop: '1px solid #f3f4f6', margin: '18px 0' }} />

                {/* Natureza Jurídica */}
                <div style={sectionLabel}>Natureza Jurídica</div>
                <div ref={natRef} style={{ position: 'relative', marginBottom: 8 }}>
                  <input
                    value={natInput}
                    onChange={e => setNatInput(e.target.value)}
                    placeholder="Buscar por código ou nome..."
                    style={inputS}
                  />
                  {showNatSuggs && natSuggs.length > 0 && (
                    <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 10,
                      background: '#fff', border: '1px solid #e5e7eb', borderRadius: 7, boxShadow: '0 4px 12px rgba(0,0,0,.08)', maxHeight: 220, overflowY: 'auto' }}>
                      {natSuggs.map(n => (
                        <div key={n.codigo} onMouseDown={() => selectNat(n.codigo, n.descricao)}
                          style={{ padding: '8px 12px', cursor: 'pointer', fontSize: 12, borderBottom: '1px solid #f3f4f6' }}
                          onMouseEnter={e => (e.currentTarget.style.background = '#f8fafc')}
                          onMouseLeave={e => (e.currentTarget.style.background = '#fff')}>
                          <span style={{ fontFamily: 'monospace', fontWeight: 700, color: '#4b5563', marginRight: 6 }}>{n.codigo}</span>
                          {n.descricao}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                {(filtros.naturezas ?? []).length > 0 && (
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 6 }}>
                    {filtros.naturezas!.map(c => (
                      <span key={c} style={{ display: 'inline-flex', alignItems: 'center', gap: 4,
                        fontSize: 11, padding: '2px 8px', borderRadius: 99, background: '#ede9fe', color: '#5b21b6', border: '1px solid #c4b5fd' }}>
                        <span style={{ fontFamily: 'monospace', fontWeight: 700 }}>{c}</span>
                        <span style={{ maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {natDesc[c] ? ` · ${natDesc[c]}` : ''}
                        </span>
                        <button onMouseDown={() => removeNat(c)}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#7c3aed', fontSize: 13, lineHeight: 1, padding: 0 }}>×</button>
                      </span>
                    ))}
                    <button onClick={() => setFiltros(f => ({ ...f, naturezas: [] }))}
                      style={{ fontSize: 11, color: '#9ca3af', background: 'none', border: 'none', cursor: 'pointer' }}>limpar</button>
                  </div>
                )}
                <div style={{ fontSize: 11, color: '#9ca3af', marginBottom: 18 }}>
                  Ex: 2305 LTDA · 2062 SA · 2135 Emp. Individual · 3034 Associação
                </div>

                <div style={{ borderTop: '1px solid #f3f4f6', margin: '18px 0' }} />

                {/* Capital Social */}
                <div style={sectionLabel}>Capital Social (R$)</div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 11, color: '#9ca3af', marginBottom: 3 }}>Mínimo</div>
                    <input value={capMinInput} onChange={e => setCapMinInput(e.target.value)}
                      placeholder="ex: 100000" type="number" min={0} style={inputS} />
                  </div>
                  <div style={{ fontSize: 13, color: '#d1d5db', paddingTop: 18 }}>–</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 11, color: '#9ca3af', marginBottom: 3 }}>Máximo</div>
                    <input value={capMaxInput} onChange={e => setCapMaxInput(e.target.value)}
                      placeholder="ex: 1000000" type="number" min={0} style={inputS} />
                  </div>
                </div>
                <div style={{ fontSize: 11, color: '#9ca3af', marginBottom: 18 }}>
                  Requer parquet de empresas carregado na Base Primária.
                </div>

                <div style={{ borderTop: '1px solid #f3f4f6', margin: '18px 0' }} />

                {/* Limite de enriquecimento */}
                <div style={sectionLabel}>Limite de Enriquecimento</div>
                <input
                  value={filtros.enrichLimit ?? ''}
                  onChange={e => setFiltros(f => ({ ...f, enrichLimit: e.target.value ? Number(e.target.value) : undefined }))}
                  placeholder="Sem limite (enriquecer todos)"
                  type="number" min={1} style={inputS} />
                <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 4, marginBottom: 18 }}>
                  Processa apenas os primeiros N registros no enriquecimento de site.
                </div>

                {saveError && (
                  <div style={{ marginTop: 16, padding: '10px 14px', background: '#fff0f0', border: '1px solid #fecaca', borderRadius: 6, fontSize: 13, color: '#dc2626' }}>
                    {saveError}
                  </div>
                )}
              </div>

              {/* Coluna direita — CNAEs + Municípios + Bairros */}
              <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>

                {/* CNAEs */}
                <div style={sectionLabel}>CNAEs</div>
                {(filtros.cnaes?.length ?? 0) > 0 && (
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 8 }}>
                    {filtros.cnaes!.map(c => {
                      const label = cnaeSuggs.find(s => s.codigo === c)?.descricao ?? cnaeDesc[c];
                      return (
                        <span key={c} style={{ fontSize: 12, padding: '3px 8px', background: '#f3e8ff', color: '#6b21a8', borderRadius: 99, display: 'flex', alignItems: 'center', gap: 4 }}>
                          <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{c}</span>
                          {label && <span style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>}
                          <button onClick={() => removeCnae(c)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9333ea', fontSize: 14, padding: 0, lineHeight: 1 }}>×</button>
                        </span>
                      );
                    })}
                  </div>
                )}
                <div ref={cnaeRef} style={{ position: 'relative', marginBottom: 18 }}>
                  <input value={cnaeInput} onChange={e => setCnaeInput(e.target.value)}
                    onFocus={() => cnaeInput.length >= 2 && setShowCnaeSuggs(true)}
                    style={inputS} placeholder="Buscar CNAE por código ou descrição..." />
                  {showCnaeSuggs && cnaeSuggs.length > 0 && (
                    <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#fff', border: '1px solid #e5e7eb', borderRadius: 6, boxShadow: '0 4px 12px rgba(0,0,0,0.1)', zIndex: 50, maxHeight: 220, overflowY: 'auto' }}>
                      {cnaeSuggs.map(s => (
                        <button key={s.codigo} onMouseDown={() => selectCnae(s.codigo)}
                          style={{ width: '100%', textAlign: 'left', padding: '8px 12px', background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, display: 'flex', gap: 8, alignItems: 'center' }}
                          onMouseEnter={e => (e.currentTarget.style.background = '#f8fafc')}
                          onMouseLeave={e => (e.currentTarget.style.background = 'none')}>
                          <span style={{ fontFamily: 'monospace', fontWeight: 600, color: '#6b21a8', whiteSpace: 'nowrap' }}>{s.codigo}</span>
                          <span style={{ color: '#374151' }}>{s.descricao}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div style={{ borderTop: '1px solid #f3f4f6', margin: '18px 0' }} />

                {/* Municípios */}
                <div style={sectionLabel}>
                  Municípios <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0, color: '#d1d5db' }}>sem seleção = estado todo</span>
                </div>
                {(filtros.municipios?.length ?? 0) > 0 && (
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 8 }}>
                    {filtros.municipios!.map(c => {
                      const label = muniSuggs.find(s => s.codigo === c)?.descricao ?? muniDesc[c];
                      return (
                        <span key={c} style={{ fontSize: 12, padding: '3px 8px', background: '#e0f2fe', color: '#0369a1', borderRadius: 99, display: 'flex', alignItems: 'center', gap: 4 }}>
                          <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{c}</span>
                          {label && <span style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>}
                          <button onClick={() => removeMuni(c)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#0284c7', fontSize: 14, padding: 0, lineHeight: 1 }}>×</button>
                        </span>
                      );
                    })}
                  </div>
                )}
                <div ref={muniRef} style={{ position: 'relative', marginBottom: 18 }}>
                  <input value={muniInput} onChange={e => setMuniInput(e.target.value)}
                    onFocus={() => muniInput.length >= 2 && setShowMuniSuggs(true)}
                    style={inputS} placeholder="Buscar município por código ou nome..." />
                  {showMuniSuggs && muniSuggs.length > 0 && (
                    <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#fff', border: '1px solid #e5e7eb', borderRadius: 6, boxShadow: '0 4px 12px rgba(0,0,0,0.1)', zIndex: 50, maxHeight: 220, overflowY: 'auto' }}>
                      {muniSuggs.map(s => (
                        <button key={s.codigo} onMouseDown={() => selectMuni(s.codigo)}
                          style={{ width: '100%', textAlign: 'left', padding: '8px 12px', background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, display: 'flex', gap: 8, alignItems: 'center' }}
                          onMouseEnter={e => (e.currentTarget.style.background = '#f8fafc')}
                          onMouseLeave={e => (e.currentTarget.style.background = 'none')}>
                          <span style={{ fontFamily: 'monospace', fontWeight: 600, color: '#0369a1', whiteSpace: 'nowrap' }}>{s.codigo}</span>
                          <span style={{ color: '#374151' }}>{s.descricao}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div style={{ borderTop: '1px solid #f3f4f6', margin: '18px 0' }} />

                {/* Bairros */}
                <div style={sectionLabel}>
                  Bairros <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0, color: '#d1d5db' }}>busca aproximada</span>
                </div>
                {(filtros.bairros?.length ?? 0) > 0 && (
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 8 }}>
                    {filtros.bairros!.map(b => (
                      <span key={b} style={{ fontSize: 12, padding: '3px 8px', background: '#d1fae5', color: '#065f46', borderRadius: 99, display: 'flex', alignItems: 'center', gap: 4 }}>
                        {b}
                        <button onClick={() => removeBairro(b)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#059669', fontSize: 14, padding: 0, lineHeight: 1 }}>×</button>
                      </span>
                    ))}
                  </div>
                )}
                <div style={{ display: 'flex', gap: 6 }}>
                  <input value={bairroInput} onChange={e => setBairroInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addBairro(bairroInput); } }}
                    placeholder="ex: itaim bibi, vila madalena..." style={{ ...inputS, flex: 1 }} />
                  <button onClick={() => addBairro(bairroInput)} disabled={!bairroInput.trim()}
                    style={{ padding: '7px 14px', fontSize: 12, fontWeight: 600, borderRadius: 6, cursor: 'pointer', background: '#ecfdf5', color: '#065f46', border: '1px solid #6ee7b7' }}>
                    Adicionar
                  </button>
                </div>
                <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 4 }}>
                  Filtra pelo campo bairro do cadastro da Receita Federal — grafia pode variar.
                </div>
              </div>

            </>}

            {/* ── Step 1: Analisar & Refinar ────────────────────────────── */}
            {wizardStep === 1 && (
              <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

                {/* Painel esquerdo — filtros ativos */}
                <div style={{ width: 300, flexShrink: 0, borderRight: '1px solid #e5e7eb', background: '#fff', overflowY: 'auto', padding: '18px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>Filtros ativos</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                      {(filtros.situacoes ?? ['02']).map(s => (
                        <span key={s} style={{ fontSize: 11, padding: '2px 8px', borderRadius: 99, background: '#dcfce7', color: '#166534', fontWeight: 500 }}>{SITUACAO_LABEL[s] ?? s}</span>
                      ))}
                      {(filtros.ufs ?? []).map(u => (
                        <button key={u} onClick={() => setFiltros(f => ({ ...f, ufs: (f.ufs ?? []).filter(x => x !== u) }))}
                          style={{ fontSize: 11, padding: '2px 8px', borderRadius: 99, background: '#dbeafe', color: '#1e40af', border: '1px solid #93c5fd', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3 }}>
                          {u} <span style={{ opacity: 0.6 }}>×</span>
                        </button>
                      ))}
                      {(filtros.cnaes ?? []).map(c => (
                        <button key={c} onClick={() => removeCnae(c)}
                          style={{ fontSize: 11, padding: '2px 8px', borderRadius: 99, background: '#f3e8ff', color: '#6b21a8', border: '1px solid #c4b5fd', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3, maxWidth: 180 }}>
                          <span style={{ fontFamily: 'monospace', fontWeight: 700 }}>{c}</span>
                          {cnaeDesc[c] && <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}> · {cnaeDesc[c]}</span>}
                          <span style={{ opacity: 0.6, flexShrink: 0 }}>×</span>
                        </button>
                      ))}
                      {(filtros.portes ?? []).map(p => (
                        <button key={p} onClick={() => setFiltros(f => ({ ...f, portes: (f.portes ?? []).filter(x => x !== p) }))}
                          style={{ fontSize: 11, padding: '2px 8px', borderRadius: 99, background: '#fef3c7', color: '#92400e', border: '1px solid #fcd34d', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3 }}>
                          {PORTE_LABEL[p] ?? p} <span style={{ opacity: 0.6 }}>×</span>
                        </button>
                      ))}
                      {(filtros.naturezas ?? []).map(n => (
                        <button key={n} onClick={() => removeNat(n)}
                          style={{ fontSize: 11, padding: '2px 8px', borderRadius: 99, background: '#ede9fe', color: '#5b21b6', border: '1px solid #c4b5fd', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3 }}>
                          <span style={{ fontFamily: 'monospace', fontWeight: 700 }}>{n}</span> <span style={{ opacity: 0.6 }}>×</span>
                        </button>
                      ))}
                      {(capMinInput || capMaxInput) && (
                        <button onClick={() => { setCapMinInput(''); setCapMaxInput(''); }}
                          style={{ fontSize: 11, padding: '2px 8px', borderRadius: 99, background: '#d1fae5', color: '#065f46', border: '1px solid #6ee7b7', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3 }}>
                          Capital {capMinInput ? `≥${Number(capMinInput).toLocaleString('pt-BR',{style:'currency',currency:'BRL',maximumFractionDigits:0})}` : ''}{capMaxInput ? ` ≤${Number(capMaxInput).toLocaleString('pt-BR',{style:'currency',currency:'BRL',maximumFractionDigits:0})}` : ''}
                          <span style={{ opacity: 0.6 }}>×</span>
                        </button>
                      )}
                    </div>
                  </div>

                  <div style={{ borderTop: '1px solid #f3f4f6', paddingTop: 12 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>Adicionar CNAE</div>
                    <div ref={cnaeRef} style={{ position: 'relative' }}>
                      <input value={cnaeInput} onChange={e => setCnaeInput(e.target.value)}
                        onFocus={() => cnaeInput.length >= 2 && setShowCnaeSuggs(true)}
                        style={{ ...inputS, fontSize: 12 }} placeholder="Buscar CNAE..." />
                      {showCnaeSuggs && cnaeSuggs.length > 0 && (
                        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#fff', border: '1px solid #e5e7eb', borderRadius: 6, boxShadow: '0 4px 12px rgba(0,0,0,0.1)', zIndex: 50, maxHeight: 180, overflowY: 'auto' }}>
                          {cnaeSuggs.map(s => (
                            <button key={s.codigo} onMouseDown={() => selectCnae(s.codigo)}
                              style={{ width: '100%', textAlign: 'left', padding: '7px 10px', background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, display: 'flex', gap: 6 }}
                              onMouseEnter={e => (e.currentTarget.style.background = '#f8fafc')}
                              onMouseLeave={e => (e.currentTarget.style.background = 'none')}>
                              <span style={{ fontFamily: 'monospace', fontWeight: 600, color: '#6b21a8', whiteSpace: 'nowrap' }}>{s.codigo}</span>
                              <span style={{ color: '#374151', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.descricao}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  <div style={{ borderTop: '1px solid #f3f4f6', paddingTop: 12 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>Adicionar UF</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                      {UFS.map(uf => {
                        const sel = (filtros.ufs ?? []).includes(uf);
                        return (
                          <button key={uf} onClick={() => setFiltros(f => ({ ...f, ufs: toggle(f.ufs, uf) }))}
                            style={{ padding: '3px 7px', fontSize: 11, borderRadius: 4, cursor: 'pointer', border: '1px solid', fontWeight: sel ? 700 : 400,
                              background: sel ? '#dbeafe' : '#f8fafc', borderColor: sel ? '#93c5fd' : '#e5e7eb', color: sel ? '#1e40af' : '#6b7280' }}>
                            {uf}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {saveError && (
                    <div style={{ padding: '8px 12px', background: '#fff0f0', border: '1px solid #fecaca', borderRadius: 6, fontSize: 12, color: '#dc2626' }}>{saveError}</div>
                  )}
                </div>

                {/* Painel direito — barras interativas */}
                <div style={{ flex: 1, overflowY: 'auto', padding: '18px 24px', background: '#f8fafc' }}>
                  {wizardLoading && !wizardAnalise && (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#9ca3af', fontSize: 14 }}>
                      Analisando dados...
                    </div>
                  )}
                  {wizardAnalise && (
                    <>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
                        <div style={{ fontSize: 28, fontWeight: 800, color: '#0070f3' }}>{fmt(wizardAnalise.total)}</div>
                        <div style={{ fontSize: 13, color: '#6b7280' }}>
                          empresas encontradas
                          {wizardLoading && <span style={{ marginLeft: 8, color: '#9ca3af', fontSize: 11 }}>atualizando...</span>}
                        </div>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 20 }}>

                        {/* Estados */}
                        {wizardAnalise.ufs.length > 0 && (
                          <div>
                            <div style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>
                              Estados
                              <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0, marginLeft: 6, color: '#d1d5db' }}>clique para filtrar</span>
                            </div>
                            {wizardAnalise.ufs.slice(0, 10).map(r => {
                              const inFilter = (filtros.ufs ?? []).includes(r.uf);
                              const hasFilter = (filtros.ufs?.length ?? 0) > 0;
                              const pct = wizardAnalise.total > 0 ? (r.total / wizardAnalise.total * 100).toFixed(1) : '0';
                              return (
                                <button key={r.uf} onClick={() => setFiltros(f => ({ ...f, ufs: toggle(f.ufs, r.uf) }))}
                                  style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', background: 'none', border: 'none', padding: '3px 0', cursor: 'pointer', borderRadius: 4 }}
                                  title={inFilter ? 'Remover do filtro' : 'Adicionar ao filtro'}>
                                  <div style={{ width: 28, textAlign: 'right', fontSize: 11, fontWeight: 700, color: inFilter ? '#1e40af' : '#6b7280', flexShrink: 0 }}>{r.uf}</div>
                                  <div style={{ flex: 1, height: 14, background: '#e5e7eb', borderRadius: 3, overflow: 'hidden' }}>
                                    <div style={{ height: '100%', width: `${pct}%`, background: inFilter ? '#3b82f6' : (hasFilter ? '#d1d5db' : '#93c5fd'), borderRadius: 3, transition: 'width 0.3s' }} />
                                  </div>
                                  <div style={{ width: 44, textAlign: 'right', fontSize: 11, color: inFilter ? '#1e40af' : '#9ca3af', flexShrink: 0 }}>{pct}%</div>
                                  <div style={{ width: 14, fontSize: 11, color: inFilter ? '#ef4444' : '#10b981', fontWeight: 700, flexShrink: 0 }}>{inFilter ? '−' : '+'}</div>
                                </button>
                              );
                            })}
                          </div>
                        )}

                        {/* CNAEs */}
                        {wizardAnalise.cnaes.length > 0 && (
                          <div>
                            <div style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>
                              CNAEs
                              <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0, marginLeft: 6, color: '#d1d5db' }}>clique para filtrar</span>
                            </div>
                            {wizardAnalise.cnaes.slice(0, 10).map(r => {
                              const inFilter = (filtros.cnaes ?? []).includes(r.cnae);
                              const hasFilter = (filtros.cnaes?.length ?? 0) > 0;
                              const pct = wizardAnalise.total > 0 ? (r.total / wizardAnalise.total * 100).toFixed(1) : '0';
                              const label = cnaeDesc[r.cnae] ?? r.cnae;
                              return (
                                <button key={r.cnae} onClick={() => { setCnaeDesc(p => ({ ...p, [r.cnae]: cnaeDesc[r.cnae] ?? r.cnae })); setFiltros(f => ({ ...f, cnaes: toggle(f.cnaes, r.cnae) })); }}
                                  style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', background: 'none', border: 'none', padding: '3px 0', cursor: 'pointer' }}
                                  title={inFilter ? 'Remover do filtro' : 'Adicionar ao filtro'}>
                                  <div style={{ width: 48, textAlign: 'right', fontSize: 10, fontFamily: 'monospace', fontWeight: 700, color: inFilter ? '#6b21a8' : '#6b7280', flexShrink: 0 }}>{r.cnae}</div>
                                  <div style={{ flex: 1, height: 14, background: '#e5e7eb', borderRadius: 3, overflow: 'hidden' }} title={label}>
                                    <div style={{ height: '100%', width: `${pct}%`, background: inFilter ? '#8b5cf6' : (hasFilter ? '#d1d5db' : '#c4b5fd'), borderRadius: 3, transition: 'width 0.3s' }} />
                                  </div>
                                  <div style={{ width: 44, textAlign: 'right', fontSize: 11, color: inFilter ? '#6b21a8' : '#9ca3af', flexShrink: 0 }}>{pct}%</div>
                                  <div style={{ width: 14, fontSize: 11, color: inFilter ? '#ef4444' : '#10b981', fontWeight: 700, flexShrink: 0 }}>{inFilter ? '−' : '+'}</div>
                                </button>
                              );
                            })}
                          </div>
                        )}

                        {/* Porte */}
                        {wizardAnalise.portes.length > 0 && (
                          <div>
                            <div style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>
                              Porte
                              <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0, marginLeft: 6, color: '#d1d5db' }}>clique para filtrar</span>
                            </div>
                            {wizardAnalise.portes.map(r => {
                              const inFilter = (filtros.portes ?? []).includes(r.porte);
                              const hasFilter = (filtros.portes?.length ?? 0) > 0;
                              const maxV = wizardAnalise.portes[0]?.total ?? 1;
                              const pct = (r.total / maxV * 100).toFixed(0);
                              const pctTotal = wizardAnalise.total > 0 ? (r.total / wizardAnalise.total * 100).toFixed(1) : '0';
                              return (
                                <button key={r.porte} onClick={() => setFiltros(f => ({ ...f, portes: toggle(f.portes, r.porte) }))}
                                  style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', background: 'none', border: 'none', padding: '3px 0', cursor: 'pointer' }}>
                                  <div style={{ width: 36, textAlign: 'right', fontSize: 11, fontWeight: 700, color: inFilter ? (r.porte === 'MEI' ? '#4338ca' : '#92400e') : '#6b7280', flexShrink: 0 }}>{PORTE_LABEL[r.porte] ?? r.porte}</div>
                                  <div style={{ flex: 1, height: 14, background: '#e5e7eb', borderRadius: 3, overflow: 'hidden' }}>
                                    <div style={{ height: '100%', width: `${pct}%`, background: inFilter ? (r.porte === 'MEI' ? '#6366f1' : '#f59e0b') : (hasFilter ? '#d1d5db' : (r.porte === 'MEI' ? '#a5b4fc' : '#fcd34d')), borderRadius: 3, transition: 'width 0.3s' }} />
                                  </div>
                                  <div style={{ width: 44, textAlign: 'right', fontSize: 11, color: '#9ca3af', flexShrink: 0 }}>{pctTotal}%</div>
                                  <div style={{ width: 14, fontSize: 11, color: inFilter ? '#ef4444' : '#10b981', fontWeight: 700, flexShrink: 0 }}>{inFilter ? '−' : '+'}</div>
                                </button>
                              );
                            })}
                          </div>
                        )}

                        {/* Natureza Jurídica */}
                        {wizardAnalise.naturezas.length > 0 && (
                          <div>
                            <div style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>
                              Natureza Jurídica
                              <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0, marginLeft: 6, color: '#d1d5db' }}>clique para filtrar</span>
                            </div>
                            {wizardAnalise.naturezas.slice(0, 10).map(r => {
                              const inFilter = (filtros.naturezas ?? []).includes(r.natureza);
                              const hasFilter = (filtros.naturezas?.length ?? 0) > 0;
                              const maxV = wizardAnalise.naturezas[0]?.total ?? 1;
                              const pct = (r.total / maxV * 100).toFixed(0);
                              const pctTotal = wizardAnalise.total > 0 ? (r.total / wizardAnalise.total * 100).toFixed(1) : '0';
                              const label = natDesc[r.natureza] ?? r.natureza;
                              return (
                                <button key={r.natureza} onClick={() => {
                                  setNatDesc(p => ({ ...p, [r.natureza]: natDesc[r.natureza] ?? r.natureza }));
                                  setFiltros(f => ({ ...f, naturezas: toggle(f.naturezas, r.natureza) }));
                                }}
                                  style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', background: 'none', border: 'none', padding: '3px 0', cursor: 'pointer' }}>
                                  <div style={{ width: 36, textAlign: 'right', fontSize: 10, fontFamily: 'monospace', fontWeight: 700, color: inFilter ? '#5b21b6' : '#6b7280', flexShrink: 0 }}>{r.natureza}</div>
                                  <div style={{ flex: 1, height: 14, background: '#e5e7eb', borderRadius: 3, overflow: 'hidden' }} title={label}>
                                    <div style={{ height: '100%', width: `${pct}%`, background: inFilter ? '#8b5cf6' : (hasFilter ? '#d1d5db' : '#ddd6fe'), borderRadius: 3, transition: 'width 0.3s' }} />
                                  </div>
                                  <div style={{ width: 44, textAlign: 'right', fontSize: 11, color: '#9ca3af', flexShrink: 0 }}>{pctTotal}%</div>
                                  <div style={{ width: 14, fontSize: 11, color: inFilter ? '#ef4444' : '#10b981', fontWeight: 700, flexShrink: 0 }}>{inFilter ? '−' : '+'}</div>
                                </button>
                              );
                            })}
                          </div>
                        )}

                        {/* Capital Social */}
                        {wizardAnalise.capital.length > 0 && (
                          <div>
                            <div style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>Capital Social</div>
                            <div style={{ fontSize: 10, color: '#9ca3af', marginBottom: 8 }}>MEI e ME frequentemente não informam capital</div>
                            {wizardAnalise.capital.map(r => {
                              const maxV = Math.max(...wizardAnalise.capital.map(c => c.total), 1);
                              const pct = (r.total / maxV * 100).toFixed(0);
                              const pctTotal = wizardAnalise.total > 0 ? (r.total / wizardAnalise.total * 100).toFixed(1) : '0';
                              return (
                                <div key={r.faixa} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '3px 0' }}>
                                  <div style={{ width: 80, textAlign: 'right', fontSize: 10, color: '#6b7280', flexShrink: 0 }}>{FAIXA_LABEL[r.faixa] ?? r.faixa}</div>
                                  <div style={{ flex: 1, height: 12, background: '#e5e7eb', borderRadius: 3, overflow: 'hidden' }}>
                                    <div style={{ height: '100%', width: `${pct}%`, background: FAIXA_COLOR[r.faixa] ?? '#e5e7eb', borderRadius: 3 }} />
                                  </div>
                                  <div style={{ width: 40, textAlign: 'right', fontSize: 11, color: '#9ca3af', flexShrink: 0 }}>{pctTotal}%</div>
                                </div>
                              );
                            })}
                            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                              <div style={{ flex: 1 }}>
                                <div style={{ fontSize: 10, color: '#9ca3af', marginBottom: 3 }}>Mín (R$)</div>
                                <input value={capMinInput} onChange={e => setCapMinInput(e.target.value)} type="number" min={0} placeholder="0" style={{ ...inputS, fontSize: 12 }} />
                              </div>
                              <div style={{ flex: 1 }}>
                                <div style={{ fontSize: 10, color: '#9ca3af', marginBottom: 3 }}>Máx (R$)</div>
                                <input value={capMaxInput} onChange={e => setCapMaxInput(e.target.value)} type="number" min={0} placeholder="sem limite" style={{ ...inputS, fontSize: 12 }} />
                              </div>
                            </div>
                          </div>
                        )}

                      </div>
                    </>
                  )}
                </div>
              </div>
            )}

            {/* ── Step 2: Confirmar ─────────────────────────────────────── */}
            {wizardStep === 2 && (
              <div style={{ flex: 1, overflowY: 'auto', padding: '32px 40px', display: 'flex', gap: 32, alignItems: 'flex-start' }}>

                {/* Resumo */}
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 16 }}>Resumo do segmento</div>

                  <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, padding: '16px 20px', marginBottom: 16 }}>
                    <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>{nome || <span style={{ color: '#9ca3af' }}>Sem nome</span>}</div>
                    {desc && <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 10 }}>{desc}</div>}
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                      {(filtros.situacoes ?? []).map(s => <Tag key={s} label={SITUACAO_LABEL[s] ?? s} color="#dcfce7" text="#166534" />)}
                      {(filtros.ufs ?? []).map(u => <Tag key={u} label={u} color="#dbeafe" text="#1e40af" />)}
                      {(filtros.cnaes ?? []).map(c => <Tag key={c} label={cnaeDesc[c] ? `${c} · ${cnaeDesc[c]}` : c} color="#f3e8ff" text="#6b21a8" />)}
                      {(filtros.portes ?? []).map(p => <Tag key={p} label={PORTE_LABEL[p] ?? p} color="#fef3c7" text="#92400e" />)}
                      {(filtros.naturezas ?? []).map(n => <Tag key={n} label={natDesc[n] ? `${n} · ${natDesc[n]}` : n} color="#ede9fe" text="#5b21b6" />)}
                      {capMinInput && <Tag label={`Capital ≥ R$ ${Number(capMinInput).toLocaleString('pt-BR')}`} color="#d1fae5" text="#065f46" />}
                      {capMaxInput && <Tag label={`Capital ≤ R$ ${Number(capMaxInput).toLocaleString('pt-BR')}`} color="#d1fae5" text="#065f46" />}
                      {(filtros.municipios ?? []).map(m => <Tag key={m} label={muniDesc[m] ?? m} color="#e0f2fe" text="#0369a1" />)}
                    </div>
                  </div>

                  {wizardAnalise && (
                    <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 10, padding: '14px 18px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 16 }}>
                      <div style={{ fontSize: 32, fontWeight: 800, color: '#0070f3' }}>{fmt(wizardAnalise.total)}</div>
                      <div style={{ fontSize: 13, color: '#1d4ed8' }}>empresas no segmento</div>
                    </div>
                  )}
                </div>

                {/* Configuração de enriquecimento */}
                <div style={{ width: 280, flexShrink: 0, background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, padding: '20px' }}>
                  <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>Criar base para enriquecimento</div>
                  <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 16 }}>
                    Defina quantos CNPJs processar. Deixe em branco para enriquecer todos.
                  </div>

                  <label style={labelS}>
                    Limite de registros
                    <input value={filtros.enrichLimit ?? ''}
                      onChange={e => setFiltros(f => ({ ...f, enrichLimit: e.target.value ? Number(e.target.value) : undefined }))}
                      placeholder="Sem limite" type="number" min={1} style={inputS} />
                  </label>

                  {filtros.enrichLimit && wizardAnalise && (
                    <div style={{ marginTop: 8, fontSize: 11, color: '#6b7280' }}>
                      Processará {fmt(Math.min(filtros.enrichLimit, wizardAnalise.total))} de {fmt(wizardAnalise.total)} registros
                    </div>
                  )}

                  {saveError && (
                    <div style={{ marginTop: 12, padding: '8px 12px', background: '#fff0f0', border: '1px solid #fecaca', borderRadius: 6, fontSize: 12, color: '#dc2626' }}>{saveError}</div>
                  )}
                </div>
              </div>
            )}

            </div>

            {/* Footer — wizard navigation */}
            <div style={{ background: '#fff', borderTop: '1px solid #e5e7eb', padding: '14px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
              <div>
                {wizardStep === 0
                  ? <button onClick={() => setShowBuilder(false)} style={btnSecondary}>Cancelar</button>
                  : <button onClick={() => setWizardStep(s => s - 1)} style={btnSecondary}>← Voltar</button>
                }
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                {wizardStep < 2 && (
                  <button onClick={() => goToStep(wizardStep + 1)} disabled={!nome.trim()}
                    style={{ ...btnPrimary, opacity: !nome.trim() ? 0.5 : 1 }}>
                    {wizardStep === 0 ? 'Analisar →' : 'Confirmar →'}
                  </button>
                )}
                {wizardStep === 2 && <>
                  <button onClick={() => handleSave(false)} disabled={saving || !nome.trim()} style={{ ...btnSecondary, minWidth: 140 }}>
                    {saving ? 'Salvando...' : editingId !== null ? 'Salvar alterações' : 'Salvar segmento'}
                  </button>
                  <button onClick={() => handleSave(true)} disabled={saving || !nome.trim()} style={{ ...btnPrimary, minWidth: 180 }}>
                    {saving ? 'Salvando...' : '✦ Salvar e Enriquecer'}
                  </button>
                </>}
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

// ─── Sub-componentes ─────────────────────────────────────────────────────────

function Tag({ label, color, text }: { label: string; color: string; text: string }) {
  return (
    <span style={{ fontSize: 11, padding: '2px 7px', borderRadius: 99, background: color, color: text, fontWeight: 500 }}>
      {label}
    </span>
  );
}

function formatCnpj(cnpj: string) {
  if (!cnpj || cnpj.length !== 14) return cnpj;
  return `${cnpj.slice(0,2)}.${cnpj.slice(2,5)}.${cnpj.slice(5,8)}/${cnpj.slice(8,12)}-${cnpj.slice(12)}`;
}
