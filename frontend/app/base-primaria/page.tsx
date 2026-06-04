'use client';

import { useEffect, useState, useCallback, useRef } from 'react';

const API = (process.env.NEXT_PUBLIC_API_URL||'https://pie-system-production.up.railway.app');

// ─── Types ───────────────────────────────────────────────────────────────────

type Overview = {
  totalEstab: number; ativos: number; estados: number; cnaes: number; totalEmp: number;
};

type UfRow    = { uf: string; total: number; ativos: number };
type CnaeRow  = { cnae: string; total: number; descricao?: string };
type MuniRow  = { codigo_municipio: string; uf: string; total: number; descricao?: string };
type SitRow   = { situacao: string; label: string; total: number };
type PorteRow = { porte: string; label: string; total: number };

type FileInfo = { tipo: string; arquivo: string; tamanho: number; criadoEm: string };
type Status   = {
  estabelecimentos: { arquivos: FileInfo[]; total: number };
  empresas: { arquivos: FileInfo[]; total: number };
  socios: { arquivos: FileInfo[]; total: number };
};

type ConvProgress = { stage: string; detail?: string };
type Tab = 'uf' | 'cnae' | 'municipio' | 'situacao' | 'porte' | 'socios';
type SocioRow = {
  cnpj_basico: string; identificador_socio: string; nome_socio: string;
  cpf_cnpj_socio: string; qualificacao_socio: string;
  data_entrada_sociedade: string; faixa_etaria: string;
};

const SITUACAO_COLOR: Record<string, string> = {
  '02': '#16a34a', '03': '#d97706', '04': '#dc2626', '08': '#6b7280', '01': '#6b7280',
};

function fmtBytes(b: number) {
  if (b >= 1_073_741_824) return `${(b / 1_073_741_824).toFixed(1)} GB`;
  if (b >= 1_048_576) return `${(b / 1_048_576).toFixed(1)} MB`;
  return `${(b / 1_024).toFixed(0)} KB`;
}

function pct(value: number, total: number) {
  if (!total) return '0%';
  return `${Math.round((value / total) * 100)}%`;
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function BasePrimariaPage() {
  const [overview, setOverview]   = useState<Overview | null>(null);
  const [status, setStatus]       = useState<Status | null>(null);
  const [tab, setTab]             = useState<Tab>('uf');
  const [ufFilter, setUfFilter]   = useState('');

  const [ufData, setUfData]       = useState<UfRow[]>([]);
  const [cnaeData, setCnaeData]   = useState<CnaeRow[]>([]);
  const [muniData, setMuniData]   = useState<MuniRow[]>([]);
  const [sitData, setSitData]     = useState<SitRow[]>([]);
  const [porteData, setPorteData] = useState<PorteRow[]>([]);

  const [sociosData, setSociosData]   = useState<SocioRow[]>([]);
  const [sociosTotal, setSociosTotal] = useState(0);
  const [sociosPage, setSociosPage]   = useState(1);
  const [sociosQ, setSociosQ]         = useState('');
  const [sociosLoading, setSociosLoading] = useState(false);

  const [conv, setConv]           = useState<Record<string, ConvProgress>>({});
  const [uploadOpen, setUploadOpen] = useState(false);
  const [loading, setLoading]     = useState(false);
  const fileRefEstab  = useRef<HTMLInputElement>(null);
  const fileRefEmp    = useRef<HTMLInputElement>(null);
  const fileRefSocios = useRef<HTMLInputElement>(null);

  const loadMeta = useCallback(async () => {
    const [ov, st] = await Promise.all([
      fetch(`${API}/base-primaria/overview`).then((r) => r.json()),
      fetch(`${API}/base-primaria/status`).then((r) => r.json()),
    ]);
    setOverview(ov);
    setStatus(st);
  }, []);

  const fetchArr = async (url: string) => {
    const data = await fetch(url).then((r) => r.json());
    return Array.isArray(data) ? data : [];
  };

  const loadTab = useCallback(async (t: Tab, uf: string) => {
    setLoading(true);
    try {
      const q = (p: string) => {
        const params = new URLSearchParams({ limit: '100' });
        if (uf) params.set('uf', uf);
        return `${p}?${params}`;
      };
      if (t === 'uf')        setUfData(await fetchArr(`${API}/base-primaria/analise/uf`));
      if (t === 'cnae')      setCnaeData(await fetchArr(q(`${API}/base-primaria/analise/cnae`)));
      if (t === 'municipio') setMuniData(await fetchArr(q(`${API}/base-primaria/analise/municipio`)));
      if (t === 'situacao')  setSitData(await fetchArr(q(`${API}/base-primaria/analise/situacao`)));
      if (t === 'porte')     setPorteData(await fetchArr(`${API}/base-primaria/analise/porte`));
    } finally {
      setLoading(false);
    }
  }, [ufFilter]);

  const loadSocios = useCallback(async (q: string, page: number) => {
    setSociosLoading(true);
    try {
      const params = new URLSearchParams({ limit: '50', page: String(page) });
      if (q) params.set('q', q);
      const res = await fetch(`${API}/base-primaria/socios/browse?${params}`).then((r) => r.json());
      setSociosData(Array.isArray(res.data) ? res.data : []);
      setSociosTotal(res.total ?? 0);
    } finally {
      setSociosLoading(false);
    }
  }, []);

  // Carrega UFs assim que há dados (para o dropdown ficar disponível em qualquer aba)
  useEffect(() => {
    if (overview?.totalEstab) fetchArr(`${API}/base-primaria/analise/uf`).then(setUfData);
  }, [overview?.totalEstab]);

  useEffect(() => { loadMeta(); }, [loadMeta]);
  useEffect(() => { if (overview?.totalEstab) loadTab(tab, ufFilter); }, [tab, ufFilter, loadTab, overview?.totalEstab]);
  useEffect(() => { if (tab === 'socios') loadSocios(sociosQ, sociosPage); }, [tab, sociosQ, sociosPage, loadSocios]);

  async function handleUpload(file: File, tipo: 'estabelecimentos' | 'empresas' | 'socios') {
    const key = `${tipo}_${Date.now()}`;
    setConv((p) => ({ ...p, [key]: { stage: 'enviando', detail: file.name } }));

    const fd = new FormData();
    fd.append('file', file);
    const res = await fetch(`${API}/base-primaria/upload/${tipo}`, { method: 'POST', body: fd });

    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let buf = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const parts = buf.split('\n\n');
      buf = parts.pop() ?? '';
      for (const part of parts) {
        const line = part.replace(/^data: /, '').trim();
        if (!line) continue;
        try {
          const ev: ConvProgress = JSON.parse(line);
          setConv((p) => ({ ...p, [key]: ev }));
          if (ev.stage === 'concluido') {
            await loadMeta();
            await loadTab(tab, ufFilter);
          }
        } catch {}
      }
    }
  }

  const hasData = (overview?.totalEstab ?? 0) > 0;
  const totalEstab = overview?.totalEstab ?? 0;

  return (
    <main style={{ padding: 32, fontFamily: 'sans-serif', maxWidth: 1200, margin: '0 auto' }}>
      <h1 style={{ marginBottom: 4, fontSize: 22, fontWeight: 700 }}>Base Primária</h1>
      <p style={{ color: '#666', fontSize: 13, marginBottom: 28 }}>
        Dados da Receita Federal armazenados em Parquet · consultados via DuckDB
      </p>

      {/* ── Overview ────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 14, marginBottom: 28, flexWrap: 'wrap' }}>
        {[
          { label: 'Estabelecimentos', value: totalEstab.toLocaleString('pt-BR'), sub: '' },
          { label: 'Ativos', value: (overview?.ativos ?? 0).toLocaleString('pt-BR'), sub: pct(overview?.ativos ?? 0, totalEstab) },
          { label: 'Empresas', value: (overview?.totalEmp ?? 0).toLocaleString('pt-BR'), sub: '' },
          { label: 'Estados', value: overview?.estados ?? 0, sub: '' },
          { label: 'CNAEs únicos', value: (overview?.cnaes ?? 0).toLocaleString('pt-BR'), sub: '' },
        ].map((c) => (
          <div key={c.label} style={card}>
            <div style={{ fontSize: 22, fontWeight: 700, color: '#111' }}>{c.value}</div>
            <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>{c.label}</div>
            {c.sub && <div style={{ fontSize: 11, color: '#9ca3af' }}>{c.sub} do total</div>}
          </div>
        ))}
      </div>

      {/* ── Upload ──────────────────────────────────────────────────────── */}
      <div style={{ background: '#f8fafc', border: '1px solid #e5e7eb', borderRadius: 10, marginBottom: 28, overflow: 'hidden' }}>
        <button
          onClick={() => setUploadOpen((o) => !o)}
          style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 20px', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 14, color: '#111', textAlign: 'left' }}
        >
          Carregar arquivos da Receita Federal
          <span style={{ fontSize: 12, color: '#9ca3af', fontWeight: 400 }}>{uploadOpen ? '▲ recolher' : '▼ expandir'}</span>
        </button>

        {uploadOpen && (
          <div style={{ padding: '0 20px 20px', borderTop: '1px solid #e5e7eb' }}>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-start', paddingTop: 16 }}>
              {(['estabelecimentos', 'empresas', 'socios'] as const).map((tipo) => {
                const fileRef = tipo === 'estabelecimentos' ? fileRefEstab : tipo === 'empresas' ? fileRefEmp : fileRefSocios;
                const arquivos = tipo === 'estabelecimentos'
                  ? status?.estabelecimentos?.arquivos ?? []
                  : tipo === 'empresas'
                  ? status?.empresas?.arquivos ?? []
                  : status?.socios?.arquivos ?? [];
                const activeConvs = Object.entries(conv).filter(([k]) => k.startsWith(tipo));

                return (
                  <div key={tipo} style={{ flex: '1 1 260px', background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, padding: 14 }}>
                    <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 8, textTransform: 'capitalize' }}>{tipo}</div>

                    {arquivos.length > 0 && (
                      <div style={{ marginBottom: 8 }}>
                        {arquivos.map((f) => (
                          <div key={f.arquivo} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#374151', padding: '3px 0', borderBottom: '1px solid #f3f4f6' }}>
                            <span style={{ fontFamily: 'monospace' }}>{f.arquivo}</span>
                            <span style={{ color: '#9ca3af' }}>{fmtBytes(f.tamanho)}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    {activeConvs.map(([key, ev]) => (
                      <div key={key} style={{ fontSize: 12, color: ev.stage === 'erro' ? '#dc2626' : ev.stage === 'concluido' ? '#16a34a' : '#d97706', marginBottom: 6, padding: '6px 10px', background: ev.stage === 'concluido' ? '#f0fff4' : ev.stage === 'erro' ? '#fff0f0' : '#fffbeb', borderRadius: 6 }}>
                        {ev.stage === 'iniciando' && `Enviando ${ev.detail}...`}
                        {ev.stage === 'extraindo' && `Extraindo...`}
                        {ev.stage === 'convertendo' && `Convertendo para Parquet...`}
                        {ev.stage === 'concluido' && `Concluído: ${ev.detail}`}
                        {ev.stage === 'erro' && `Erro: ${ev.detail}`}
                      </div>
                    ))}

                    <label style={{ ...btnSecondary, cursor: 'pointer', display: 'inline-block', fontSize: 12 }}>
                      + Adicionar ZIP
                      <input
                        ref={fileRef}
                        type="file"
                        accept=".zip,.csv,.txt"
                        style={{ display: 'none' }}
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) { handleUpload(f, tipo); if (fileRef.current) fileRef.current.value = ''; }
                        }}
                      />
                    </label>
                    <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 6 }}>
                      Múltiplos ZIPs são acumulados (part_0, part_1, ...)
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* ── Análise ──────────────────────────────────────────────────────── */}
      {!hasData ? (
        <div style={{ textAlign: 'center', padding: '48px 0', color: '#9ca3af', fontSize: 14 }}>
          Carregue arquivos ZIP da Receita Federal para visualizar a análise.
        </div>
      ) : (
        <>
          {/* Filtro UF global */}
          <div style={{ display: 'flex', gap: 10, marginBottom: 16, alignItems: 'center' }}>
            <span style={{ fontSize: 13, color: '#6b7280' }}>Filtrar por UF:</span>
            <select value={ufFilter} onChange={(e) => setUfFilter(e.target.value)} style={filterSel}>
              <option value="">Todos os estados</option>
              {ufData.map((r) => (
                <option key={r.uf} value={r.uf}>{r.uf} ({r.total.toLocaleString('pt-BR')})</option>
              ))}
            </select>
            {ufFilter && (
              <button onClick={() => setUfFilter('')} style={{ ...btnSecondary, fontSize: 12 }}>✕ Limpar</button>
            )}
          </div>

          {/* Tabs */}
          <div style={{ display: 'flex', gap: 0, borderBottom: '2px solid #e5e7eb', marginBottom: 20 }}>
            {([
              { id: 'uf', label: 'Por UF' },
              { id: 'cnae', label: 'Por CNAE' },
              { id: 'municipio', label: 'Por Município' },
              { id: 'situacao', label: 'Por Situação' },
              { id: 'porte', label: 'Por Porte' },
              { id: 'socios', label: 'Sócios' },
            ] as { id: Tab; label: string }[]).map((t) => (
              <button key={t.id} onClick={() => setTab(t.id)} style={{
                padding: '8px 18px', border: 'none', background: 'none', cursor: 'pointer',
                fontSize: 13, fontWeight: tab === t.id ? 700 : 400,
                color: tab === t.id ? '#0070f3' : '#6b7280',
                borderBottom: tab === t.id ? '2px solid #0070f3' : '2px solid transparent',
                marginBottom: -2,
              }}>{t.label}</button>
            ))}
          </div>

          {loading && <div style={{ color: '#9ca3af', fontSize: 13, marginBottom: 12 }}>Consultando...</div>}

          {/* ── Por UF ── */}
          {tab === 'uf' && (
            <table style={tblStyle}>
              <thead><tr style={thRow}>
                <th style={th}>UF</th>
                <th style={{ ...th, textAlign: 'right' }}>Total</th>
                <th style={{ ...th, textAlign: 'right' }}>Ativos</th>
                <th style={{ ...th, textAlign: 'right' }}>% Ativos</th>
                <th style={th}>Distribuição</th>
              </tr></thead>
              <tbody>
                {ufData.map((r) => (
                  <tr key={r.uf} style={tdRow}>
                    <td style={{ ...td, fontWeight: 700 }}>{r.uf}</td>
                    <td style={{ ...td, textAlign: 'right', fontFamily: 'monospace' }}>{r.total.toLocaleString('pt-BR')}</td>
                    <td style={{ ...td, textAlign: 'right', fontFamily: 'monospace', color: '#16a34a' }}>{r.ativos.toLocaleString('pt-BR')}</td>
                    <td style={{ ...td, textAlign: 'right' }}>{pct(r.ativos, r.total)}</td>
                    <td style={{ ...td, minWidth: 120 }}>
                      <div style={{ background: '#e5e7eb', borderRadius: 99, height: 6, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: pct(r.total, totalEstab), background: '#0070f3', borderRadius: 99 }} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {/* ── Por CNAE ── */}
          {tab === 'cnae' && (
            <table style={tblStyle}>
              <thead><tr style={thRow}>
                <th style={th}>CNAE</th>
                <th style={th}>Descrição</th>
                <th style={{ ...th, textAlign: 'right' }}>Estabelecimentos Ativos</th>
                <th style={th}>Distribuição</th>
              </tr></thead>
              <tbody>
                {cnaeData.map((r) => (
                  <tr key={r.cnae} style={tdRow}>
                    <td style={{ ...td, fontFamily: 'monospace', fontWeight: 600, whiteSpace: 'nowrap' }}>{r.cnae}</td>
                    <td style={{ ...td, color: '#374151' }}>{r.descricao ?? '—'}</td>
                    <td style={{ ...td, textAlign: 'right', fontFamily: 'monospace' }}>{r.total.toLocaleString('pt-BR')}</td>
                    <td style={{ ...td, minWidth: 140 }}>
                      <div style={{ background: '#e5e7eb', borderRadius: 99, height: 6, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: pct(r.total, cnaeData[0]?.total ?? 1), background: '#7c3aed', borderRadius: 99 }} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {/* ── Por Município ── */}
          {tab === 'municipio' && (
            <table style={tblStyle}>
              <thead><tr style={thRow}>
                <th style={th}>Município</th>
                <th style={th}>UF</th>
                <th style={{ ...th, textAlign: 'right' }}>Estabelecimentos Ativos</th>
                <th style={th}>Distribuição</th>
              </tr></thead>
              <tbody>
                {muniData.map((r) => (
                  <tr key={r.codigo_municipio} style={tdRow}>
                    <td style={{ ...td, fontWeight: 600 }}>{r.descricao ?? r.codigo_municipio}</td>
                    <td style={td}>{r.uf}</td>
                    <td style={{ ...td, textAlign: 'right', fontFamily: 'monospace' }}>{r.total.toLocaleString('pt-BR')}</td>
                    <td style={{ ...td, minWidth: 140 }}>
                      <div style={{ background: '#e5e7eb', borderRadius: 99, height: 6, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: pct(r.total, muniData[0]?.total ?? 1), background: '#0891b2', borderRadius: 99 }} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {/* ── Por Situação ── */}
          {tab === 'situacao' && (
            <table style={tblStyle}>
              <thead><tr style={thRow}>
                <th style={th}>Situação</th>
                <th style={{ ...th, textAlign: 'right' }}>Total</th>
                <th style={{ ...th, textAlign: 'right' }}>% do Total</th>
                <th style={th}>Distribuição</th>
              </tr></thead>
              <tbody>
                {sitData.map((r) => (
                  <tr key={r.situacao} style={tdRow}>
                    <td style={td}>
                      <span style={{
                        fontSize: 11, padding: '2px 8px', borderRadius: 99, fontWeight: 500,
                        background: `${SITUACAO_COLOR[r.situacao] ?? '#6b7280'}22`,
                        color: SITUACAO_COLOR[r.situacao] ?? '#6b7280',
                      }}>{r.label}</span>
                    </td>
                    <td style={{ ...td, textAlign: 'right', fontFamily: 'monospace' }}>{r.total.toLocaleString('pt-BR')}</td>
                    <td style={{ ...td, textAlign: 'right' }}>{pct(r.total, totalEstab)}</td>
                    <td style={{ ...td, minWidth: 200 }}>
                      <div style={{ background: '#e5e7eb', borderRadius: 99, height: 8, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: pct(r.total, totalEstab), background: SITUACAO_COLOR[r.situacao] ?? '#6b7280', borderRadius: 99 }} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {/* ── Por Porte ── */}
          {tab === 'porte' && (
            <table style={tblStyle}>
              <thead><tr style={thRow}>
                <th style={th}>Porte</th>
                <th style={{ ...th, textAlign: 'right' }}>Empresas</th>
                <th style={{ ...th, textAlign: 'right' }}>% do Total</th>
                <th style={th}>Distribuição</th>
              </tr></thead>
              <tbody>
                {porteData.map((r) => (
                  <tr key={r.porte} style={tdRow}>
                    <td style={{ ...td, fontWeight: 600 }}>{r.label}</td>
                    <td style={{ ...td, textAlign: 'right', fontFamily: 'monospace' }}>{r.total.toLocaleString('pt-BR')}</td>
                    <td style={{ ...td, textAlign: 'right' }}>{pct(r.total, overview?.totalEmp ?? 1)}</td>
                    <td style={{ ...td, minWidth: 200 }}>
                      <div style={{ background: '#e5e7eb', borderRadius: 99, height: 8, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: pct(r.total, overview?.totalEmp ?? 1), background: '#f59e0b', borderRadius: 99 }} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {/* ── Sócios ── */}
          {tab === 'socios' && (
            <div>
              <div style={{ display: 'flex', gap: 10, marginBottom: 14, alignItems: 'center' }}>
                <input
                  type="text"
                  placeholder="Buscar por CNPJ, nome ou CPF/CNPJ do sócio..."
                  value={sociosQ}
                  onChange={(e) => { setSociosQ(e.target.value); setSociosPage(1); }}
                  style={{ flex: 1, padding: '7px 12px', border: '1px solid #ccc', borderRadius: 6, fontSize: 13 }}
                />
                <span style={{ fontSize: 12, color: '#9ca3af', whiteSpace: 'nowrap' }}>
                  {sociosTotal.toLocaleString('pt-BR')} registros
                </span>
              </div>
              {sociosLoading && <div style={{ color: '#9ca3af', fontSize: 13, marginBottom: 10 }}>Consultando...</div>}
              {!sociosLoading && sociosData.length === 0 && (
                <div style={{ color: '#9ca3af', fontSize: 13, padding: '32px 0', textAlign: 'center' }}>
                  {status?.socios?.total ? 'Nenhum resultado para a busca.' : 'Carregue arquivos de sócios para visualizar.'}
                </div>
              )}
              {sociosData.length > 0 && (
                <>
                  <table style={tblStyle}>
                    <thead><tr style={thRow}>
                      <th style={th}>CNPJ Básico</th>
                      <th style={th}>Nome / Razão Social</th>
                      <th style={th}>CPF / CNPJ</th>
                      <th style={th}>Qualificação</th>
                      <th style={th}>Entrada</th>
                      <th style={th}>Faixa Etária</th>
                    </tr></thead>
                    <tbody>
                      {sociosData.map((r, i) => (
                        <tr key={i} style={tdRow}>
                          <td style={{ ...td, fontFamily: 'monospace' }}>{r.cnpj_basico}</td>
                          <td style={{ ...td, fontWeight: 500 }}>{r.nome_socio || '—'}</td>
                          <td style={{ ...td, fontFamily: 'monospace', color: '#6b7280' }}>{r.cpf_cnpj_socio || '—'}</td>
                          <td style={td}>{r.qualificacao_socio || '—'}</td>
                          <td style={{ ...td, color: '#6b7280' }}>{r.data_entrada_sociedade || '—'}</td>
                          <td style={td}>{r.faixa_etaria || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div style={{ display: 'flex', gap: 8, marginTop: 14, alignItems: 'center', justifyContent: 'flex-end' }}>
                    <button onClick={() => setSociosPage((p) => Math.max(1, p - 1))} disabled={sociosPage === 1} style={btnSecondary}>‹ Anterior</button>
                    <span style={{ fontSize: 13, color: '#6b7280' }}>Página {sociosPage} de {Math.ceil(sociosTotal / 50) || 1}</span>
                    <button onClick={() => setSociosPage((p) => p + 1)} disabled={sociosPage * 50 >= sociosTotal} style={btnSecondary}>Próxima ›</button>
                  </div>
                </>
              )}
            </div>
          )}
        </>
      )}
    </main>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────
const card: React.CSSProperties = {
  background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10,
  padding: '14px 20px', minWidth: 140, flex: '1 1 140px',
};
const btnSecondary: React.CSSProperties = {
  padding: '7px 14px', background: '#fff', color: '#333',
  border: '1px solid #ccc', borderRadius: 6, cursor: 'pointer', fontSize: 13,
};
const filterSel: React.CSSProperties = {
  padding: '6px 10px', border: '1px solid #ccc', borderRadius: 6,
  fontSize: 13, background: '#fff', minWidth: 200,
};
const tblStyle: React.CSSProperties = { width: '100%', borderCollapse: 'collapse' };
const thRow: React.CSSProperties = { background: '#f8fafc', textAlign: 'left' };
const tdRow: React.CSSProperties = { borderBottom: '1px solid #f3f4f6' };
const th: React.CSSProperties = { padding: '10px 12px', fontSize: 12, fontWeight: 700, color: '#6b7280', whiteSpace: 'nowrap' };
const td: React.CSSProperties = { padding: '8px 12px', fontSize: 13 };
