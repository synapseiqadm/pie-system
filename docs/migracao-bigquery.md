# Migração Concluída: DuckDB/Parquet → BigQuery + PostgreSQL local → Neon

## Status: ✅ CONCLUÍDO em 2026-06-03

## Arquitetura atual (produção)

| Peça | Serviço | Detalhes |
|------|---------|----------|
| Frontend | Vercel — `pie-three.vercel.app` | Next.js 16, branch `dev` |
| Backend | Railway — `pie-system-production.up.railway.app` | NestJS 11, porta 3001 |
| App DB | Neon — `ep-muddy-sea-acsxxyfc-pooler.sa-east-1.aws.neon.tech` | PostgreSQL 16, São Paulo |
| Analytics | BigQuery — `pie-system-493218.receita_federal` | southamerica-east1 |
| Parquet files | GCS — `gs://pie-receita-uploads` | southamerica-east1 |

## Dados carregados no BigQuery

| Tabela | Registros |
|--------|-----------|
| `receita_federal.estabelecimentos` | 50.094.930 |
| `receita_federal.empresas` | 38.339.005 |
| `receita_federal.socios` | 20.191.500 |

Clustering: `estabelecimentos` → `situacao_cadastral, uf, cnae_fiscal_principal, codigo_municipio`

---

## Contexto (motivação original)

O PIE usava DuckDB em `:memory:` lendo ~4 GB de arquivos Parquet da Receita Federal localmente,
e PostgreSQL local para dados transacionais.

**Problemas resolvidos:**
- Queries analíticas lentas (30–120s) → agora 1–5s com clustering no BQ
- Conexão única do DuckDB serializava queries → BQ suporta concorrência
- Arquitetura local impedia deploy multi-usuário → agora 100% em cloud

---

## Fase 1 — GCP Setup ✅

**Projeto GCP:** `pie-system-493218`

### Recursos criados

```bash
# Service account
pie-bq-sa@pie-system-493218.iam.gserviceaccount.com

# Roles concedidos
roles/bigquery.jobUser    → nível de projeto
roles/bigquery.dataViewer → nível de projeto
roles/storage.objectAdmin → bucket pie-receita-uploads

# Bucket GCS
gs://pie-receita-uploads  (southamerica-east1)

# Dataset BigQuery
pie-system-493218:receita_federal  (southamerica-east1)
```

### Credenciais

A key da service account está em `backend/.env` como `GOOGLE_APPLICATION_CREDENTIALS_JSON`.
O arquivo `pie-bq-sa-key.json` está em `.gitignore` — não commitar.

---

## Fase 2 — Carga inicial dos dados ✅

```bash
# Upload Parquet → GCS
gsutil -m cp D:/dev/PIE/data/receita/estabelecimentos/*.parquet gs://pie-receita-uploads/estabelecimentos/
gsutil -m cp D:/dev/PIE/data/receita/empresas/*.parquet gs://pie-receita-uploads/empresas/
gsutil -m cp D:/dev/PIE/data/receita/socios/*.parquet gs://pie-receita-uploads/socios/

# Load GCS → BigQuery
bq load --source_format=PARQUET --replace pie-system-493218:receita_federal.estabelecimentos "gs://pie-receita-uploads/estabelecimentos/*.parquet"
bq load --source_format=PARQUET --replace pie-system-493218:receita_federal.empresas "gs://pie-receita-uploads/empresas/*.parquet"
bq load --source_format=PARQUET --replace pie-system-493218:receita_federal.socios "gs://pie-receita-uploads/socios/*.parquet"
```

Para futuras atualizações da Receita Federal: usar o endpoint `POST /base-primaria/upload/:tipo`
que faz ZIP → CSV temp → GCS → BQ Load Job (WRITE_TRUNCATE).

---

## Fase 3 — Migração do backend ✅

### Arquivos criados/modificados

```
backend/src/base-primaria/
  bigquery.service.ts           ← novo (substitui duckdb.service.ts)
  bigquery-upload.service.ts    ← novo (substitui parquet.service.ts)
  base-primaria.service.ts      ← queries migradas para BQ
  base-primaria.module.ts       ← providers atualizados
  base-primaria.controller.ts   ← usa BigQueryUploadService
  duckdb.service.ts             ← deletado
  parquet.service.ts            ← deletado

backend/src/recortes/recortes.service.ts     ← ILIKE→LIKE, SAFE_CAST, ORDER BY, refs BQ
backend/src/enriquecimento/enriquecimento.service.ts  ← duck/parquet → BigQueryService
backend/src/app.module.ts       ← DATABASE_URL para Neon
backend/src/main.ts             ← CORS inclui pie-three.vercel.app
```

### Principais adaptações de SQL (DuckDB → GoogleSQL)

| DuckDB | BigQuery |
|--------|----------|
| `read_parquet('*.parquet')` | `` `pie-system-493218.receita_federal.tabela` `` |
| `TRY_CAST(x AS FLOAT)` | `SAFE_CAST(x AS FLOAT64)` |
| `TRY_CAST(x AS BIGINT)` | `SAFE_CAST(x AS INT64)` |
| `COUNT(*)::int` | `CAST(COUNT(*) AS INT64)` |
| `printf('%08d', x)` | `FORMAT('%08d', CAST(x AS INT64))` |
| `ILIKE` | `LOWER(x) LIKE LOWER(y)` |
| `ORDER BY cnpj_basico` | `ORDER BY cnpj_basico, cnpj_ordem, cnpj_dv` |

### Variáveis de ambiente do backend

```env
ANTHROPIC_API_KEY=...
GOOGLE_PLACES_API_KEY=...
GOOGLE_CLOUD_PROJECT_ID=pie-system-493218
BIGQUERY_DATASET=receita_federal
GCS_BUCKET=pie-receita-uploads
GOOGLE_APPLICATION_CREDENTIALS_JSON={...json da service account...}
DATABASE_URL=postgresql://...@...neon.tech/neondb?sslmode=require
NODE_ENV=production
PORT=3001  (Railway injeta automaticamente)
```

---

## Fase 4 — Migração PostgreSQL local → Neon ✅

```bash
# Export local (excluindo tabela estabelecimentos — 5.3 GB desnecessária)
docker exec pie-db-1 pg_dump -U pie -d pie --no-owner --no-acl \
  --exclude-table=estabelecimentos -f /tmp/backup_pie_neon_slim.sql
docker cp pie-db-1:/tmp/backup_pie_neon_slim.sql D:\dev\PIE\backup_pie_neon_slim.sql

# Import no Neon
Get-Content backup_pie_neon_slim.sql | docker exec -i pie-db-1 psql "postgresql://neondb_owner:...@ep-muddy-sea-acsxxyfc-pooler.sa-east-1.aws.neon.tech/neondb?sslmode=require"
```

**Observação:** A tabela `estabelecimentos` local (5.3 GB) não foi migrada para o Neon —
os dados já estão no BigQuery. O banco app (Neon) contém apenas dados transacionais:
recortes, leads, oportunidades, enriquecimento, cache de sites, tabelas de referência (~5 MB).

---

## Fase 5 — Deploy cloud ✅

### Railway (backend)

- Repositório: `synapseiqadm/pie-system`, branch `dev`, root `/backend`
- Dockerfile multistage em `backend/Dockerfile`
- URL pública: `https://pie-system-production.up.railway.app`
- Variáveis configuradas no painel Railway

### Vercel (frontend)

- Repositório: `synapseiqadm/pie-system`, branch `dev`, root `frontend`
- Framework: Next.js (auto-detectado)
- URL pública: `https://pie-three.vercel.app`
- A URL do backend está em `frontend/src/services/api.ts` e nos arquivos de página em `frontend/app/`
- Para desenvolvimento local: criar `frontend/.env.local` com `NEXT_PUBLIC_API_URL=http://localhost:3001`

---

## Estimativa de performance (resultado real)

| Endpoint | Antes (DuckDB local) | Depois (BigQuery) |
|----------|---------------------|-------------------|
| `overview` | 60–120s | ~3s |
| `analise/uf` | 30–60s | ~2s |
| `executar` recorte | 20–60s | 1–3s |

## Estimativa de custo mensal

| Serviço | Custo |
|---------|-------|
| Railway | ~$5/mês |
| Neon | Free tier |
| Vercel | Free tier |
| BigQuery (queries) | ~$3–8/mês |
| GCS (storage 4 GB) | ~$0.10/mês |
| **Total** | **~$10/mês** |
