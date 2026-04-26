'use client';

type Props = {
  processed: number;
  inserted: number;
  updated: number;
  errors: number;
  done: boolean;
  percent: number;
  bytesRead: number;
  totalBytes: number;
  filename?: string;
};

function fmtBytes(b: number) {
  if (b >= 1_073_741_824) return `${(b / 1_073_741_824).toFixed(1)} GB`;
  if (b >= 1_048_576)     return `${(b / 1_048_576).toFixed(1)} MB`;
  if (b >= 1_024)         return `${(b / 1_024).toFixed(0)} KB`;
  return `${b} B`;
}

export default function ImportProgress({ processed, inserted, updated, errors, done, percent, bytesRead, totalBytes, filename }: Props) {
  const pct = done ? 100 : percent;

  return (
    <div style={{
      background: done ? '#f0fff4' : '#fffbeb',
      border: `1px solid ${done ? '#b2f5c8' : '#fde68a'}`,
      borderRadius: 8,
      padding: '14px 16px',
      marginBottom: 16,
      fontSize: 14,
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        {!done && (
          <span style={{ display: 'inline-block', width: 14, height: 14, border: '2px solid #d97706', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.7s linear infinite', flexShrink: 0 }} />
        )}
        <div style={{ flex: 1 }}>
          <strong style={{ color: done ? '#276749' : '#92400e' }}>
            {done ? 'Importação concluída' : 'Importando...'}
          </strong>
          {filename && (
            <span style={{ marginLeft: 8, fontSize: 12, color: done ? '#276749' : '#a16207', fontWeight: 400 }}>
              {filename}
            </span>
          )}
        </div>
        <span style={{ fontWeight: 700, fontSize: 15, color: done ? '#276749' : '#92400e' }}>
          {pct}%
        </span>
      </div>

      {/* Progress bar */}
      <div style={{ background: '#e5e7eb', borderRadius: 99, height: 8, overflow: 'hidden', marginBottom: 10 }}>
        <div style={{
          height: '100%',
          width: `${pct}%`,
          background: done ? '#22c55e' : '#f59e0b',
          borderRadius: 99,
          transition: 'width 0.4s ease',
        }} />
      </div>

      {/* Byte progress */}
      {totalBytes > 0 && !done && (
        <div style={{ fontSize: 12, color: '#78716c', marginBottom: 8 }}>
          {fmtBytes(bytesRead)} de {fmtBytes(totalBytes)}
        </div>
      )}

      {/* Counters */}
      <div style={{ display: 'flex', gap: 20, fontSize: 13, color: '#555', flexWrap: 'wrap' }}>
        <span>Processados: <strong>{processed.toLocaleString('pt-BR')}</strong></span>
        <span style={{ color: '#166534' }}>Novos: <strong>{inserted.toLocaleString('pt-BR')}</strong></span>
        {updated > 0 && <span style={{ color: '#1d4ed8' }}>Atualizados: <strong>{updated.toLocaleString('pt-BR')}</strong></span>}
        {errors > 0 && <span style={{ color: '#c00' }}>Erros: <strong>{errors.toLocaleString('pt-BR')}</strong></span>}
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
