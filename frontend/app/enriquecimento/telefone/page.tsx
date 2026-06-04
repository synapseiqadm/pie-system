'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';

const API = (process.env.NEXT_PUBLIC_API_URL||'https://pie-system-production.up.railway.app');

type TelefoneStats = {
  total: number;
  celular: number;
  fixo: number;
  invalido: number;
  sem_telefone: number;
  aproveitamento: number;
};

type TelefoneRow = {
  cnpj: string;
  nome_fantasia: string;
  uf: string;
  ddd: string;
  numero: string;
  telefone_formatado: string;
  telefone_e164: string;
  tipo: 'celular' | 'fixo';
};

function fmt(n: number) { return n.toLocaleString('pt-BR'); }

function StatCard({ label, value, color, sub }: { label: string; value: string | number; color: string; sub?: string }) {
  return (
    <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, padding: '14px 20px', flex: '1 1 130px' }}>
      <div style={{ fontSize: 22, fontWeight: 700, color }}>{typeof value === 'number' ? fmt(value) : value}</div>
      <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>{label}</div>
      {sub && <div style={{ fontSize: 11, color: '#9ca3af' }}>{sub}</div>}
    </div>
  );
}

function TelefoneContent() {
  const params     = useSearchParams();
  const recorteId  = params.get('recorteId');
  const recorteNome = params.get('nome') ?? 'Recorte';

  const [stats, setStats]     = useState<TelefoneStats | null>(null);
  const [data, setData]       = useState<TelefoneRow[]>([]);
  const [total, setTotal]     = useState(0);
  const [page, setPage]       = useState(1);
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState(false);
  const [filtroTipo, setFiltroTipo] = useState<'todos' | 'celular' | 'fixo'>('todos');

  const run = async () => {
    if (!recorteId) return;
    setRunning(true);
    try {
      const s = await fetch(`${API}/enriquecimento/${recorteId}/telefone`, { method: 'POST' }).then(r => r.json());
      setStats(s);
      await loadPage(1);
    } finally { setRunning(false); }
  };

  const loadPage = async (p: number) => {
    if (!recorteId) return;
    setLoading(true);
    try {
      const res = await fetch(`${API}/enriquecimento/${recorteId}/telefone?page=${p}&limit=50`).then(r => r.json());
      setStats(res.stats);
      setData(res.data ?? []);
      setTotal(res.total ?? 0);
      setPage(p);
    } finally { setLoading(false); }
  };

  useEffect(() => { if (recorteId) loadPage(1); }, [recorteId]);

  const filtered = filtroTipo === 'todos' ? data : data.filter(r => r.tipo === filtroTipo);
  const totalPages = Math.ceil(total / 50) || 1;

  return (
    <main style={{ padding: 32, fontFamily: 'sans-serif', maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
        <a href="/enriquecimento" style={{ fontSize: 13, color: '#0070f3', textDecoration: 'none' }}>← Enriquecimento</a>
        <span style={{ color: '#d1d5db' }}>/</span>
        <span style={{ fontSize: 13, color: '#6b7280' }}>Telefone</span>
      </div>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>Telefone · {recorteNome}</h1>
      <p style={{ fontSize: 13, color: '#6b7280', marginBottom: 24 }}>
        Classificação e formatação dos números da Receita Federal.
      </p>

      {/* ── Stats ── */}
      {stats && (
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 24 }}>
          <StatCard label="Total no recorte"  value={stats.total}       color="#111" />
          <StatCard label="Celular"           value={stats.celular}     color="#16a34a" sub={`${stats.total ? Math.round(stats.celular/stats.total*100) : 0}%`} />
          <StatCard label="Fixo"              value={stats.fixo}        color="#0070f3" sub={`${stats.total ? Math.round(stats.fixo/stats.total*100) : 0}%`} />
          <StatCard label="Sem telefone"      value={stats.sem_telefone} color="#9ca3af" />
          <StatCard label="Inválido"          value={stats.invalido}    color="#dc2626" />
          <StatCard label="Aproveitamento"    value={`${stats.aproveitamento}%`} color="#7c3aed" sub="celular + fixo" />
        </div>
      )}

      {/* ── Barra de aproveitamento ── */}
      {stats && stats.total > 0 && (
        <div style={{ marginBottom: 24, background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, padding: '16px 20px' }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>
            Distribuição
          </div>
          <div style={{ display: 'flex', height: 12, borderRadius: 99, overflow: 'hidden', marginBottom: 10 }}>
            <div style={{ width: `${Math.round(stats.celular/stats.total*100)}%`, background: '#16a34a' }} title={`Celular: ${fmt(stats.celular)}`} />
            <div style={{ width: `${Math.round(stats.fixo/stats.total*100)}%`, background: '#0070f3' }} title={`Fixo: ${fmt(stats.fixo)}`} />
            <div style={{ width: `${Math.round(stats.invalido/stats.total*100)}%`, background: '#fca5a5' }} title={`Inválido: ${fmt(stats.invalido)}`} />
            <div style={{ flex: 1, background: '#e5e7eb' }} title={`Sem telefone: ${fmt(stats.sem_telefone)}`} />
          </div>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            {[
              { cor: '#16a34a', label: 'Celular',      val: stats.celular },
              { cor: '#0070f3', label: 'Fixo',         val: stats.fixo },
              { cor: '#fca5a5', label: 'Inválido',     val: stats.invalido },
              { cor: '#e5e7eb', label: 'Sem telefone', val: stats.sem_telefone },
            ].map(i => (
              <div key={i.label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <div style={{ width: 10, height: 10, borderRadius: 2, background: i.cor, border: '1px solid #e5e7eb' }} />
                <span style={{ fontSize: 12, color: '#374151' }}>{i.label}</span>
                <span style={{ fontSize: 12, fontWeight: 700 }}>{fmt(i.val)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Ações ── */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, alignItems: 'center' }}>
        <button onClick={run} disabled={running || !recorteId} style={{
          padding: '8px 20px', borderRadius: 7, fontSize: 13, fontWeight: 600,
          background: '#0070f3', color: '#fff', border: 'none', cursor: 'pointer',
        }}>
          {running ? 'Processando...' : stats ? '↺ Reprocessar' : '▶ Processar'}
        </button>
        {stats && (
          <>
            <div style={{ display: 'flex', gap: 4 }}>
              {(['todos', 'celular', 'fixo'] as const).map(t => (
                <button key={t} onClick={() => setFiltroTipo(t)} style={{
                  padding: '6px 14px', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                  background: filtroTipo === t ? '#0070f3' : '#fff',
                  color: filtroTipo === t ? '#fff' : '#374151',
                  border: `1px solid ${filtroTipo === t ? '#0070f3' : '#d1d5db'}`,
                }}>
                  {t === 'todos' ? 'Todos' : t.charAt(0).toUpperCase() + t.slice(1)}
                </button>
              ))}
            </div>
            <span style={{ fontSize: 12, color: '#9ca3af', marginLeft: 4 }}>
              {fmt(total)} válidos
            </span>
          </>
        )}
      </div>

      {/* ── Tabela ── */}
      {loading && <div style={{ color: '#9ca3af', fontSize: 13 }}>Consultando...</div>}
      {!loading && filtered.length > 0 && (
        <>
          <div style={{ overflowX: 'auto', borderRadius: 8, border: '1px solid #e5e7eb' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: '#f8fafc' }}>
                  {['CNPJ', 'Nome Fantasia', 'UF', 'Tipo', 'Telefone', 'E.164'].map(h => (
                    <th key={h} style={{ padding: '9px 12px', textAlign: 'left', fontWeight: 700, color: '#6b7280', borderBottom: '2px solid #e5e7eb', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((r, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid #f3f4f6' }}>
                    <td style={{ padding: '7px 12px', fontFamily: 'monospace', color: '#374151' }}>{r.cnpj}</td>
                    <td style={{ padding: '7px 12px' }}>{r.nome_fantasia || '—'}</td>
                    <td style={{ padding: '7px 12px', fontWeight: 600 }}>{r.uf}</td>
                    <td style={{ padding: '7px 12px' }}>
                      <span style={{
                        fontSize: 11, padding: '2px 8px', borderRadius: 99, fontWeight: 600,
                        background: r.tipo === 'celular' ? '#dcfce7' : '#dbeafe',
                        color: r.tipo === 'celular' ? '#16a34a' : '#0070f3',
                      }}>
                        {r.tipo === 'celular' ? '📱 Celular' : '📞 Fixo'}
                      </span>
                    </td>
                    <td style={{ padding: '7px 12px', fontFamily: 'monospace' }}>{r.telefone_formatado}</td>
                    <td style={{ padding: '7px 12px', fontFamily: 'monospace', color: '#6b7280' }}>{r.telefone_e164}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ display: 'flex', gap: 8, marginTop: 14, alignItems: 'center', justifyContent: 'flex-end' }}>
            <button onClick={() => loadPage(page - 1)} disabled={page === 1} style={btnPage}>‹ Anterior</button>
            <span style={{ fontSize: 12, color: '#6b7280' }}>Página {page} de {totalPages}</span>
            <button onClick={() => loadPage(page + 1)} disabled={page >= totalPages} style={btnPage}>Próxima ›</button>
          </div>
        </>
      )}

      {!loading && !stats && (
        <div style={{ textAlign: 'center', padding: '48px 0', color: '#9ca3af', fontSize: 14, border: '1px dashed #e5e7eb', borderRadius: 10 }}>
          Clique em "Processar" para classificar os telefones deste recorte.
        </div>
      )}
    </main>
  );
}

export default function TelefoneEnriquecimentoPage() {
  return <Suspense><TelefoneContent /></Suspense>;
}

const btnPage: React.CSSProperties = {
  padding: '6px 14px', borderRadius: 6, fontSize: 12, border: '1px solid #e5e7eb',
  background: '#fff', cursor: 'pointer', color: '#374151',
};
