'use client';

import { useEffect, useState, useRef } from 'react';

const API_URL = (process.env.NEXT_PUBLIC_API_URL||'https://pie-system-production.up.railway.app');

type Row = { id: number; codigo: string; descricao: string };

type Props = {
  title: string;
  endpoint: string;
  codigoLabel?: string;
};

export default function RefPage({ title, endpoint, codigoLabel = 'Código' }: Props) {
  const [rows, setRows] = useState<Row[]>([]);
  const [search, setSearch] = useState('');
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<{ inserted: number; errors: number } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = (q = '') => {
    const url = q
      ? `${API_URL}/${endpoint}?q=${encodeURIComponent(q)}`
      : `${API_URL}/${endpoint}`;
    fetch(url).then((r) => r.json()).then(setRows).catch(() => {});
  };

  useEffect(() => { load(); }, []);

  useEffect(() => {
    const t = setTimeout(() => load(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true); setResult(null);
    const form = new FormData();
    form.append('file', file);
    const res = await fetch(`${API_URL}/${endpoint}/upload`, { method: 'POST', body: form });
    const data = await res.json();
    setResult(data);
    setUploading(false);
    if (fileRef.current) fileRef.current.value = '';
    load(search);
  }

  return (
    <main style={{ padding: 32, fontFamily: 'sans-serif', maxWidth: 900, margin: '0 auto' }}>
      <h1 style={{ marginBottom: 24 }}>{title}</h1>

      <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          placeholder={`Buscar por código ou descrição...`}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={inputStyle}
        />
        <label style={{ ...btnSecondary, cursor: 'pointer' }}>
          {uploading ? 'Importando...' : 'Importar CSV (Receita Federal)'}
          <input ref={fileRef} type="file" accept=".csv,.txt,.zip" style={{ display: 'none' }}
            onChange={handleUpload} disabled={uploading} />
        </label>
      </div>

      {result && (
        <div style={resultBox}>
          Importação concluída: <strong>{result.inserted}</strong> registros
          {result.errors > 0 && <>, <strong>{result.errors}</strong> erros</>}.
        </div>
      )}

      <p style={{ color: '#666', fontSize: 13, margin: '0 0 8px' }}>
        {rows.length.toLocaleString('pt-BR')} registro(s)
      </p>

      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ background: '#f0f2f5', textAlign: 'left' }}>
            <th style={th}>{codigoLabel}</th>
            <th style={th}>Descrição</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} style={{ borderBottom: '1px solid #eee' }}>
              <td style={{ ...td, fontFamily: 'monospace', fontWeight: 600, whiteSpace: 'nowrap' }}>{r.codigo}</td>
              <td style={td}>{r.descricao}</td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr><td colSpan={2} style={{ ...td, color: '#aaa', textAlign: 'center', padding: 32 }}>
              Nenhum registro encontrado.
            </td></tr>
          )}
        </tbody>
      </table>
    </main>
  );
}

const inputStyle: React.CSSProperties = { padding: '8px 12px', border: '1px solid #ccc', borderRadius: 6, fontSize: 14, minWidth: 260 };
const btnSecondary: React.CSSProperties = { padding: '8px 16px', background: '#fff', color: '#333', border: '1px solid #ccc', borderRadius: 6, fontSize: 14 };
const th: React.CSSProperties = { padding: '10px 12px', fontWeight: 600, fontSize: 13 };
const td: React.CSSProperties = { padding: '9px 12px', fontSize: 13 };
const resultBox: React.CSSProperties = { background: '#f0fff4', border: '1px solid #b2f5c8', borderRadius: 6, padding: '10px 16px', marginBottom: 16, fontSize: 14, color: '#276749' };
