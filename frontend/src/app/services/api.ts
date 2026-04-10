const API_URL = 'http://localhost:4000'

export async function getLeads() {
  const res = await fetch(`${API_URL}/leads`)
  return res.json()
}