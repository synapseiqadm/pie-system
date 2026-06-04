# Enriquecimento de Dados

Módulo em `backend/src/enriquecimento/enriquecimento.service.ts`.

## Dois enriquecimentos independentes

### Telefone

Classifica dados do BigQuery sem chamadas externas:
- `celular` — 9 dígitos começando com 9
- `fixo` — 8 dígitos
- `invalido` — DDD inválido ou formato errado
- `sem_telefone` — campo vazio

Retorna stats de aproveitamento (% com telefone válido) e rows paginadas.

### Site (presença digital)

Batch com concorrência 8, duas fases em cascata:

**Fase 1 — Autoritativo (sem IA, alta confiança):**
1. Email corporativo do CNPJ → extrai domínio (ignora gmail, hotmail, etc.)
2. Google Places API → `websiteUri` direto
3. ReclameAqui → testa slugs do nome fantasia

**Fase 2 — Heurístico (só se Fase 1 falhou, requer validação IA):**
1. `AiService.gerarCandidatosSite(nome, cnae, municipio, uf)` → até 5 domínios (Haiku)
2. `slugCandidates(nome)` → variações `.com.br` / `.com`
3. Para cada candidato: `isBannedUrl` → `verifyUrl` → `fetchPageMeta` → `ai.validarSite` (Haiku)

## O que é coletado

URL, slug, Instagram, Facebook, LinkedIn, WhatsApp, ReclameAqui, Google Places (telefone, rating, nº avaliações, status, endereço).

## Cache

`cnpj_site_cache` — global por CNPJ, TTL configurável (default 30 dias via `SITE_CACHE_TTL_DAYS`). Permite restart seguro de batch.

## Filtro de URLs banidas (`isBannedUrl`)

Rejeita: `.gov.br`, `prefeitura.*`, `camara.leg.*`, iFood, Rappi, Uber Eats, TripAdvisor, Foursquare, GuiaMais, TeleListas, Encontra.

Aplicado **antes** de `verifyUrl` (evita requisição desnecessária) e **após** (cobre redirects).

## Validação de site (Claude Haiku)

Recebe: `url`, `titulo`, `descricao`, `nome`, `cnpj`, `opts: { uf?, cnae?, temWhatsapp? }`

Rejeita se:
- Site é de prefeitura/governo/órgão público
- Site é app de delivery, marketplace ou diretório
- Atividade incompatível com o CNAE
- Empresa homônima em UF diferente
- Sem forma de contato direto (telefone, e-mail ou WhatsApp)

## Revalidação

`POST /enriquecimento/:recorteId/site/revalidar` — passa sites com status `encontrado` pela IA novamente + aplica `isBannedUrl` em URLs já salvas.

## Fonte dos dados

O batch busca CNPJs do recorte via BigQuery (`buildFrom()` + `buildWhere()` do `RecortesService`). `BigQueryService` substituiu `DuckDbService` — queries concorrentes agora suportadas.
