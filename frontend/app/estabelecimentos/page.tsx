'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { getEstabelecimentos, createEstabelecimento, updateEstabelecimento, deleteEstabelecimento } from '@/services/api';
import ImportProgress from '../components/ImportProgress';
import { useImport } from '../contexts/ImportContext';

const API_URL = 'http://localhost:3001';

const SITUACAO_LABEL: Record<string, string> = {
  '01': 'Nula', '02': 'Ativa', '03': 'Suspensa', '04': 'Inapta', '08': 'Baixada',
};

const MATRIZ_FILIAL: Record<string, string> = { '1': 'Matriz', '2': 'Filial' };

type Estabelecimento = {
  id: number;
  cnpjCompleto: string;
  cnpjBasico: string;
  cnpjOrdem: string;
  cnpjDv: string;
  identificadorMatrizFilial?: string;
  nomeFantasia?: string;
  situacaoCadastral?: string;
  dataInicioAtividade?: string;
  cnaePrincipal?: string;
  uf?: string;
  codigoMunicipio?: string;
  logradouro?: string;
  numero?: string;
  bairro?: string;
  cep?: string;
  ddd1?: string;
  telefone1?: string;
  email?: string;
};

type FormState = {
  cnpjBasico: string; cnpjOrdem: string; cnpjDv: string;
  identificadorMatrizFilial: string; nomeFantasia: string;
  situacaoCadastral: string; dataInicioAtividade: string;
  cnaePrincipal: string; uf: string; codigoMunicipio: string;
  logradouro: string; numero: string; bairro: string; cep: string;
  ddd1: string; telefone1: string; email: string;
};

const emptyForm: FormState = {
  cnpjBasico: '', cnpjOrdem: '', cnpjDv: '',
  identificadorMatrizFilial: '', nomeFantasia: '',
  situacaoCadastral: '', dataInicioAtividade: '',
  cnaePrincipal: '', uf: '', codigoMunicipio: '',
  logradouro: '', numero: '', bairro: '', cep: '',
  ddd1: '', telefone1: '', email: '',
};

const LIMIT = 50;

function formatCnpj(cnpj: string) {
  if (cnpj.length !== 14) return cnpj;
  return `${cnpj.slice(0,2)}.${cnpj.slice(2,5)}.${cnpj.slice(5,8)}/${cnpj.slice(8,12)}-${cnpj.slice(12)}`;
}

function formatDate(d?: string) {
  if (!d || d.length !== 8) return d || '—';
  return `${d.slice(6,8)}/${d.slice(4,6)}/${d.slice(0,4)}`;
}

export default function EstabelecimentosPage() {
  const [items, setItems] = useState<Estabelecimento[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [hasSearched, setHasSearched] = useState(true);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState('');
  const { jobs, startImport } = useImport();
  const job = jobs['estabelecimentos'] ?? null;
  const fileRef = useRef<HTMLInputElement>(null);
  const totalPages = Math.ceil(total / LIMIT);

  const load = useCallback((q: string, p: number) => {
    getEstabelecimentos(q || undefined, p, LIMIT).then(([data, count]) => {
      setItems(data);
      setTotal(count);
    });
  }, []);

  // Load on mount and on page change
  useEffect(() => { load(search, page); }, [page, load]);

  // Debounce search input
  useEffect(() => {
    if (!search) return;
    const t = setTimeout(() => { setHasSearched(true); setPage(1); load(search, 1); }, 350);
    return () => clearTimeout(t);
  }, [search, load]);

  useEffect(() => {
    if (job?.progress.done) { setHasSearched(true); setPage(1); load(search, 1); }
  }, [job?.progress.done]);

  function openCreate() {
    setForm(emptyForm); setEditingId(null); setError(''); setShowForm(true);
  }

  function openEdit(e: Estabelecimento) {
    setForm({
      cnpjBasico: e.cnpjBasico, cnpjOrdem: e.cnpjOrdem, cnpjDv: e.cnpjDv,
      identificadorMatrizFilial: e.identificadorMatrizFilial ?? '',
      nomeFantasia: e.nomeFantasia ?? '',
      situacaoCadastral: e.situacaoCadastral ?? '',
      dataInicioAtividade: e.dataInicioAtividade ?? '',
      cnaePrincipal: e.cnaePrincipal ?? '',
      uf: e.uf ?? '', codigoMunicipio: e.codigoMunicipio ?? '',
      logradouro: e.logradouro ?? '', numero: e.numero ?? '',
      bairro: e.bairro ?? '', cep: e.cep ?? '',
      ddd1: e.ddd1 ?? '', telefone1: e.telefone1 ?? '', email: e.email ?? '',
    });
    setEditingId(e.id); setError(''); setShowForm(true);
  }

  async function handleSubmit(ev: React.FormEvent) {
    ev.preventDefault();
    setError('');
    if (!/^\d{8}$/.test(form.cnpjBasico)) { setError('CNPJ básico deve ter 8 dígitos.'); return; }
    if (!/^\d{4}$/.test(form.cnpjOrdem)) { setError('Ordem deve ter 4 dígitos.'); return; }
    if (!/^\d{2}$/.test(form.cnpjDv)) { setError('DV deve ter 2 dígitos.'); return; }

    const payload = {
      cnpjBasico: form.cnpjBasico,
      cnpjOrdem: form.cnpjOrdem,
      cnpjDv: form.cnpjDv,
      cnpjCompleto: form.cnpjBasico + form.cnpjOrdem + form.cnpjDv,
      identificadorMatrizFilial: form.identificadorMatrizFilial || undefined,
      nomeFantasia: form.nomeFantasia || undefined,
      situacaoCadastral: form.situacaoCadastral || undefined,
      dataInicioAtividade: form.dataInicioAtividade || undefined,
      cnaePrincipal: form.cnaePrincipal || undefined,
      uf: form.uf || undefined,
      codigoMunicipio: form.codigoMunicipio || undefined,
      logradouro: form.logradouro || undefined,
      numero: form.numero || undefined,
      bairro: form.bairro || undefined,
      cep: form.cep || undefined,
      ddd1: form.ddd1 || undefined,
      telefone1: form.telefone1 || undefined,
      email: form.email || undefined,
    };

    if (editingId !== null) await updateEstabelecimento(editingId, payload);
    else await createEstabelecimento(payload);

    setShowForm(false);
    load(search, page);
  }

  async function handleDelete(id: number, cnpj: string) {
    if (!confirm(`Excluir estabelecimento ${cnpj}?`)) return;
    await deleteEstabelecimento(id);
    load(search, page);
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (fileRef.current) fileRef.current.value = '';
    const formData = new FormData();
    formData.append('file', file);
    const res = await fetch(`${API_URL}/estabelecimentos/upload`, { method: 'POST', body: formData });
    startImport('estabelecimentos', 'Estabelecimentos', res, file.name);
  }

  const f = (field: keyof FormState, label: string, opts?: { maxLength?: number; placeholder?: string }) => (
    <label style={labelStyle}>
      {label}
      <input
        value={form[field]}
        maxLength={opts?.maxLength}
        placeholder={opts?.placeholder}
        onChange={(e) => setForm({ ...form, [field]: e.target.value })}
        style={{ ...inputStyle, width: '100%' }}
      />
    </label>
  );

  return (
    <main style={{ padding: 32, fontFamily: 'sans-serif', maxWidth: 1300, margin: '0 auto' }}>
      <h1 style={{ marginBottom: 24 }}>Estabelecimentos</h1>

      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          placeholder="Buscar por CNPJ, nome fantasia..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={inputStyle}
        />
        <button onClick={openCreate} style={btnPrimary}>+ Novo estabelecimento</button>
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
            <h2 style={{ marginTop: 0 }}>{editingId !== null ? 'Editar Estabelecimento' : 'Novo Estabelecimento'}</h2>
            <form onSubmit={handleSubmit}>
              {/* CNPJ */}
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 12 }}>
                {f('cnpjBasico', 'CNPJ Básico (8 dígitos)', { maxLength: 8, placeholder: '00000000' })}
                {f('cnpjOrdem', 'Ordem (4 dígitos)', { maxLength: 4, placeholder: '0001' })}
                {f('cnpjDv', 'DV (2 dígitos)', { maxLength: 2, placeholder: '00' })}
              </div>
              <div style={{ ...grid2, marginTop: 12 }}>
                <label style={labelStyle}>
                  Tipo
                  <select value={form.identificadorMatrizFilial}
                    onChange={(e) => setForm({ ...form, identificadorMatrizFilial: e.target.value })}
                    style={{ ...inputStyle, width: '100%' }}>
                    <option value="">—</option>
                    <option value="1">Matriz</option>
                    <option value="2">Filial</option>
                  </select>
                </label>
                {f('nomeFantasia', 'Nome Fantasia', { placeholder: 'Nome fantasia' })}
              </div>
              <div style={{ ...grid2, marginTop: 12 }}>
                <label style={labelStyle}>
                  Situação Cadastral
                  <select value={form.situacaoCadastral}
                    onChange={(e) => setForm({ ...form, situacaoCadastral: e.target.value })}
                    style={{ ...inputStyle, width: '100%' }}>
                    <option value="">—</option>
                    {Object.entries(SITUACAO_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </label>
                {f('dataInicioAtividade', 'Início Atividade (AAAAMMDD)', { maxLength: 8, placeholder: '20000101' })}
              </div>
              <div style={{ ...grid2, marginTop: 12 }}>
                {f('cnaePrincipal', 'CNAE Principal', { maxLength: 7, placeholder: '6201500' })}
                {f('uf', 'UF', { maxLength: 2, placeholder: 'SP' })}
              </div>
              <div style={{ ...grid2, marginTop: 12 }}>
                {f('codigoMunicipio', 'Cód. Município', { maxLength: 7, placeholder: '7107' })}
                {f('cep', 'CEP', { maxLength: 8, placeholder: '01310100' })}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12, marginTop: 12 }}>
                {f('logradouro', 'Logradouro', { placeholder: 'Av. Paulista' })}
                {f('numero', 'Número', { placeholder: '1000' })}
              </div>
              {f('bairro', 'Bairro', { placeholder: 'Bela Vista' })}
              <div style={{ ...grid2, marginTop: 12 }}>
                {f('ddd1', 'DDD', { maxLength: 4, placeholder: '11' })}
                {f('telefone1', 'Telefone', { maxLength: 9, placeholder: '999999999' })}
              </div>
              {f('email', 'E-mail', { placeholder: 'contato@empresa.com.br' })}

              {error && <p style={{ color: '#c00', margin: '8px 0 0', fontSize: 13 }}>{error}</p>}
              <div style={{ display: 'flex', gap: 8, marginTop: 20, justifyContent: 'flex-end' }}>
                <button type="button" onClick={() => setShowForm(false)} style={btnSecondary}>Cancelar</button>
                <button type="submit" style={btnPrimary}>{editingId !== null ? 'Salvar' : 'Criar'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {hasSearched && (
        <p style={{ color: '#666', fontSize: 13, margin: '0 0 8px' }}>
          {total.toLocaleString('pt-BR')} registro(s) — página {page} de {totalPages || 1}
        </p>
      )}

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 1000 }}>
          <thead>
            <tr style={{ background: '#f0f2f5', textAlign: 'left' }}>
              <th style={th}>CNPJ</th>
              <th style={th}>Tipo</th>
              <th style={th}>Nome Fantasia</th>
              <th style={th}>Situação</th>
              <th style={th}>Início Atividade</th>
              <th style={th}>CNAE Principal</th>
              <th style={th}>UF</th>
              <th style={th}>Município</th>
              <th style={th}>Endereço</th>
              <th style={th}>Telefone</th>
              <th style={{ ...th, width: 120 }}>Ações</th>
            </tr>
          </thead>
          <tbody>
            {items.map((e) => (
              <tr key={e.id} style={{ borderBottom: '1px solid #eee' }}>
                <td style={{ ...td, fontFamily: 'monospace', fontWeight: 600, whiteSpace: 'nowrap' }}>
                  {formatCnpj(e.cnpjCompleto)}
                </td>
                <td style={td}>{e.identificadorMatrizFilial ? (MATRIZ_FILIAL[e.identificadorMatrizFilial] ?? e.identificadorMatrizFilial) : '—'}</td>
                <td style={td}>{e.nomeFantasia || '—'}</td>
                <td style={td}>{e.situacaoCadastral ? (SITUACAO_LABEL[e.situacaoCadastral] ?? e.situacaoCadastral) : '—'}</td>
                <td style={td}>{formatDate(e.dataInicioAtividade)}</td>
                <td style={{ ...td, fontFamily: 'monospace' }}>{e.cnaePrincipal || '—'}</td>
                <td style={td}>{e.uf || '—'}</td>
                <td style={td}>{e.codigoMunicipio || '—'}</td>
                <td style={td}>
                  {e.logradouro
                    ? `${e.logradouro}${e.numero ? ', ' + e.numero : ''}${e.bairro ? ' – ' + e.bairro : ''}`
                    : '—'}
                </td>
                <td style={{ ...td, whiteSpace: 'nowrap' }}>
                  {e.ddd1 && e.telefone1 ? `(${e.ddd1}) ${e.telefone1}` : '—'}
                </td>
                <td style={{ ...td, padding: 0, whiteSpace: 'nowrap' }}>
                  <button onClick={() => openEdit(e)} style={btnEdit}>Editar</button>
                  <button onClick={() => handleDelete(e.id, formatCnpj(e.cnpjCompleto))} style={btnDel}>Excluir</button>
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr><td colSpan={11} style={{ ...td, color: '#aaa', textAlign: 'center', padding: 32 }}>
                Nenhum estabelecimento encontrado.
              </td></tr>
            )}
          </tbody>
        </table>
      </div>

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

const inputStyle: React.CSSProperties = { padding: '8px 12px', border: '1px solid #ccc', borderRadius: 6, fontSize: 14, minWidth: 0 };
const btnPrimary: React.CSSProperties = { padding: '8px 16px', background: '#0070f3', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 14 };
const btnSecondary: React.CSSProperties = { padding: '8px 16px', background: '#fff', color: '#333', border: '1px solid #ccc', borderRadius: 6, cursor: 'pointer', fontSize: 14 };
const btnEdit: React.CSSProperties = { padding: '4px 10px', marginRight: 6, background: '#f0f2f5', border: '1px solid #ccc', borderRadius: 4, cursor: 'pointer', fontSize: 12 };
const btnDel: React.CSSProperties = { padding: '4px 10px', background: '#fff0f0', border: '1px solid #f5c6c6', borderRadius: 4, cursor: 'pointer', fontSize: 12, color: '#c00' };
const th: React.CSSProperties = { padding: '10px 12px', fontWeight: 600, fontSize: 13, whiteSpace: 'nowrap' };
const td: React.CSSProperties = { padding: '9px 12px', fontSize: 13 };
const labelStyle: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, fontWeight: 600, marginTop: 0 };
const grid2: React.CSSProperties = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 };
const overlay: React.CSSProperties = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 };
const modal: React.CSSProperties = { background: '#fff', borderRadius: 10, padding: 28, width: 580, boxShadow: '0 8px 32px rgba(0,0,0,0.18)', maxHeight: '90vh', overflowY: 'auto' };
