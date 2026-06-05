'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';

const API = (process.env.NEXT_PUBLIC_API_URL||'https://pie-system-production.up.railway.app');

type CanalScore = 'alto' | 'medio' | 'inviavel';

type OutboundRow = {
  id: number;
  cnpj: string;
  phoneBest?: string;
  phoneBestSource?: string;
  emailBest?: string;
  emailBestSource?: string;
  whatsappNumber?: string;
  isOperational?: boolean;
  siteUrl?: string;
  instagramUrl?: string;
  linkedinCompanyUrl?: string;
  socioNome?: string;
  socioEmailCandidate?: string;
  emailScore: CanalScore;
  whatsappScore: CanalScore;
  sdrScore: CanalScore;
  linkedinScore: CanalScore;
  outboundScore: number;
};

type Stats = { total: number; alto: number; medio: number; inviavel: number };

const SCORE_COLORS: Record<CanalScore, { bg: string; color: string }> = {
  alto:     { bg: '#dcfce7', color: '#16a34a' },
  medio:    { bg: '#fef9c3', color: '#ca8a04' },
  inviavel: { bg: '#f3f4f6', color: '#9ca3af' },
};

function ScoreBadge({ score }: { score: CanalScore }) {
  const { bg, color } = SCORE_COLORS[score];
  return (
    <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 99, background: bg, color }}>
      {score.toUpperCase()}
    </span>
  );
}

function StatCard({ label, value, color, sub }: { label: string; value: string | number; color: string; sub?: string }) {
  return (
    <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, padding: '14px 20px', flex: '1 1 130px' }}>
      <div style={{ fontSize: 22, fontWeight: 700, color }}>{typeof value === 'number' ? value.toLocaleString('pt-BR') : value}</div>
      <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>{label}</div>
      {sub && <div style={{ fontSize: 11, color: '#9ca3af' }}>{sub}</div>}
    </div>
  );
}

function OutboundContent() {
  const params      = useSearchParams();
  const recorteId   = params.get('recorteId');
  const recorteNome = params.get('nome') ?? 'Recorte';

  const [stats, setStats]   = useState<Stats | null>(null);
  const [data, setData]     = useState<OutboundRow[]>([]);
  const [total, setTotal]   = useState(0);
  const [page, setPage]     = useState(1);
  const [loading, setLoading] = useState(false);
  const [emailFilter, setEmailFilter] = useState<CanalScore | ''>('');
  const [whatsFilter, setWhatsFilter] = useState<CanalScore | ''>('');
  const [sdrFilter,   setSdrFilter]   = useState<CanalScore | ''>('');

  const loadPage = async (p: number, ef = emailFilter, wf = whatsFilter, sf = sdrFilter) => {
    if (!recorteId) return;
    setLoading(true);
    try {
      let url = `${API}/enriquecimento/${recorteId}/outbound?page=${p}&limit=50`;
      if (ef)  url += `&emailScore=${ef}`;
      if (wf)  url += `&whatsappScore=${wf}`;
      if (sf)  url += `&sdrScore=${sf}`;
      const res = await fetch(url).then(r => r.json());
      setData(res.data ?? []);
      setTotal(res.total ?? 0);
      setStats({ total: res.total ?? 0, alto: res.alto ?? 0, medio: res.medio ?? 0, inviavel: res.inviavel ?? 0 });
      setPage(p);
    } finally { setLoading(false); }
  };

  useEffect(() => { if (recorteId) loadPage(1); }, [recorteId]);

  const applyFilter = (ef: CanalScore | '', wf: CanalScore | '', sf: CanalScore | '') => {
    setEmailFilter(ef); setWhatsFilter(wf); setSdrFilter(sf);
    loadPage(1, ef, wf, sf);
  };

  const exportJson = async () => {
    if (!recorteId) return;
    const res = await fetch(`${API}/enriquecimento/${recorteId}/outbound/export`);
    const data = await res.json();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `outbound_${recorteNome.replace(/\s+/g,'_')}.json`;
    a.click();
  };

  const totalPages = Math.ceil(total / 50) || 1;

  return (
    <main style={{ padding: 32, fontFamily: 'sans-serif', maxWidth: 1300, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
        <a href="/enriquecimento" style={{ fontSize: 13, color: '#0070f3', textDecoration: 'none' }}>← Enriquecimento</a>
        <span style={{ color: '#d1d5db' }}>/</span>
        <span style={{ fontSize: 13, color: '#6b7280' }}>Outbound-Ready</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>Outbound-Ready · {recorteNome}</h1>
          <p style={{ fontSize: 13, color: '#6b7280' }}>Perfil consolidado com canal scores. DNC excluído automaticamente do export.</p>
        </div>
        <button onClick={exportJson} style={{
          padding: '8px 18px', borderRadius: 8, fontSize: 13, fontWeight: 600,
          background: '#d97706', color: '#fff', border: 'none', cursor: 'pointer',
        }}>
          ⬇ Exportar JSON
        </button>
      </div>

      {/* Stats */}
      {stats && (
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>
          <StatCard label="Total" value={stats.total} color="#111" />
          <StatCard label="Score Alto (≥50)" value={stats.alto} color="#16a34a" sub={`${stats.total ? Math.round(stats.alto/stats.total*100) : 0}%`} />
          <StatCard label="Score Médio" value={stats.medio} color="#ca8a04" sub="20–49 pts" />
          <StatCard label="Inviável" value={stats.inviavel} color="#9ca3af" sub="<20 pts" />
        </div>
      )}

      {/* Filtros de canal */}
      <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, padding: '12px 16px', marginBottom: 16, display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase' }}>Filtrar por canal:</span>
        {(['', 'alto', 'medio', 'inviavel'] as const).map(v => (
          <label key={`email-${v}`} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, cursor: 'pointer' }}>
            <input type="radio" name="email" checked={emailFilter === v} onChange={() => applyFilter(v, whatsFilter, sdrFilter)} />
            Email {v || 'todos'}
          </label>
        ))}
        <span style={{ color: '#e5e7eb' }}>|</span>
        {(['', 'alto', 'medio', 'inviavel'] as const).map(v => (
          <label key={`whats-${v}`} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, cursor: 'pointer' }}>
            <input type="radio" name="whats" checked={whatsFilter === v} onChange={() => applyFilter(emailFilter, v, sdrFilter)} />
            WhatsApp {v || 'todos'}
          </label>
        ))}
        <span style={{ color: '#e5e7eb' }}>|</span>
        {(['', 'alto', 'medio', 'inviavel'] as const).map(v => (
          <label key={`sdr-${v}`} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, cursor: 'pointer' }}>
            <input type="radio" name="sdr" checked={sdrFilter === v} onChange={() => applyFilter(emailFilter, whatsFilter, v)} />
            SDR {v || 'todos'}
          </label>
        ))}
        {(emailFilter || whatsFilter || sdrFilter) && (
          <button onClick={() => applyFilter('', '', '')} style={{ fontSize: 11, color: '#dc2626', background: 'none', border: 'none', cursor: 'pointer' }}>✕ Limpar</button>
        )}
      </div>

      {loading && <div style={{ color: '#9ca3af', fontSize: 13 }}>Consultando...</div>}

      {!loading && data.length > 0 && (
        <>
          <div style={{ overflowX: 'auto', borderRadius: 8, border: '1px solid #e5e7eb' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: '#f8fafc' }}>
                  {['CNPJ', 'Score', 'Email', 'Email Score', 'WhatsApp', 'WA Score', 'Telefone Direto', 'SDR Score', 'LinkedIn', 'Sócio', 'Site'].map(h => (
                    <th key={h} style={{ padding: '9px 10px', textAlign: 'left', fontWeight: 700, color: '#6b7280', borderBottom: '2px solid #e5e7eb', whiteSpace: 'nowrap', fontSize: 11 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.map((r, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid #f3f4f6', background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                    <td style={{ padding: '7px 10px', fontFamily: 'monospace', fontSize: 11, color: '#374151' }}>{r.cnpj}</td>
                    <td style={{ padding: '7px 10px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <div style={{ width: 36, height: 6, borderRadius: 3, background: '#e5e7eb', overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${r.outboundScore}%`, background: r.outboundScore >= 50 ? '#16a34a' : r.outboundScore >= 20 ? '#ca8a04' : '#9ca3af' }} />
                        </div>
                        <span style={{ fontSize: 11, fontWeight: 700 }}>{r.outboundScore}</span>
                      </div>
                    </td>
                    <td style={{ padding: '7px 10px', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {r.emailBest ? <span title={r.emailBest}>{r.emailBest}</span> : <span style={{ color: '#d1d5db' }}>—</span>}
                      {r.emailBestSource && <span style={{ fontSize: 9, color: '#9ca3af', marginLeft: 4 }}>({r.emailBestSource})</span>}
                    </td>
                    <td style={{ padding: '7px 10px' }}><ScoreBadge score={r.emailScore} /></td>
                    <td style={{ padding: '7px 10px', fontFamily: 'monospace', fontSize: 11 }}>{r.whatsappNumber ?? <span style={{ color: '#d1d5db' }}>—</span>}</td>
                    <td style={{ padding: '7px 10px' }}><ScoreBadge score={r.whatsappScore} /></td>
                    <td style={{ padding: '7px 10px', fontFamily: 'monospace', fontSize: 11 }}>
                      {r.phoneBest ?? <span style={{ color: '#d1d5db' }}>—</span>}
                      {r.phoneBestSource && <span style={{ fontSize: 9, color: '#9ca3af', marginLeft: 4 }}>({r.phoneBestSource})</span>}
                    </td>
                    <td style={{ padding: '7px 10px' }}><ScoreBadge score={r.sdrScore} /></td>
                    <td style={{ padding: '7px 10px' }}>
                      {r.linkedinCompanyUrl
                        ? <a href={r.linkedinCompanyUrl} target="_blank" style={{ color: '#0a66c2', fontSize: 11 }}>LinkedIn</a>
                        : <ScoreBadge score={r.linkedinScore} />}
                    </td>
                    <td style={{ padding: '7px 10px', fontSize: 11 }}>
                      {r.socioNome
                        ? <div><div style={{ fontWeight: 600 }}>{r.socioNome}</div><div style={{ color: '#9ca3af', fontSize: 10 }}>{r.socioEmailCandidate}</div></div>
                        : <span style={{ color: '#d1d5db' }}>—</span>}
                    </td>
                    <td style={{ padding: '7px 10px' }}>
                      {r.siteUrl
                        ? <a href={r.siteUrl} target="_blank" style={{ color: '#0070f3', fontSize: 11 }}>↗</a>
                        : <span style={{ color: '#d1d5db' }}>—</span>}
                    </td>
                  </tr>
                ))}
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

      {!loading && data.length === 0 && (
        <div style={{ textAlign: 'center', padding: '48px 0', color: '#9ca3af', fontSize: 14, border: '1px dashed #e5e7eb', borderRadius: 10 }}>
          Nenhum dado outbound. Execute o módulo Outbound-Ready para este recorte.
        </div>
      )}
    </main>
  );
}

export default function OutboundPage() {
  return <Suspense><OutboundContent /></Suspense>;
}

const btnPage: React.CSSProperties = {
  padding: '6px 14px', borderRadius: 6, fontSize: 12, border: '1px solid #e5e7eb',
  background: '#fff', cursor: 'pointer', color: '#374151',
};
