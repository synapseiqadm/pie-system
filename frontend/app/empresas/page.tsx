'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { getEmpresas, createEmpresa, updateEmpresa, deleteEmpresa } from '@/services/api';
import ImportProgress from '../components/ImportProgress';
import { useImport } from '../contexts/ImportContext';

const API_URL = (process.env.NEXT_PUBLIC_API_URL||'https://pie-system-production.up.railway.app');

const PORTE_LABEL: Record<string, string> = {
  '00': 'Não informado', '01': 'ME', '03': 'EPP', '05': 'Demais', '10': 'Grande',
};

type Empresa = {
  id: number; cnpjBasico: string; razaoSocial: string;
  naturezaJuridica?: string; qualificacaoResponsavel?: string;
  capitalSocial?: number; porte?: string; enteFederativo?: string;
};

type FormState = Omit<Empresa, 'id'>;

const emptyForm: FormState = {
  cnpjBasico: '', razaoSocial: '', naturezaJuridica: '',
  qualificacaoResponsavel: '', capitalSocial: undefined, porte: '', enteFederativo: '',
};

const LIMIT = 50;

export default function EmpresasPage() {
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [hasSearched, setHasSearched] = useState(true);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState('');
  const { jobs, startImport } = useImport();
  const job = jobs['empresas'] ?? null;
  const fileRef = useRef<HTMLInputElement>(null);
  const totalPages = Math.ceil(total / LIMIT);

  const load = useCallback(async (q: string, p: number) => {
    const [items, count] = await getEmpresas(q || undefined, p, LIMIT);
    if (count > 0 || items.length > 0) {
      setEmpresas(items);
      setTotal(count);
      return;
    }
    // PostgreSQL vazio — busca no Parquet (base primária)
    const params = new URLSearchParams({ page: String(p), limit: String(LIMIT) });
    if (q) params.set('q', q);
    const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL||"https://pie-system-production.up.railway.app"}/base-primaria/empresas/browse?${params}`).then(r => r.json());
    setEmpresas((res.data ?? []).map((r: any) => ({
      id: 0,
      cnpjBasico: r.cnpj_basico,
      razaoSocial: r.razao_social,
      naturezaJuridica: r.natureza_juridica,
      capitalSocial: parseFloat(r.capital_social?.replace(',', '.') ?? '0'),
      porte: r.porte,
      enteFederativo: undefined,
    })));
    setTotal(res.total ?? 0);
  }, []);

  // Load on mount and on page change
  useEffect(() => { load(search, page); }, [page, load]);

  // Debounce search input
  useEffect(() => {
    if (!search) return;
    const t = setTimeout(() => { setHasSearched(true); setPage(1); load(search, 1); }, 350);
    return () => clearTimeout(t);
  }, [search, load]);

  function openCreate() {
    setForm(emptyForm); setEditingId(null); setError(''); setShowForm(true);
  }

  function openEdit(e: Empresa) {
    setForm({
      cnpjBasico: e.cnpjBasico, razaoSocial: e.razaoSocial,
      naturezaJuridica: e.naturezaJuridica ?? '',
      qualificacaoResponsavel: e.qualificacaoResponsavel ?? '',
      capitalSocial: e.capitalSocial, porte: e.porte ?? '',
      enteFederativo: e.enteFederativo ?? '',
    });
    setEditingId(e.id); setError(''); setShowForm(true);
  }

  async function handleSubmit(ev: React.FormEvent) {
    ev.preventDefault();
    setError('');
    if (!/^\d{8}$/.test(form.cnpjBasico)) { setError('CNPJ básico deve ter 8 dígitos.'); return; }
    if (!form.razaoSocial.trim()) { setError('Razão social obrigatória.'); return; }

    const payload = { ...form, capitalSocial: form.capitalSocial ?? 0 };
    if (editingId !== null) await updateEmpresa(editingId, payload);
    else await createEmpresa(payload as Parameters<typeof createEmpresa>[0]);

    setShowForm(false);
    load(search, page);
  }

  async function handleDelete(id: number, nome: string) {
    if (!confirm(`Excluir "${nome}"?`)) return;
    await deleteEmpresa(id);
    load(search, page);
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (fileRef.current) fileRef.current.value = '';
    const formData = new FormData();
    formData.append('file', file);
    const res = await fetch(`${API_URL}/empresas/upload`, { method: 'POST', body: formData });
    startImport('empresas', 'Empresas', res, file.name);
  }

  useEffect(() => {
    if (job?.progress.done) { setHasSearched(true); setPage(1); load(search, 1); }
  }, [job?.progress.done]);

  return (
    <main style={{ padding: 32, fontFamily: 'sans-serif', maxWidth: 1100, margin: '0 auto' }}>
      <h1 style={{ marginBottom: 24 }}>Empresas / Estabelecimentos</h1>

      {/* Toolbar */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          placeholder="Buscar por CNPJ ou razão social..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={inputStyle}
        />
        <button onClick={openCreate} style={btnPrimary}>+ Nova empresa</button>
        <label style={{ ...btnSecondary, cursor: 'pointer' }}>
          {job && !job.progress.done ? 'Importando...' : 'Importar CSV/ZIP (Receita Federal)'}
          <input ref={fileRef} type="file" accept=".csv,.txt,.zip" style={{ display: 'none' }}
            onChange={handleUpload} disabled={job !== null && !job.progress.done} />
        </label>
      </div>

      {job && (
        <ImportProgress
          processed={job.progress.processed}
          inserted={job.progress.inserted}
          updated={job.progress.updated}
          errors={job.progress.errors}
          done={job.progress.done}
          percent={job.progress.percent}
          bytesRead={job.progress.bytesRead}
          totalBytes={job.progress.totalBytes}
          filename={job.filename}
        />
      )}

      {/* Modal */}
      {showForm && (
        <div style={overlay}>
          <div style={modal}>
            <h2 style={{ marginTop: 0 }}>{editingId !== null ? 'Editar Empresa' : 'Nova Empresa'}</h2>
            <form onSubmit={handleSubmit}>
              <div style={grid2}>
                <label style={labelStyle}>
                  CNPJ Básico (8 dígitos)
                  <input value={form.cnpjBasico} maxLength={8}
                    onChange={(e) => setForm({ ...form, cnpjBasico: e.target.value })}
                    style={{ ...inputStyle, width: '100%' }} placeholder="00000000" />
                </label>
                <label style={labelStyle}>
                  Porte
                  <select value={form.porte ?? ''} onChange={(e) => setForm({ ...form, porte: e.target.value })}
                    style={{ ...inputStyle, width: '100%' }}>
                    <option value="">—</option>
                    {Object.entries(PORTE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </label>
              </div>
              <label style={{ ...labelStyle, marginTop: 12 }}>
                Razão Social
                <input value={form.razaoSocial}
                  onChange={(e) => setForm({ ...form, razaoSocial: e.target.value })}
                  style={{ ...inputStyle, width: '100%' }} placeholder="Nome da empresa" />
              </label>
              <div style={{ ...grid2, marginTop: 12 }}>
                <label style={labelStyle}>
                  Natureza Jurídica
                  <input value={form.naturezaJuridica ?? ''} maxLength={4}
                    onChange={(e) => setForm({ ...form, naturezaJuridica: e.target.value })}
                    style={{ ...inputStyle, width: '100%' }} placeholder="2062" />
                </label>
                <label style={labelStyle}>
                  Qual. Responsável
                  <input value={form.qualificacaoResponsavel ?? ''} maxLength={2}
                    onChange={(e) => setForm({ ...form, qualificacaoResponsavel: e.target.value })}
                    style={{ ...inputStyle, width: '100%' }} placeholder="49" />
                </label>
              </div>
              <div style={{ ...grid2, marginTop: 12 }}>
                <label style={labelStyle}>
                  Capital Social (R$)
                  <input type="number" step="0.01" min={0}
                    value={form.capitalSocial ?? ''}
                    onChange={(e) => setForm({ ...form, capitalSocial: parseFloat(e.target.value) || 0 })}
                    style={{ ...inputStyle, width: '100%' }} placeholder="0.00" />
                </label>
                <label style={labelStyle}>
                  Ente Federativo
                  <input value={form.enteFederativo ?? ''}
                    onChange={(e) => setForm({ ...form, enteFederativo: e.target.value })}
                    style={{ ...inputStyle, width: '100%' }} placeholder="Ex: SAO PAULO" />
                </label>
              </div>
              {error && <p style={{ color: '#c00', margin: '8px 0 0', fontSize: 13 }}>{error}</p>}
              <div style={{ display: 'flex', gap: 8, marginTop: 20, justifyContent: 'flex-end' }}>
                <button type="button" onClick={() => setShowForm(false)} style={btnSecondary}>Cancelar</button>
                <button type="submit" style={btnPrimary}>{editingId !== null ? 'Salvar' : 'Criar'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Table */}
      {hasSearched && (
        <p style={{ color: '#666', fontSize: 13, margin: '0 0 8px' }}>
          {total.toLocaleString('pt-BR')} registro(s) — página {page} de {totalPages || 1}
        </p>
      )}
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ background: '#f0f2f5', textAlign: 'left' }}>
            <th style={th}>CNPJ Básico</th>
            <th style={th}>Razão Social</th>
            <th style={th}>Nat. Jurídica</th>
            <th style={th}>Capital Social</th>
            <th style={th}>Porte</th>
            <th style={th}>Ente Federativo</th>
            <th style={{ ...th, width: 120 }}>Ações</th>
          </tr>
        </thead>
        <tbody>
          {empresas.map((e, i) => (
            <tr key={e.id || `pq-${i}`} style={{ borderBottom: '1px solid #eee' }}>
              <td style={{ ...td, fontFamily: 'monospace', fontWeight: 600 }}>{e.cnpjBasico}</td>
              <td style={td}>{e.razaoSocial}</td>
              <td style={td}>{e.naturezaJuridica ?? '—'}</td>
              <td style={{ ...td, textAlign: 'right' }}>
                {e.capitalSocial != null
                  ? Number(e.capitalSocial).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
                  : '—'}
              </td>
              <td style={td}>{e.porte ? (PORTE_LABEL[e.porte] ?? e.porte) : '—'}</td>
              <td style={td}>{e.enteFederativo || '—'}</td>
              <td style={{ ...td, padding: 0 }}>
                {e.id > 0 && <>
                  <button onClick={() => openEdit(e)} style={btnEdit}>Editar</button>
                  <button onClick={() => handleDelete(e.id, e.razaoSocial)} style={btnDel}>Excluir</button>
                </>}
              </td>
            </tr>
          ))}
          {empresas.length === 0 && (
            <tr><td colSpan={7} style={{ ...td, color: '#aaa', textAlign: 'center', padding: 32 }}>
              Nenhuma empresa encontrada.
            </td></tr>
          )}
        </tbody>
      </table>

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{ display: 'flex', gap: 8, marginTop: 16, alignItems: 'center' }}>
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} style={btnSecondary}>‹ Anterior</button>
          <span style={{ fontSize: 13, color: '#555' }}>Página {page} / {totalPages}</span>
          <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} style={btnSecondary}>Próxima ›</button>
        </div>
      )}
    </main>
  );
}

const inputStyle: React.CSSProperties = { padding: '8px 12px', border: '1px solid #ccc', borderRadius: 6, fontSize: 14, minWidth: 240 };
const btnPrimary: React.CSSProperties = { padding: '8px 16px', background: '#0070f3', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 14 };
const btnSecondary: React.CSSProperties = { padding: '8px 16px', background: '#fff', color: '#333', border: '1px solid #ccc', borderRadius: 6, cursor: 'pointer', fontSize: 14 };
const btnEdit: React.CSSProperties = { padding: '4px 10px', marginRight: 6, background: '#f0f2f5', border: '1px solid #ccc', borderRadius: 4, cursor: 'pointer', fontSize: 12 };
const btnDel: React.CSSProperties = { padding: '4px 10px', background: '#fff0f0', border: '1px solid #f5c6c6', borderRadius: 4, cursor: 'pointer', fontSize: 12, color: '#c00' };
const th: React.CSSProperties = { padding: '10px 12px', fontWeight: 600, fontSize: 13 };
const td: React.CSSProperties = { padding: '9px 12px', fontSize: 13 };
const labelStyle: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, fontWeight: 600 };
const grid2: React.CSSProperties = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 };
const overlay: React.CSSProperties = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 };
const modal: React.CSSProperties = { background: '#fff', borderRadius: 10, padding: 28, width: 520, boxShadow: '0 8px 32px rgba(0,0,0,0.18)', maxHeight: '90vh', overflowY: 'auto' };
