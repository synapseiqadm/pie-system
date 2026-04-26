'use client';

import { useImport } from '../contexts/ImportContext';

export default function ImportToast() {
  const { jobs, dismissJob, cancelImport } = useImport();

  const doneJobs = Object.values(jobs).filter((j) => j.progress.done);
  const activeJobs = Object.values(jobs).filter((j) => !j.progress.done);

  if (doneJobs.length === 0 && activeJobs.length === 0) return null;

  return (
    <div style={{
      position: 'fixed', bottom: 24, right: 24, zIndex: 1000,
      display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 340,
    }}>
      {/* Importações em andamento */}
      {activeJobs.map((job) => (
        <div key={job.key} style={toastBase('#fffbeb', '#fde68a')}>
          <div style={toastHeader}>
            <span style={spinner} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <strong style={{ color: '#92400e', fontSize: 13 }}>Importando {job.label}...</strong>
              {job.filename && (
                <div style={{ fontSize: 11, color: '#a16207', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {job.filename}
                </div>
              )}
            </div>
            <button
              onClick={() => cancelImport(job.key)}
              style={cancelBtn}
              title="Cancelar importação"
            >
              ✕ Cancelar
            </button>
          </div>
          {/* Mini progress bar */}
          <div style={{ background: '#fde68a', borderRadius: 99, height: 5, overflow: 'hidden', margin: '4px 0 8px' }}>
            <div style={{ height: '100%', width: `${job.progress.percent}%`, background: '#d97706', borderRadius: 99, transition: 'width 0.4s ease' }} />
          </div>
          <div style={{ ...toastBody, justifyContent: 'space-between' }}>
            <span style={{ color: '#92400e', fontWeight: 600 }}>{job.progress.percent}%</span>
            <span>{job.progress.processed.toLocaleString('pt-BR')} proc.</span>
            <span style={{ color: '#059669' }}>{job.progress.inserted.toLocaleString('pt-BR')} novos</span>
            {job.progress.updated > 0 && (
              <span style={{ color: '#2563eb' }}>{job.progress.updated.toLocaleString('pt-BR')} atual.</span>
            )}
            {job.progress.errors > 0 && (
              <span style={{ color: '#dc2626' }}>{job.progress.errors.toLocaleString('pt-BR')} erros</span>
            )}
          </div>
        </div>
      ))}

      {/* Importações concluídas */}
      {doneJobs.map((job) => (
        <div key={job.key} style={toastBase('#f0fff4', '#bbf7d0')}>
          <div style={toastHeader}>
            <span style={{ color: '#16a34a', fontSize: 16 }}>✓</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <strong style={{ color: '#166534', fontSize: 13 }}>{job.label} importado</strong>
              {job.filename && (
                <div style={{ fontSize: 11, color: '#166534', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {job.filename}
                </div>
              )}
            </div>
            <button onClick={() => dismissJob(job.key)} style={closeBtn}>✕</button>
          </div>
          <div style={toastBody}>
            <span style={{ color: '#059669' }}>{job.progress.inserted.toLocaleString('pt-BR')} novos</span>
            {job.progress.updated > 0 && (
              <span style={{ color: '#2563eb' }}>{job.progress.updated.toLocaleString('pt-BR')} atualizados</span>
            )}
            {job.progress.errors > 0 && (
              <span style={{ color: '#dc2626' }}>{job.progress.errors.toLocaleString('pt-BR')} erros</span>
            )}
            <span style={{ color: '#6b7280' }}>
              {job.startedAt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>
        </div>
      ))}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

const toastBase = (bg: string, border: string): React.CSSProperties => ({
  background: bg,
  border: `1px solid ${border}`,
  borderRadius: 10,
  padding: '10px 14px',
  boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
  minWidth: 280,
});

const toastHeader: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6,
};

const toastBody: React.CSSProperties = {
  display: 'flex', gap: 12, fontSize: 12, color: '#374151', flexWrap: 'wrap',
};

const spinner: React.CSSProperties = {
  display: 'inline-block', width: 13, height: 13, flexShrink: 0,
  border: '2px solid #d97706', borderTopColor: 'transparent',
  borderRadius: '50%', animation: 'spin 0.7s linear infinite',
};

const closeBtn: React.CSSProperties = {
  background: 'none', border: 'none', cursor: 'pointer',
  color: '#6b7280', fontSize: 13, padding: '0 2px', lineHeight: 1,
};

const cancelBtn: React.CSSProperties = {
  background: 'none', border: '1px solid #d97706', borderRadius: 4, cursor: 'pointer',
  color: '#92400e', fontSize: 11, padding: '2px 7px', lineHeight: 1.4,
};
