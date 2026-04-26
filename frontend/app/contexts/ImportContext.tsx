'use client';

import { createContext, useContext, useState, useCallback, useRef } from 'react';

export type ImportProgress = {
  processed: number;
  inserted: number;
  updated: number;
  errors: number;
  done: boolean;
  percent: number;
  bytesRead: number;
  totalBytes: number;
};

export type ImportJob = {
  key: string;
  label: string;
  filename: string;
  progress: ImportProgress;
  startedAt: Date;
  notified: boolean;
};

type ImportContextType = {
  jobs: Record<string, ImportJob>;
  startImport: (key: string, label: string, response: Response, filename?: string) => void;
  cancelImport: (key: string) => void;
  dismissJob: (key: string) => void;
  clearDone: () => void;
};

const ImportContext = createContext<ImportContextType | null>(null);

export function ImportProvider({ children }: { children: React.ReactNode }) {
  const [jobs, setJobs] = useState<Record<string, ImportJob>>({});
  const jobsRef = useRef<Record<string, ImportJob>>({});

  const setJob = useCallback((key: string, updater: (prev: ImportJob) => ImportJob) => {
    setJobs((prev) => {
      const next = { ...prev, [key]: updater(prev[key]) };
      jobsRef.current = next;
      return next;
    });
  }, []);

  const startImport = useCallback((key: string, label: string, response: Response, filename = '') => {
    const initial: ImportJob = {
      key, label, filename,
      progress: { processed: 0, inserted: 0, updated: 0, errors: 0, done: false, percent: 0, bytesRead: 0, totalBytes: 0 },
      startedAt: new Date(),
      notified: false,
    };
    setJobs((prev) => {
      const next = { ...prev, [key]: initial };
      jobsRef.current = next;
      return next;
    });

    // Read stream in background — survives page navigation
    (async () => {
      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          const parts = buf.split('\n\n');
          buf = parts.pop() ?? '';
          for (const part of parts) {
            const line = part.replace(/^data:\s*/, '').trim();
            if (!line) continue;
            try {
              const p = JSON.parse(line) as ImportProgress;
              setJob(key, (prev) => ({
                ...prev,
                progress: p,
                notified: p.done ? false : prev.notified, // reset so toast shows
              }));
            } catch { /* ignore */ }
          }
        }
      } catch { /* stream closed */ }
    })();
  }, [setJob]);

  const cancelImport = useCallback((key: string) => {
    fetch(`http://localhost:3001/${key}/upload/cancel`, { method: 'POST' }).catch(() => {});
  }, []);

  const dismissJob = useCallback((key: string) => {
    setJobs((prev) => {
      const next = { ...prev };
      delete next[key];
      jobsRef.current = next;
      return next;
    });
  }, []);

  const clearDone = useCallback(() => {
    setJobs((prev) => {
      const next = Object.fromEntries(
        Object.entries(prev).filter(([, j]) => !j.progress.done),
      );
      jobsRef.current = next;
      return next;
    });
  }, []);

  return (
    <ImportContext.Provider value={{ jobs, startImport, cancelImport, dismissJob, clearDone }}>
      {children}
    </ImportContext.Provider>
  );
}

export function useImport() {
  const ctx = useContext(ImportContext);
  if (!ctx) throw new Error('useImport must be used inside ImportProvider');
  return ctx;
}
