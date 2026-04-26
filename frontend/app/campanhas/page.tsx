'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import type { Job } from '../enriquecimento/page';
import { ENRICHMENT_COLORS } from '../enriquecimento/page';

const STORAGE_KEY = 'pie_enrichment_jobs';

function loadJobs(): Job[] {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]'); } catch { return []; }
}

type Channel = { id: string; label: string; icon: string; available: boolean };

const CHANNELS: Channel[] = [
  { id: 'whatsapp', label: 'WhatsApp', icon: '💬', available: false },
  { id: 'email',    label: 'E-mail',   icon: '✉',  available: false },
];

const ENRICHMENTS_META: Record<string, { label: string; icon: string }> = {
  socios:    { label: 'Sócios',    icon: '👥' },
  telefone:  { label: 'Telefone',  icon: '📞' },
  site:      { label: 'Site',      icon: '🌐' },
  whatsapp:  { label: 'WhatsApp',  icon: '💬' },
  instagram: { label: 'Instagram', icon: '📸' },
  facebook:  { label: 'Facebook',  icon: '🔵' },
  linkedin:  { label: 'LinkedIn',  icon: '💼' },
};

function fmt(d: string) {
  return new Date(d).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function CampanhasContent() {
  const params = useSearchParams();
  const jobId  = params.get('jobId');

  const [bases, setBases]       = useState<Job[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [channel, setChannel]   = useState<string | null>(null);
  const [nivelMaxStress, setNivelMaxStress] = useState<string>('baixo');

  useEffect(() => {
    const jobs = loadJobs().filter((j) => j.status === 'concluido');
    setBases(jobs);
    if (jobId) setSelected(jobId);
  }, [jobId]);

  const base = bases.find((b) => b.id === selected) ?? null;
  const canCreate = selected !== null && channel !== null;

  return (
    <main style={{ padding: 32, fontFamily: 'sans-serif', maxWidth: 1000, margin: '0 auto' }}>

      {/* ── Fluxo ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
        <FlowStep label="Recortes"       href="/recortes"       active={false} done />
        <FlowArrow />
        <FlowStep label="Enriquecimento" href="/enriquecimento" active={false} done />
        <FlowArrow />
        <FlowStep label="Campanhas"      href="/campanhas"      active={true}  done={false} />
      </div>

      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>Campanhas</h1>
      <p style={{ color: '#6b7280', fontSize: 13, marginBottom: 28 }}>
        Crie uma campanha a partir de uma base enriquecida.
      </p>

      {/* ── 1. Selecionar base enriquecida ── */}
      <section style={sectionStyle}>
        <div style={stepLabel}>1 · Base Enriquecida</div>

        {bases.length === 0 ? (
          <div style={{ fontSize: 13, color: '#9ca3af', textAlign: 'center', padding: '20px 0' }}>
            Nenhuma base enriquecida disponível.{' '}
            <a href="/enriquecimento" style={{ color: '#0070f3' }}>Enriqueça um recorte</a> primeiro.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {bases.map((b) => (
              <label key={b.id} style={{
                display: 'flex', alignItems: 'center', gap: 14,
                padding: '12px 16px', borderRadius: 8, cursor: 'pointer',
                border: `1.5px solid ${selected === b.id ? '#0070f3' : '#e5e7eb'}`,
                background: selected === b.id ? '#eff6ff' : '#fff',
                transition: 'border-color 0.15s, background 0.15s',
              }}>
                <input
                  type="radio" name="base" value={b.id}
                  checked={selected === b.id}
                  onChange={() => setSelected(b.id)}
                  style={{ accentColor: '#0070f3' }}
                />
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>{b.recorteNome}</div>
                  {b.concluidoEm && (
                    <div style={{ fontSize: 11, color: '#9ca3af' }}>Enriquecido em {fmt(b.concluidoEm)}</div>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 4 }}>
                  {b.enrichments.map((e) => (
                    <span key={e} style={{
                      fontSize: 11, padding: '2px 8px', borderRadius: 99, fontWeight: 500,
                      background: `${ENRICHMENT_COLORS[e] ?? '#6b7280'}18`,
                      color: ENRICHMENT_COLORS[e] ?? '#6b7280',
                    }}>
                      {ENRICHMENTS_META[e]?.icon} {ENRICHMENTS_META[e]?.label}
                    </span>
                  ))}
                </div>
                {b.totalRegistros != null && (
                  <span style={{ fontSize: 12, color: '#6b7280', whiteSpace: 'nowrap' }}>
                    {b.totalRegistros.toLocaleString('pt-BR')} reg.
                  </span>
                )}
              </label>
            ))}
          </div>
        )}
      </section>

      {/* ── 2. Canal ── */}
      <section style={{ ...sectionStyle, opacity: selected ? 1 : 0.45, pointerEvents: selected ? 'auto' : 'none' }}>
        <div style={stepLabel}>2 · Canal de Envio</div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          {CHANNELS.map((c) => (
            <button
              key={c.id}
              onClick={() => c.available && setChannel(c.id)}
              title={!c.available ? 'Em desenvolvimento' : undefined}
              style={{
                flex: '1 1 160px', padding: '16px 20px', borderRadius: 10, textAlign: 'left',
                cursor: c.available ? 'pointer' : 'not-allowed',
                border: `1.5px solid ${channel === c.id ? '#0070f3' : '#e5e7eb'}`,
                background: channel === c.id ? '#eff6ff' : c.available ? '#fff' : '#f8fafc',
                opacity: c.available ? 1 : 0.5,
              }}
            >
              <div style={{ fontSize: 24, marginBottom: 6 }}>{c.icon}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontWeight: 600, fontSize: 13 }}>{c.label}</span>
                {!c.available && (
                  <span style={{ fontSize: 10, background: '#f3f4f6', color: '#9ca3af', padding: '1px 6px', borderRadius: 99 }}>
                    em breve
                  </span>
                )}
              </div>
            </button>
          ))}
        </div>
      </section>

      {/* ── 3. Stress Rating ── */}
      <section style={{ ...sectionStyle, opacity: selected ? 1 : 0.45, pointerEvents: selected ? 'auto' : 'none' }}>
        <div style={stepLabel}>3 · Proteção Anti-Bloqueio</div>
        <p style={{ fontSize: 13, color: '#6b7280', marginBottom: 14 }}>
          Define o nível máximo de stress aceito. Leads acima do limite são excluídos automaticamente do envio.
        </p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {[
            { id: 'descansado', label: '🟢 Descansado', desc: '0 contatos em 7 dias' },
            { id: 'baixo',      label: '🟡 Baixo',      desc: '1 contato em 7 dias' },
            { id: 'moderado',   label: '🟠 Moderado',   desc: 'até 3 contatos'       },
            { id: 'alto',       label: '🔴 Alto',       desc: 'até 6 contatos'       },
          ].map((n) => (
            <button key={n.id} onClick={() => setNivelMaxStress(n.id)} style={{
              flex: '1 1 140px', padding: '10px 14px', borderRadius: 8, textAlign: 'left', cursor: 'pointer',
              border: `1.5px solid ${nivelMaxStress === n.id ? '#0070f3' : '#e5e7eb'}`,
              background: nivelMaxStress === n.id ? '#eff6ff' : '#fff',
            }}>
              <div style={{ fontWeight: 600, fontSize: 13 }}>{n.label}</div>
              <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>{n.desc}</div>
            </button>
          ))}
        </div>
      </section>

      {/* ── 4. Criar campanha ── */}
      <section style={{ ...sectionStyle, opacity: canCreate ? 1 : 0.45, pointerEvents: canCreate ? 'auto' : 'none' }}>
        <div style={stepLabel}>4 · Criar Campanha</div>
        {base && channel && (
          <div style={{ fontSize: 13, color: '#374151', marginBottom: 16 }}>
            Canal <strong>{CHANNELS.find((c) => c.id === channel)?.label}</strong> para{' '}
            <strong>{base.recorteNome}</strong>
            {base.totalRegistros != null && <> · {base.totalRegistros.toLocaleString('pt-BR')} registros</>}
            {' '}· stress máximo: <strong>{nivelMaxStress}</strong>.
          </div>
        )}
        <button
          disabled={!canCreate}
          onClick={() => alert('Criação de campanhas em desenvolvimento.')}
          style={{
            padding: '10px 28px', borderRadius: 8, fontSize: 14, fontWeight: 600,
            background: canCreate ? '#0070f3' : '#e5e7eb',
            color: canCreate ? '#fff' : '#9ca3af',
            border: 'none', cursor: canCreate ? 'pointer' : 'not-allowed',
          }}
        >
          Criar Campanha
        </button>
      </section>
    </main>
  );
}

export default function CampanhasPage() {
  return (
    <Suspense>
      <CampanhasContent />
    </Suspense>
  );
}

function FlowStep({ label, href, active, done }: { label: string; href: string; active: boolean; done: boolean }) {
  return (
    <a href={href} style={{
      display: 'flex', alignItems: 'center', gap: 5,
      padding: '5px 14px', borderRadius: 99, fontSize: 12, fontWeight: 600,
      textDecoration: 'none',
      background: active ? '#0070f3' : done ? '#f0fdf4' : '#f3f4f6',
      color: active ? '#fff' : done ? '#16a34a' : '#6b7280',
      border: `1.5px solid ${active ? '#0070f3' : done ? '#bbf7d0' : '#e5e7eb'}`,
    }}>
      {done && !active && <span style={{ fontSize: 10 }}>✓</span>}
      {label}
    </a>
  );
}

function FlowArrow() {
  return <span style={{ color: '#d1d5db', fontSize: 16 }}>→</span>;
}

const sectionStyle: React.CSSProperties = {
  background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10,
  padding: '20px 24px', marginBottom: 16,
};
const stepLabel: React.CSSProperties = {
  fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase',
  letterSpacing: '0.05em', marginBottom: 14,
};
