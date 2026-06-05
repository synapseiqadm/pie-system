'use client';

import { usePathname } from 'next/navigation';
import { AuthProvider } from '../contexts/AuthContext';
import { ImportProvider } from '../contexts/ImportContext';
import ImportToast from './ImportToast';
import Sidebar from './Sidebar';

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
