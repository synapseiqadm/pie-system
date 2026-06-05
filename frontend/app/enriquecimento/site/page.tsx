'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';

const API = (process.env.NEXT_PUBLIC_API_URL||'https://pie-system-production.up.railway.app');

type SiteRow = {
  id: number;
  cnpj: string;
  url?: string;
  status: 'encontrado' | 'nao_encontrado';
  instagramUrl?: string;
  facebookUrl?: string;
  linkedinUrl?: string;
  whatsappUrl?: string;
  reclameaquiUrl?: string;
  googlePhone?: string;
  googleRating?: number;
  googleRatingCount?: number;
  googleBusinessStatus?: string;
  googleAddress?: string;
  confiabilidadeScore: number;
  confiabilidadeLabel: string;
};

type Stats = { total: number; encontrado: number; scoreAlto: number; scoreMedio: number; scoreBaixo: number };

const CONF_STYLE: Record<string, { bg: string; color: string }> = {
  alto:  { bg: '#dcfce7', color: '#16a34a' },
  medio: { bg: '#fef9c3', color: '#ca8a04' },
  baixo: { bg: '#fee2e2', color: '#dc2626' },
};

const BSTATUS_COLOR: Record<string, string> = {
  OPERATIONAL:        '#16a34a',
  CLOSED_PERMANENTLY: '#dc2626',
  CLOSED_TEMPORARILY: '#ca8a04',
};

function StatCard({ label, value, color, sub }: { label: string; value: string | number; color: string; sub?: string }) {
  return (
    <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, padding: '14px 20px', flex: '1 1 130px' }}>
      <div style={{ fontSize: 22, fontWeight: 700, color }}>{typeof value === 'number' ? value.toLocaleString('pt-BR') : value}</div>
      <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>{label}</div>
      {sub && <div style={{ fontSize: 11, color: '#9ca3af' }}>{sub}</div>}
    </div>
  );
}

function SiteContent() {
  const params      = useSearchParams();
  const recorteId   = params.get('recorteId');
  const recorteNome = params.get('nome') ?? 'Recorte';

  const [stats, setStats]     = useState<Stats | null>(null);
  const [data, setData]       = useState<SiteRow[]>([]);
  const [total, setTotal]     = useState(0);
  const [page, setPage]       = useState(1);
  const [loading, setLoading] = useState(false);
  const [soloEncontrado, setSoloEncontrado] = useState(false);

  const loadPage = async (p: number) => {
    if (!recorteId) return;
    setLoading(true);
    try {
      const res = await fetch(`${API}/enriquecimento/${recorteId}/site?page=${p}&limit=50`).then(r => r.json());
      setData(res.data ?? []);
      setTotal(res.total ?? 0);
      setStats({
        total: res.total ?? 0,
        encontrado: res.encontrado ?? 0,
        scoreAlto: res.scoreAlto ?? 0,
        scoreMedio: res.scoreMedio ?? 0,
        scoreBaixo: res.scoreBaixo ?? 0,
      });
      setPage(p);
    } finally { setLoading(false); }
  };

  useEffect(() => { if (recorteId) loadPage(1); }, [recorteId]);

  const filtered = soloEncontrado ? data.filter(r => r.status === 'encontrado') : data;
  const totalPages = Math.ceil(total / 50) || 1;

  return (
    <main style={{ padding: 32, fontFamily: 'sans-serif', maxWidth: 1300, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
        <a href="/enriquecimento" style={{ fontSize: 13, color: '#0070f3', textDecoration: 'none' }}>← Enriquecimento</a>
        <span style={{ color: '#d1d5db' }}>/</span>
        <span style={{ fontSize: 13, color: '#6b7280' }}>Site + Redes Sociais</span>
      </div>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>Site + Redes · {recorteNome}</h1>
      <p style={{ fontSize: 13, color: '#6b7280', marginBottom: 24 }}>
        Presença digital validada via Google Places, email corporativo e scraping com IA.
      </p>

      {stats && (
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 24 }}>
          <StatCard label="Total" value={stats.total} color="#111" />
          <StatCard label="Site encontrado" value={stats.encontrado} color="#0070f3"
            sub={`${stats.total ? Math.round(stats.encontrado/stats.total*100) : 0}%`} />
          <StatCard label="Score alto" value={stats.scoreAlto} color="#16a34a" sub="≥ 70 pts" />
          <StatCard label="Score médio" value={stats.scoreMedio} color="#ca8a04" sub="40–69 pts" />
          <StatCard label="Score baixo" value={stats.scoreBaixo} color="#dc2626" sub="< 40 pts" />
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {[false, true].map(v => (
          <button key={String(v)} onClick={() => setSoloEncontrado(v)} style={{
            padding: '5px 12px', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer',
            background: soloEncontrado === v ? '#0070f3' : '#fff',
            color: soloEncontrado === v ? '#fff' : '#374151',
            border: `1px solid ${soloEncontrado === v ? '#0070f3' : '#d1d5db'}`,
          }}>{v ? 'Só encontrados' : 'Todos'}</button>
        ))}
      </div>

      {loading && <div style={{ color: '#9ca3af', fontSize: 13 }}>Consultando...</div>}

      {!loading && filtered.length > 0 && (
        <>
          <div style={{ overflowX: 'auto', borderRadius: 8, border: '1px solid #e5e7eb' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: '#f8fafc' }}>
                  {['CNPJ', 'Site', 'Score', 'Business Status', 'Telefone Places', 'Rating', 'Redes Sociais', 'WhatsApp'].map(h => (
                    <th key={h} style={{ padding: '9px 10px', textAlign: 'left', fontWeight: 700, color: '#6b7280', borderBottom: '2px solid #e5e7eb', whiteSpace: 'nowrap', fontSize: 11 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((r, i) => {
                  const conf = CONF_STYLE[r.confiabilidadeLabel] ?? CONF_STYLE.baixo;
                  const bColor = BSTATUS_COLOR[r.googleBusinessStatus ?? ''] ?? '#9ca3af';
                  return (
                    <tr key={i} style={{ borderBottom: '1px solid #f3f4f6', background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                      <td style={{ padding: '7px 10px', fontFamily: 'monospace', fontSize: 11 }}>{r.cnpj}</td>
                      <td style={{ padding: '7px 10px', maxWidth: 200 }}>
                        {r.url
                          ? <div>
                              <a href={r.url} target="_blank" style={{ color: '#0070f3', fontSize: 11, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.url}</a>
                              <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 99, background: conf.bg, color: conf.color, fontWeight: 600 }}>{r.confiabilidadeLabel} ({r.confiabilidadeScore})</span>
                            </div>
                          : <span style={{ color: '#d1d5db', fontSize: 11 }}>Não encontrado</span>}
                      </td>
                      <td style={{ padding: '7px 10px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                          <div style={{ width: 32, height: 5, borderRadius: 3, background: '#e5e7eb', overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: `${r.confiabilidadeScore}%`, background: conf.color }} />
                          </div>
                          <span style={{ fontSize: 11, fontWeight: 700 }}>{r.confiabilidadeScore}</span>
                        </div>
                      </td>
                      <td style={{ padding: '7px 10px', fontSize: 11, fontWeight: 600, color: bColor }}>
                        {r.googleBusinessStatus ?? <span style={{ color: '#d1d5db', fontWeight: 400 }}>—</span>}
                      </td>
                      <td style={{ padding: '7px 10px', fontFamily: 'monospace', fontSize: 11 }}>{r.googlePhone ?? <span style={{ color: '#d1d5db' }}>—</span>}</td>
                      <td style={{ padding: '7px 10px', fontSize: 11 }}>
                        {r.googleRating != null ? `${r.googleRating.toFixed(1)} ★ (${r.googleRatingCount ?? 0})` : <span style={{ color: '#d1d5db' }}>—</span>}
                      </td>
                      <td style={{ padding: '7px 10px' }}>
                        <div style={{ display: 'flex', gap: 4 }}>
                          {r.instagramUrl && <a href={r.instagramUrl} target="_blank" style={{ fontSize: 10, padding: '1px 6px', borderRadius: 99, background: '#fce7f3', color: '#db2777', fontWeight: 600, textDecoration: 'none' }}>IG</a>}
                          {r.facebookUrl  && <a href={r.facebookUrl}  target="_blank" style={{ fontSize: 10, padding: '1px 6px', borderRadius: 99, background: '#dbeafe', color: '#1d4ed8', fontWeight: 600, textDecoration: 'none' }}>FB</a>}
                          {r.linkedinUrl  && <a href={r.linkedinUrl}  target="_blank" style={{ fontSize: 10, padding: '1px 6px', borderRadius: 99, background: '#e0f2fe', color: '#0369a1', fontWeight: 600, textDecoration: 'none' }}>LI</a>}
                          {r.reclameaquiUrl && <a href={r.reclameaquiUrl} target="_blank" style={{ fontSize: 10, padding: '1px 6px', borderRadius: 99, background: '#fff7ed', color: '#c2410c', fontWeight: 600, textDecoration: 'none' }}>RA</a>}
                          {!r.instagramUrl && !r.facebookUrl && !r.linkedinUrl && <span style={{ color: '#d1d5db', fontSize: 11 }}>—</span>}
                        </div>
                      </td>
                      <td style={{ padding: '7px 10px' }}>
                        {r.whatsappUrl
                          ? <a href={r.whatsappUrl} target="_blank" style={{ fontSize: 11, color: '#16a34a', fontWeight: 600, textDecoration: 'none' }}>WA ↗</a>
                          : <span style={{ color: '#d1d5db', fontSize: 11 }}>—</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 14, alignItems: 'center', justifyContent: 'flex-end' }}>
            <button onClick={() => loadPage(page - 1)} disabled={page === 1} style={btnPage}>‹ Anterior</button>
            <span style={{ fontSize: 12, color: '#6b7280' }}>Página {page} de {totalPages} · {total.toLocaleString('pt-BR')} registros</span>
            <button onClick={() => loadPage(page + 1)} disabled={page >= totalPages} style={btnPage}>Próxima ›</button>
          </div>
        </>
      )}

      {!loading && filtered.length === 0 && (
        <div style={{ textAlign: 'center', padding: '48px 0', color: '#9ca3af', fontSize: 14, border: '1px dashed #e5e7eb', borderRadius: 10 }}>
          Nenhum dado de site. Execute o módulo Site + Redes Sociais para este recorte.
        </div>
      )}
    </main>
  );
}

export default function SitePage() {
  return <Suspense><SiteContent /></Suspense>;
}

const btnPage: React.CSSProperties = {
  padding: '6px 14px', borderRadius: 6, fontSize: 12, border: '1px solid #e5e7eb',
  background: '#fff', cursor: 'pointer', color: '#374151',
};
