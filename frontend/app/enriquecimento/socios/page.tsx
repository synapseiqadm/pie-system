'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';

const API = (process.env.NEXT_PUBLIC_API_URL||'https://pie-system-production.up.railway.app');

type SocioRow = {
  id: number;
  cnpj: string;
  socioNome?: string;
  socioQualificacao?: string;
  socioEmailCandidate?: string;
  socioEmailConfidence: string;
  hasCandidate: boolean;
  lgpdBasis: string;
  dnc: boolean;
};

type Stats = { total: number; com_candidato: number; sem_candidato: number };

function StatCard({ label, value, color, sub }: { label: string; value: string | number; color: string; sub?: string }) {
  return (
    <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, padding: '14px 20px', flex: '1 1 130px' }}>
      <div style={{ fontSize: 22, fontWeight: 700, color }}>{typeof value === 'number' ? value.toLocaleString('pt-BR') : value}</div>
      <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>{label}</div>
      {sub && <div style={{ fontSize: 11, color: '#9ca3af' }}>{sub}</div>}
    </div>
  );
}

function SociosContent() {
  const params      = useSearchParams();
  const recorteId   = params.get('recorteId');
  const recorteNome = params.get('nome') ?? 'Recorte';

  const [stats, setStats]     = useState<Stats | null>(null);
  const [data, setData]       = useState<SocioRow[]>([]);
  const [total, setTotal]     = useState(0);
  const [page, setPage]       = useState(1);
  const [loading, setLoading] = useState(false);
  const [soloComCandidate, setSoloComCandidate] = useState(false);

  const loadPage = async (p: number) => {
    if (!recorteId) return;
    setLoading(true);
    try {
      const res = await fetch(`${API}/enriquecimento/${recorteId}/socio?page=${p}&limit=50`).then(r => r.json());
      setData(res.data ?? []);
      setTotal(res.total ?? 0);
      setStats({ total: res.total ?? 0, com_candidato: res.com_candidato ?? 0, sem_candidato: res.sem_candidato ?? 0 });
      setPage(p);
    } finally { setLoading(false); }
  };

  useEffect(() => { if (recorteId) loadPage(1); }, [recorteId]);

  const filtered = soloComCandidate ? data.filter(r => r.hasCandidate) : data;
  const totalPages = Math.ceil(total / 50) || 1;

  return (
    <main style={{ padding: 32, fontFamily: 'sans-serif', maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
        <a href="/enriquecimento" style={{ fontSize: 13, color: '#0070f3', textDecoration: 'none' }}>← Enriquecimento</a>
        <span style={{ color: '#d1d5db' }}>/</span>
        <span style={{ fontSize: 13, color: '#6b7280' }}>Sócios</span>
      </div>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>Sócios · {recorteNome}</h1>
      <p style={{ fontSize: 13, color: '#6b7280', marginBottom: 4 }}>
        Sócio-decisor prioritário por CNPJ com email estimado por padrão de domínio.
      </p>
      <p style={{ fontSize: 12, color: '#9ca3af', marginBottom: 24 }}>
        Base legal: legítimo interesse (prospecção B2B). Email candidato com confidence low — confirmar antes de usar.
      </p>

      {stats && (
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 24 }}>
          <StatCard label="Total" value={stats.total} color="#111" />
          <StatCard label="Com email candidato" value={stats.com_candidato} color="#7c3aed"
            sub={`${stats.total ? Math.round(stats.com_candidato/stats.total*100) : 0}%`} />
          <StatCard label="Sem candidato" value={stats.sem_candidato} color="#9ca3af" sub="sem site encontrado" />
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {[false, true].map(v => (
          <button key={String(v)} onClick={() => setSoloComCandidate(v)} style={{
            padding: '5px 12px', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer',
            background: soloComCandidate === v ? '#7c3aed' : '#fff',
            color: soloComCandidate === v ? '#fff' : '#374151',
            border: `1px solid ${soloComCandidate === v ? '#7c3aed' : '#d1d5db'}`,
          }}>{v ? 'Com email candidato' : 'Todos'}</button>
        ))}
      </div>

      {loading && <div style={{ color: '#9ca3af', fontSize: 13 }}>Consultando...</div>}

      {!loading && filtered.length > 0 && (
        <>
          <div style={{ overflowX: 'auto', borderRadius: 8, border: '1px solid #e5e7eb' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: '#f8fafc' }}>
                  {['CNPJ', 'Nome do Sócio', 'Qualificação', 'Email Candidato', 'Confiança', 'LGPD', 'DNC'].map(h => (
                    <th key={h} style={{ padding: '9px 12px', textAlign: 'left', fontWeight: 700, color: '#6b7280', borderBottom: '2px solid #e5e7eb', whiteSpace: 'nowrap', fontSize: 11 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((r, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid #f3f4f6', background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                    <td style={{ padding: '7px 12px', fontFamily: 'monospace', fontSize: 11 }}>{r.cnpj}</td>
                    <td style={{ padding: '7px 12px', fontWeight: 600 }}>{r.socioNome ?? <span style={{ color: '#d1d5db' }}>—</span>}</td>
                    <td style={{ padding: '7px 12px', fontSize: 11, color: '#6b7280' }}>{r.socioQualificacao ?? '—'}</td>
                    <td style={{ padding: '7px 12px' }}>
                      {r.socioEmailCandidate
                        ? <span style={{ fontFamily: 'monospace', color: '#0070f3', fontSize: 11 }}>{r.socioEmailCandidate}</span>
                        : <span style={{ color: '#d1d5db' }}>—</span>}
                    </td>
                    <td style={{ padding: '7px 12px' }}>
                      <span style={{
                        fontSize: 10, padding: '2px 7px', borderRadius: 99, fontWeight: 600,
                        background: r.socioEmailConfidence === 'low' ? '#fef9c3' : '#dcfce7',
                        color: r.socioEmailConfidence === 'low' ? '#ca8a04' : '#16a34a',
                      }}>{r.socioEmailConfidence}</span>
                    </td>
                    <td style={{ padding: '7px 12px', fontSize: 11, color: '#6b7280' }}>{r.lgpdBasis}</td>
                    <td style={{ padding: '7px 12px' }}>
                      {r.dnc
                        ? <span style={{ fontSize: 11, fontWeight: 700, color: '#dc2626' }}>DNC</span>
                        : <span style={{ color: '#d1d5db', fontSize: 11 }}>—</span>}
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

      {!loading && filtered.length === 0 && (
        <div style={{ textAlign: 'center', padding: '48px 0', color: '#9ca3af', fontSize: 14, border: '1px dashed #e5e7eb', borderRadius: 10 }}>
          Nenhum dado de sócio. Execute o módulo Sócios para este recorte.
        </div>
      )}
    </main>
  );
}

export default function SociosPage() {
  return <Suspense><SociosContent /></Suspense>;
}

const btnPage: React.CSSProperties = {
  padding: '6px 14px', borderRadius: 6, fontSize: 12, border: '1px solid #e5e7eb',
  background: '#fff', cursor: 'pointer', color: '#374151',
};
