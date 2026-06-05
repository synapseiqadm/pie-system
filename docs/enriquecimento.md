# Enriquecimento de Dados

Módulo em `backend/src/enriquecimento/`.  
Referência de arquitetura: `PIE_Enriquecimento_Arquitetura_v1.pdf` (Junho 2026).

---

## Arquitetura geral

Todos os dados enriquecidos são gravados na tabela central `enrichment_data` (EAV por `cnpj / module / field_name / status`) com rastreabilidade completa: `source`, `confidence`, `enriched_at`, `invalidation_reason`.

Cada módulo também mantém uma tabela de job tracking por `(cnpj, recorteId)` para controle de progresso e exibição na UI.

### Tabelas Neon

| Tabela | Papel |
|---|---|
| `enrichment_data` | Fonte de verdade — todos os dados enriquecidos |
| `site_enriquecimento` | Job tracking + campos UI do Módulo 3 (débito: migrar para ler de `enrichment_data`) |
| `address_enriquecimento` | Job tracking + resumo do Módulo 1 |
| `contact_enriquecimento` | Job tracking + resumo do Módulo 2 |
| `socio_enriquecimento` | Job tracking + resumo do Módulo 4 |
| `outbound_enriquecimento` | Perfil consolidado + canal scores do Módulo 5 |

---

## Módulo Telefone

Classifica dados do BigQuery sem chamadas externas:
- `celular` — 9 dígitos começando com 9
- `fixo` — 8 dígitos
- `invalido` — DDD inválido ou formato errado
- `sem_telefone` — campo vazio

Retorna stats de aproveitamento (% com telefone válido) e rows paginadas.

---

## Módulo 1 — Endereço

**Endpoint:** `POST /enriquecimento/:recorteId/endereco`  
**Custo:** ~$0.017–0.051/CNPJ (1–3 calls Places API)

Verifica se o estabelecimento ainda opera no endereço da RF e enriquece com dados reais do Google Places.

### Lógica — 3 queries em cascata

1. `nome_fantasia + logradouro + numero + UF Brasil`
2. `razao_social + logradouro + numero + UF Brasil`
3. `logradouro + numero + UF Brasil` (sem nome)

Para cada resultado, calcula score multi-âncora e para ao atingir score ≥ 70.

### Score multi-âncora

| Âncora | Peso | Critério |
|---|---|---|
| Endereço | 40pts | Token overlap logradouro+número RF vs Places |
| Telefone | 30pts | Sufixo 8 dígitos RF phone = Places phone |
| CNAE × categoria | 20pts | CNAE division → Places `primaryType` (17 setores mapeados) |
| Nome | 10pts | Fuzzy match nome fantasia vs Places displayName |

**Classificação:** ≥70 → `verificado/high` · 40–69 → `suspeito/medium` · <40 → `suspeito/low` · sem resultado → `unverified`

### Campos em enrichment_data (module='address')

`address_verified`, `address_match_score`, `business_status`, `address_places`, `places_phone`, `places_rating`, `places_reviews_count`, `places_has_hours`, `places_website_uri`, `places_primary_type`

---

## Módulo 2 — Contato PJ

**Endpoint:** `POST /enriquecimento/:recorteId/contato`  
**Custo:** ~$0.01–0.05 BQ · zero chamadas externas

Detecta se telefone/email da RF pertencem à empresa ou a um terceiro (contador), e propõe o contato direto.

### Detecção de terceiro — 4 sinais (em memória, 1 query BQ)

| Sinal | Motivo gravado |
|---|---|
| Email com domínio free (gmail, hotmail...) | `generic_domain` |
| Mesmo telefone/email em >5 CNPJs no recorte | `shared_multiple_cnpjs` |
| Domínio sem relação com nome fantasia (tokenOverlap < 40%) | `domain_mismatch` |
| Telefone/email aparece em CNPJ com CNAE 6920601/6920602 | `accounting_cnae` |

> **Limitação:** detecção de `shared_multiple_cnpjs` é dentro do recorte, não cruzando os 71M CNPJs. Débito futuro: pré-computar tabela `receita_federal.telefones_compartilhados` mensalmente (~$3–5/execução).

### Busca de contato direto (sem HTTP)

1. `places_phone` do Módulo 1 (se RF phone é suspeito)
2. `whatsapp_url` do Módulo 3 como fallback
3. Padrões `contato@`, `info@`, `fale@`, `sac@` + domínio próprio (confidence: low)

### Campos em enrichment_data (module='contact')

`phone_is_third_party`, `phone_third_party_reason`, `phone_direct`, `phone_direct_source`, `email_is_third_party`, `email_third_party_reason`, `email_corporate`, `email_corporate_source`, `contact_quality`

---

## Módulo 3 — Presença Digital

**Endpoint:** `POST /enriquecimento/:recorteId/site`  
**Custo:** Places API + AI Haiku (só Fase 2)

Batch com concorrência 8, duas fases em cascata.

### Fase 1 — Autoritativo (sem IA)

Ordem de tentativa (mais autoritativo primeiro):
1. Google Places API → `websiteUri` direto (`confidence: high`)
2. Email corporativo do CNPJ → extrai domínio, ignora free providers (`confidence: medium`)
3. ReclameAqui → testa slugs do nome fantasia (`confidence: medium`)

### Fase 2 — Heurístico + IA + multi-âncora (só se Fase 1 falhou)

1. `AiService.gerarCandidatosSite(nome, cnae, uf)` → até 5 domínios (Haiku)
2. `slugCandidates(nome)` → variações `.com.br` / `.com`
3. Para cada candidato: `isBannedUrl` → `verifyUrl` → `fetchPageMeta` → `ai.validarSite` (Haiku)
4. **Multi-âncora:** após validação IA, verifica telefone (30pts) e UF (20pts) na página
   - Score > 0 + IA valida → `confidence: medium`
   - Score = 0 + só IA → `confidence: low`

### O que é coletado

URL, slug, Instagram, Facebook, LinkedIn, WhatsApp, ReclameAqui, Google Places (phone, rating, reviews, business_status, address), `site_anchor_score`.

### Filtro de URLs banidas (`isBannedUrl`)

Rejeita: `.gov.br`, `prefeitura.*`, `camara.leg.*`, iFood, Rappi, Uber Eats, TripAdvisor, Foursquare, GuiaMais, TeleListas, Encontra.  
Aplicado antes de `verifyUrl` e após (cobre redirects).

### Cache global

`enrichment_data` (module='digital') — TTL 30 dias via `SITE_CACHE_TTL_DAYS`. Upsert via `ON CONFLICT DO UPDATE`. Permite restart seguro de batch.

---

## Módulo 4 — Sócio

**Endpoint:** `POST /enriquecimento/:recorteId/socio`  
**Custo:** ~$0.10–0.50 BQ (JOIN socios 27M linhas) · zero chamadas externas

Enriquece dados dos sócios da RF com email estimado por padrão de domínio.

### Priorização de decisores

Query BQ faz JOIN `estabelecimentos` (filtros do recorte) × `socios` com QUALIFY:

```sql
ORDER BY
  CASE WHEN qualificacao_socio IN ('05','08','10','16','17','20','49','50','54','65','78') THEN 0 ELSE 1 END,
  data_entrada_sociedade DESC
```

Sócio-administrador, Diretor, Presidente têm prioridade. Cotista/acionista sem função executiva: prioridade baixa.

### Email por padrão de domínio (Fase 1)

Só executa se Módulo 3 encontrou `site_url`. Gera até 5 candidatos:
- `primeironome@dominio`
- `primeironome.sobrenome@dominio`
- `primeironome.ultimo@dominio`
- `inicial.sobrenome@dominio`
- `inicial.ultimo@dominio`

Confidence: `low` até confirmação manual. Sem verificação HTTP.

### LGPD

`socio_lgpd_basis: legitimate_interest` · `socio_dnc: false` por padrão.  
Dados de PF com `dnc: true` são excluídos automaticamente do export outbound.

> **Fase 2 — LinkedIn via Apify:** não implementada. Ver débitos.

---

## Módulo 5 — Outbound-Ready

**Endpoint:** `POST /enriquecimento/:recorteId/outbound`  
**Custo:** ~$0.01–0.05 BQ · zero chamadas externas

Consolida dados dos módulos 1–4 em perfil único com canal scores.

### Lógica de consolidação (`phone_best`, `email_best`)

```
phone_best:  phone_direct (M2) → rf_phone (se não terceiro) → places_phone (M1)
email_best:  email_corporate (M2) → rf_email (se não terceiro)
site_url:    só se confidence = high|medium (multi-âncora confirmada)
```

### Canal scores

| Canal | ALTO | MÉDIO | INVIÁVEL |
|---|---|---|---|
| Email | email_corporate + confidence ≥ medium | rf_email não terceiro | ausente ou terceiro |
| WhatsApp | número + is_operational=true | número sem confirmação | sem WhatsApp |
| SDR | phone_direct + confidence ≥ medium + is_operational | phone + não terceiro | sem telefone |
| LinkedIn | — | linkedin_company_url presente | sem LinkedIn |

**outbound_score** (0–100): email ALTO=30, médio=15 · WhatsApp ALTO=25, médio=12 · SDR ALTO=25, médio=12 · LinkedIn médio=20.

### Endpoints

- `GET /outbound?minScore=50&emailScore=alto&whatsappScore=alto` — paginado com filtros
- `GET /outbound/export` — JSON completo, exclui DNC automaticamente

---

## Débitos técnicos

1. **`site_enriquecimento` campos duplicados** — `url`, `instagramUrl`, etc. são duplicatas de `enrichment_data`. Migrar `getSiteEnriquecimento`/`getSiteMap` para ler de `enrichment_data` e remover colunas da entity.

2. **Fase 1 do Módulo 3 sem multi-âncora** — Places websiteUri recebe `confidence: high` sem verificar se telefone/endereço do site confirma. Integrar com resultado do Módulo 1 (Endereço).

3. **Feedback pós-contato** — `invalidation_reason` e `invalidateDigitalCache` existem no service, mas não há endpoint/UI para o usuário sinalizar dado errado (PDF §2.3).

4. **Busca ativa de redes sociais** — Instagram e Facebook são extraídos só se aparecem no site. PDF §5.4.2/5.4.3 prevê busca ativa por nome fantasia + município.

5. **LinkedIn Sócio (Fase 5)** — requer Apify. Não implementado.

6. **Export XLSX** — `GET /outbound/export` retorna JSON. PDF §7.4 prevê XLSX com abas por canal.

7. **`shared_multiple_cnpjs` cross-recorte** — detecção limitada ao recorte atual. Solução futura: tabela `telefones_compartilhados` pré-computada mensalmente no BQ.
