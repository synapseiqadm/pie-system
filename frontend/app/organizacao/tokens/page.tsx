'use client';

import { useState } from 'react';

interface ApiToken {
  id: string;
  nome: string;
  prefixo: string;
  escopo: string[];
  criadoEm: string;
  ultimoUso: string | null;
  status: 'ativo' | 'revogado';
}

const ESCOPOS = [
  { value: 'recortes:read', label: 'Segmentos — Leitura' },
  { value: 'recortes:write', label: 'Segmentos — Escrita' },
  { value: 'enriquecimento:read', label: 'Enriquecimento — Leitura' },
  { value: 'enriquecimento:write', label: 'Enriquecimento — Escrita' },
  { value: 'leads:read', label: 'Leads — Leitura' },
  { value: 'leads:write', label: 'Leads — Escrita' },
  { value: 'campanhas:read', label: 'Campanhas — Leitura' },
  { value: 'campanhas:write', label: 'Campanhas — Escrita' },
];

const MOCK_TOKENS: ApiToken[] = [
  {
    id: '1',
    nome: 'Integração CRM',
    prefixo: 'pie_sk_7f3a',
    escopo: ['recortes:read', 'leads:read', 'leads:write'],
    criadoEm: '2024-02-10',
    ultimoUso: '2024-04-15',
    status: 'ativo',
  },
  {
    id: '2',
    nome: 'Pipeline ETL',
    prefixo: 'pie_sk_2c8b',
    escopo: ['recortes:read', 'enriquecimento:read'],
    criadoEm: '2024-03-05',
    ultimoUso: '2024-04-14',
    status: 'ativo',
  },
  {
    id: '3',
    nome: 'Token antigo (deprecado)',
    prefixo: 'pie_sk_9d1e',
    escopo: ['recortes:read'],
    criadoEm: '2023-11-01',
    ultimoUso: '2024-01-20',
    status: 'revogado',
  },
];

export default function TokensPage() {
  const [showCreate, setShowCreate] = useState(false);
  const [newTokenName, setNewTokenName] = useState('');
  const [newTokenEscopos, setNewTokenEscopos] = useState<string[]>([]);
  const [createdToken, setCreatedToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const toggleEscopo = (e: string) =>
    setNewTokenEscopos(prev => prev.includes(e) ? prev.filter(x => x !== e) : [...prev, e]);

  const handleCreate = () => {
    const fake = `pie_sk_${Math.random().toString(36).slice(2, 10)}${'x'.repeat(28)}`;
    setCreatedToken(fake);
  };

  const handleCopy = () => {
    if (createdToken) {
      navigator.clipboard.writeText(createdToken).catch(() => {});
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div style={{ padding: 32, maxWidth: 860, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 28 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: '#111', margin: 0 }}>Tokens de API</h1>
          <p style={{ color: '#6b7280', fontSize: 14, marginTop: 4 }}>
            Crie tokens para integrar sistemas externos à plataforma PIE.
          </p>
        </div>
        <button
          onClick={() => { setShowCreate(true); setCreatedToken(null); setNewTokenName(''); setNewTokenEscopos([]); }}
          style={{ background: '#111827', color: '#fff', border: 'none', borderRadius: 8, padding: '9px 18px', fontSize: 14, fontWeight: 500, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
        >
          <span>+</span> Novo Token
        </button>
      </div>

      {/* Aviso de segurança */}
      <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 10, padding: '12px 16px', marginBottom: 24, display: 'flex', gap: 10, alignItems: 'flex-start' }}>
        <span style={{ fontSize: 16 }}>⚠</span>
        <div style={{ fontSize: 13, color: '#92400e' }}>
          <strong>Atenção:</strong> Tokens concedem acesso programático à sua organização. Nunca compartilhe tokens em código-fonte público. Revogue imediatamente tokens comprometidos.
        </div>
      </div>

      {/* Lista de tokens */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {MOCK_TOKENS.map(token => (
          <div
            key={token.id}
            style={{
              border: `1px solid ${token.status === 'revogado' ? '#f3f4f6' : '#e5e7eb'}`,
              borderRadius: 10,
              padding: '16px 20px',
              background: token.status === 'revogado' ? '#fafafa' : '#fff',
              opacity: token.status === 'revogado' ? 0.7 : 1,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 18 }}>🔑</span>
                <div>
                  <span style={{ fontWeight: 600, fontSize: 14, color: '#111' }}>{token.nome}</span>
                  <span style={{ marginLeft: 10, fontSize: 13, color: '#9ca3af', fontFamily: 'monospace' }}>
                    {token.prefixo}••••••••••••••
                  </span>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{
                  fontSize: 12, fontWeight: 500, borderRadius: 20, padding: '2px 10px',
                  background: token.status === 'ativo' ? '#d1fae5' : '#f3f4f6',
                  color: token.status === 'ativo' ? '#065f46' : '#6b7280',
                }}>
                  {token.status === 'ativo' ? 'Ativo' : 'Revogado'}
                </span>
                {token.status === 'ativo' && (
                  <button style={{ background: 'none', border: '1px solid #fca5a5', borderRadius: 6, padding: '3px 10px', fontSize: 12, color: '#ef4444', cursor: 'pointer' }}>
                    Revogar
                  </button>
                )}
              </div>
            </div>

            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
              {token.escopo.map(e => {
                const label = ESCOPOS.find(s => s.value === e)?.label ?? e;
                return (
                  <span key={e} style={{ fontSize: 11, background: '#eff6ff', color: '#1d4ed8', borderRadius: 4, padding: '2px 7px', fontWeight: 500 }}>
                    {label}
                  </span>
                );
              })}
            </div>

            <div style={{ display: 'flex', gap: 16, fontSize: 12, color: '#9ca3af' }}>
              <span>Criado em {new Date(token.criadoEm).toLocaleDateString('pt-BR')}</span>
              {token.ultimoUso && (
                <span>Último uso {new Date(token.ultimoUso).toLocaleDateString('pt-BR')}</span>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Modal criar token */}
      {showCreate && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: '#fff', borderRadius: 12, padding: 28, width: 480, boxShadow: '0 20px 60px rgba(0,0,0,0.2)', maxHeight: '90vh', overflowY: 'auto' }}>
            {!createdToken ? (
              <>
                <h2 style={{ margin: '0 0 6px', fontSize: 17, fontWeight: 700 }}>Novo Token de API</h2>
                <p style={{ margin: '0 0 20px', fontSize: 13, color: '#6b7280' }}>Defina um nome descritivo e os escopos de acesso do token.</p>

                <label style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 4, color: '#374151' }}>Nome do Token</label>
                <input
                  value={newTokenName}
                  onChange={e => setNewTokenName(e.target.value)}
                  placeholder="Ex: Integração CRM, Pipeline ETL..."
                  style={{ width: '100%', border: '1px solid #d1d5db', borderRadius: 8, padding: '8px 12px', fontSize: 14, marginBottom: 16, boxSizing: 'border-box', outline: 'none' }}
                />

                <label style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 8, color: '#374151' }}>Escopos</label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 20 }}>
                  {ESCOPOS.map(e => (
                    <label key={e.value} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, color: '#374151' }}>
                      <input
                        type="checkbox"
                        checked={newTokenEscopos.includes(e.value)}
                        onChange={() => toggleEscopo(e.value)}
                        style={{ width: 15, height: 15, cursor: 'pointer' }}
                      />
                      {e.label}
                    </label>
                  ))}
                </div>

                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                  <button onClick={() => setShowCreate(false)} style={{ background: 'none', border: '1px solid #e5e7eb', borderRadius: 8, padding: '8px 16px', fontSize: 13, cursor: 'pointer' }}>
                    Cancelar
                  </button>
                  <button
                    onClick={handleCreate}
                    disabled={!newTokenName.trim() || newTokenEscopos.length === 0}
                    style={{ background: !newTokenName.trim() || newTokenEscopos.length === 0 ? '#9ca3af' : '#111827', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 500, cursor: !newTokenName.trim() || newTokenEscopos.length === 0 ? 'not-allowed' : 'pointer' }}
                  >
                    Gerar Token
                  </button>
                </div>
              </>
            ) : (
              <>
                <div style={{ textAlign: 'center', marginBottom: 20 }}>
                  <div style={{ fontSize: 32, marginBottom: 8 }}>✅</div>
                  <h2 style={{ margin: '0 0 6px', fontSize: 17, fontWeight: 700 }}>Token criado com sucesso!</h2>
                  <p style={{ fontSize: 13, color: '#ef4444', margin: 0, fontWeight: 500 }}>
                    Copie agora — ele não será exibido novamente.
                  </p>
                </div>

                <div style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 8, padding: '12px 14px', fontFamily: 'monospace', fontSize: 12, wordBreak: 'break-all', marginBottom: 12, color: '#111' }}>
                  {createdToken}
                </div>

                <button
                  onClick={handleCopy}
                  style={{ width: '100%', background: copied ? '#059669' : '#111827', color: '#fff', border: 'none', borderRadius: 8, padding: '10px', fontSize: 14, fontWeight: 500, cursor: 'pointer', marginBottom: 12 }}
                >
                  {copied ? '✓ Copiado!' : 'Copiar Token'}
                </button>

                <button onClick={() => setShowCreate(false)} style={{ width: '100%', background: 'none', border: '1px solid #e5e7eb', borderRadius: 8, padding: '9px', fontSize: 13, cursor: 'pointer' }}>
                  Fechar
                </button>
              </>
            )}
          </div>
        </div>
      )}

      <p style={{ marginTop: 24, fontSize: 12, color: '#9ca3af', textAlign: 'center' }}>
        Mockup — funcionalidade em desenvolvimento
      </p>
    </div>
  );
}
