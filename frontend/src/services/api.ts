const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://pie-system-production.up.railway.app';

// Leads
export async function getLeads() {
  const res = await fetch(`${API_URL}/leads`);
  return res.json();
}

export async function createLead(data: {
  cnpj: string; nome: string; cnae?: string; porte?: string;
  regiao?: string; website?: string; telefone?: string;
  email?: string; isMatriz?: boolean; score?: number;
}) {
  const res = await fetch(`${API_URL}/leads`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return res.json();
}

// Tenants
export async function getTenants() {
  const res = await fetch(`${API_URL}/tenants`);
  return res.json();
}

// Opportunities
export async function getOpportunities(tenantId?: number) {
  const url = tenantId
    ? `${API_URL}/opportunities?tenantId=${tenantId}`
    : `${API_URL}/opportunities`;
  const res = await fetch(url);
  return res.json();
}

export async function updateOpportunityStage(id: number, stage: string) {
  const res = await fetch(`${API_URL}/opportunities/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ stage }),
  });
  return res.json();
}

// CNAEs
export async function getCnaes(q?: string) {
  const url = q ? `${API_URL}/cnaes?q=${encodeURIComponent(q)}` : `${API_URL}/cnaes`;
  const res = await fetch(url);
  return res.json();
}

export async function createCnae(data: { codigo: string; descricao: string }) {
  const res = await fetch(`${API_URL}/cnaes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return res.json();
}

export async function updateCnae(id: number, data: { codigo?: string; descricao?: string }) {
  const res = await fetch(`${API_URL}/cnaes/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return res.json();
}

export async function deleteCnae(id: number) {
  const res = await fetch(`${API_URL}/cnaes/${id}`, { method: 'DELETE' });
  return res.json();
}

export async function uploadCnaeCsv(file: File) {
  const form = new FormData();
  form.append('file', file);
  const res = await fetch(`${API_URL}/cnaes/upload`, { method: 'POST', body: form });
  return res.json();
}

// Empresas
export async function getEmpresas(q?: string, page = 1, limit = 50) {
  const params = new URLSearchParams({ page: String(page), limit: String(limit) });
  if (q) params.set('q', q);
  const res = await fetch(`${API_URL}/empresas?${params}`);
  return res.json(); // returns [items, total]
}

export async function createEmpresa(data: {
  cnpjBasico: string; razaoSocial: string; naturezaJuridica?: string;
  qualificacaoResponsavel?: string; capitalSocial?: number; porte?: string; enteFederativo?: string;
}) {
  const res = await fetch(`${API_URL}/empresas`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return res.json();
}

export async function updateEmpresa(id: number, data: Record<string, unknown>) {
  const res = await fetch(`${API_URL}/empresas/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return res.json();
}

export async function deleteEmpresa(id: number) {
  const res = await fetch(`${API_URL}/empresas/${id}`, { method: 'DELETE' });
  return res.json();
}

export async function uploadEmpresasCsv(file: File) {
  const form = new FormData();
  form.append('file', file);
  const res = await fetch(`${API_URL}/empresas/upload`, { method: 'POST', body: form });
  return res.json();
}

// Estabelecimentos
export async function getEstabelecimentos(q?: string, page = 1, limit = 50) {
  const params = new URLSearchParams({ page: String(page), limit: String(limit) });
  if (q) params.set('q', q);
  const res = await fetch(`${API_URL}/estabelecimentos?${params}`);
  return res.json(); // returns [items, total]
}

export async function createEstabelecimento(data: Record<string, unknown>) {
  const res = await fetch(`${API_URL}/estabelecimentos`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return res.json();
}

export async function updateEstabelecimento(id: number, data: Record<string, unknown>) {
  const res = await fetch(`${API_URL}/estabelecimentos/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return res.json();
}

export async function deleteEstabelecimento(id: number) {
  const res = await fetch(`${API_URL}/estabelecimentos/${id}`, { method: 'DELETE' });
  return res.json();
}

export async function uploadEstabelecimentosCsv(file: File) {
  const form = new FormData();
  form.append('file', file);
  const res = await fetch(`${API_URL}/estabelecimentos/upload`, { method: 'POST', body: form });
  return res.json();
}

// CNPJs (visão cruzada)
export async function getCnpjs(
  q?: string, page = 1, limit = 50,
  filters?: { situacao?: string; tipo?: string; cnae?: string; uf?: string; porte?: string; municipio?: string },
) {
  const params = new URLSearchParams({ page: String(page), limit: String(limit) });
  if (q) params.set('q', q);
  if (filters?.situacao) params.set('situacao', filters.situacao);
  if (filters?.tipo)     params.set('tipo', filters.tipo);
  if (filters?.cnae)     params.set('cnae', filters.cnae);
  if (filters?.uf)       params.set('uf', filters.uf);
  if (filters?.porte)    params.set('porte', filters.porte);
  if (filters?.municipio) params.set('municipio', filters.municipio);
  const res = await fetch(`${API_URL}/cnpjs?${params}`);
  return res.json(); // returns [items, total]
}

export async function createCnpjRecord(data: Record<string, unknown>) {
  const res = await fetch(`${API_URL}/cnpjs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return res.json();
}

export async function updateCnpjRecord(id: number, data: Record<string, unknown>) {
  const res = await fetch(`${API_URL}/cnpjs/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return res.json();
}

export async function deleteCnpjRecord(id: number) {
  const res = await fetch(`${API_URL}/cnpjs/${id}`, { method: 'DELETE' });
  return res.json();
}

// Stats
export async function getBasePrimariaStats() {
  const res = await fetch(`${API_URL}/stats/base-primaria`);
  return res.json();
}

// Tabelas de referência (upload only)
export async function uploadReferenciaCsv(endpoint: string, file: File) {
  const form = new FormData();
  form.append('file', file);
  const res = await fetch(`${API_URL}/${endpoint}/upload`, { method: 'POST', body: form });
  return res.json();
}
