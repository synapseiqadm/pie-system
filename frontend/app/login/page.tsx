'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../contexts/AuthContext';

export default function LoginPage() {
  const { login } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password);
      router.replace('/');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao fazer login');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      {/* background image */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/bg.png"
        alt=""
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', zIndex: 0 }}
      />
      {/* overlay */}
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(10,15,30,0.62)', zIndex: 1 }} />

      {/* card */}
      <div style={{ position: 'relative', zIndex: 2, width: '100%', maxWidth: 380, padding: '0 16px' }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div style={{ color: '#fff', fontWeight: 700, fontSize: 28, letterSpacing: 6 }}>PIE</div>
          <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13, marginTop: 4 }}>Plataforma de Inteligência Comercial</div>
        </div>

        <form
          onSubmit={handleSubmit}
          style={{
            background: 'rgba(255,255,255,0.10)',
            backdropFilter: 'blur(16px)',
            WebkitBackdropFilter: 'blur(16px)',
            border: '1px solid rgba(255,255,255,0.18)',
            borderRadius: 20,
            padding: '32px 32px',
            display: 'flex',
            flexDirection: 'column',
            gap: 20,
            boxShadow: '0 8px 40px rgba(0,0,0,0.4)',
          }}
        >
          <h1 style={{ color: '#fff', fontWeight: 600, fontSize: 17, textAlign: 'center', margin: 0 }}>
            Entrar na plataforma
          </h1>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={{ color: 'rgba(255,255,255,0.55)', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1 }}>
              Email
            </label>
            <input
              type="email"
              required
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="seu@email.com"
              style={{
                background: 'rgba(255,255,255,0.08)',
                border: '1px solid rgba(255,255,255,0.18)',
                borderRadius: 10,
                padding: '10px 12px',
                fontSize: 14,
                color: '#fff',
                outline: 'none',
              }}
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={{ color: 'rgba(255,255,255,0.55)', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1 }}>
              Senha
            </label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              style={{
                background: 'rgba(255,255,255,0.08)',
                border: '1px solid rgba(255,255,255,0.18)',
                borderRadius: 10,
                padding: '10px 12px',
                fontSize: 14,
                color: '#fff',
                outline: 'none',
              }}
            />
          </div>

          {error && (
            <div style={{ color: '#fca5a5', fontSize: 13, background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, padding: '8px 12px' }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              background: loading ? 'rgba(6,182,212,0.5)' : '#06b6d4',
              color: '#fff',
              border: 'none',
              borderRadius: 10,
              padding: '11px 0',
              fontSize: 14,
              fontWeight: 600,
              cursor: loading ? 'not-allowed' : 'pointer',
              boxShadow: '0 4px 20px rgba(6,182,212,0.35)',
              transition: 'background 0.2s',
            }}
          >
            {loading ? 'Entrando…' : 'Entrar'}
          </button>
        </form>
      </div>
    </div>
  );
}
