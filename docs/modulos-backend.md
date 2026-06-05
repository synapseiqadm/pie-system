# Módulos do Backend

Cada módulo em `backend/src/` segue o padrão `controller + service + entity`.

## Mapa de módulos

| Módulo | Responsabilidade |
|--------|-----------------|
| `base-primaria` | Data Lake Receita Federal via BigQuery; `bigquery.service.ts`, `bigquery-upload.service.ts` (ZIP→GCS→BQ), `base-primaria.service.ts` (stats analíticas) |
| `recortes` | Criar/editar segmentos; query builder `buildWhere()` + `buildFrom()` + `buildEmpresasJoin()` (retorna refs BQ); filtros como JSONB no Neon |
| `enriquecimento` | 5 módulos de enriquecimento + módulo de telefone; ver `docs/enriquecimento.md` |
| `ai` | Anthropic SDK; `sugerirFiltros` (Sonnet), `gerarCandidatosSite` e `validarSite` (Haiku); RateLimiter 40 RPM |
| `leads` | Lead por recorte (cnpj + status + notas); UNIQUE(cnpj, recorteId) |
| `opportunities` | Pipeline de vendas; stages: `novo → contato → qualificado → proposta → sell_out` |
| `tenants` | Multi-tenancy (equipes) |
| `cnpjs` | Busca por CNPJ completo (14 dígitos) via BigQuery |
| `empresas` | CRUD administrativo local (tabela no Neon; dados master estão no BQ) |
| `estabelecimentos` | CRUD administrativo local (tabela no Neon; dados estão no BQ) |
| `impactos` | Rastreamento de impactos de leads em campanhas |
| `cnaes` | Tabela de referência no Neon; busca com `public.unaccent()` para accent-insensitive |
| `municipios / naturezas / qualificacoes / motivos / paises` | Tabelas de referência no Neon |

## Módulo enriquecimento — endpoints

| Endpoint | Módulo | Descrição |
|---|---|---|
| `POST /enriquecimento/:id/telefone` | Telefone | Stats de classificação celular/fixo/inválido |
| `GET  /enriquecimento/:id/telefone` | Telefone | Rows paginadas |
| `POST /enriquecimento/:id/site` | 3 — Presença Digital | Batch SSE (Places + scraping + IA) |
| `POST /enriquecimento/:id/site/revalidar` | 3 | Revalida encontrados com IA |
| `GET  /enriquecimento/:id/site` | 3 | Browse paginado |
| `GET  /enriquecimento/:id/site/map` | 3 | `{ cnpj → PresencaDigital }` para tabela |
| `POST /enriquecimento/:id/endereco` | 1 — Endereço | Batch SSE (Places cascata + score multi-âncora) |
| `GET  /enriquecimento/:id/endereco` | 1 | Browse paginado |
| `POST /enriquecimento/:id/contato` | 2 — Contato PJ | Batch SSE (detecção terceiro, zero API externa) |
| `GET  /enriquecimento/:id/contato` | 2 | Browse paginado |
| `POST /enriquecimento/:id/socio` | 4 — Sócio | Batch SSE (JOIN socios BQ + email por domínio) |
| `GET  /enriquecimento/:id/socio` | 4 | Browse paginado |
| `POST /enriquecimento/:id/outbound` | 5 — Outbound-Ready | Batch SSE (consolidação pura, zero API) |
| `GET  /enriquecimento/:id/outbound` | 5 | Browse com filtros (minScore, emailScore, etc.) |
| `GET  /enriquecimento/:id/outbound/export` | 5 | JSON completo, exclui DNC |

## Dados Receita Federal no BigQuery

| Tabela | Registros (maio/2026) | Clustering |
|--------|----------------------|------------|
| `receita_federal.estabelecimentos` | 71.314.044 | `situacao_cadastral, uf, cnae_fiscal_principal, codigo_municipio` |
| `receita_federal.empresas` | 68.081.781 | `cnpj_basico` |
| `receita_federal.socios` | 27.650.926 | `cnpj_basico` |

## Tabelas Neon (enriquecimento)

| Tabela | Status | Papel |
|---|---|---|
| `enrichment_data` | ativa | Fonte de verdade EAV — todos os módulos |
| `site_enriquecimento` | ativa (débito) | Job tracking M3 + campos UI duplicados |
| `address_enriquecimento` | ativa | Job tracking M1 |
| `contact_enriquecimento` | ativa | Job tracking M2 |
| `socio_enriquecimento` | ativa | Job tracking M4 |
| `outbound_enriquecimento` | ativa | Perfil consolidado M5 |

## Padrões importantes

- Raw SQL no Neon: sempre usar prefixo `public.` (ex: `FROM public.cnae`) — Neon não configura search_path
- BigQuery: queries concorrentes suportadas; usar GoogleSQL (não DuckDB/ANSI)
- TypeORM `synchronize: true` — cria tabelas faltantes automaticamente no Neon
- Todos os batches de enriquecimento: progresso via SSE, restart seguro (skip CNPJs já processados)
