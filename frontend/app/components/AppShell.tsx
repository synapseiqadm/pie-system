'use client';

import { ImportProvider } from '../contexts/ImportContext';
import ImportToast from './ImportToast';
import Sidebar from './Sidebar';

export default function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <ImportProvider>
      <Sidebar />
      <main className="flex-1 overflow-auto">
        {children}
      </main>
      <ImportToast />
    </ImportProvider>
  );
}
