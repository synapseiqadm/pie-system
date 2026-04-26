'use client';

import { useState } from 'react';

type Role = 'admin' | 'gerenciamento' | 'analista';

interface Usuario {
  id: number;
  nome: string;
  email: string;
  role: Role;
  status: 'ativo' | 'inativo' | 'pendente';
  criadoEm: string;
}

const ROLE_LABEL: Record<Role, string> = {
  admin: 'Administrador',
  gerenciamento: 'Gerenciamento',
  analista: 'Analista',
};

const ROLE_DESC: Record<Role, string> = {
  admin: 'Acesso total à plataforma, incluindo configurações e gerenciamento de usuários.',
  gerenciamento: 'Pode criar e gerenciar segmentos, enriquecimentos e campanhas.',
  analista: 'Acesso somente leitura a segmentos e análises. Não pode criar ou editar.',
};

const ROLE_COLOR: Record<Role, string> = {
  admin: '#ef4444',
  gerenciamento: '#f59e0b',
  analista: '#3b82f6',
};

const MOCK_USUARIOS: Usuario[] = [
  { id: 1, nome: 'Ervin Rampazzo', email: 'ervin@empresa.com', role: 'admin', status: 'ativo', criadoEm: '2024-01-10' },
  { id: 2, nome: 'Ana Paula Silva', email: 'ana.silva@empresa.com', role: 'gerenciamento', status: 'ativo', criadoEm: '2024-02-15' },
  { id: 3, nome: 'Carlos Mendes', email: 'carlos.mendes@empresa.com', role: 'analista', status: 'ativo', criadoEm: '2024-03-01' },
  { id: 4, nome: 'Fernanda Costa', email: 'fernanda@empresa.com', role: 'analista', status: 'pendente', criadoEm: '2024-04-10' },
  { id: 5, nome: 'Roberto Alves', email: 'roberto@empresa.com', role: 'gerenciamento', status: 'inativo', criadoEm: '2024-01-22' },
];

const STATUS_STYLE: Record<string, string> = {
  ativo: 'background:#d1fae5;color:#065f46',
  inativo: 'background:#f3f4f6;color:#6b7280',
  pendente: 'background:#fef3c7;color:#92400e',
};

export default function UsuariosPage() {
  const [showInvite, setShowInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<Role>('analista');
  const [filter, setFilter] = useState<Role | 'todos'>('todos');

  const filtered = filter === 'todos' ? MOCK_USUARIOS : MOCK_USUARIOS.filter(u => u.role === filter);

  return (
    <div style={{ padding: 32, maxWidth: 960, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 28 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: '#111', margin: 0 }}>Usuários</h1>
          <p style={{ color: '#6b7280', fontSize: 14, marginTop: 4 }}>
            Gerencie os membros da sua organização e seus níveis de acesso.
          </p>
        </div>
        <button
          onClick={() => setShowInvite(true)}
          style={{ background: '#111827', color: '#fff', border: 'none', borderRadius: 8, padding: '9px 18px', fontSize: 14, fontWeight: 500, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
        >
          <span>+</span> Convidar Usuário
        </button>
      </div>

      {/* Perfis de acesso */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 28 }}>
        {(Object.keys(ROLE_LABEL) as Role[]).map(role => (
          <div key={role} style={{ border: '1px solid #e5e7eb', borderRadius: 10, padding: 16, background: '#fff' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%', background: ROLE_COLOR[role] }} />
              <span style={{ fontWeight: 600, fontSize: 14, color: '#111' }}>{ROLE_LABEL[role]}</span>
              <span style={{ marginLeft: 'auto', fontSize: 12, color: '#6b7280', background: '#f3f4f6', borderRadius: 20, padding: '2px 8px' }}>
                {MOCK_USUARIOS.filter(u => u.role === role).length} usuário{MOCK_USUARIOS.filter(u => u.role === role).length !== 1 ? 's' : ''}
              </span>
            </div>
            <p style={{ fontSize: 12, color: '#6b7280', margin: 0, lineHeight: 1.5 }}>{ROLE_DESC[role]}</p>
          </div>
        ))}
      </div>

      {/* Filtro */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {(['todos', 'admin', 'gerenciamento', 'analista'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            style={{
              border: 'none', borderRadius: 20, padding: '5px 14px', fontSize: 13, cursor: 'pointer',
              background: filter === f ? '#111827' : '#f3f4f6',
              color: filter === f ? '#fff' : '#374151',
              fontWeight: filter === f ? 600 : 400,
            }}
          >
            {f === 'todos' ? 'Todos' : ROLE_LABEL[f]}
          </button>
        ))}
      </div>

      {/* Tabela */}
      <div style={{ border: '1px solid #e5e7eb', borderRadius: 10, overflow: 'hidden', background: '#fff' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
              <th style={{ padding: '10px 16px', textAlign: 'left', fontSize: 12, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Usuário</th>
              <th style={{ padding: '10px 16px', textAlign: 'left', fontSize: 12, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Perfil</th>
              <th style={{ padding: '10px 16px', textAlign: 'left', fontSize: 12, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Status</th>
              <th style={{ padding: '10px 16px', textAlign: 'left', fontSize: 12, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Desde</th>
              <th style={{ padding: '10px 16px' }} />
            </tr>
          </thead>
          <tbody>
            {filtered.map((u, i) => (
              <tr key={u.id} style={{ borderBottom: i < filtered.length - 1 ? '1px solid #f3f4f6' : 'none' }}>
                <td style={{ padding: '12px 16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 34, height: 34, borderRadius: '50%', background: '#e5e7eb', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 600, fontSize: 13, color: '#374151', flexShrink: 0 }}>
                      {u.nome.split(' ').map(n => n[0]).slice(0, 2).join('')}
                    </div>
                    <div>
                      <div style={{ fontWeight: 500, fontSize: 14, color: '#111' }}>{u.nome}</div>
                      <div style={{ fontSize: 12, color: '#6b7280' }}>{u.email}</div>
                    </div>
                  </div>
                </td>
                <td style={{ padding: '12px 16px' }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 500 }}>
                    <span style={{ width: 7, height: 7, borderRadius: '50%', background: ROLE_COLOR[u.role], display: 'inline-block' }} />
                    {ROLE_LABEL[u.role]}
                  </span>
                </td>
                <td style={{ padding: '12px 16px' }}>
                  <span style={{ fontSize: 12, fontWeight: 500, borderRadius: 20, padding: '2px 10px', ...Object.fromEntries(STATUS_STYLE[u.status].split(';').map(s => s.split(':').map(v => v.trim())).filter(p => p.length === 2).map(([k, v]) => [k === 'background' ? 'background' : k, v])) }}>
                    {u.status.charAt(0).toUpperCase() + u.status.slice(1)}
                  </span>
                </td>
                <td style={{ padding: '12px 16px', fontSize: 13, color: '#6b7280' }}>
                  {new Date(u.criadoEm).toLocaleDateString('pt-BR')}
                </td>
                <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                  <button style={{ background: 'none', border: '1px solid #e5e7eb', borderRadius: 6, padding: '4px 10px', fontSize: 12, color: '#374151', cursor: 'pointer' }}>
                    Editar
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Modal convidar */}
      {showInvite && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: '#fff', borderRadius: 12, padding: 28, width: 420, boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
            <h2 style={{ margin: '0 0 6px', fontSize: 17, fontWeight: 700 }}>Convidar Usuário</h2>
            <p style={{ margin: '0 0 20px', fontSize: 13, color: '#6b7280' }}>Um e-mail de convite será enviado para o endereço informado.</p>

            <label style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 4, color: '#374151' }}>E-mail</label>
            <input
              type="email"
              value={inviteEmail}
              onChange={e => setInviteEmail(e.target.value)}
              placeholder="usuario@empresa.com"
              style={{ width: '100%', border: '1px solid #d1d5db', borderRadius: 8, padding: '8px 12px', fontSize: 14, marginBottom: 16, boxSizing: 'border-box', outline: 'none' }}
            />

            <label style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 4, color: '#374151' }}>Perfil de acesso</label>
            <select
              value={inviteRole}
              onChange={e => setInviteRole(e.target.value as Role)}
              style={{ width: '100%', border: '1px solid #d1d5db', borderRadius: 8, padding: '8px 12px', fontSize: 14, marginBottom: 8, boxSizing: 'border-box', outline: 'none', background: '#fff' }}
            >
              {(Object.keys(ROLE_LABEL) as Role[]).map(r => (
                <option key={r} value={r}>{ROLE_LABEL[r]}</option>
              ))}
            </select>
            <p style={{ fontSize: 12, color: '#6b7280', margin: '0 0 20px' }}>{ROLE_DESC[inviteRole]}</p>

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setShowInvite(false)} style={{ background: 'none', border: '1px solid #e5e7eb', borderRadius: 8, padding: '8px 16px', fontSize: 13, cursor: 'pointer' }}>
                Cancelar
              </button>
              <button onClick={() => setShowInvite(false)} style={{ background: '#111827', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>
                Enviar Convite
              </button>
            </div>
          </div>
        </div>
      )}

      <p style={{ marginTop: 24, fontSize: 12, color: '#9ca3af', textAlign: 'center' }}>
        Mockup — funcionalidade em desenvolvimento
      </p>
    </div>
  );
}
