'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Job } from '../enriquecimento/page';
import { ENRICHMENT_COLORS } from '../enriquecimento/page';

const API           = (process.env.NEXT_PUBLIC_API_URL||'https://pie-system-production.up.railway.app');
const STORAGE_KEY   = 'pie_enrichment_jobs';
const SCORE_STORAGE = 'pie_lead_scores';

const ENRICHMENTS_META: Record<string, { label: string; icon: string }> = {
  socios:    { label: 'Sócios',    icon: '👥' },
  telefone:  { label: 'Telefone',  icon: '📞' },
  site:      { label: 'Site',      icon: '🌐' },
  whatsapp:  { label: 'WhatsApp',  icon: '💬' },
  instagram: { label: 'Instagram', icon: '📸' },
  facebook:  { label: 'Facebook',  icon: '🔵' },
  linkedin:  { label: 'LinkedIn',  icon: '💼' },
};

type Criterion = { id: string; label: string; icon: string; desc: string; defaultPeso: number };

const CRITERIA: Criterion[] = [
  { id: 'whatsapp_ativo',   label: 'WhatsApp ativo',       icon: '💬', desc: 'Número com WhatsApp validado',           defaultPeso: 30 },
  { id: 'site',             label: 'Possui site',          icon: '🌐', desc: 'Site identificado via Google Places',    defaultPeso: 20 },
  { id: 'email',            label: 'Possui e-mail',        icon: '📧', desc: 'E-mail cadastrado na Receita Federal',   defaultPeso: 15 },
  { id: 'linkedin',         label: 'LinkedIn do sócio',    icon: '💼', desc: 'Sócio com perfil LinkedIn encontrado',   defaultPeso: 15 },
  { id: 'telefone_celular', label: 'Celular',              icon: '📞', desc: 'Telefone classificado como celular',     defaultPeso: 10 },
  { id: 'socio_pf',         label: 'Sócio pessoa física',  icon: '👤', desc: 'Empresa com sócio PF (MEI/ME/EPP)',      defaultPeso: 10 },
  { id: 'cnae_prioritario', label: 'CNAE prioritário',     icon: '⊞', desc: 'Atividade dentro dos CNAEs do recorte', defaultPeso: 15 },
  { id: 'tempo_atividade',  label: 'Mais de 5 anos ativa', icon: '📅', desc: 'Empresa com histórico de estabilidade', defaultPeso: 10 },
  { id: 'instagram',        label: 'Instagram ativo',      icon: '📸', desc: 'Perfil encontrado no Instagram',        defaultPeso: 10 },
];

type StressNivel = 'descansado' | 'baixo' | 'moderado' | 'alto' | 'critico';

type StressResumo = {
  distribuicao: Record<StressNivel, number>;
  total: number;
  livres: number;
  carregadoEm: string;
};

type ScoreResult = {
  jobId: string;
  pesos: Record<string, number>;
  distribuicao: { faixa: string; label: string; cor: string; pct: number }[];
  calculadoEm: string;
};

const STRESS_META: Record<StressNivel, { label: string; cor: string; emoji: string }> = {
  descansado: { label: 'Descansado', cor: '#16a34a', emoji: '🟢' },
  baixo:      { label: 'Baixo',      cor: '#65a30d', emoji: '🟡' },
  moderado:   { label: 'Moderado',   cor: '#d97706', emoji: '🟠' },
  alto:       { label: 'Alto',       cor: '#ea580c', emoji: '🔴' },
  critico:    { label: 'Crítico',    cor: '#dc2626', emoji: '⛔' },
};

const NIVEIS: StressNivel[] = ['descansado', 'baixo', 'moderado', 'alto', 'critico'];

function loadBases(): Job[] {
  try {
    const all: Job[] = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]');
    return all.filter((j) => j.status === 'concluido');
  } catch { return []; }
}
function loadScores(): Record<string, ScoreResult> {
  try { return JSON.parse(localStorage.getItem(SCORE_STORAGE) ?? '{}'); } catch { return {}; }
}
function saveScores(s: Record<string, ScoreResult>) {
  localStorage.setItem(SCORE_STORAGE, JSON.stringify(s));
}

function simularDistribuicao(job: Job, pesos: Record<string, number>) {
  const maxScore = Object.values(pesos).reduce((a, b) => a + b, 0);
  const fator = Math.min(1, job.enrichments.length / 4);
  const alto   = Math.round((0.15 + fator * 0.25) * 100);
  const medio  = Math.round((0.25 + fator * 0.15) * 100);
  const baixo  = Math.round(0.30 * 100);
  const minimo = 100 - alto - medio - baixo;
  return [
    { faixa: 'alto',   label: `80–${maxScore} pts`, cor: '#16a34a', pct: alto   },
    { faixa: 'medio',  label: '60–79 pts',           cor: '#d97706', pct: medio  },
    { faixa: 'baixo',  label: '40–59 pts',           cor: '#f59e0b', pct: baixo  },
    { faixa: 'minimo', label: '0–39 pts',            cor: '#e5e7eb', pct: minimo },
  ];
}

function fmt(d: string) {
  return new Date(d).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

type ViewMode = 'bases' | 'recortes';

type RecorteGroup = {
  recorteId: number;
  recorteNome: string;
  jobs: Job[];
  totalRegistros: number;
  enrichments: string[]; // união de todos os enriquecimentos
  ultimoEnriquecimento: string;
};

function groupByRecorte(bases: Job[]): RecorteGroup[] {
  const map = new Map<number, RecorteGroup>();
  for (const b of bases) {
    const id = b.recorteId;
    if (!map.has(id)) {
      map.set(id, {
        recorteId: id,
        recorteNome: b.recorteNome,
        jobs: [],
        totalRegistros: 0,
        enrichments: [],
        ultimoEnriquecimento: b.concluidoEm ?? b.criadoEm,
      });
    }
    const g = map.get(id)!;
    g.jobs.push(b);
    g.totalRegistros = Math.max(g.totalRegistros, b.totalRegistros ?? 0);
    for (const e of b.enrichments) {
      if (!g.enrichments.includes(e)) g.enrichments.push(e);
    }
    const d = b.concluidoEm ?? b.criadoEm;
    if (d > g.ultimoEnriquecimento) g.ultimoEnriquecimento = d;
  }
  return [...map.values()].sort((a, b) => b.ultimoEnriquecimento.localeCompare(a.ultimoEnriquecimento));
}

export default function LeadsPage() {
  const router = useRouter();
  const [bases, setBases]         = useState<Job[]>([]);
  const [scores, setScores]       = useState<Record<string, ScoreResult>>({});
  const [stress, setStress]       = useState<Record<string, StressResumo>>({});
  const [scoring, setScoring]     = useState<string | null>(null);
  const [pesos, setPesos]         = useState<Record<string, number>>({});
  const [loadingStress, setLoadingStress] = useState<Record<string, boolean>>({});
  const [viewMode, setViewMode]   = useState<ViewMode>('recortes');
  const [expandedRecorte, setExpandedRecorte] = useState<number | null>(null);

  useEffect(() => {
    setBases(loadBases());
    setScores(loadScores());
  }, []);

  const abrirScore = (job: Job) => {
    const existing = scores[job.id];
    setPesos(existing?.pesos ?? Object.fromEntries(CRITERIA.map((c) => [c.id, c.defaultPeso])));
    setScoring(job.id);
  };

  const calcularScore = (job: Job) => {
    const dist = simularDistribuicao(job, pesos);
    const result: ScoreResult = { jobId: job.id, pesos, distribuicao: dist, calculadoEm: new Date().toISOString() };
    const updated = { ...scores, [job.id]: result };
    setScores(updated);
    saveScores(updated);
    setScoring(null);
  };

  const carregarStress = async (job: Job) => {
    if (!job.recorteId) return;
    setLoadingStress((p) => ({ ...p, [job.id]: true }));
    try {
      // Busca histórico de impactos do recorte para montar distribuição
      const res = await fetch(`${API}/impactos/historico/${job.recorteId}`).then((r) => r.json());
      const impactos: { cnpj: string; impactadoEm: string }[] = Array.isArray(res) ? res : [];
      const agora = new Date();
      const desde7d = new Date(agora); desde7d.setDate(agora.getDate() - 7);

      // Conta impactos nos últimos 7 dias por CNPJ
      const counts = new Map<string, number>();
      for (const i of impactos) {
        if (new Date(i.impactadoEm) >= desde7d) {
          counts.set(i.cnpj, (counts.get(i.cnpj) ?? 0) + 1);
        }
      }

      const nivel = (n: number): StressNivel =>
        n === 0 ? 'descansado' : n === 1 ? 'baixo' : n <= 3 ? 'moderado' : n <= 6 ? 'alto' : 'critico';

      const dist: Record<StressNivel, number> = { descansado: 0, baixo: 0, moderado: 0, alto: 0, critico: 0 };
      const total = job.totalRegistros ?? 0;
      const impactados = counts.size;
      dist.descansado = Math.max(0, total - impactados);
      for (const cnt of counts.values()) dist[nivel(cnt)]++;

      setStress((p) => ({
        ...p,
        [job.id]: { distribuicao: dist, total, livres: dist.descansado + dist.baixo, carregadoEm: new Date().toISOString() },
      }));
    } finally {
      setLoadingStress((p) => ({ ...p, [job.id]: false }));
    }
  };

  const scoreJob = scoring ? bases.find((b) => b.id === scoring) : null;

  return (
    <main style={{ padding: 32, fontFamily: 'sans-serif', maxWidth: 1000, margin: '0 auto' }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>Leads</h1>
      <p style={{ color: '#6b7280', fontSize: 13, marginBottom: 28 }}>
        Bases enriquecidas com score e stress rating — prontas para campanhas.
      </p>

      {bases.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 0', color: '#9ca3af', fontSize: 14, border: '1px dashed #e5e7eb', borderRadius: 10 }}>
          Nenhuma base enriquecida ainda.{' '}
          <a href="/enriquecimento" style={{ color: '#0070f3' }}>Inicie um enriquecimento</a> para gerar leads.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {bases.map((b) => {
            const sc  = scores[b.id];
            const st  = stress[b.id];
            const isLoadingSt = loadingStress[b.id];
            return (
              <div key={b.id} style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, overflow: 'hidden' }}>

                {/* ── Cabeçalho do card ── */}
                <div style={{ padding: '18px 22px', display: 'flex', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
                  <div style={{ flex: 1, minWidth: 200 }}>
                    <div style={{ fontWeight: 700, fontSize: 15, color: '#111', marginBottom: 4 }}>{b.recorteNome}</div>
                    <div style={{ fontSize: 12, color: '#9ca3af' }}>Enriquecido em {b.concluidoEm ? fmt(b.concluidoEm) : '—'}</div>
                  </div>
                  {b.totalRegistros != null && (
                    <div style={{ textAlign: 'center', minWidth: 80 }}>
                      <div style={{ fontSize: 20, fontWeight: 700, color: '#111' }}>{b.totalRegistros.toLocaleString('pt-BR')}</div>
                      <div style={{ fontSize: 11, color: '#9ca3af' }}>registros</div>
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', flex: '1 1 180px' }}>
                    {b.enrichments.map((e) => (
                      <span key={e} style={{ fontSize: 12, padding: '3px 10px', borderRadius: 99, fontWeight: 500, background: `${ENRICHMENT_COLORS[e] ?? '#6b7280'}18`, color: ENRICHMENT_COLORS[e] ?? '#6b7280' }}>
                        {ENRICHMENTS_META[e]?.icon} {ENRICHMENTS_META[e]?.label}
                      </span>
                    ))}
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button
                      onClick={() => router.push(`/leads/recorte?recorteId=${b.recorteId}&nome=${encodeURIComponent(b.recorteNome)}&enrichments=${b.enrichments.join(',')}`)}
                      style={{ padding: '7px 14px', borderRadius: 7, fontSize: 12, fontWeight: 600, background: '#fff', color: '#374151', border: '1px solid #d1d5db', cursor: 'pointer', whiteSpace: 'nowrap' }}
                    >
                      Ver registros
                    </button>
                    <button onClick={() => abrirScore(b)} style={{ padding: '7px 14px', borderRadius: 7, fontSize: 12, fontWeight: 600, background: sc ? '#f0fdf4' : '#fff', color: sc ? '#16a34a' : '#374151', border: `1px solid ${sc ? '#bbf7d0' : '#d1d5db'}`, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                      {sc ? '✓ Score' : '★ Score'}
                    </button>
                    <button onClick={() => router.push(`/campanhas?jobId=${b.id}`)} style={{ padding: '7px 14px', borderRadius: 7, fontSize: 12, fontWeight: 600, background: '#0070f3', color: '#fff', border: 'none', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                      Usar em Campanha →
                    </button>
                  </div>
                </div>

                {/* ── Score ── */}
                {sc && (
                  <div style={{ borderTop: '1px solid #f3f4f6', padding: '12px 22px', background: '#fafafa' }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>Score · {fmt(sc.calculadoEm)}</div>
                    <div style={{ display: 'flex', height: 8, borderRadius: 99, overflow: 'hidden', marginBottom: 8 }}>
                      {sc.distribuicao.map((d) => <div key={d.faixa} style={{ width: `${d.pct}%`, background: d.cor }} title={`${d.label}: ${d.pct}%`} />)}
                    </div>
                    <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                      {sc.distribuicao.map((d) => (
                        <div key={d.faixa} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <div style={{ width: 8, height: 8, borderRadius: 2, background: d.cor }} />
                          <span style={{ fontSize: 11, color: '#374151' }}>{d.label}</span>
                          <span style={{ fontSize: 11, fontWeight: 700, color: '#111' }}>{d.pct}%</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* ── Stress Rating ── */}
                <div style={{ borderTop: '1px solid #f3f4f6', padding: '12px 22px', background: '#fff' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: st ? 10 : 0 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      Stress Rating
                      {st && <span style={{ fontWeight: 400, marginLeft: 6 }}>· atualizado {fmt(st.carregadoEm)}</span>}
                    </div>
                    <button
                      onClick={() => carregarStress(b)}
                      disabled={isLoadingSt}
                      style={{ fontSize: 11, fontWeight: 600, padding: '3px 12px', borderRadius: 6, border: '1px solid #e5e7eb', background: '#fff', color: '#374151', cursor: 'pointer' }}
                    >
                      {isLoadingSt ? 'Carregando...' : st ? '↺ Atualizar' : 'Carregar'}
                    </button>
                  </div>

                  {st && (
                    <>
                      {/* Barra de stress empilhada */}
                      <div style={{ display: 'flex', height: 10, borderRadius: 99, overflow: 'hidden', marginBottom: 10 }}>
                        {NIVEIS.map((n) => {
                          const pct = st.total > 0 ? (st.distribuicao[n] / st.total) * 100 : 0;
                          return <div key={n} style={{ width: `${pct}%`, background: STRESS_META[n].cor, transition: 'width 0.4s' }} title={`${STRESS_META[n].label}: ${Math.round(pct)}%`} />;
                        })}
                      </div>
                      {/* Legenda */}
                      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 10 }}>
                        {NIVEIS.map((n) => {
                          const qty = st.distribuicao[n];
                          if (qty === 0) return null;
                          return (
                            <div key={n} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                              <span style={{ fontSize: 13 }}>{STRESS_META[n].emoji}</span>
                              <span style={{ fontSize: 12, color: '#374151' }}>{STRESS_META[n].label}</span>
                              <span style={{ fontSize: 12, fontWeight: 700, color: '#111' }}>{qty.toLocaleString('pt-BR')}</span>
                            </div>
                          );
                        })}
                      </div>
                      {/* Resumo de livres */}
                      <div style={{ fontSize: 12, padding: '8px 12px', borderRadius: 8, background: '#f0fdf4', color: '#16a34a', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        ✓ {st.livres.toLocaleString('pt-BR')} leads disponíveis para nova campanha
                        <span style={{ fontWeight: 400, color: '#6b7280' }}>
                          ({st.total > 0 ? Math.round((st.livres / st.total) * 100) : 0}% do total)
                        </span>
                      </div>
                    </>
                  )}
                </div>

              </div>
            );
          })}
        </div>
      )}

      {/* ── Modal de Score ── */}
      {scoring && scoreJob && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: '#fff', borderRadius: 12, padding: 28, width: '100%', maxWidth: 540, maxHeight: '85vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
              <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>Configurar Score</h2>
              <button onClick={() => setScoring(null)} style={{ background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: '#9ca3af' }}>✕</button>
            </div>
            <p style={{ fontSize: 13, color: '#6b7280', marginBottom: 20 }}>
              Pesos para <strong>{scoreJob.recorteNome}</strong>. A soma é a pontuação máxima.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
              {CRITERIA.map((c) => (
                <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', border: '1px solid #f3f4f6', borderRadius: 8, background: '#fafafa' }}>
                  <span style={{ fontSize: 18, width: 24, textAlign: 'center' }}>{c.icon}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#111' }}>{c.label}</div>
                    <div style={{ fontSize: 11, color: '#9ca3af' }}>{c.desc}</div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <input type="range" min={0} max={50} step={5} value={pesos[c.id] ?? c.defaultPeso} onChange={(e) => setPesos((p) => ({ ...p, [c.id]: Number(e.target.value) }))} style={{ width: 90, accentColor: '#0070f3' }} />
                    <span style={{ fontSize: 13, fontWeight: 700, color: '#111', minWidth: 32, textAlign: 'right' }}>{pesos[c.id] ?? c.defaultPeso}</span>
                  </div>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 13, color: '#6b7280' }}>Pontuação máxima: <strong style={{ color: '#111' }}>{Object.values(pesos).reduce((a, b) => a + b, 0)} pts</strong></span>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => setScoring(null)} style={{ padding: '8px 16px', borderRadius: 7, fontSize: 13, background: '#fff', border: '1px solid #d1d5db', cursor: 'pointer', color: '#374151' }}>Cancelar</button>
                <button onClick={() => calcularScore(scoreJob)} style={{ padding: '8px 20px', borderRadius: 7, fontSize: 13, fontWeight: 600, background: '#0070f3', color: '#fff', border: 'none', cursor: 'pointer' }}>Calcular</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
