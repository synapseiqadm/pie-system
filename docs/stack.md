# Stack Tecnológica

## Serviços em produção

| Camada | Serviço | URL |
|--------|---------|-----|
| Frontend | Vercel | `https://pie-three.vercel.app` |
| Backend | Railway | `https://pie-system-production.up.railway.app` |
| App DB | Neon (PostgreSQL 16, São Paulo) | `ep-muddy-sea-acsxxyfc-pooler.sa-east-1.aws.neon.tech` |
| Analytics | BigQuery `pie-system-493218.receita_federal` | southamerica-east1 |
| Storage | GCS `gs://pie-receita-uploads` | southamerica-east1 |

## Tecnologias

**Backend:** NestJS 11 + TypeScript 5.7 + TypeORM 0.3 + Express  
**Frontend:** Next.js 16 (App Router) + React 19 + TypeScript 5 + Tailwind CSS 4  
**Banco app:** Neon PostgreSQL 16 — dados transacionais (recortes, leads, oportunidades, enriquecimento)  
**Analytics:** BigQuery — 71M estabelecimentos, 68M empresas, 27M sócios (maio/2026)

## IA

| Função | Modelo | Motivo |
|--------|--------|--------|
| `sugerirFiltros` | `claude-sonnet-4-6` | Contexto semântico rico, conhecimento de CNAEs |
| `gerarCandidatosSite` | `claude-haiku-4-5-20251001` | Bulk, velocidade > qualidade |
| `validarSite` | `claude-haiku-4-5-20251001` | Bulk, binário sim/não |

Rate limit: 40 RPM (sliding window). Sem key: fallback textual gracioso.

## Integrações externas

- **Anthropic Claude API** — sugestão de filtros (Sonnet), geração de candidatos e validação de site (Haiku)
- **Google Places API** (`GOOGLE_PLACES_API_KEY`) — Módulo 1 (Endereço): 3 queries em cascata com score multi-âncora; Módulo 3 (Site): Fase 1, retorna `websiteUri`, telefone, rating, status, endereço, `primaryType`. Timeout 8s. Sem key: etapa pulada.
- **Web scraping próprio** — HEAD/GET com `User-Agent: PIE-bot/1.0`, timeout 6–8s; extrai title, description, redes sociais, WhatsApp, telefones BR

## GCP

- Projeto: `pie-system-493218`
- Service account: `pie-bq-sa@pie-system-493218.iam.gserviceaccount.com`
- Roles: `bigquery.jobUser` + `bigquery.dataViewer` (projeto) + `storage.objectAdmin` (bucket)
- Key: variável `GOOGLE_APPLICATION_CREDENTIALS_JSON` no Railway — não commitar

## Variáveis de ambiente (Railway)

```env
ANTHROPIC_API_KEY=...
GOOGLE_PLACES_API_KEY=...
GOOGLE_CLOUD_PROJECT_ID=pie-system-493218
BIGQUERY_DATASET=receita_federal
GCS_BUCKET=pie-receita-uploads
GOOGLE_APPLICATION_CREDENTIALS_JSON={...json da service account...}
DATABASE_URL=postgresql://...@...neon.tech/neondb?sslmode=require
NODE_ENV=production
PORT=3001
SITE_CACHE_TTL_DAYS=30         # TTL do cache enrichment_data (padrão: 30)
CONTACT_SHARED_THRESHOLD=5     # Módulo 2: limiar de telefone/email compartilhado
```

## Desenvolvimento local

```env
# frontend/.env.local
NEXT_PUBLIC_API_URL=http://localhost:3001
```

TypeORM usa `synchronize: true` — esquema sincroniza automaticamente no startup.  
PostgreSQL local: `pie/pie@127.0.0.1:5432/pie` (Docker Compose).

> `NEXT_PUBLIC_*` vars no Vercel dashboard não funcionam com Turbopack — URL do backend está hardcoded como fallback em `frontend/src/services/api.ts`.
