'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';

type NavItem = { href: string; label: string; icon: string };

type NavGroup = {
  label: string;
  icon: string;
  children: NavItem[];
};

type NavEntry = NavItem | NavGroup;

const isGroup = (entry: NavEntry): entry is NavGroup => 'children' in entry;

const nav: NavEntry[] = [
  { href: '/', label: 'Dashboard', icon: '◈' },
  {
    label: 'Base Primária',
    icon: '🗄',
    children: [
      { href: '/base-primaria', label: 'Dashboard', icon: '◈' },
      { href: '/cnpjs', label: 'Consulta CNPJ', icon: '🔍' },
      { href: '/empresas', label: 'Empresas', icon: '🏢' },
      { href: '/estabelecimentos', label: 'Estabelecimentos', icon: '⊙' },
      { href: '/cnaes', label: 'CNAEs', icon: '⊞' },
      { href: '/naturezas', label: 'Naturezas Jurídicas', icon: '⊏' },
      { href: '/municipios', label: 'Municípios', icon: '⊐' },
      { href: '/motivos', label: 'Motivos', icon: '⊟' },
      { href: '/paises', label: 'Países', icon: '⊠' },
      { href: '/qualificacoes', label: 'Qualificações', icon: '⊡' },
    ],
  },
  { href: '/recortes', label: 'Segmentos', icon: '◎' },
  { href: '/enriquecimento', label: 'Enriquecimento', icon: '✦' },
  { href: '/leads', label: 'Leads', icon: '⭐' },
  {
    label: 'Campanhas',
    icon: '📣',
    children: [
      { href: '/campanhas', label: 'Visão Geral', icon: '◈' },
      { href: '/campanhas/whatsapp', label: 'WhatsApp', icon: '💬' },
      { href: '/campanhas/email', label: 'E-mail', icon: '✉' },
    ],
  },
];

const navBottom: NavEntry[] = [
  {
    label: 'Organização',
    icon: '⚙',
    children: [
      { href: '/organizacao/usuarios', label: 'Usuários', icon: '👤' },
      { href: '/organizacao/tokens', label: 'Tokens de API', icon: '🔑' },
    ],
  },
];

const BASE_PRIMARIA_PATHS = [
  '/base-primaria', '/empresas', '/estabelecimentos', '/cnaes',
  '/naturezas', '/municipios', '/motivos', '/paises', '/qualificacoes', '/cnpjs',
];

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { logout } = useAuth();
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({
    'Base Primária': BASE_PRIMARIA_PATHS.some((p) => pathname.startsWith(p)),
    'Organização': pathname.startsWith('/organizacao'),
  });

  const toggle = (label: string) =>
    setOpenGroups((prev) => ({ ...prev, [label]: !prev[label] }));

  const renderEntry = (entry: NavEntry) => {
    if (!isGroup(entry)) {
      const active = pathname === entry.href;
      return (
        <Link
          key={entry.href}
          href={entry.href}
          className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
            active
              ? 'bg-white/15 text-white font-medium'
              : 'text-white/50 hover:bg-white/8 hover:text-white'
          }`}
        >
          <span className="text-base">{entry.icon}</span>
          {entry.label}
        </Link>
      );
    }

    const isOpen = openGroups[entry.label] ?? false;
    const groupActive = entry.children.some((c) => pathname.startsWith(c.href));

    return (
      <div key={entry.label}>
        <button
          onClick={() => toggle(entry.label)}
          className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
            groupActive
              ? 'text-white font-medium'
              : 'text-white/50 hover:bg-white/8 hover:text-white'
          }`}
        >
          <span className="text-base">{entry.icon}</span>
          <span className="flex-1 text-left">{entry.label}</span>
          <span className={`text-xs transition-transform duration-200 ${isOpen ? 'rotate-90' : ''}`}>
            ›
          </span>
        </button>

        {isOpen && (
          <div className="ml-3 mt-0.5 flex flex-col gap-0.5 border-l border-white/10 pl-3">
            {entry.children.map((child) => {
              const active = pathname === child.href;
              return (
                <Link
                  key={child.href}
                  href={child.href}
                  className={`flex items-center gap-2 px-2 py-1.5 rounded-md text-xs transition-colors ${
                    active
                      ? 'bg-white/15 text-white font-medium'
                      : 'text-white/40 hover:bg-white/8 hover:text-white'
                  }`}
                >
                  <span>{child.icon}</span>
                  {child.label}
                </Link>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  return (
    <aside className="w-56 min-h-screen bg-[#0f1724] flex flex-col shrink-0">
      <div className="px-5 py-5 border-b border-white/10">
        <span className="text-white font-bold text-lg tracking-wide">PIE</span>
        <p className="text-white/40 text-xs mt-0.5">Inteligência Comercial</p>
      </div>

      <nav className="flex-1 px-3 py-4 flex flex-col gap-1">
        {nav.map(renderEntry)}
      </nav>

      <div className="px-3 pb-4">
        <div className="border-t border-white/10 pt-3 flex flex-col gap-1">
          {navBottom.map(renderEntry)}
          <button
            onClick={() => { logout(); router.replace('/login'); }}
            className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-white/40 hover:bg-white/8 hover:text-white transition-colors w-full text-left"
          >
            <span className="text-base">↩</span>
            Sair
          </button>
        </div>
      </div>
    </aside>
  );
}
