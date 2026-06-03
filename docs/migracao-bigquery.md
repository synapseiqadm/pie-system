# Migração Concluída: DuckDB/Parquet → BigQuery + PostgreSQL local → Neon

## Status: ✅ CONCLUÍDO em 2026-06-03

## Arquitetura atual (produção)

| Peça | Serviço | Detalhes |
|------|---------|----------|
| Frontend | Vercel — `pie-three.vercel.app` | Next.js 16, branch `dev` |
| Backend | Railway — `pie-system-production.up.railway.app` | NestJS 11, porta 3001 |
| App DB | Neon — `ep-muddy-sea-acsxxyfc-pooler.sa-east-1.aws.neon.tech` | PostgreSQL 16, São Paulo |
| Analytics | BigQuery — `pie-system-493218.receita_federal` | southamerica-east1 |
| Parquet/CSV files | GCS — `gs://pie-receita-uploads` | southamerica-east1 |

## Dados carregados no BigQuery (maio/2026)

| Tabela | Registros |
|--------|-----------|
| `receita_federal.estabelecimentos` | 71.314.044 |
| `receita_federal.empresas` | 68.081.781 |
| `receita_federal.socios` | 27.650.926 |

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

Carga inicial feita via Parquet local. Para atualizações subsequentes, ver seção **Atualização da Receita Federal** abaixo.

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
backend/src/app.module.ts       ← DATABASE_URL para Neon, schema: 'public', synchronize: true
backend/src/main.ts             ← CORS inclui pie-three.vercel.app
backend/src/ai/ai.service.ts    ← sugerirFiltros usa claude-sonnet-4-6
backend/src/cnaes/cnaes.service.ts  ← busca com public.unaccent() para accent-insensitive
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

### Modelos de IA

| Função | Modelo | Motivo |
|--------|--------|--------|
| `sugerirFiltros` | `claude-sonnet-4-6` | Contexto semântico rico — precisa conhecer CNAEs brasileiros |
| `gerarCandidatosSite` | `claude-haiku-4-5-20251001` | Chamada bulk, velocidade > qualidade |
| `validarSite` | `claude-haiku-4-5-20251001` | Chamada bulk, binário sim/não |

---

## Fase 4 — Migração PostgreSQL local → Neon ✅

```bash
# Export local (excluindo tabela estabelecimentos — 5.3 GB desnecessária)
docker exec pie-db-1 pg_dump -U pie -d pie --no-owner --no-acl \
  --exclude-table=estabelecimentos -f /tmp/backup_pie_neon_slim.sql
docker cp pie-db-1:/tmp/backup_pie_neon_slim.sql D:\dev\PIE\backup_pie_neon_slim.sql

# Import no Neon — usar psql -f DENTRO do container (evita corrupção de encoding no Windows)
docker cp D:\dev\PIE\backup_pie_neon_slim.sql pie-db-1:/tmp/backup_pie_neon_slim.sql
docker exec pie-db-1 psql "postgresql://neondb_owner:...@ep-muddy-sea-acsxxyfc-pooler.sa-east-1.aws.neon.tech/neondb?sslmode=require" -f /tmp/backup_pie_neon_slim.sql
```

**Observação:** A tabela `estabelecimentos` local (5.3 GB) não foi migrada para o Neon —
os dados estão no BigQuery. O banco app (Neon) contém apenas dados transacionais (~5 MB).

**Aviso de encoding:** Sempre usar `psql -f` DENTRO do container Docker para importar dados ao Neon.
`Get-Content | docker exec` corrompeu os acentos (PowerShell converte encoding).

---

## Fase 5 — Deploy cloud ✅

### Railway (backend)

- Repositório: `synapseiqadm/pie-system`, branch `dev`, root `/backend`
- Dockerfile multistage em `backend/Dockerfile`
- URL pública: `https://pie-system-production.up.railway.app`

### Vercel (frontend)

- Repositório: `synapseiqadm/pie-system`, branch `dev`, root `frontend`
- URL pública: `https://pie-three.vercel.app`
- A URL do backend está hardcoded como fallback em `frontend/src/services/api.ts`
  e nos arquivos de página em `frontend/app/`
- Para desenvolvimento local: criar `frontend/.env.local` com `NEXT_PUBLIC_API_URL=http://localhost:3001`

**Nota:** `NEXT_PUBLIC_*` vars no Vercel dashboard não funcionaram com Turbopack — URL está hardcoded no código como fallback de produção.

---

## Atualização da Receita Federal

Processo para quando a Receita Federal lançar novos dados (mensal):

```powershell
# 1. Extrair ZIPs para CSVs
New-Item -ItemType Directory -Force "D:\temp\receita_update\empresas"
New-Item -ItemType Directory -Force "D:\temp\receita_update\estabelecimentos"
New-Item -ItemType Directory -Force "D:\temp\receita_update\socios"

Get-ChildItem "D:\[pasta_zips]\Empresas*.zip" | ForEach-Object {
  Expand-Archive -Path $_.FullName -DestinationPath "D:\temp\receita_update\empresas\" -Force
}
Get-ChildItem "D:\[pasta_zips]\Socios*.zip" | ForEach-Object {
  Expand-Archive -Path $_.FullName -DestinationPath "D:\temp\receita_update\socios\" -Force
}
Get-ChildItem "D:\[pasta_zips]\Estabelecimentos*.zip" | ForEach-Object {
  Expand-Archive -Path $_.FullName -DestinationPath "D:\temp\receita_update\estabelecimentos\" -Force
}

# 2. Upload para GCS (substituir YYYY-MM pela competência)
gsutil -m cp "D:\temp\receita_update\empresas\*" gs://pie-receita-uploads/YYYY-MM/empresas/
gsutil -m cp "D:\temp\receita_update\socios\*" gs://pie-receita-uploads/YYYY-MM/socios/
gsutil -m cp "D:\temp\receita_update\estabelecimentos\*" gs://pie-receita-uploads/YYYY-MM/estabelecimentos/

# 3. Load no BigQuery (atômico — tabela antiga disponível até job terminar)
bq load --source_format=CSV --field_delimiter=";" --encoding=ISO-8859-1 --max_bad_records=100 --replace pie-system-493218:receita_federal.empresas "gs://pie-receita-uploads/YYYY-MM/empresas/*"
bq load --source_format=CSV --field_delimiter=";" --encoding=ISO-8859-1 --max_bad_records=100 --replace pie-system-493218:receita_federal.socios "gs://pie-receita-uploads/YYYY-MM/socios/*"
bq load --source_format=CSV --field_delimiter=";" --encoding=ISO-8859-1 --max_bad_records=100 --replace pie-system-493218:receita_federal.estabelecimentos "gs://pie-receita-uploads/YYYY-MM/estabelecimentos/*"

# 4. Limpar staging
Remove-Item -Recurse -Force "D:\temp\receita_update"
```

**Tabelas de referência** (Cnaes, Motivos, Municípios, Naturezas, Países, Qualificações):
Raramente mudam. Importar via UI do PIE (`/cnaes`, `/municipios`, etc.) quando necessário.

**Warnings esperados** no bq load de estabelecimentos:
- `CSV table references column position 29, but line contains only N columns` — linhas incompletas (normal na RF)
- `Bad character (ASCII 0)` — caracteres nulos em endereços internacionais (normal)
- Ambos são absorvidos pelo `--max_bad_records=100`

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
| GCS (storage ~25 GB) | ~$0.50/mês |
| **Total** | **~$10/mês** |
