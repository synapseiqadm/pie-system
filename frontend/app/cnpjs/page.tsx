'use client';

import { useEffect, useState, useCallback } from 'react';
import { getCnpjs, createCnpjRecord, updateCnpjRecord, deleteCnpjRecord } from '@/services/api';

const SITUACAO_LABEL: Record<string, string> = {
  '01': 'Nula', '02': 'Ativa', '03': 'Suspensa', '04': 'Inapta', '08': 'Baixada',
};
const SITUACAO_COLOR: Record<string, string> = {
  '02': '#16a34a', '03': '#d97706', '04': '#dc2626', '08': '#6b7280', '01': '#6b7280',
};
const MATRIZ_FILIAL: Record<string, string> = { '1': 'Matriz', '2': 'Filial' };
const PORTE_LABEL: Record<string, string> = {
  '00': 'Não inf.', '01': 'ME', '03': 'EPP', '05': 'Demais', '10': 'Grande',
};

const UF_LIST = [
  'AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG',
  'PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO',
];

type Filters = { situacao: string; tipo: string; cnae: string; uf: string; porte: string; municipio: string };

type CnpjRecord = {
  id: number;
  cnpjCompleto: string; cnpjBasico: string; cnpjOrdem: string; cnpjDv: string;
  identificadorMatrizFilial?: string; nomeFantasia?: string;
  situacaoCadastral?: string; dataSituacaoCadastral?: string;
  motivoSituacaoCadastral?: string; dataInicioAtividade?: string;
  cnaePrincipal?: string; cnaeSecundarios?: string;
  uf?: string; codigoMunicipio?: string;
  logradouro?: string; numero?: string; complemento?: string;
  bairro?: string; cep?: string; ddd1?: string; telefone1?: string; email?: string;
  situacaoEspecial?: string;
  razaoSocial?: string; naturezaJuridica?: string; qualificacaoResponsavel?: string;
  capitalSocial?: number; porte?: string; enteFederativo?: string;
  cnaeDescricao?: string; municipioNome?: string; motivoDescricao?: string;
  naturezaDescricao?: string; qualificacaoDescricao?: string; paisNome?: string;
};

type FormState = {
  cnpjBasico: string; cnpjOrdem: string; cnpjDv: string;
  razaoSocial: string; naturezaJuridica: string; qualificacaoResponsavel: string;
  capitalSocial: string; porte: string; enteFederativo: string;
  identificadorMatrizFilial: string; nomeFantasia: string;
  situacaoCadastral: string; dataInicioAtividade: string;
  cnaePrincipal: string; uf: string; codigoMunicipio: string;
  logradouro: string; numero: string; complemento: string;
  bairro: string; cep: string; ddd1: string; telefone1: string; email: string;
};

const emptyForm: FormState = {
  cnpjBasico: '', cnpjOrdem: '', cnpjDv: '',
  razaoSocial: '', naturezaJuridica: '', qualificacaoResponsavel: '',
  capitalSocial: '', porte: '', enteFederativo: '',
  identificadorMatrizFilial: '', nomeFantasia: '',
  situacaoCadastral: '', dataInicioAtividade: '',
  cnaePrincipal: '', uf: '', codigoMunicipio: '',
  logradouro: '', numero: '', complemento: '',
  bairro: '', cep: '', ddd1: '', telefone1: '', email: '',
};

const LIMIT = 50;

function formatCnpj(cnpj: string) {
  if (!cnpj || cnpj.length !== 14) return cnpj ?? '—';
  return `${cnpj.slice(0,2)}.${cnpj.slice(2,5)}.${cnpj.slice(5,8)}/${cnpj.slice(8,12)}-${cnpj.slice(12)}`;
}

function formatDate(d?: string) {
  if (!d || d.length !== 8) return d ?? '—';
  return `${d.slice(6,8)}/${d.slice(4,6)}/${d.slice(0,4)}`;
}

export default function CnpjsPage() {
  const [items, setItems] = useState<CnpjRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState<Filters>({ situacao: '', tipo: '', cnae: '', uf: '', porte: '', municipio: '' });
  const [hasSearched, setHasSearched] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState('');
  const totalPages = Math.ceil(total / LIMIT);

  const activeFilters = Object.values(filters).filter(Boolean).length;

  const load = useCallback((q: string, p: number, f: Filters) => {
    const activeF = Object.fromEntries(
      Object.entries(f).filter(([, v]) => v !== ''),
    ) as Partial<Filters>;
    getCnpjs(q || undefined, p, LIMIT, activeF).then(([data, count]: [CnpjRecord[], number]) => {
      setItems(data);
      setTotal(count);
    });
  }, []);

  // Paginate only after user has searched/filtered
  useEffect(() => { if (hasSearched) load(search, page, filters); }, [page, load]);

  // Debounce search input
  useEffect(() => {
    if (!search) return;
    const t = setTimeout(() => { setHasSearched(true); setPage(1); load(search, 1, filters); }, 350);
    return () => clearTimeout(t);
  }, [search, load]);

  // Trigger load when filters change (if any filter is set)
  useEffect(() => {
    if (activeFilters === 0 && !search) return;
    const t = setTimeout(() => { setHasSearched(true); setPage(1); load(search, 1, filters); }, 200);
    return () => clearTimeout(t);
  }, [filters, load]);

  function setFilter(key: keyof Filters, value: string) {
    setFilters((prev) => ({ ...prev, [key]: value }));
  }

  function clearFilters() {
    const empty: Filters = { situacao: '', tipo: '', cnae: '', uf: '', porte: '', municipio: '' };
    setFilters(empty);
    if (search) load(search, 1, empty);
  }

  function openCreate() {
    setForm(emptyForm); setEditingId(null); setError(''); setShowForm(true);
  }

  function openEdit(r: CnpjRecord) {
    setForm({
      cnpjBasico: r.cnpjBasico, cnpjOrdem: r.cnpjOrdem, cnpjDv: r.cnpjDv,
      razaoSocial: r.razaoSocial ?? '', naturezaJuridica: r.naturezaJuridica ?? '',
      qualificacaoResponsavel: r.qualificacaoResponsavel ?? '',
      capitalSocial: r.capitalSocial != null ? String(r.capitalSocial) : '',
      porte: r.porte ?? '', enteFederativo: r.enteFederativo ?? '',
      identificadorMatrizFilial: r.identificadorMatrizFilial ?? '',
      nomeFantasia: r.nomeFantasia ?? '', situacaoCadastral: r.situacaoCadastral ?? '',
      dataInicioAtividade: r.dataInicioAtividade ?? '', cnaePrincipal: r.cnaePrincipal ?? '',
      uf: r.uf ?? '', codigoMunicipio: r.codigoMunicipio ?? '',
      logradouro: r.logradouro ?? '', numero: r.numero ?? '',
      complemento: r.complemento ?? '', bairro: r.bairro ?? '', cep: r.cep ?? '',
      ddd1: r.ddd1 ?? '', telefone1: r.telefone1 ?? '', email: r.email ?? '',
    });
    setEditingId(r.id); setError(''); setShowForm(true);
  }

  async function handleSubmit(ev: React.FormEvent) {
    ev.preventDefault();
    setError('');
    if (!/^\d{8}$/.test(form.cnpjBasico)) { setError('CNPJ básico deve ter 8 dígitos.'); return; }
    if (!/^\d{4}$/.test(form.cnpjOrdem)) { setError('Ordem deve ter 4 dígitos.'); return; }
    if (!/^\d{2}$/.test(form.cnpjDv)) { setError('DV deve ter 2 dígitos.'); return; }
    if (!form.razaoSocial.trim()) { setError('Razão social é obrigatória.'); return; }

    const payload = {
      cnpjBasico: form.cnpjBasico, cnpjOrdem: form.cnpjOrdem, cnpjDv: form.cnpjDv,
      razaoSocial: form.razaoSocial,
      naturezaJuridica: form.naturezaJuridica || undefined,
      qualificacaoResponsavel: form.qualificacaoResponsavel || undefined,
      capitalSocial: form.capitalSocial ? parseFloat(form.capitalSocial) : undefined,
      porte: form.porte || undefined, enteFederativo: form.enteFederativo || undefined,
      identificadorMatrizFilial: form.identificadorMatrizFilial || undefined,
      nomeFantasia: form.nomeFantasia || undefined,
      situacaoCadastral: form.situacaoCadastral || undefined,
      dataInicioAtividade: form.dataInicioAtividade || undefined,
      cnaePrincipal: form.cnaePrincipal || undefined,
      uf: form.uf || undefined, codigoMunicipio: form.codigoMunicipio || undefined,
      logradouro: form.logradouro || undefined, numero: form.numero || undefined,
      complemento: form.complemento || undefined, bairro: form.bairro || undefined,
      cep: form.cep || undefined, ddd1: form.ddd1 || undefined,
      telefone1: form.telefone1 || undefined, email: form.email || undefined,
    };

    if (editingId !== null) await updateCnpjRecord(editingId, payload);
    else await createCnpjRecord(payload);

    setShowForm(false);
    load(search, page, filters);
  }

  async function handleDelete(r: CnpjRecord) {
    if (!confirm(`Excluir ${formatCnpj(r.cnpjCompleto)}${r.razaoSocial ? ' — ' + r.razaoSocial : ''}?`)) return;
    await deleteCnpjRecord(r.id);
    load(search, page, filters);
  }

  const fi = (field: keyof FormState, label: string, opts?: { max?: number; ph?: string }) => (
    <label style={labelStyle}>
      {label}
      <input value={form[field]} maxLength={opts?.max} placeholder={opts?.ph}
        onChange={(e) => setForm({ ...form, [field]: e.target.value })}
        style={{ ...inputStyle, width: '100%' }} />
    </label>
  );

  return (
    <main style={{ padding: 32, fontFamily: 'sans-serif', maxWidth: 1400, margin: '0 auto' }}>
      <h1 style={{ marginBottom: 4 }}>CNPJs</h1>
      <p style={{ color: '#666', fontSize: 13, marginBottom: 20 }}>
        Visão cruzada: estabelecimentos enriquecidos com empresa, CNAE, município e tabelas de referência
      </p>

      {/* Search + filters */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <input placeholder="Buscar por CNPJ, razão social ou nome fantasia..."
          value={search} onChange={(e) => setSearch(e.target.value)}
          style={{ ...inputStyle, minWidth: 300, flex: '1 1 300px' }} />
        <button onClick={openCreate} style={btnPrimary}>+ Novo CNPJ</button>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
        <select value={filters.situacao} onChange={(e) => setFilter('situacao', e.target.value)} style={filterSelect}>
          <option value="">Situação</option>
          {Object.entries(SITUACAO_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>

        <select value={filters.tipo} onChange={(e) => setFilter('tipo', e.target.value)} style={filterSelect}>
          <option value="">Tipo</option>
          <option value="1">Matriz</option>
          <option value="2">Filial</option>
        </select>

        <select value={filters.uf} onChange={(e) => setFilter('uf', e.target.value)} style={filterSelect}>
          <option value="">UF</option>
          {UF_LIST.map((uf) => <option key={uf} value={uf}>{uf}</option>)}
        </select>

        <select value={filters.porte} onChange={(e) => setFilter('porte', e.target.value)} style={filterSelect}>
          <option value="">Porte</option>
          {Object.entries(PORTE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>

        <input
          placeholder="CNAE (ex: 6201500)"
          value={filters.cnae}
          onChange={(e) => setFilter('cnae', e.target.value.replace(/\D/g, '').slice(0, 7))}
          style={{ ...filterSelect, width: 140 }}
        />

        <input
          placeholder="Cidade"
          value={filters.municipio}
          onChange={(e) => setFilter('municipio', e.target.value)}
          style={{ ...filterSelect, width: 160 }}
        />

        {activeFilters > 0 && (
          <button onClick={clearFilters} style={clearBtn}>
            ✕ Limpar filtros ({activeFilters})
          </button>
        )}
      </div>

      {/* Modal */}
      {showForm && (
        <div style={overlay}>
          <div style={modal}>
            <h2 style={{ marginTop: 0 }}>{editingId !== null ? 'Editar CNPJ' : 'Novo CNPJ'}</h2>
            <form onSubmit={handleSubmit}>

              <p style={sectionTitle}>Identificação do CNPJ</p>
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 12 }}>
                {fi('cnpjBasico', 'CNPJ Básico (8 dígitos)', { max: 8, ph: '12345678' })}
                {fi('cnpjOrdem', 'Ordem (4 dígitos)', { max: 4, ph: '0001' })}
                {fi('cnpjDv', 'DV (2 dígitos)', { max: 2, ph: '00' })}
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
                {fi('nomeFantasia', 'Nome Fantasia', { ph: 'Nome fantasia' })}
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
                {fi('dataInicioAtividade', 'Início Atividade (AAAAMMDD)', { max: 8, ph: '20000101' })}
              </div>
              {fi('cnaePrincipal', 'CNAE Principal', { max: 7, ph: '6201500' })}

              <p style={{ ...sectionTitle, marginTop: 20 }}>Dados da Empresa</p>
              {fi('razaoSocial', 'Razão Social *', { ph: 'Razão social' })}
              <div style={{ ...grid2, marginTop: 12 }}>
                {fi('naturezaJuridica', 'Natureza Jurídica', { max: 4, ph: '2062' })}
                {fi('qualificacaoResponsavel', 'Qual. Responsável', { max: 2, ph: '49' })}
              </div>
              <div style={{ ...grid2, marginTop: 12 }}>
                <label style={labelStyle}>
                  Porte
                  <select value={form.porte}
                    onChange={(e) => setForm({ ...form, porte: e.target.value })}
                    style={{ ...inputStyle, width: '100%' }}>
                    <option value="">—</option>
                    {Object.entries(PORTE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </label>
                {fi('capitalSocial', 'Capital Social (R$)', { ph: '0.00' })}
              </div>
              {fi('enteFederativo', 'Ente Federativo', { ph: 'Ex: SAO PAULO' })}

              <p style={{ ...sectionTitle, marginTop: 20 }}>Endereço</p>
              <div style={{ ...grid2 }}>
                {fi('uf', 'UF', { max: 2, ph: 'SP' })}
                {fi('codigoMunicipio', 'Cód. Município', { max: 7, ph: '7107' })}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '3fr 1fr', gap: 12, marginTop: 12 }}>
                {fi('logradouro', 'Logradouro', { ph: 'Av. Paulista' })}
                {fi('numero', 'Número', { ph: '1000' })}
              </div>
              <div style={{ ...grid2, marginTop: 12 }}>
                {fi('bairro', 'Bairro', { ph: 'Bela Vista' })}
                {fi('cep', 'CEP', { max: 8, ph: '01310100' })}
              </div>
              {fi('complemento', 'Complemento', { ph: 'Sala 42' })}

              <p style={{ ...sectionTitle, marginTop: 20 }}>Contato</p>
              <div style={{ ...grid2 }}>
                {fi('ddd1', 'DDD', { max: 4, ph: '11' })}
                {fi('telefone1', 'Telefone', { max: 9, ph: '999999999' })}
              </div>
              <div style={{ marginTop: 12 }}>
                {fi('email', 'E-mail', { ph: 'contato@empresa.com.br' })}
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

      {hasSearched && (
        <p style={{ color: '#666', fontSize: 13, margin: '0 0 8px' }}>
          {total.toLocaleString('pt-BR')} registro(s) — página {page} de {totalPages || 1}
        </p>
      )}

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 1100 }}>
          <thead>
            <tr style={{ background: '#f0f2f5', textAlign: 'left' }}>
              <th style={th}>CNPJ</th>
              <th style={th}>Razão Social</th>
              <th style={th}>Nome Fantasia</th>
              <th style={th}>Situação</th>
              <th style={th}>Tipo</th>
              <th style={th}>CNAE</th>
              <th style={th}>UF</th>
              <th style={th}>Município</th>
              <th style={th}>Porte</th>
              <th style={th}>Telefone</th>
              <th style={th}>E-mail</th>
              <th style={{ ...th, width: 120 }}>Ações</th>
            </tr>
          </thead>
          <tbody>
            {items.map((r) => (
              <tr key={r.id} style={{ borderBottom: '1px solid #eee' }}>
                <td style={{ ...td, fontFamily: 'monospace', fontWeight: 600, whiteSpace: 'nowrap' }}>
                  {formatCnpj(r.cnpjCompleto)}
                </td>
                <td style={td}>{r.razaoSocial || '—'}</td>
                <td style={td}>{r.nomeFantasia || '—'}</td>
                <td style={td}>
                  {r.situacaoCadastral ? (
                    <span style={{
                      fontSize: 11, padding: '2px 7px', borderRadius: 99, fontWeight: 500,
                      background: `${SITUACAO_COLOR[r.situacaoCadastral] ?? '#6b7280'}22`,
                      color: SITUACAO_COLOR[r.situacaoCadastral] ?? '#6b7280',
                    }}>
                      {SITUACAO_LABEL[r.situacaoCadastral] ?? r.situacaoCadastral}
                    </span>
                  ) : '—'}
                </td>
                <td style={td}>{r.identificadorMatrizFilial ? (MATRIZ_FILIAL[r.identificadorMatrizFilial] ?? r.identificadorMatrizFilial) : '—'}</td>
                <td style={td}>
                  <span style={{ fontFamily: 'monospace', fontSize: 12 }}>{r.cnaePrincipal || '—'}</span>
                  {r.cnaeDescricao && (
                    <span style={{ display: 'block', fontSize: 11, color: '#6b7280', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {r.cnaeDescricao}
                    </span>
                  )}
                </td>
                <td style={td}>{r.uf || '—'}</td>
                <td style={td}>{r.municipioNome || r.codigoMunicipio || '—'}</td>
                <td style={td}>{r.porte ? (PORTE_LABEL[r.porte] ?? r.porte) : '—'}</td>
                <td style={{ ...td, whiteSpace: 'nowrap' }}>
                  {r.ddd1 && r.telefone1 ? `(${r.ddd1}) ${r.telefone1}` : '—'}
                </td>
                <td style={{ ...td, maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {r.email || '—'}
                </td>
                <td style={{ ...td, padding: 0, whiteSpace: 'nowrap' }}>
                  <button onClick={() => openEdit(r)} style={btnEdit}>Editar</button>
                  <button onClick={() => handleDelete(r)} style={btnDel}>Excluir</button>
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr><td colSpan={12} style={{ ...td, color: '#aaa', textAlign: 'center', padding: 32 }}>
                {hasSearched ? 'Nenhum registro encontrado.' : 'Digite um CNPJ, razão social ou aplique um filtro para buscar.'}
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
const labelStyle: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, fontWeight: 600 };
const grid2: React.CSSProperties = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 };
const overlay: React.CSSProperties = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 };
const modal: React.CSSProperties = { background: '#fff', borderRadius: 10, padding: 28, width: 620, boxShadow: '0 8px 32px rgba(0,0,0,0.18)', maxHeight: '92vh', overflowY: 'auto' };
const sectionTitle: React.CSSProperties = { fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: '#6b7280', letterSpacing: '0.05em', margin: '0 0 10px' };
const filterSelect: React.CSSProperties = { padding: '7px 10px', border: '1px solid #ccc', borderRadius: 6, fontSize: 13, background: '#fff', cursor: 'pointer', color: '#333' };
const clearBtn: React.CSSProperties = { padding: '7px 12px', background: '#fee2e2', color: '#991b1b', border: '1px solid #fca5a5', borderRadius: 6, cursor: 'pointer', fontSize: 13 };
