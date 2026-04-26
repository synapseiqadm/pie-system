'use client';

import { useEffect, useState, useRef } from 'react';
import { getCnaes, createCnae, updateCnae, deleteCnae, uploadCnaeCsv } from '@/services/api';

type Cnae = { id: number; codigo: string; descricao: string };
type FormState = { codigo: string; descricao: string };

const emptyForm: FormState = { codigo: '', descricao: '' };

export default function CnaesPage() {
  const [cnaes, setCnaes] = useState<Cnae[]>([]);
  const [search, setSearch] = useState('');
  const [form, setForm] = useState<FormState>(emptyForm);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [uploadResult, setUploadResult] = useState<{ inserted: number; updated: number } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const load = (q?: string) => getCnaes(q).then(setCnaes);

  useEffect(() => { load(); }, []);

  useEffect(() => {
    const t = setTimeout(() => load(search || undefined), 300);
    return () => clearTimeout(t);
  }, [search]);

  function openCreate() {
    setForm(emptyForm);
    setEditingId(null);
    setError('');
    setShowForm(true);
  }

  function openEdit(c: Cnae) {
    setForm({ codigo: c.codigo, descricao: c.descricao });
    setEditingId(c.id);
    setError('');
    setShowForm(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!/^\d{7}$/.test(form.codigo)) {
      setError('Código deve conter exatamente 7 dígitos numéricos.');
      return;
    }
    if (!form.descricao.trim()) {
      setError('Descrição é obrigatória.');
      return;
    }
    if (editingId !== null) {
      await updateCnae(editingId, form);
    } else {
      await createCnae(form);
    }
    setShowForm(false);
    load(search || undefined);
  }

  async function handleDelete(id: number, descricao: string) {
    if (!confirm(`Excluir "${descricao}"?`)) return;
    await deleteCnae(id);
    load(search || undefined);
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setUploadResult(null);
    const result = await uploadCnaeCsv(file);
    setUploadResult(result);
    setUploading(false);
    if (fileRef.current) fileRef.current.value = '';
    load(search || undefined);
  }

  return (
    <main style={{ padding: 32, fontFamily: 'sans-serif', maxWidth: 960, margin: '0 auto' }}>
      <h1 style={{ marginBottom: 24 }}>CNAEs</h1>

      {/* Toolbar */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          placeholder="Buscar por código ou descrição..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={inputStyle}
        />
        <button onClick={openCreate} style={btnPrimary}>+ Novo CNAE</button>

        <label style={{ ...btnSecondary, cursor: 'pointer' }}>
          {uploading ? 'Importando...' : 'Importar CSV'}
          <input
            ref={fileRef}
            type="file"
            accept=".csv,.txt"
            style={{ display: 'none' }}
            onChange={handleUpload}
            disabled={uploading}
          />
        </label>
      </div>

      {/* Upload result */}
      {uploadResult && (
        <div style={successBox}>
          Importação concluída: <strong>{uploadResult.inserted}</strong> inseridos,{' '}
          <strong>{uploadResult.updated}</strong> atualizados.
        </div>
      )}

      {/* Modal */}
      {showForm && (
        <div style={overlay}>
          <div style={modal}>
            <h2 style={{ marginTop: 0 }}>{editingId !== null ? 'Editar CNAE' : 'Novo CNAE'}</h2>
            <form onSubmit={handleSubmit}>
              <label style={labelStyle}>
                Código (7 dígitos)
                <input
                  value={form.codigo}
                  onChange={(e) => setForm({ ...form, codigo: e.target.value })}
                  placeholder="0111301"
                  maxLength={7}
                  style={{ ...inputStyle, width: '100%' }}
                />
              </label>
              <label style={{ ...labelStyle, marginTop: 12 }}>
                Descrição
                <input
                  value={form.descricao}
                  onChange={(e) => setForm({ ...form, descricao: e.target.value })}
                  placeholder="Cultivo de arroz"
                  style={{ ...inputStyle, width: '100%' }}
                />
              </label>
              {error && <p style={{ color: '#c00', margin: '8px 0 0' }}>{error}</p>}
              <div style={{ display: 'flex', gap: 8, marginTop: 20, justifyContent: 'flex-end' }}>
                <button type="button" onClick={() => setShowForm(false)} style={btnSecondary}>
                  Cancelar
                </button>
                <button type="submit" style={btnPrimary}>
                  {editingId !== null ? 'Salvar' : 'Criar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Table */}
      <p style={{ color: '#666', fontSize: 13, margin: '0 0 8px' }}>{cnaes.length} registro(s)</p>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ background: '#f0f2f5', textAlign: 'left' }}>
            <th style={th}>Código</th>
            <th style={th}>Descrição</th>
            <th style={{ ...th, width: 120 }}>Ações</th>
          </tr>
        </thead>
        <tbody>
          {cnaes.map((c) => (
            <tr key={c.id} style={{ borderBottom: '1px solid #eee' }}>
              <td style={{ ...td, fontFamily: 'monospace', fontWeight: 600 }}>{c.codigo}</td>
              <td style={td}>{c.descricao}</td>
              <td style={{ ...td, padding: 0 }}>
                <button onClick={() => openEdit(c)} style={btnEdit}>Editar</button>
                <button onClick={() => handleDelete(c.id, c.descricao)} style={btnDel}>Excluir</button>
              </td>
            </tr>
          ))}
          {cnaes.length === 0 && (
            <tr>
              <td colSpan={3} style={{ ...td, color: '#aaa', textAlign: 'center', padding: 32 }}>
                Nenhum CNAE encontrado.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </main>
  );
}

// Styles
const inputStyle: React.CSSProperties = {
  padding: '8px 12px', border: '1px solid #ccc', borderRadius: 6, fontSize: 14, minWidth: 240,
};
const btnPrimary: React.CSSProperties = {
  padding: '8px 16px', background: '#0070f3', color: '#fff',
  border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 14,
};
const btnSecondary: React.CSSProperties = {
  padding: '8px 16px', background: '#fff', color: '#333',
  border: '1px solid #ccc', borderRadius: 6, cursor: 'pointer', fontSize: 14,
};
const btnEdit: React.CSSProperties = {
  padding: '4px 10px', marginRight: 6, background: '#f0f2f5',
  border: '1px solid #ccc', borderRadius: 4, cursor: 'pointer', fontSize: 12,
};
const btnDel: React.CSSProperties = {
  padding: '4px 10px', background: '#fff0f0',
  border: '1px solid #f5c6c6', borderRadius: 4, cursor: 'pointer', fontSize: 12, color: '#c00',
};
const th: React.CSSProperties = { padding: '10px 12px', fontWeight: 600, fontSize: 13 };
const td: React.CSSProperties = { padding: '9px 12px', fontSize: 14 };
const labelStyle: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, fontWeight: 600 };
const overlay: React.CSSProperties = {
  position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
  display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100,
};
const modal: React.CSSProperties = {
  background: '#fff', borderRadius: 10, padding: 28, width: 420, boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
};
const successBox: React.CSSProperties = {
  background: '#f0fff4', border: '1px solid #b2f5c8', borderRadius: 6,
  padding: '10px 16px', marginBottom: 16, fontSize: 14, color: '#276749',
};
