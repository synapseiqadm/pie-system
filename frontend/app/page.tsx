'use client';

import { useEffect, useState } from 'react';

const API = 'http://localhost:3001';

// ─── Types ────────────────────────────────────────────────────────────────────

type UfRow  = { uf: string; total: number; ativos: number };
type CnaeRow = { cnae: string; total: number; descricao: string };

// ─── Palette ─────────────────────────────────────────────────────────────────

const PAL = [
  '#3b82f6','#8b5cf6','#10b981','#f59e0b','#ef4444',
  '#06b6d4','#ec4899','#84cc16','#f97316','#6366f1',
];
const OUTROS_COLOR = '#cbd5e1';

// ─── Donut chart ──────────────────────────────────────────────────────────────

type Slice = { label: string; value: number; color: string };

function DonutChart({ slices, size = 180 }: { slices: Slice[]; size?: number }) {
  const total = slices.reduce((s, d) => s + d.value, 0);
  if (!total) return null;

  const cx = size / 2, cy = size / 2;
  const R = size * 0.42, r = size * 0.24; // outer / inner radius
  let angle = -Math.PI / 2;

  const paths = slices.map((sl, i) => {
    const sweep = (sl.value / total) * 2 * Math.PI;
    const a0 = angle, a1 = angle + sweep;
    angle = a1;
    const x1o = cx + R * Math.cos(a0), y1o = cy + R * Math.sin(a0);
    const x2o = cx + R * Math.cos(a1), y2o = cy + R * Math.sin(a1);
    const x1i = cx + r * Math.cos(a1), y1i = cy + r * Math.sin(a1);
    const x2i = cx + r * Math.cos(a0), y2i = cy + r * Math.sin(a0);
    const lg = sweep > Math.PI ? 1 : 0;
    return (
      <path
        key={i}
        d={`M ${x1o} ${y1o} A ${R} ${R} 0 ${lg} 1 ${x2o} ${y2o} L ${x1i} ${y1i} A ${r} ${r} 0 ${lg} 0 ${x2i} ${y2i} Z`}
        fill={sl.color}
      />
    );
  });

  const pct = (v: number) => total > 0 ? ((v / total) * 100).toFixed(1) + '%' : '—';

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 24, flexWrap: 'wrap' }}>
      <svg width={size} height={size} style={{ flexShrink: 0 }}>{paths}</svg>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        {slices.map((sl, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12 }}>
            <span style={{ width: 10, height: 10, borderRadius: 2, background: sl.color, flexShrink: 0 }} />
            <span style={{ color: '#374151', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
              title={sl.label}>{sl.label}</span>
            <span style={{ color: '#9ca3af', marginLeft: 'auto', paddingLeft: 8, whiteSpace: 'nowrap' }}>
              {fmt(sl.value)} <span style={{ color: '#d1d5db' }}>·</span> {pct(sl.value)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number) { return n.toLocaleString('pt-BR'); }

function buildSlices(rows: { label: string; value: number }[], topN = 10): Slice[] {
  const top  = rows.slice(0, topN).map((r, i) => ({ ...r, color: PAL[i % PAL.length] }));
  const rest = rows.slice(topN).reduce((s, r) => s + r.value, 0);
  if (rest > 0) top.push({ label: 'Outros', value: rest, color: OUTROS_COLOR });
  return top;
}

// ─── Stat card ────────────────────────────────────────────────────────────────

function StatCard({ label, value, sub, color }: { label: string; value: string; sub?: string; color: string }) {
  return (
    <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, padding: '18px 22px', flex: '1 1 180px' }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 800, color, lineHeight: 1.1 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function Home() {
  const [ufs, setUfs]     = useState<UfRow[]>([]);
  const [cnaes, setCnaes] = useState<CnaeRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch(`${API}/base-primaria/analise/uf`).then(r => r.json()).catch(() => []),
      fetch(`${API}/base-primaria/analise/cnae?limit=12`).then(r => r.json()).catch(() => []),
    ]).then(([u, c]) => {
      setUfs(Array.isArray(u) ? u : []);
      setCnaes(Array.isArray(c) ? c : []);
    }).finally(() => setLoading(false));
  }, []);

  const totalCnpjs  = ufs.reduce((s, r) => s + r.total, 0);
  const totalAtivos = ufs.reduce((s, r) => s + r.ativos, 0);
  const pctAtivos   = totalCnpjs > 0 ? ((totalAtivos / totalCnpjs) * 100).toFixed(1) : '—';

  const ufSlices   = buildSlices(ufs.map(r => ({ label: r.uf, value: r.total })));
  const cnaeSlices = buildSlices(cnaes.map(r => ({ label: r.descricao || r.cnae, value: r.total })));

  const semDados = !loading && totalCnpjs === 0;

  return (
    <main style={{ padding: 32, fontFamily: 'sans-serif', maxWidth: 1200, margin: '0 auto' }}>

      {/* ── Header ── */}
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: '#111' }}>
          PIE — Plataforma de Inteligência Comercial
        </h1>
        <p style={{ margin: '4px 0 0', fontSize: 13, color: '#9ca3af' }}>
          Visão geral da base primária de CNPJs
        </p>
      </div>

      {/* ── Sem dados ── */}
      {semDados && (
        <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 10, padding: '20px 24px', marginBottom: 28, fontSize: 13, color: '#92400e' }}>
          Base primária não carregada.{' '}
          <a href="/base-primaria" style={{ color: '#0070f3', textDecoration: 'none', fontWeight: 600 }}>
            Acesse Base Primária →
          </a>{' '}
          para importar os dados da Receita Federal.
        </div>
      )}

      {/* ── Stats cards ── */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 24 }}>
        <StatCard
          label="Total de CNPJs"
          value={loading ? '...' : fmt(totalCnpjs)}
          sub="estabelecimentos na base"
          color="#0070f3"
        />
        <StatCard
          label="Ativos"
          value={loading ? '...' : fmt(totalAtivos)}
          sub={`${pctAtivos}% do total`}
          color="#16a34a"
        />
        <StatCard
          label="Estados (UF)"
          value={loading ? '...' : String(ufs.filter(u => u.uf !== '??').length)}
          sub="com dados na base"
          color="#7c3aed"
        />
        <StatCard
          label="Top CNAE"
          value={loading ? '...' : (cnaes[0]?.descricao?.split(' ').slice(0, 3).join(' ') ?? '—')}
          sub={cnaes[0] ? fmt(cnaes[0].total) + ' estabelecimentos' : undefined}
          color="#d97706"
        />
      </div>

      {/* ── Charts ── */}
      {!semDados && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))', gap: 16 }}>

          {/* UF */}
          <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, padding: '20px 24px' }}>
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#111' }}>Distribuição por Estado</div>
              <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>
                Total de estabelecimentos por UF
              </div>
            </div>
            {loading
              ? <div style={{ color: '#9ca3af', fontSize: 13 }}>Carregando...</div>
              : <DonutChart slices={ufSlices} size={190} />
            }
          </div>

          {/* CNAE */}
          <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, padding: '20px 24px' }}>
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#111' }}>Top CNAEs</div>
              <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>
                Atividades mais frequentes (estabelecimentos ativos)
              </div>
            </div>
            {loading
              ? <div style={{ color: '#9ca3af', fontSize: 13 }}>Carregando...</div>
              : <DonutChart slices={cnaeSlices} size={190} />
            }
          </div>

        </div>
      )}

      {/* ── UF table (detalhe) ── */}
      {!semDados && ufs.length > 0 && (
        <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, padding: '20px 24px', marginTop: 16 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#111', marginBottom: 14 }}>
            Detalhamento por Estado
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: '#f8fafc' }}>
                  {['UF','Total','Ativos','% Ativo','Barra'].map(h => (
                    <th key={h} style={{ padding: '8px 12px', textAlign: h === 'Barra' ? 'left' : 'right', fontWeight: 600, color: '#6b7280', whiteSpace: 'nowrap', borderBottom: '2px solid #e5e7eb', ...(h === 'UF' ? { textAlign: 'left' } : {}) }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ufs.map((r, i) => {
                  const pct = r.total > 0 ? (r.ativos / r.total) * 100 : 0;
                  const barW = totalCnpjs > 0 ? (r.total / ufs[0].total) * 100 : 0;
                  return (
                    <tr key={r.uf} style={{ borderBottom: '1px solid #f3f4f6' }}>
                      <td style={{ padding: '7px 12px', fontWeight: 700, color: '#111' }}>
                        <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, background: PAL[i] ?? OUTROS_COLOR, marginRight: 6, verticalAlign: 'middle' }} />
                        {r.uf}
                      </td>
                      <td style={{ padding: '7px 12px', textAlign: 'right', color: '#374151' }}>{fmt(r.total)}</td>
                      <td style={{ padding: '7px 12px', textAlign: 'right', color: '#16a34a' }}>{fmt(r.ativos)}</td>
                      <td style={{ padding: '7px 12px', textAlign: 'right', color: pct >= 70 ? '#16a34a' : '#d97706' }}>
                        {pct.toFixed(1)}%
                      </td>
                      <td style={{ padding: '7px 12px', width: 160, minWidth: 120 }}>
                        <div style={{ background: '#f3f4f6', borderRadius: 99, height: 6, overflow: 'hidden' }}>
                          <div style={{ background: PAL[i] ?? OUTROS_COLOR, height: '100%', width: `${barW}%`, borderRadius: 99 }} />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

    </main>
  );
}
