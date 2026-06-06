'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { AuthProvider } from '../contexts/AuthContext';
import { ImportProvider } from '../contexts/ImportContext';
import ImportToast from './ImportToast';
import Sidebar from './Sidebar';

const API_HOST = (process.env.NEXT_PUBLIC_API_URL || 'https://pie-system-production.up.railway.app');

function AuthFetchPatcher() {
  useEffect(() => {
    const original = window.fetch.bind(window);
    window.fetch = function patchedFetch(input, init) {
      const url = typeof input === 'string' ? input
        : input instanceof URL ? input.href
        : (input as Request).url;

      if (url.startsWith(API_HOST) || url.startsWith('http://localhost:3001')) {
        const token = localStorage.getItem('pie_token');
        if (token) {
          const headers = new Headers((init?.headers as HeadersInit | undefined) ?? {});
          if (!headers.has('Authorization')) {
            headers.set('Authorization', `Bearer ${token}`);
          }
          init = { ...init, headers };
        }
      }
      return original(input, init);
    };
    return () => { window.fetch = original; };
  }, []);
  return null;
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isLoginPage = pathname === '/login';

  if (isLoginPage) {
    return (
      <AuthProvider>
        {children}
      </AuthProvider>
    );
  }

  return (
    <AuthProvider>
      <AuthFetchPatcher />
      <ImportProvider>
        <Sidebar />
        <main className="flex-1 overflow-auto">
          {children}
        </main>
        <ImportToast />
      </ImportProvider>
    </AuthProvider>
  );
}
