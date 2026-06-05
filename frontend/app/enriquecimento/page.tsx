'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

const API = (process.env.NEXT_PUBLIC_API_URL||'https://pie-system-production.up.railway.app');

type Recorte = { id: number; nome: string; descricao?: string; totalCached?: number };

export type JobStatus = 'fila' | 'processando' | 'concluido' | 'erro';

export type Job = {
  id: string;
  recorteId: number;
  recorteNome: string;
  totalRegistros?: number;
  enrichments: string[];
  status: JobStatus;
  criadoEm: string;
  concluidoEm?: string;
  progresso?: string;
};

type EnrichOption = { id: string; label: string; icon: string; available: boolean };

const ENRICHMENTS: EnrichOption[] = [
  { id: 'endereco',  label: 'Endereço',        icon: '📍', available: true },
  { id: 'contato',   label: 'Contato PJ',       icon: '🔍', available: true },
  { id: 'site',      label: 'Site + Redes',     icon: '🌐', available: true },
  { id: 'socios',    label: 'Sócios',           icon: '👥', available: true },
  { id: 'outbound',  label: 'Outbound-Ready',   icon: '🚀', available: true },
  { id: 'telefone',  label: 'Telefone',         icon: '📞', available: true },
];

const COLUMNS: { id: JobStatus; label: string; color: string; bg: string }[] = [
  { id: 'fila',        label: 'Na Fila',     color: '#6b7280', bg: '#f9fafb' },
  { id: 'processando', label: 'Processando', color: '#d97706', bg: '#fffbeb' },
  { id: 'concluido',   label: 'Concluído',   color: '#16a34a', bg: '#f0fdf4' },
  { id: 'erro',        label: 'Erro',        color: '#dc2626', bg: '#fef2f2' },
];

export const ENRICHMENT_COLORS: Record<string, string> = {
  socios:    '#7c3aed',
  telefone:  '#0891b2',
  site:      '#0070f3',
  endereco:  '#059669',
  contato:   '#dc2626',
  outbound:  '#d97706',
  whatsapp:  '#16a34a',
  instagram: '#e1306c',
  facebook:  '#1877f2',
  linkedin:  '#0a66c2',
};

// ── SSE helpers ───────────────────────────────────────────────────────────────

async function readSseStream(
  url: string,
  method: string,
  onEvent: (ev: Record<string, unknown>) => void,
): Promise<void> {
  const res = await fetch(url, { method });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const reader = res.body?.getReader();
  if (!reader) return;
  const decoder = new TextDecoder();
  let buf = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split('\n');
      buf = lines.pop() ?? '';
      for (const line of lines) {
        if (!line.startsWith('data:')) continue;
        try { onEvent(JSON.parse(line.slice(5).trim())); } catch { /* ignore */ }
      }
    }
  } finally {
    reader.cancel().catch(() => {});
  }
}

async function runSseEnrichment(
  recorteId: number,
  endpoint: string,
  onProgress: (msg: string) => void,
  fmtEvent: (ev: Record<string, unknown>) => string,
  maxRetries = 3,
): Promise<void> {
  let attempt = 0;
  while (attempt < maxRetries) {
    try {
      await readSseStream(`${API}/enriquecimento/${recorteId}/${endpoint}`, 'POST', (ev) => {
        if (ev.stage === 'progresso') onProgress(fmtEvent(ev));
      });
      return;
    } catch (err) {
      attempt++;
      if (attempt >= maxRetries) throw err;
      onProgress(`Conexão interrompida — reconectando (${attempt}/${maxRetries})...`);
      await new Promise(r => setTimeout(r, 2000 * attempt));
    }
  }
}

function pct(done: unknown, total: unknown) {
  const d = Number(done ?? 0), t = Number(total ?? 0);
  return t > 0 ? Math.round((d / t) * 100) : 0;
}

// ── Persistência ──────────────────────────────────────────────────────────────

const STORAGE_KEY = 'pie_enrichment_jobs';
function loadJobs(): Job[] {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]'); } catch { return []; }
}
function saveJobs(jobs: Job[]) { localStorage.setItem(STORAGE_KEY, JSON.stringify(jobs)); }
function fmt(d: string) {
  return new Date(d).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

// ── Componente principal ──────────────────────────────────────────────────────

export default function EnriquecimentoPage() {
  const router = useRouter();
  const [recortes, setRecortes] = useState<Recorte[]>([]);
  const [selected, setSelected] = useState<number | ''>('');
  const [steps, setSteps]       = useState<Set<string>>(new Set(['endereco']));
  const [jobs, setJobs]         = useState<Job[]>([]);

  useEffect(() => {
    setJobs(loadJobs());
    fetch(`${API}/recortes`).then(r => r.json()).then(d => setRecortes(Array.isArray(d) ? d : []));
  }, []);

  const persist = (updated: Job[]) => { setJobs(updated); saveJobs(updated); };

  const toggleStep = (id: string, available: boolean) => {
    if (!available) return;
    setSteps(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  };

  const addToQueue = () => {
    const recorte = recortes.find(r => r.id === Number(selected));
    if (!recorte || steps.size === 0) return;
    persist([{
      id: `${Date.now()}`,
      recorteId: recorte.id,
      recorteNome: recorte.nome,
      totalRegistros: recorte.totalCached,
      enrichments: [...steps],
      status: 'fila',
      criadoEm: new Date().toISOString(),
    }, ...jobs]);
    setSelected('');
    setSteps(new Set(['endereco']));
  };

  const moveJob = (id: string, status: JobStatus, extra?: Partial<Job>) =>
    persist(jobs.map(j => j.id === id
      ? { ...j, status, concluidoEm: status === 'concluido' ? new Date().toISOString() : j.concluidoEm, ...extra }
      : j));

  const removeJob = (id: string) => persist(jobs.filter(j => j.id !== id));

  const revalidarSite = async (job: Job) => {
    moveJob(job.id, 'processando', { progresso: 'Revalidando sites com IA...' });
    try {
      await readSseStream(`${API}/enriquecimento/${job.recorteId}/site/revalidar`, 'POST', (ev) => {
        if (ev.stage === 'progresso') {
          const p = pct(ev.done, ev.total);
          moveJob(job.id, 'processando', {
            progresso: `Revalidando: ${p}% (${ev.rejeitados ?? 0} rejeitados de ${ev.done}/${ev.total})`,
          });
        }
      });
      moveJob(job.id, 'concluido');
    } catch (err) {
      moveJob(job.id, 'erro', { progresso: String(err) });
    }
  };

  const runJob = async (job: Job) => {
    moveJob(job.id, 'processando', { progresso: 'Iniciando...' });
    try {
      // Ordem recomendada: endereço → contato, site, sócios → outbound
      const ordered = ['endereco', 'telefone', 'site', 'contato', 'socios', 'outbound']
        .filter(e => job.enrichments.includes(e));

      for (const enrichment of ordered) {
        if (enrichment === 'telefone') {
          moveJob(job.id, 'processando', { progresso: 'Classificando telefones...' });
          await fetch(`${API}/enriquecimento/${job.recorteId}/telefone`, { method: 'POST' });

        } else if (enrichment === 'site') {
          moveJob(job.id, 'processando', { progresso: 'Site: verificando (0%)...' });
          await runSseEnrichment(job.recorteId, 'site',
            msg => moveJob(job.id, 'processando', { progresso: msg }),
            ev => `Site: ${pct(ev.done, ev.total)}% (${ev.found ?? 0} encontrados de ${ev.done}/${ev.total})`,
          );

        } else if (enrichment === 'endereco') {
          moveJob(job.id, 'processando', { progresso: 'Endereço: verificando (0%)...' });
          await runSseEnrichment(job.recorteId, 'endereco',
            msg => moveJob(job.id, 'processando', { progresso: msg }),
            ev => `Endereço: ${pct(ev.done, ev.total)}% (${ev.verificado ?? 0} verificados, ${ev.suspeito ?? 0} suspeitos)`,
          );

        } else if (enrichment === 'contato') {
          moveJob(job.id, 'processando', { progresso: 'Contato PJ: analisando (0%)...' });
          await runSseEnrichment(job.recorteId, 'contato',
            msg => moveJob(job.id, 'processando', { progresso: msg }),
            ev => `Contato: ${pct(ev.done, ev.total)}% (${ev.direct ?? 0} diretos, ${ev.thirdParty ?? 0} terceiros)`,
          );

        } else if (enrichment === 'socios') {
          moveJob(job.id, 'processando', { progresso: 'Sócios: processando (0%)...' });
          await runSseEnrichment(job.recorteId, 'socio',
            msg => moveJob(job.id, 'processando', { progresso: msg }),
            ev => `Sócios: ${pct(ev.done, ev.total)}% (${ev.comCandidate ?? 0} com email candidato)`,
          );

        } else if (enrichment === 'outbound') {
          moveJob(job.id, 'processando', { progresso: 'Outbound: consolidando (0%)...' });
          await runSseEnrichment(job.recorteId, 'outbound',
            msg => moveJob(job.id, 'processando', { progresso: msg }),
            ev => `Outbound: ${pct(ev.done, ev.total)}% consolidado`,
          );
        }
      }
      moveJob(job.id, 'concluido');
    } catch (err) {
      console.error('[runJob]', err);
      moveJob(job.id, 'erro', { progresso: String(err) });
    }
  };

  const navResult = (path: string, job: Job) =>
    router.push(`/enriquecimento/${path}?recorteId=${job.recorteId}&nome=${encodeURIComponent(job.recorteNome)}`);

  const byStatus = (s: JobStatus) => jobs.filter(j => j.status === s);
  const canAdd = selected !== '' && steps.size > 0;

  return (
    <main style={{ padding: 32, fontFamily: 'sans-serif', maxWidth: 1200, margin: '0 auto' }}>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
        <FlowStep label="Recortes"      href="/recortes"      active={false} />
        <FlowArrow />
        <FlowStep label="Enriquecimento" href="/enriquecimento" active={true} />
        <FlowArrow />
        <FlowStep label="Campanhas"     href="/campanhas"     active={false} />
      </div>

      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>Enriquecimento</h1>
      <p style={{ color: '#6b7280', fontSize: 13, marginBottom: 24 }}>
        Adicione dados complementares a um recorte. O resultado fica disponível para campanhas.
      </p>

      {/* ── Formulário ── */}
      <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, padding: '20px 24px', marginBottom: 28, display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div style={{ flex: '1 1 220px' }}>
          <label style={labelStyle}>Recorte</label>
          <select value={selected} onChange={e => setSelected(e.target.value === '' ? '' : Number(e.target.value))} style={selectStyle}>
            <option value="">Selecionar...</option>
            {recortes.map(r => (
              <option key={r.id} value={r.id}>{r.nome}{r.totalCached != null ? ` · ${r.totalCached.toLocaleString('pt-BR')} reg.` : ''}</option>
            ))}
          </select>
        </div>

        <div style={{ flex: '2 1 400px' }}>
          <label style={labelStyle}>Módulos</label>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {ENRICHMENTS.map(e => {
              const on = steps.has(e.id) && e.available;
              return (
                <button key={e.id} onClick={() => toggleStep(e.id, e.available)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 5,
                    padding: '5px 11px', borderRadius: 99, fontSize: 12, fontWeight: 500,
                    cursor: e.available ? 'pointer' : 'not-allowed',
                    border: `1.5px solid ${on ? ENRICHMENT_COLORS[e.id] : '#e5e7eb'}`,
                    background: on ? `${ENRICHMENT_COLORS[e.id]}18` : '#f9fafb',
                    color: on ? ENRICHMENT_COLORS[e.id] : '#374151',
                  }}>
                  {e.icon} {e.label}
                </button>
              );
            })}
          </div>
        </div>

        <button onClick={addToQueue} disabled={!canAdd} style={{
          padding: '9px 22px', borderRadius: 8, fontSize: 13, fontWeight: 600,
          background: canAdd ? '#0070f3' : '#e5e7eb',
          color: canAdd ? '#fff' : '#9ca3af',
          border: 'none', cursor: canAdd ? 'pointer' : 'not-allowed', whiteSpace: 'nowrap',
        }}>
          + Adicionar à Fila
        </button>
      </div>

      {/* ── Kanban ── */}
      {jobs.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 0', color: '#9ca3af', fontSize: 14, border: '1px dashed #e5e7eb', borderRadius: 10 }}>
          Nenhum job na fila. Selecione um recorte acima para começar.
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
          {COLUMNS.map(col => (
            <div key={col.id} style={{ background: col.bg, border: `1px solid ${col.color}22`, borderRadius: 10, padding: 12, minHeight: 200 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: col.color, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{col.label}</span>
                <span style={{ fontSize: 11, background: `${col.color}22`, color: col.color, borderRadius: 99, padding: '1px 7px', fontWeight: 600 }}>{byStatus(col.id).length}</span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {byStatus(col.id).map(job => (
                  <div key={job.id} style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, padding: '12px 14px', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
                    <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 4, color: '#111' }}>{job.recorteNome}</div>
                    {job.totalRegistros != null && (
                      <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 8 }}>{job.totalRegistros.toLocaleString('pt-BR')} registros</div>
                    )}
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 10 }}>
                      {job.enrichments.map(e => {
                        const opt = ENRICHMENTS.find(o => o.id === e);
                        return (
                          <span key={e} style={{
                            fontSize: 11, padding: '2px 7px', borderRadius: 99,
                            background: `${ENRICHMENT_COLORS[e] ?? '#6b7280'}18`,
                            color: ENRICHMENT_COLORS[e] ?? '#6b7280', fontWeight: 500,
                          }}>
                            {opt?.icon} {opt?.label ?? e}
                          </span>
                        );
                      })}
                    </div>
                    {job.progresso && (
                      <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 8, fontStyle: 'italic' }}>{job.progresso}</div>
                    )}
                    <div style={{ fontSize: 10, color: '#9ca3af', marginBottom: 10 }}>
                      {col.id === 'concluido' && job.concluidoEm ? `Concluído em ${fmt(job.concluidoEm)}` : fmt(job.criadoEm)}
                    </div>

                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {col.id === 'fila' && (
                        <>
                          <ActionBtn color="#0070f3" onClick={() => runJob(job)}>▶ Iniciar</ActionBtn>
                          <ActionBtn color="#dc2626" onClick={() => removeJob(job.id)}>✕</ActionBtn>
                        </>
                      )}
                      {col.id === 'processando' && (
                        <ActionBtn color="#6b7280" onClick={() => moveJob(job.id, 'erro')}>✕ Cancelar</ActionBtn>
                      )}
                      {col.id === 'concluido' && (
                        <>
                          {job.enrichments.includes('endereco') && (
                            <ResultBtn color={ENRICHMENT_COLORS.endereco} onClick={() => navResult('endereco', job)}>
                              📍 Ver Endereços
                            </ResultBtn>
                          )}
                          {job.enrichments.includes('contato') && (
                            <ResultBtn color={ENRICHMENT_COLORS.contato} onClick={() => navResult('contato', job)}>
                              🔍 Ver Contatos
                            </ResultBtn>
                          )}
                          {job.enrichments.includes('site') && (
                            <>
                              <ResultBtn color={ENRICHMENT_COLORS.site} onClick={() => navResult('site', job)}>
                                🌐 Ver Sites
                              </ResultBtn>
                              <ResultBtn color="#7e22ce" onClick={() => revalidarSite(job)}>
                                ✨ Revalidar IA
                              </ResultBtn>
                            </>
                          )}
                          {job.enrichments.includes('socios') && (
                            <ResultBtn color={ENRICHMENT_COLORS.socios} onClick={() => navResult('socios', job)}>
                              👥 Ver Sócios
                            </ResultBtn>
                          )}
                          {job.enrichments.includes('telefone') && (
                            <ResultBtn color={ENRICHMENT_COLORS.telefone} onClick={() => navResult('telefone', job)}>
                              📞 Ver Telefones
                            </ResultBtn>
                          )}
                          {job.enrichments.includes('outbound') && (
                            <ResultBtn color={ENRICHMENT_COLORS.outbound} onClick={() => navResult('outbound', job)}>
                              🚀 Ver Outbound
                            </ResultBtn>
                          )}
                          <button onClick={() => router.push(`/campanhas?jobId=${job.id}`)} style={{
                            width: '100%', padding: '6px 0', borderRadius: 7, fontSize: 12, fontWeight: 700,
                            background: '#0070f3', color: '#fff', border: 'none', cursor: 'pointer', marginTop: 2,
                          }}>
                            Usar em Campanha →
                          </button>
                          <ActionBtn color="#6b7280" onClick={() => removeJob(job.id)}>✕ Remover</ActionBtn>
                        </>
                      )}
                      {col.id === 'erro' && (
                        <>
                          <ActionBtn color="#d97706" onClick={() => moveJob(job.id, 'fila')}>↺ Retentar</ActionBtn>
                          <ActionBtn color="#6b7280" onClick={() => removeJob(job.id)}>✕</ActionBtn>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}

function FlowStep({ label, href, active }: { label: string; href: string; active: boolean }) {
  return (
    <a href={href} style={{
      padding: '5px 14px', borderRadius: 99, fontSize: 12, fontWeight: 600, textDecoration: 'none',
      background: active ? '#0070f3' : '#f3f4f6',
      color: active ? '#fff' : '#6b7280',
      border: `1.5px solid ${active ? '#0070f3' : '#e5e7eb'}`,
    }}>{label}</a>
  );
}
function FlowArrow() { return <span style={{ color: '#d1d5db', fontSize: 16 }}>→</span>; }

function ActionBtn({ children, color, onClick }: { children: React.ReactNode; color: string; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{
      fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 6,
      border: `1px solid ${color}44`, background: `${color}12`, color, cursor: 'pointer',
    }}>{children}</button>
  );
}

function ResultBtn({ children, color, onClick }: { children: React.ReactNode; color: string; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{
      width: '100%', padding: '5px 0', borderRadius: 7, fontSize: 11, fontWeight: 600,
      background: `${color}12`, color, border: `1px solid ${color}44`, cursor: 'pointer', marginBottom: 3,
    }}>{children}</button>
  );
}

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: 11, fontWeight: 700, color: '#6b7280',
  textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8,
};
const selectStyle: React.CSSProperties = {
  width: '100%', padding: '8px 10px', border: '1px solid #d1d5db',
  borderRadius: 6, fontSize: 13, background: '#fff', color: '#111',
};
