'use client'

import { useEffect, useState } from 'react'
import { getLeads } from '@/services/api'

export default function Home() {
  const [leads, setLeads] = useState<any[]>([])

  useEffect(() => {
    getLeads().then(setLeads)
  }, [])

  return (
    <main>
      <h1>PIE - Leads</h1>

      <ul>
        {leads.map((lead) => (
          <li key={lead.id}>
            {lead.nome} - {lead.cnpj}
          </li>
        ))}
      </ul>
    </main>
  )
}