'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';

const API = (process.env.NEXT_PUBLIC_API_URL||'https://pie-system-production.up.railway.app');

type ContactRow = {
  id: number;
  cnpj: string;
  phoneIsThirdParty?: boolean;
  phoneThirdPartyReason?: string;
  phoneDirect?: string;
  phoneDirectSource?: string;
  emailIsThirdParty?: boolean;
  emailThirdPartyReason?: string;
  emailCorporate?: string;
  emailCorporateSource?: string;
  contactQuality: 'direct' | 'third_party' | 'not_found';
};

type Stats = { total: number; direct: number; third_party: number; not_found: number };

const QUALITY_STYLE: Record<string, { bg: string; color: string; label: string }> = {
  direct:      { bg: '#dcfce7', color: '#16a34a', label: '✓ Direto' },
  third_party: { bg: '#fee2e2', color: '#dc2626', label: '✕ Terceiro' },
  not_found:   { bg: '#f3f4f6', color: '#9ca3af', label: '— Não encontrado' },
};

const REASON_LABELS: Record<string, string> = {
  generic_domain:        'Domínio genérico',
  shared_multiple_cnpjs: 'Compartilhado (>5 CNPJs)',
  accounting_cnae:       'CNAE de contabilidade',
  domain_mismatch:       'Domínio sem relação',
};

function ThirdPartyBadge({ value }: { value?: boolean }) {
  if (value == null) return <span style={{ color: '#d1d5db', fontSize: 11 }}>—</span>;
  return (
    <span style={{
      fontSize: 11, fontWeight: 600, padding: '2px 7px', borderRadius: 99,
      background: value ? '#fee2e2' : '#dcfce7',
      color: value ? '#dc2626' : '#16a34a',
    }}>
      {value ? 'Terceiro' : 'Direto'}
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

function ContatoContent() {
  const params      = useSearchParams();
  const recorteId   = params.get('recorteId');
  const recorteNome = params.get('nome') ?? 'Recorte';

  const [stats, setStats]     = useState<Stats | null>(null);
  const [data, setData]       = useState<ContactRow[]>([]);
  const [total, setTotal]     = useState(0);
  const [page, setPage]       = useState(1);
  const [loading, setLoading] = useState(false);
  const [qualityFilter, setQualityFilter] = useState<string>('');

  const loadPage = async (p: number) => {
    if (!recorteId) return;
    setLoading(true);
    try {
      const res = await fetch(`${API}/enriquecimento/${recorteId}/contato?page=${p}&limit=50`).then(r => r.json());
      setData(res.data ?? []);
      setTotal(res.total ?? 0);
      setStats({ total: res.total ?? 0, direct: res.direct ?? 0, third_party: res.third_party ?? 0, not_found: res.not_found ?? 0 });
      setPage(p);
    } finally { setLoading(false); }
  };

  useEffect(() => { if (recorteId) loadPage(1); }, [recorteId]);

  const filtered = qualityFilter ? data.filter(r => r.contactQuality === qualityFilter) : data;
  const totalPages = Math.ceil(total / 50) || 1;

  return (
    <main style={{ padding: 32, fontFamily: 'sans-serif', maxWidth: 1300, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
        <a href="/enriquecimento" style={{ fontSize: 13, color: '#0070f3', textDecoration: 'none' }}>← Enriquecimento</a>
        <span style={{ color: '#d1d5db' }}>/</span>
        <span style={{ fontSize: 13, color: '#6b7280' }}>Contato PJ</span>
      </div>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>Contato PJ · {recorteNome}</h1>
      <p style={{ fontSize: 13, color: '#6b7280', marginBottom: 24 }}>
        Detecção de contato de terceiro (contador) e identificação do contato direto da empresa.
      </p>

      {stats && (
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 24 }}>
          <StatCard label="Total" value={stats.total} color="#111" />
          <StatCard label="Contato Direto" value={stats.direct} color="#16a34a" sub={`${stats.total ? Math.round(stats.direct/stats.total*100) : 0}%`} />
          <StatCard label="Terceiro detectado" value={stats.third_party} color="#dc2626" sub="contador / escritório" />
          <StatCard label="Não determinado" value={stats.not_found} color="#9ca3af" />
        </div>
      )}

      {/* Barra de distribuição */}
      {stats && stats.total > 0 && (
        <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, padding: '14px 20px', marginBottom: 20 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>Distribuição</div>
          <div style={{ display: 'flex', height: 10, borderRadius: 99, overflow: 'hidden', marginBottom: 8 }}>
            <div style={{ width: `${Math.round(stats.direct/stats.total*100)}%`, background: '#16a34a' }} />
            <div style={{ width: `${Math.round(stats.third_party/stats.total*100)}%`, background: '#dc2626' }} />
            <div style={{ flex: 1, background: '#e5e7eb' }} />
          </div>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            {[{ cor: '#16a34a', label: 'Direto', val: stats.direct }, { cor: '#dc2626', label: 'Terceiro', val: stats.third_party }, { cor: '#e5e7eb', label: 'Não determinado', val: stats.not_found }].map(i => (
              <div key={i.label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <div style={{ width: 10, height: 10, borderRadius: 2, background: i.cor, border: '1px solid #e5e7eb' }} />
                <span style={{ fontSize: 12, color: '#374151' }}>{i.label}</span>
                <span style={{ fontSize: 12, fontWeight: 700 }}>{i.val.toLocaleString('pt-BR')}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
        {[['', 'Todos'], ['direct', '✓ Direto'], ['third_party', '✕ Terceiro'], ['not_found', '— Não determinado']].map(([v, label]) => (
          <button key={v} onClick={() => setQualityFilter(v)} style={{
            padding: '5px 12px', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer',
            background: qualityFilter === v ? '#0070f3' : '#fff',
            color: qualityFilter === v ? '#fff' : '#374151',
            border: `1px solid ${qualityFilter === v ? '#0070f3' : '#d1d5db'}`,
          }}>{label}</button>
        ))}
      </div>

      {loading && <div style={{ color: '#9ca3af', fontSize: 13 }}>Consultando...</div>}

      {!loading && filtered.length > 0 && (
        <>
          <div style={{ overflowX: 'auto', borderRadius: 8, border: '1px solid #e5e7eb' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: '#f8fafc' }}>
                  {['CNPJ', 'Qualidade', 'Telefone RF', 'Motivo', 'Telefone Direto', 'Fonte', 'Email RF', 'Motivo Email', 'Email Corporativo'].map(h => (
                    <th key={h} style={{ padding: '9px 10px', textAlign: 'left', fontWeight: 700, color: '#6b7280', borderBottom: '2px solid #e5e7eb', whiteSpace: 'nowrap', fontSize: 11 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((r, i) => {
                  const qs = QUALITY_STYLE[r.contactQuality] ?? QUALITY_STYLE.not_found;
                  return (
                    <tr key={i} style={{ borderBottom: '1px solid #f3f4f6', background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                      <td style={{ padding: '7px 10px', fontFamily: 'monospace', fontSize: 11 }}>{r.cnpj}</td>
                      <td style={{ padding: '7px 10px' }}>
                        <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 99, background: qs.bg, color: qs.color }}>{qs.label}</span>
                      </td>
                      <td style={{ padding: '7px 10px' }}><ThirdPartyBadge value={r.phoneIsThirdParty} /></td>
                      <td style={{ padding: '7px 10px', fontSize: 11, color: '#6b7280' }}>
                        {r.phoneThirdPartyReason ? REASON_LABELS[r.phoneThirdPartyReason] ?? r.phoneThirdPartyReason : <span style={{ color: '#d1d5db' }}>—</span>}
                      </td>
                      <td style={{ padding: '7px 10px', fontFamily: 'monospace', fontSize: 11, fontWeight: 600, color: '#16a34a' }}>
                        {r.phoneDirect ?? <span style={{ color: '#d1d5db', fontFamily: 'sans-serif', fontWeight: 400 }}>—</span>}
                      </td>
                      <td style={{ padding: '7px 10px', fontSize: 11, color: '#9ca3af' }}>{r.phoneDirectSource ?? '—'}</td>
                      <td style={{ padding: '7px 10px' }}><ThirdPartyBadge value={r.emailIsThirdParty} /></td>
                      <td style={{ padding: '7px 10px', fontSize: 11, color: '#6b7280' }}>
                        {r.emailThirdPartyReason ? REASON_LABELS[r.emailThirdPartyReason] ?? r.emailThirdPartyReason : <span style={{ color: '#d1d5db' }}>—</span>}
                      </td>
                      <td style={{ padding: '7px 10px', fontSize: 11 }}>
                        {r.emailCorporate
                          ? <span style={{ color: '#0070f3', fontFamily: 'monospace' }}>{r.emailCorporate} <span style={{ color: '#9ca3af', fontFamily: 'sans-serif' }}>({r.emailCorporateSource})</span></span>
                          : <span style={{ color: '#d1d5db' }}>—</span>}
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
          Nenhum dado de contato. Execute o módulo Contato PJ para este recorte.
        </div>
      )}
    </main>
  );
}

export default function ContatoPage() {
  return <Suspense><ContatoContent /></Suspense>;
}

const btnPage: React.CSSProperties = {
  padding: '6px 14px', borderRadius: 6, fontSize: 12, border: '1px solid #e5e7eb',
  background: '#fff', cursor: 'pointer', color: '#374151',
};
