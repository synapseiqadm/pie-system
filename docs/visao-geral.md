# PIE — Visão Geral

PIE é uma plataforma de **inteligência comercial B2B brasileira** para prospecção e qualificação de empresas.

## Por que existe

Permite que equipes de vendas e inteligência comercial segmentem empresas a partir dos dados abertos da Receita Federal (71M CNPJs), enriqueçam as listas com dados de contato validados e gerenciem o pipeline de vendas resultante.

## Funcionalidades principais

**Segmentação:**
- Criar segmentos com filtros multi-critério: CNAE, UF, situação cadastral, porte, capital social, município, bairro
- Sugestão de filtros por linguagem natural via Claude Sonnet
- Análise estatística do segmento (por UF, CNAE, município, porte)

**Enriquecimento (5 módulos):**
- **Módulo 1 — Endereço:** verifica operacionalidade via Google Places com score multi-âncora
- **Módulo 2 — Contato PJ:** detecta se telefone/email é do contador; propõe contato direto
- **Módulo 3 — Presença Digital:** site, Instagram, Facebook, LinkedIn, WhatsApp com validação multi-âncora
- **Módulo 4 — Sócio:** identifica sócio-decisor e gera email candidato por padrão de domínio
- **Módulo 5 — Outbound-Ready:** perfil consolidado com canal score (ALTO/MÉDIO/INVIÁVEL) por Email, WhatsApp, SDR, LinkedIn

**Pipeline:**
- Gerenciar leads por segmento (cnpj + status + notas)
- Pipeline de oportunidades: `novo → contato → qualificado → proposta → sell_out`

**Classificação de telefone:**
- Classifica dados da RF: celular / fixo / inválido / sem telefone (sem chamadas externas)

## Fluxo principal

```
Segmento (filtros) → Enriquecimento (módulos 1–5) → Leads → Oportunidades
```

## Status

**Produção** desde 2026-06-03.  
Owner: Gabriel — Founder & CEO, Grupo SynapseIQ.
