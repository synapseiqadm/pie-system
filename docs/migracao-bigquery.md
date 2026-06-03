# Plano de Migração: DuckDB/Parquet → BigQuery + PostgreSQL local → Neon

## Contexto

O PIE usa DuckDB em `:memory:` lendo ~4 GB de arquivos Parquet da Receita Federal localmente,
e PostgreSQL local para dados transacionais (recortes, leads, oportunidades, enriquecimento).

**Problemas que motivam a migração:**
- Queries analíticas lentas (30–120s) consumindo CPU/RAM do container
- Conexão única do DuckDB — queries de múltiplos usuários ficam serializadas
- Arquitetura local impede deploy multi-usuário em cloud

## Visão geral das fases

```
Fase 1: GCP Setup           (~2h)   infra e credenciais
Fase 2: Carga inicial BQ    (~3h)   dados Receita Federal → BigQuery
Fase 3: Migração backend    (~3-4d) substituir DuckDB por BQ client
Fase 4: Migração PostgreSQL (~2h)   local → Neon
Fase 5: Deploy cloud        (~1-2d) Railway + Vercel
```

---

## Fase 1 — GCP Setup

**Projeto GCP:** `pie-system-493218`

### 1.1 Habilitar APIs

```bash
gcloud services enable bigquery.googleapis.com \
  storage.googleapis.com \
  iam.googleapis.com \
  --project=pie-system-493218
```

### 1.2 Criar Service Account

```bash
gcloud iam service-accounts create pie-bq-sa \
  --display-name="PIE BigQuery Service Account" \
  --project=pie-system-493218
```

Conceder acesso no escopo do **dataset**, não do projeto inteiro:

```bash
# jobUser no projeto (necessário para criar jobs BQ)
gcloud projects add-iam-policy-binding pie-system-493218 \
  --member="serviceAccount:pie-bq-sa@pie-system-493218.iam.gserviceaccount.com" \
  --role="roles/bigquery.jobUser"

# dataEditor no dataset receita_federal (após criar o dataset na 1.3)
bq add-iam-policy-binding \
  --member="serviceAccount:pie-bq-sa@pie-system-493218.iam.gserviceaccount.com" \
  --role="roles/bigquery.dataEditor" \
  pie-system-493218:receita_federal

# objectAdmin no bucket (após criar o bucket na 1.3)
gsutil iam ch \
  serviceAccount:pie-bq-sa@pie-system-493218.iam.gserviceaccount.com:roles/storage.objectAdmin \
  gs://pie-receita-uploads
```

Baixar JSON da key:

```bash
gcloud iam service-accounts keys create ./pie-bq-sa-key.json \
  --iam-account=pie-bq-sa@pie-system-493218.iam.gserviceaccount.com \
  --project=pie-system-493218
```

> O conteúdo de `pie-bq-sa-key.json` vira a variável `GOOGLE_APPLICATION_CREDENTIALS_JSON`.
> Não commitar este arquivo — já está no `.gitignore`.

### 1.3 Criar infraestrutura

```bash
# Bucket GCS
gcloud storage buckets create gs://pie-receita-uploads \
  --location=southamerica-east1 \
  --project=pie-system-493218

# Dataset BigQuery
bq --location=southamerica-east1 mk \
  --dataset pie-system-493218:receita_federal
```

Criar tabelas com clustering (executar no BigQuery Console ou via `bq mk --table`):

```sql
-- estabelecimentos
CREATE TABLE IF NOT EXISTS `pie-system-493218.receita_federal.estabelecimentos` (
  cnpj_basico STRING,
  cnpj_ordem STRING,
  cnpj_dv STRING,
  identificador_matriz_filial STRING,
  nome_fantasia STRING,
  situacao_cadastral STRING,
  data_situacao_cadastral STRING,
  motivo_situacao_cadastral STRING,
  nome_cidade_exterior STRING,
  codigo_pais STRING,
  data_inicio_atividade STRING,
  cnae_fiscal_principal STRING,
  cnae_fiscal_secundaria STRING,
  tipo_logradouro STRING,
  logradouro STRING,
  numero STRING,
  complemento STRING,
  bairro STRING,
  cep STRING,
  uf STRING,
  codigo_municipio STRING,
  ddd_1 STRING,
  telefone_1 STRING,
  ddd_2 STRING,
  telefone_2 STRING,
  ddd_fax STRING,
  fax STRING,
  correio_eletronico STRING,
  situacao_especial STRING,
  data_situacao_especial STRING
)
CLUSTER BY situacao_cadastral, uf, cnae_fiscal_principal, codigo_municipio;

-- empresas
CREATE TABLE IF NOT EXISTS `pie-system-493218.receita_federal.empresas` (
  cnpj_basico STRING,
  razao_social STRING,
  natureza_juridica STRING,
  qualificacao_responsavel STRING,
  capital_social STRING,
  porte STRING,
  ente_federativo_responsavel STRING
)
CLUSTER BY cnpj_basico;

-- socios
CREATE TABLE IF NOT EXISTS `pie-system-493218.receita_federal.socios` (
  cnpj_basico STRING,
  identificador_socio STRING,
  nome_socio STRING,
  cpf_cnpj_socio STRING,
  qualificacao_socio STRING,
  data_entrada_sociedade STRING,
  pais STRING,
  representante_legal STRING,
  nome_representante STRING,
  qualificacao_representante_legal STRING,
  faixa_etaria STRING
)
CLUSTER BY cnpj_basico;
```

> **Ordem do CLUSTER BY importa:** `situacao_cadastral` primeiro porque quase todas as queries
> filtram `situacao_cadastral = '02'` (apenas ativos). Depois `uf`, `cnae_fiscal_principal`,
> `codigo_municipio`. BigQuery permite até 4 colunas de clustering.

---

## Fase 2 — Carga inicial dos dados

Os Parquet locais já existem em `D:/dev/PIE/data/receita/`.

```bash
# Upload ao GCS
gsutil -m cp D:/dev/PIE/data/receita/estabelecimentos/*.parquet \
  gs://pie-receita-uploads/estabelecimentos/

gsutil -m cp D:/dev/PIE/data/receita/empresas/*.parquet \
  gs://pie-receita-uploads/empresas/

gsutil -m cp D:/dev/PIE/data/receita/socios/*.parquet \
  gs://pie-receita-uploads/socios/

# Load no BigQuery (--replace garante idempotência — re-executar é seguro)
bq load --source_format=PARQUET --replace \
  pie-system-493218:receita_federal.estabelecimentos \
  "gs://pie-receita-uploads/estabelecimentos/*.parquet"

bq load --source_format=PARQUET --replace \
  pie-system-493218:receita_federal.empresas \
  "gs://pie-receita-uploads/empresas/*.parquet"

bq load --source_format=PARQUET --replace \
  pie-system-493218:receita_federal.socios \
  "gs://pie-receita-uploads/socios/*.parquet"
```

Verificar carga:

```bash
bq show pie-system-493218:receita_federal.estabelecimentos
bq show pie-system-493218:receita_federal.empresas
bq show pie-system-493218:receita_federal.socios
```

Uploads futuros de novos ZIPs da Receita Federal usarão BQ Load Jobs via API (pipeline da Fase 3).

---

## Fase 3 — Migração do backend (DuckDB → BigQuery)

### 3.1 Dependências

```bash
cd backend
npm uninstall duckdb
npm install @google-cloud/bigquery @google-cloud/storage
```

### 3.2 Novos arquivos

| Arquivo | Substitui | Responsabilidade |
|---------|-----------|-----------------|
| `base-primaria/bigquery.service.ts` | `duckdb.service.ts` | Client BQ, método `query<T>()` |
| `base-primaria/bigquery-upload.service.ts` | `parquet.service.ts` | ZIP → GCS → BQ Load Job |

### 3.3 Implementação do `BigQueryService`

```typescript
import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { BigQuery } from '@google-cloud/bigquery';

@Injectable()
export class BigQueryService implements OnModuleInit {
  private readonly logger = new Logger(BigQueryService.name);
  private bq: BigQuery;

  onModuleInit() {
    this.bq = new BigQuery({
      projectId: process.env.GOOGLE_CLOUD_PROJECT_ID,
      credentials: JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON),
    });
    this.logger.log('BigQuery client inicializado');
  }

  async query<T = Record<string, unknown>>(sql: string): Promise<T[]> {
    const [rows] = await this.bq.query({ query: sql, useLegacySql: false });
    return rows as T[];
  }
}
```

> Railway não cria arquivos a partir de secrets. Passar `credentials` diretamente como objeto JSON
> elimina a dependência de `GOOGLE_APPLICATION_CREDENTIALS` como path de arquivo.

### 3.4 Pipeline de upload — antes e depois

```
Antes:  ZIP → CSV (temp) → DuckDB COPY TO → .parquet local
Depois: ZIP → CSV (temp) → GCS upload    → BQ Load Job (WRITE_TRUNCATE)
```

Configuração do BQ Load Job para CSV da Receita Federal:

```typescript
{
  sourceFormat: 'CSV',
  fieldDelimiter: ';',
  encoding: 'ISO-8859-1',
  maxBadRecords: 100,
  writeDisposition: 'WRITE_TRUNCATE',
  skipLeadingRows: 0,
}
```

> `WRITE_TRUNCATE` (não `WRITE_APPEND`) porque os dados da Receita Federal são snapshots completos.
> A tabela antiga permanece disponível durante o Load Job — substituição é atômica.

### 3.5 Ajustes de SQL — mapeamento completo (GoogleSQL)

#### Tipos e funções

| DuckDB (atual) | BigQuery GoogleSQL | Ocorre em |
|---|---|---|
| `read_parquet('.../*.parquet')` | `` `pie-system-493218.receita_federal.tabela` `` | recortes.service.ts, base-primaria.service.ts |
| `TRY_CAST(x AS FLOAT)` | `SAFE_CAST(x AS FLOAT64)` | recortes.service.ts:112 |
| `TRY_CAST(x AS BIGINT)` | `SAFE_CAST(x AS INT64)` | recortes.service.ts:337 |
| `TRY_CAST(x AS INTEGER)` | `SAFE_CAST(x AS INT64)` | base-primaria.service.ts:240 |
| `COUNT(*)::int` | `CAST(COUNT(*) AS INT64)` | base-primaria.service.ts (múltiplos) |
| `printf('%08d', x)` | `FORMAT('%08d', CAST(x AS INT64))` | base-primaria.service.ts:240 |
| `NULLIF`, `TRIM`, `COALESCE` | iguais — BQ suporta ✓ | — |
| `QUALIFY ROW_NUMBER() OVER` | igual — BQ suporta ✓ | — |
| `CASE WHEN`, `UNION ALL` | iguais — BQ suporta ✓ | — |

#### Substituição de ILIKE

O BigQuery (GoogleSQL) não possui `ILIKE`:

```sql
-- Caso 1: ambos os lados já em lowercase — só trocar palavra-chave
-- recortes.service.ts:72 (bairros)
TRIM(LOWER(e.bairro)) LIKE '%${b.toLowerCase()}%'

-- Caso 2: input do usuário sem toLowerCase — base-primaria.service.ts:180,:209
LOWER(cnpj_basico) LIKE LOWER('%${search}%') OR LOWER(razao_social) LIKE LOWER('%${search}%')
```

> Os arquivos `cnaes.service.ts`, `municipios.service.ts`, `empresas.service.ts`,
> `cnpjs.service.ts`, `estabelecimentos.service.ts` usam `ILIKE` em queries PostgreSQL —
> fora do escopo desta migração, permanecem intactos.

#### ORDER BY determinístico na paginação

| Query | Correção |
|-------|----------|
| `executar()` recortes.service.ts:244 | `ORDER BY e.cnpj_basico, e.cnpj_ordem, e.cnpj_dv` |
| `exportarCsv()` recortes.service.ts:379 | `ORDER BY e.cnpj_basico, e.cnpj_ordem, e.cnpj_dv` |

### 3.6 Variáveis de ambiente

```env
# Adicionar
GOOGLE_CLOUD_PROJECT_ID=pie-system-493218
BIGQUERY_DATASET=receita_federal
GCS_BUCKET=pie-receita-uploads
GOOGLE_APPLICATION_CREDENTIALS_JSON={"type":"service_account","project_id":"pie-system-493218",...}

# Remover
RECEITA_DATA_DIR=...
```

### 3.7 Arquivos a modificar

```
backend/src/base-primaria/
  duckdb.service.ts           → deletar
  parquet.service.ts          → deletar
  bigquery.service.ts         → criar (novo)
  bigquery-upload.service.ts  → criar (novo)
  base-primaria.service.ts    → ILIKE, CAST, FORMAT, refs de tabela BQ
  base-primaria.module.ts     → trocar providers

backend/src/recortes/
  recortes.service.ts         → ILIKE→LIKE, SAFE_CAST, ORDER BY, refs de tabela BQ
  recortes.module.ts          → trocar imports

backend/src/enriquecimento/
  enriquecimento.service.ts   → refs de tabela BQ (usa read_parquet e QUALIFY)

backend/.env                  → novas vars GCP, remover RECEITA_DATA_DIR
backend/package.json          → trocar duckdb por @google-cloud/bigquery
```

---

## Fase 4 — Migração PostgreSQL local → Neon

**Neon** é um PostgreSQL serverless com branching, free tier generoso e região São Paulo.

### 4.1 Criar projeto no Neon

1. Acessar [neon.tech](https://neon.tech) → New Project
2. Nome: `pie-prod`
3. Região: **AWS South America (São Paulo) — sa-east-1**
4. PostgreSQL version: 16

### 4.2 Exportar banco local

```bash
pg_dump -h 127.0.0.1 -U pie -d pie \
  --no-owner --no-acl \
  -f backup_pie_neon.sql
```

> `--no-owner --no-acl` evita erros de permissão ao importar no Neon (owner será `neondb_owner`).

### 4.3 Importar no Neon

```bash
# Connection string disponível no painel Neon → Connection Details → psql
psql "postgresql://[user]:[password]@[host].neon.tech/neondb?sslmode=require" \
  < backup_pie_neon.sql
```

### 4.4 Atualizar variáveis de ambiente

```env
# antes (local)
DB_HOST=127.0.0.1
DB_PORT=5432
DB_USER=pie
DB_PASSWORD=pie
DB_NAME=pie

# depois (Neon)
DATABASE_URL=postgresql://[user]:[password]@[host].neon.tech/neondb?sslmode=require
```

Ajustar `backend/src/app.module.ts` (TypeORM config) para ler `DATABASE_URL` diretamente:

```typescript
TypeOrmModule.forRoot({
  type: 'postgres',
  url: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  entities: [...],
  synchronize: process.env.NODE_ENV !== 'production',
})
```

### 4.5 Verificar conexão local com Neon

```bash
# No backend local, trocar .env e subir:
npm run start:dev
# Checar que migrations/sync rodam sem erro e os dados estão presentes
```

---

## Fase 5 — Deploy cloud

### Stack

| Peça | Hoje | Proposta | Custo est. |
|------|------|----------|-----------|
| Frontend | Next.js local | **Vercel** | Free tier |
| Backend | NestJS Docker | **Railway** | ~$5/mês |
| App DB | PostgreSQL local | **Neon** (São Paulo) | Free tier |
| Analytics | DuckDB + Parquet | **BigQuery** (southamerica-east1) | ~$1–5/mês |
| Parquet files | Disco local | **GCS bucket** | ~$0.10/mês |

**Custo total estimado: ~$10/mês** para poucos usuários simultâneos.

### 5.1 Frontend → Vercel

1. Conectar repositório GitHub ao Vercel
2. Trocar URL hardcoded em `frontend/src/services/api.ts`:
   ```typescript
   const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';
   ```
3. Definir `NEXT_PUBLIC_API_URL` no painel Vercel

### 5.2 Backend → Railway

1. Criar projeto Railway com `Dockerfile` existente (sem alterações)
2. Definir variáveis de ambiente no painel Railway:
   - `DATABASE_URL` → connection string do Neon
   - `GOOGLE_CLOUD_PROJECT_ID`, `BIGQUERY_DATASET`, `GCS_BUCKET`
   - `GOOGLE_APPLICATION_CREDENTIALS_JSON` → conteúdo completo do JSON da service account
   - `ANTHROPIC_API_KEY`, `GOOGLE_PLACES_API_KEY`
3. Região: **US East (Virginia)** — mais próxima de São Paulo disponível no Railway

---

## Estimativa de performance pós-migração

| Query | DuckDB local | BigQuery (com clustering) |
|-------|-------------|--------------------------|
| `porUf()` | 30–60s | 2–4s |
| `analiseFromFiltros()` | 60–120s | 2–5s |
| `executar()` recorte | 20–60s | 1–3s |
| detalhe CNPJ | 2–5s | <1s |
| `browseEmpresas()` | 10–20s | 1–2s |

---

## Estimativa de custo BigQuery (on-demand)

| Operação | Dados lidos | Custo por query |
|----------|------------|----------------|
| Scan completo estabelecimentos | 3 GB | ~$0.015 |
| Query com filtro UF (clustering) | ~110 MB | ~$0.0005 |
| Query com filtro UF + CNAE | ~20 MB | ~$0.0001 |
| Storage 4 GB/mês | — | ~$0.08/mês |

Para 200 queries/dia com filtros típicos: **~$3–8/mês**.
