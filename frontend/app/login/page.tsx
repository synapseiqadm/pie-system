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
    <div
      className="min-h-screen flex items-center justify-end bg-cover bg-center bg-no-repeat"
      style={{ backgroundImage: "url('/bg.png')" }}
    >
      {/* overlay escuro para contraste */}
      <div className="absolute inset-0 bg-[#0a0f1e]/60" />

      <div className="relative z-10 w-full max-w-sm mr-16 flex flex-col gap-6">
        {/* logo */}
        <div className="text-left px-1">
          <span className="text-white font-bold text-3xl tracking-widest">PIE</span>
          <p className="text-white/50 text-sm mt-1">Plataforma de Inteligência Comercial</p>
        </div>

        {/* card */}
        <form
          onSubmit={handleSubmit}
          className="bg-white/10 backdrop-blur-md border border-white/20 rounded-2xl px-8 py-8 flex flex-col gap-5 shadow-2xl"
        >
          <h1 className="text-white font-semibold text-lg">Entrar na plataforma</h1>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-white/60 uppercase tracking-wide">Email</label>
            <input
              type="email"
              required
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="bg-white/10 border border-white/20 rounded-lg px-3 py-2.5 text-sm text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-cyan-400/40 focus:border-cyan-400/60"
              placeholder="seu@email.com"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-white/60 uppercase tracking-wide">Senha</label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="bg-white/10 border border-white/20 rounded-lg px-3 py-2.5 text-sm text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-cyan-400/40 focus:border-cyan-400/60"
              placeholder="••••••••"
            />
          </div>

          {error && (
            <p className="text-red-300 text-sm bg-red-500/20 border border-red-400/30 rounded-lg px-3 py-2">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="bg-cyan-500 hover:bg-cyan-400 text-white rounded-lg py-2.5 text-sm font-medium transition-colors disabled:opacity-60 shadow-lg shadow-cyan-500/30"
          >
            {loading ? 'Entrando…' : 'Entrar'}
          </button>
        </form>
      </div>
    </div>
  );
}
