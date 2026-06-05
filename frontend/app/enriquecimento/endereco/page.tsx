'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';

const API = (process.env.NEXT_PUBLIC_API_URL||'https://pie-system-production.up.railway.app');

type AddressRow = {
  id: number;
  cnpj: string;
  status: 'verificado' | 'suspeito' | 'nao_verificado';
  matchScore: number;
  confidence: string;
  businessStatus?: string;
  placesAddress?: string;
  placesPhone?: string;
  placesRating?: number;
  placesReviewsCount?: number;
  placesHasHours?: boolean;
};

type Stats = { total: number; verificado: number; suspeito: number; nao_verificado: number };

const STATUS_STYLE: Record<string, { bg: string; color: string; label: string }> = {
  verificado:    { bg: '#dcfce7', color: '#16a34a', label: '✓ Verificado' },
  suspeito:      { bg: '#fef9c3', color: '#ca8a04', label: '⚠ Suspeito' },
  nao_verificado:{ bg: '#f3f4f6', color: '#9ca3af', label: '— Não verificado' },
};

const BSTATUS_STYLE: Record<string, { color: string; label: string }> = {
  OPERATIONAL:          { color: '#16a34a', label: '● Operacional' },
  CLOSED_PERMANENTLY:   { color: '#dc2626', label: '✕ Fechado' },
  CLOSED_TEMPORARILY:   { color: '#ca8a04', label: '◌ Temporariamente fechado' },
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

function EnderecoContent() {
  const params      = useSearchParams();
  const recorteId   = params.get('recorteId');
  const recorteNome = params.get('nome') ?? 'Recorte';

  const [stats, setStats]     = useState<Stats | null>(null);
  const [data, setData]       = useState<AddressRow[]>([]);
  const [total, setTotal]     = useState(0);
  const [page, setPage]       = useState(1);
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>('');

  const loadPage = async (p: number, sf = statusFilter) => {
    if (!recorteId) return;
    setLoading(true);
    try {
      const res = await fetch(`${API}/enriquecimento/${recorteId}/endereco?page=${p}&limit=50`).then(r => r.json());
      let rows: AddressRow[] = res.data ?? [];
      if (sf) rows = rows.filter(r => r.status === sf);
      setData(rows);
      setTotal(res.total ?? 0);
      setStats({ total: res.total ?? 0, verificado: res.verificado ?? 0, suspeito: res.suspeito ?? 0, nao_verificado: res.nao_verificado ?? 0 });
      setPage(p);
    } finally { setLoading(false); }
  };

  useEffect(() => { if (recorteId) loadPage(1); }, [recorteId]);

  const totalPages = Math.ceil(total / 50) || 1;

  return (
    <main style={{ padding: 32, fontFamily: 'sans-serif', maxWidth: 1200, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
        <a href="/enriquecimento" style={{ fontSize: 13, color: '#0070f3', textDecoration: 'none' }}>← Enriquecimento</a>
        <span style={{ color: '#d1d5db' }}>/</span>
        <span style={{ fontSize: 13, color: '#6b7280' }}>Endereço</span>
      </div>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>Endereço · {recorteNome}</h1>
      <p style={{ fontSize: 13, color: '#6b7280', marginBottom: 24 }}>
        Verificação de operacionalidade via Google Places com score multi-âncora.
      </p>

      {stats && (
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 24 }}>
          <StatCard label="Total" value={stats.total} color="#111" />
          <StatCard label="Verificado" value={stats.verificado} color="#16a34a" sub={`score ≥ 70 pts`} />
          <StatCard label="Suspeito" value={stats.suspeito} color="#ca8a04" sub="score 40–69 pts" />
          <StatCard label="Não verificado" value={stats.nao_verificado} color="#9ca3af" />
        </div>
      )}

      <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
        {[['', 'Todos'], ['verificado', '✓ Verificado'], ['suspeito', '⚠ Suspeito'], ['nao_verificado', '— Não verificado']].map(([v, label]) => (
          <button key={v} onClick={() => { setStatusFilter(v); loadPage(1, v); }} style={{
            padding: '5px 12px', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer',
            background: statusFilter === v ? '#059669' : '#fff',
            color: statusFilter === v ? '#fff' : '#374151',
            border: `1px solid ${statusFilter === v ? '#059669' : '#d1d5db'}`,
          }}>{label}</button>
        ))}
      </div>

      {loading && <div style={{ color: '#9ca3af', fontSize: 13 }}>Consultando...</div>}

      {!loading && data.length > 0 && (
        <>
          <div style={{ overflowX: 'auto', borderRadius: 8, border: '1px solid #e5e7eb' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: '#f8fafc' }}>
                  {['CNPJ', 'Status', 'Score', 'Confiança', 'Business Status', 'Endereço Places', 'Telefone Places', 'Rating', 'Horários'].map(h => (
                    <th key={h} style={{ padding: '9px 10px', textAlign: 'left', fontWeight: 700, color: '#6b7280', borderBottom: '2px solid #e5e7eb', whiteSpace: 'nowrap', fontSize: 11 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.map((r, i) => {
                  const st = STATUS_STYLE[r.status] ?? STATUS_STYLE.nao_verificado;
                  const bs = BSTATUS_STYLE[r.businessStatus ?? ''];
                  return (
                    <tr key={i} style={{ borderBottom: '1px solid #f3f4f6', background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                      <td style={{ padding: '7px 10px', fontFamily: 'monospace', fontSize: 11 }}>{r.cnpj}</td>
                      <td style={{ padding: '7px 10px' }}>
                        <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 99, background: st.bg, color: st.color }}>{st.label}</span>
                      </td>
                      <td style={{ padding: '7px 10px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <div style={{ width: 40, height: 5, borderRadius: 3, background: '#e5e7eb', overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: `${r.matchScore}%`, background: r.matchScore >= 70 ? '#16a34a' : r.matchScore >= 40 ? '#ca8a04' : '#9ca3af' }} />
                          </div>
                          <span style={{ fontWeight: 700, fontSize: 11 }}>{r.matchScore}</span>
                        </div>
                      </td>
                      <td style={{ padding: '7px 10px', fontSize: 11, color: '#6b7280' }}>{r.confidence}</td>
                      <td style={{ padding: '7px 10px' }}>
                        {bs ? <span style={{ fontSize: 11, fontWeight: 600, color: bs.color }}>{bs.label}</span> : <span style={{ color: '#d1d5db' }}>—</span>}
                      </td>
                      <td style={{ padding: '7px 10px', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        <span title={r.placesAddress}>{r.placesAddress ?? <span style={{ color: '#d1d5db' }}>—</span>}</span>
                      </td>
                      <td style={{ padding: '7px 10px', fontFamily: 'monospace', fontSize: 11 }}>{r.placesPhone ?? <span style={{ color: '#d1d5db' }}>—</span>}</td>
                      <td style={{ padding: '7px 10px', fontSize: 11 }}>
                        {r.placesRating != null ? `${r.placesRating.toFixed(1)} ★ (${r.placesReviewsCount ?? 0})` : <span style={{ color: '#d1d5db' }}>—</span>}
                      </td>
                      <td style={{ padding: '7px 10px', fontSize: 11 }}>
                        {r.placesHasHours != null ? (r.placesHasHours ? '✓' : '—') : <span style={{ color: '#d1d5db' }}>—</span>}
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

      {!loading && data.length === 0 && (
        <div style={{ textAlign: 'center', padding: '48px 0', color: '#9ca3af', fontSize: 14, border: '1px dashed #e5e7eb', borderRadius: 10 }}>
          Nenhum dado de endereço. Execute o módulo Endereço para este recorte.
        </div>
      )}
    </main>
  );
}

export default function EnderecoPage() {
  return <Suspense><EnderecoContent /></Suspense>;
}

const btnPage: React.CSSProperties = {
  padding: '6px 14px', borderRadius: 6, fontSize: 12, border: '1px solid #e5e7eb',
  background: '#fff', cursor: 'pointer', color: '#374151',
};
