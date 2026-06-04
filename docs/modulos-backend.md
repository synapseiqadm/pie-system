# Módulos do Backend

Cada módulo em `backend/src/` segue o padrão `controller + service + entity`.

## Mapa de módulos

| Módulo | Responsabilidade |
|--------|-----------------|
| `base-primaria` | Data Lake Receita Federal via BigQuery; `bigquery.service.ts`, `bigquery-upload.service.ts` (ZIP→GCS→BQ), `base-primaria.service.ts` (stats analíticas) |
| `recortes` | Criar/editar segmentos; query builder `buildWhere()` + `buildFrom()` (retorna tabela BQ); filtros como JSONB no Neon |
| `enriquecimento` | Web scraping + Google Places + IA; cache 30 dias por CNPJ; fases 1 (autoritativo) e 2 (heurístico+IA); SSE progress |
| `ai` | Anthropic SDK; `sugerirFiltros` (Sonnet), `gerarCandidatosSite` e `validarSite` (Haiku); RateLimiter 40 RPM |
| `leads` | Lead por recorte (cnpj + status + notas); UNIQUE(cnpj, recorteId) |
| `opportunities` | Pipeline de vendas; stages: `novo → contato → qualificado → proposta → sell_out` |
| `tenants` | Multi-tenancy (equipes) |
| `cnpjs` | Busca por CNPJ completo (14 dígitos) via BigQuery |
| `empresas` | CRUD administrativo local (tabela no Neon; dados master estão no BQ) |
| `estabelecimentos` | CRUD administrativo local (tabela no Neon; dados estão no BQ) |
| `impactos` | Rastreamento de impactos de leads em campanhas |
| `stats` | Import logs |
| `cnaes` | Tabela de referência no Neon; busca com `public.unaccent()` para accent-insensitive |
| `municipios / naturezas / qualificacoes / motivos / paises` | Tabelas de referência no Neon |

## Dados Receita Federal no BigQuery

| Tabela | Registros (maio/2026) | Clustering |
|--------|----------------------|------------|
| `receita_federal.estabelecimentos` | 71.314.044 | `situacao_cadastral, uf, cnae_fiscal_principal, codigo_municipio` |
| `receita_federal.empresas` | 68.081.781 | `cnpj_basico` |
| `receita_federal.socios` | 27.650.926 | `cnpj_basico` |

## Padrões importantes

- Raw SQL no Neon: sempre usar prefixo `public.` (ex: `FROM public.cnae`) — Neon não configura search_path por padrão
- BigQuery: queries concorrentes suportadas (diferente do DuckDB anterior)
- TypeORM `synchronize: true` — cria tabelas faltantes automaticamente no Neon
