# Radar BV — radarbv.com.br

Portal de notícias 100% automatizado por uma "Redação de IA", focado em Boa Vista/Roraima, escalável para Brasil e mundo.

## 1. Diagrama de Arquitetura (Fase 1)

```
┌──────────────────────────────────────────────────────────────────────────┐
│                         FONTES OFICIAIS (RSS / HTTP)                     │
│  Prefeitura BV · Governo RR · Câmara Municipal · Diários Oficiais ·      │
│  Polícia · Portais parceiros                                             │
└───────────────────────────────┬────────────────────────────────────────┘
                                 │ fetch RSS/HTML (a cada 45min/1h30/05h30)
                                 ▼
                    ┌────────────────────────┐
                    │   1. COLETOR + CRON     │   Custo: R$ 0
                    │   DINÂMICO (node-cron)  │
                    └───────────┬─────────────┘
                                │
                                ▼
                    ┌────────────────────────┐
                    │  TRAVA DE SILÊNCIO      │   Compara hash/URL
                    │  (hash SHA-256 da URL)  │   com `fontes_monitoradas`
                    └───────────┬─────────────┘
                     já existe? │ sim → encerra (custo zero)
                                │ não (link inédito)
                                ▼
                    ┌────────────────────────┐
                    │ 2. GEMINI FLASH (free)  │   Limpa HTML, dedup
                    │  Triagem + Resumo       │   semântico 24h,
                    │  (4-5 tópicos, ≤150 pal)│   extrai fatos essenciais
                    └───────────┬─────────────┘
                                │ JSON com tópicos
                                ▼
                    ┌────────────────────────┐
              ┌─────┤ 3. CLAUDE (Redação-Chefe)│
              │     │  Reescreve, título,     │
              │ fail│  subtítulo, categoria   │
              │ /quota  JSON estrito          │
              │     └───────────┬─────────────┘
              │                 │ ok
              ▼                 ▼
    ┌───────────────────┐  ┌──────────────────────┐
    │ FALLBACK           │  │  BLINDAGEM            │
    │ Gemini Flash        │  │  ANTI-FAKE/ALUCINAÇÃO │
    │ ou Groq (Llama)     │  │  (fatos só da fonte)  │
    └─────────┬───────────┘  └───────────┬──────────┘
              └───────────┬──────────────┘
                           ▼
                ┌─────────────────────────┐
                │ BANCO DE IMAGENS         │  Unsplash/Pexels API
                │ (busca por keyword →     │  → fallback: imagem
                │  fallback pré-cadastrado)│    padrão por categoria
                └────────────┬────────────┘
                             ▼
                ┌─────────────────────────┐
                │ FILA DE GOTEJAMENTO      │  data_publicacao
                │ (20-30min entre posts)   │  futura, status=agendado
                └────────────┬────────────┘
                             ▼
                ┌─────────────────────────┐
                │ SUPABASE (Postgres)      │  tabela `noticias`
                │ status: publicado        │  + logs_sistema
                │ tags de cruzamento ──────┼────────────┐
                └────────────┬────────────┘            │
                 ┌───────────┴────────────┐             ▼
                 ▼                        ▼   ┌───────────────────────────┐
     ┌──────────────────────┐   ┌─────────────┤ MOTOR DE PUBLICIDADE       │
     │ Next.js (Site + PWA)  │   │ Webhook/API  │ INTELIGENTE (4 níveis)     │
     │ SSR/ISR, SEO          │◄──┤ WhatsApp     │ obter_banner_contextual()  │
     │ chama o motor por     │   │ Resumo curto │ 1. interno_ecossistema     │
     │ slot (topo/meio/      │   │ + link       │    (Metadoc Express,       │
     │ lateral/rodapé)       │   └──────────────┤    AzimuteGeo, Agrimensura)│
     └──────────────────────┘                  │ 2. patrocinador_externo    │
                                                │ 3. captacao_anunciante     │
                                                │    ("Anuncie Aqui" → WhatsApp)│
                                                │ 4. adsense (rodízio)       │
                                                └───────────────────────────┘
```

O motor escolhe o banner por slot cruzando as `tags`/`editoria` que o Claude já devolve na matéria (ex: `documento`, `cartorio`, `imovel` → Metadoc Express/Agrimensura; `tecnologia`, `obra`, `engenharia` → AzimuteGeo) com `tags_contextuais`/`editorias_contextuais` de cada banner; sem match, cai no rodízio entre rede própria, captação e AdSense.

## 2. Estrutura completa de pastas

```
radar-bv/
├── apps/
│   └── web/                        # Next.js 15 (App Router) + PWA + Admin — Fases 2 e 3
│       ├── app/
│       │   ├── layout.tsx          # metadata, manifest, registro do service worker
│       │   ├── page.tsx            # Home (destaque, Roraima, Brasil&Mundo, banners)
│       │   ├── editoria/[editoria]/page.tsx
│       │   ├── noticia/[slug]/page.tsx
│       │   └── admin/              # Painel Administrativo (Fase 3)
│       │       ├── login/          # autenticação (Supabase Auth)
│       │       └── (painel)/       # protegido pelo middleware.ts
│       │           ├── page.tsx           # dashboard
│       │           ├── noticias/          # CRUD/moderação de notícias
│       │           ├── fontes/            # CRUD de fontes_monitoradas
│       │           ├── banners/           # CRUD do Motor de Publicidade
│       │           └── whatsapp/          # CRUD de destinos_whatsapp
│       ├── middleware.ts           # bloqueia /admin/* sem sessão
│       ├── components/             # Cabecalho, MesaDeRedacao, CardNoticia, BannerAnuncio, Rodape, BotaoConfirmar
│       ├── lib/
│       │   ├── supabase.ts, data.ts (c/ fallback p/ dados-demo), types.ts, formato.ts  # site público (anon key)
│       │   ├── supabase-server.ts, auth.ts        # sessão do admin (anon key + cookies)
│       │   └── supabase-admin.ts, admin-data.ts, admin-types.ts  # CRUD do admin (service_role, server-only)
│       ├── public/
│       │   ├── manifest.json       # PWA instalável
│       │   ├── sw.js               # service worker (network-first)
│       │   └── icons/              # ícones gerados (192/512/maskable/apple-touch)
│       └── scripts/gerar_icones.py # gera os ícones reais a partir das cores da marca
├── worker/                         # Worker Node.js/TypeScript — Fases 1 e 3 (este pacote)
│   ├── src/
│   │   ├── config.ts               # env, chaves, janelas de cron
│   │   ├── types.ts                # tipos compartilhados
│   │   ├── logger.ts               # logger -> tabela logs_sistema
│   │   ├── db.ts                   # cliente Supabase
│   │   ├── scheduler.ts            # Cron Dinâmico (node-cron) + cron do resumo diário
│   │   ├── collector.ts            # fetch RSS/HTML + Trava de Silêncio
│   │   ├── images.ts               # Unsplash/Pexels + fallback por categoria
│   │   ├── queue.ts                # Fila de Gotejamento (agendamento)
│   │   ├── whatsapp.ts             # dispara p/ múltiplos destinos_whatsapp (Fase 3)
│   │   ├── resumoDiario.ts         # resumo diário consolidado (Fase 3, com dedupe)
│   │   ├── ai/
│   │   │   ├── prompts.ts          # System Prompts blindados (Gemini e Claude)
│   │   │   ├── gemini.ts           # Triagem/Resumo (Gemini Flash free tier)
│   │   │   ├── claude.ts           # Redação-Chefe (Claude API)
│   │   │   ├── groq.ts             # Fallback de IA (Llama via Groq)
│   │   │   └── pipeline.ts         # Orquestra Gemini -> Claude -> Fallback
│   │   └── index.ts                # entrypoint do worker
│   ├── package.json
│   ├── tsconfig.json
│   └── .env.example
├── supabase/
│   └── schema.sql                  # script SQL completo (Fases 1 e 3)
└── README.md
```

## 2.1 Motor de Publicidade Inteligente

A tabela `banners_publicidade` suporta 4 tipos de anunciante (`tipo_anunciante`): `interno_ecossistema` (Metadoc Express, AzimuteGeo, Serviços de Agrimensura — já com seed inicial), `patrocinador_externo` (clientes pagos, com vigência e métricas de clique/visualização), `captacao_anunciante` (banner institucional "Anuncie Aqui no Radar BV", com link direto para o WhatsApp comercial) e `adsense` (slots do Google AdSense). A função SQL `obter_banner_contextual(posicao, tags, editoria)` resolve qual banner exibir em cada slot: prioriza casamento contextual (tags/editoria da matéria batendo com `tags_contextuais`/`editorias_contextuais` do banner), depois quem paga (`patrocinador_externo`), e por fim faz rodízio aleatório entre os demais — pronta para o frontend da Fase 2 só chamar.

## 3. Como rodar o worker (Fase 1)

```bash
cd worker
cp .env.example .env     # preencher chaves (Supabase, Gemini, Claude, Groq, Unsplash/Pexels)
npm install
npm run dev               # roda o worker em modo contínuo com o cron dinâmico
npm test                  # roda a suíte de testes (mocks — não precisa de chaves reais)
```

## 4. Auditoria da Fase 1 (varredura completa)

Rodada em 2026-11-18. Tudo abaixo foi **executado de verdade** neste ambiente (não é inspeção visual de código):

| Verificação | Como foi testada | Resultado |
|---|---|---|
| `schema.sql` cria o banco do zero | Executado contra um PostgreSQL 16 real (`psql -f schema.sql`), 2x | ✅ Sem erros |
| Função `obter_banner_contextual` | Chamada com dados reais inseridos, 3 cenários (ecossistema, rodízio, captação) | ✅ Retornou o banner certo nos 3 |
| `tsc --noEmit` (worker inteiro) | Compilado | ✅ Zero erros |
| Build + execução (`npm run build && node dist/index.js`) | Rodado sem `.env` | ✅ Falha exatamente onde devia (variável obrigatória ausente), sem erro de módulo |
| Trava de Silêncio, Isolamento de Fontes, fila de gotejamento, fallback de IA em cascata, banco de imagens de segurança | 12 testes automatizados com mocks do Supabase/Gemini/Claude/Groq/rss-parser (`worker/test/`) | ✅ 12/12 passando |
| Timeout de rede em `node-fetch` v3 | Testado contra servidor TCP que nunca responde | ❌ bug real — corrigido (ver abaixo) |
| Cron Dinâmico (cadência diurna) | Simulado os horários gerados | ❌ bug real — corrigido (ver abaixo) |

### Bugs reais encontrados e corrigidos
1. **Cron duplicado/fora de cadência.** A versão anterior usava 2 jobs cron sobrepostos pra cobrir a janela diurna; na prática eles disparavam o pulso em dobro em vários horários (ex: 7h00, 7h45) e criavam pulsos extras fora do intervalo de 45min pedido (ex: 8h00, 8h45). Corrigido: agora é gerada a lista exata dos 16 horários (`07:00` até `18:15`, de 45 em 45 min) e cada um tem exatamente 1 cron job — testei a lista gerada, bate 100% com o pedido.
2. **Timeout de rede não funcionava.** `node-fetch` v3 **removeu** a opção `timeout` (ela era silenciosamente ignorada); testei contra um servidor que nunca responde e confirmei que o código antigo ficava pendurado indefinidamente. Numa fonte travada, isso bloquearia o `Promise.all` do coletor e travaria o ciclo inteiro — quebrando o Isolamento de Fontes. Corrigido com `AbortSignal.timeout(...)` em todas as chamadas de rede (coletor HTML, Unsplash, Pexels, webhook do WhatsApp) — validado que agora aborta no tempo certo.
3. **Trava de concorrência ausente.** Mesmo corrigindo o cron, adicionei um mutex em memória (`pulsoEmExecucao`) pra garantir que dois pulsos nunca rodem ao mesmo tempo, e outro equivalente na publicação da fila (que roda a cada 1 min) — defesa extra contra duplicidade mesmo em cenários futuros (reinício, atraso de API).
4. Limpeza: um fallback morto (`item.summary`, que o `rss-parser` nunca preenche) foi removido do coletor; confirmei com teste real contra um feed de exemplo o que o `rss-parser` de fato expõe (`content:encoded` e `content`).

### Itens que não puderam ser testados aqui (precisam das suas chaves reais)
- As chamadas de verdade pra Gemini, Claude, Groq, Unsplash/Pexels e pro seu projeto Supabase — simulei o comportamento delas com mocks fiéis ao contrato (JSON estrito, erros, cota), mas a integração final só se confirma com as chaves em `.env` preenchidas.
- O disparo real pro webhook de WhatsApp (depende da API/provedor que você escolher — cadastrado no painel admin da Fase 3).
- `npm audit` mostrou 8 avisos nesta época; a vulnerabilidade do `node-cron`/`uuid` citada aqui foi completamente eliminada na auditoria da Fase 3 (ver seção 6) trocando pra `node-cron@4`, que tem zero dependências.

**Conclusão da varredura: com as correções aplicadas, a Fase 1 está estruturalmente 100% — compila, builda, roda, e a lógica de cada regra de ouro foi provada com testes reais, não só lida no código.** O que falta pra rodar "ao vivo" de verdade é só a parte que nenhuma auditoria de código resolve: suas chaves de API e um projeto Supabase real.

## 5. Fase 2 — Site + PWA (Next.js) — entregue e validada

A ideia central: a redação é feita por IAs, mas o site precisa deixar isso **visível e verificável**, não escondido. Por isso o "Mesa de Redação IA" (ticker ao vivo no topo) e o selo "Redigido por Claude/Gemini a partir de fatos apurados..." + link pra fonte original em cada matéria — nenhum concorrente local faz essa transparência, e ela vira o diferencial de confiança do produto. O visual (cores navy/esmeralda, tipografia Space Grotesk+Inter) segue exatamente o protótipo aprovado no Design.

**Páginas:** Home (`/`), editoria (`/editoria/[editoria]`, 7 editorias com `generateStaticParams`), matéria (`/noticia/[slug]`, com banner contextual no meio do texto e "Leia também"). Todas chamam o mesmo `lib/data.ts`, que usa o Supabase real quando configurado (inclusive a função `obter_banner_contextual` via RPC) e cai em dados de demonstração quando não — o site nunca fica numa tela vazia/quebrada, mesmo sem as chaves ainda preenchidas. **Importante:** o frontend só usa a chave `anon` (leitura); toda escrita é feita pelo worker com a `service_role` — a chave de escrita nunca entra no código do site.

**PWA instalável:** `manifest.json` com os 2 ícones + versão "maskable" (gerados de verdade com Pillow, não placeholders), `sw.js` com estratégia network-first (notícia sempre fresca; só usa cache se o celular estiver offline) e cache-first pros ícones/manifest.

### Auditoria real da Fase 2
Mesma rigor da Fase 1 — execução real, não leitura de código:

| Verificação | Como foi testada | Resultado |
|---|---|---|
| `npm install` | Instalado do zero | ✅ Sem erro |
| `npm audit` | Next.js estava em `14.2.15`, vulnerável a **12 CVEs reais** (1 crítico: RCE na API de otimização de imagem; os outros DoS/SSRF/cache poisoning em Server Actions e rewrites) — nenhuma corrigida em qualquer versão 14.x | ❌ bug real de segurança — corrigido: subi pra `next@15.5.29` (a `16` exigiria mais ajustes de API sem necessidade). `postcss` interno do Next também estava vulnerável (XSS/path traversal via source map) — corrigido via `overrides` do npm pra `postcss@8.5.33` | ✅ 0 vulnerabilidades do Next/postcss após a correção |
| `npm run build` (produção) | Buildado de verdade após subir o Next | ❌ erro real de tipos (Next 15 tornou `params` assíncrono nas rotas dinâmicas — breaking change da própria versão) — corrigido em `editoria/[editoria]` e `noticia/[slug]` | ✅ build limpo, 11 páginas geradas (SSG nas 7 editorias) |
| `npm run start` (servidor de produção real) + `curl` em cada rota | Home, editoria, matéria, 404 de editoria inválida, 404 de notícia inexistente, `manifest.json`, `sw.js`, ícone PNG | ✅ todas HTTP 200 (ou 404 nos casos certos), conteúdo real renderizado (verifiquei o `<title>`, o ticker "Mesa de Redação", o selo "Redigido por", o `<h1>` da editoria) — sem erro no log do servidor |
| Ícones PWA | Abertos com `file` após gerados | ✅ PNGs reais 192×192/512×512/180×180, não placeholders de 1px |

**Vulnerabilidade sem correção ainda disponível:** `picomatch` (usado só em tempo de build/dev pelo Tailwind, pra observar arquivos) tem um ReDoS reportado sem versão corrigida publicada por ninguém ainda — reportando com transparência, não é um risco de produção (não processa entrada de usuário, só os próprios arquivos do projeto em build/dev).

**Conclusão: a Fase 2 está estruturalmente 100% — build limpo, roda em produção de verdade, todas as rotas testadas via HTTP real, zero vulnerabilidade crítica/alta restante no código que controlamos.** O que falta pra ficar "ao vivo" com dados reais é só preencher `apps/web/.env.local` com as chaves do seu Supabase.

## 6. Fase 3 — Painel Administrativo + Automação WhatsApp — entregue e validada

**Painel admin (`/admin`):** login via Supabase Auth (contas criadas em Authentication → Users do seu projeto — qualquer conta ali já entra), protegido em duas camadas — `middleware.ts` bloqueia qualquer rota `/admin/*` sem sessão (redireciona pro login), e cada Server Action chama `exigirLogin()` de novo antes de tocar no banco, nunca confiando só no middleware. O CRUD do admin usa a `service_role` key (ignora RLS) através de `lib/supabase-admin.ts`, que importa `"server-only"` — isso faz o **build falhar**, não só avisar, se esse módulo for importado por engano em código que vai pro navegador. O site público continua só com a `anon` key (RLS), como na Fase 2.

Telas: **Dashboard** (contadores de notícias por status, fontes com erro/desativadas, últimos logs), **Notícias** (lista com filtro por status, editar título/subtítulo/conteúdo/destaque/urgente, publicar/despublicar/excluir com confirmação), **Fontes** (cadastrar/reativar/desativar/excluir — reativar já zera o contador de erros do Isolamento de Fontes), **Banners** (CRUD completo do Motor de Publicidade: tipo, posição, tags contextuais, prioridade) e **WhatsApp** (cadastro de destinos — ver abaixo).

**Automação WhatsApp (múltiplos destinos):** antes (Fase 1) só existia 1 webhook fixo no `.env`. Agora `destinos_whatsapp` guarda vários grupos/canais, cada um com seu próprio webhook (de qualquer provedor — Evolution API, WPPConnect, Z-API etc.; o Radar BV nunca guarda sessão/número do WhatsApp, só a URL já configurada). O disparo por matéria publicada (`whatsapp.ts`) vai pra **todos** os destinos ativos, com Isolamento de Destinos: um webhook fora do ar não impede o disparo pros demais. Também foi adicionado um **resumo diário** (`resumoDiario.ts`, 08h) que consolida as notícias das últimas 24h num único disparo — com dedupe real via constraint `unique(destino_id, data_envio)` no Postgres, então não duplica mesmo com restart do worker ou cron disparando 2x. Quem só preencheu o `.env` (nunca abriu o admin) continua funcionando: sem nenhum destino cadastrado, o worker cai automaticamente no webhook legado da variável `WHATSAPP_WEBHOOK_URL`.

### Auditoria real da Fase 3

| Verificação | Como foi testada | Resultado |
|---|---|---|
| `schema.sql` com as tabelas novas (`destinos_whatsapp`, `resumos_diarios_enviados`) | Executado do zero 2x contra Postgres 16 real (idempotência) | ✅ Sem erro nas 2 execuções |
| Dedupe do resumo diário | Inserido o mesmo `(destino_id, data_envio)` 2x direto no Postgres | ✅ 2ª inserção rejeitada pela constraint, como esperado |
| Idempotência da `fk_urls_noticia` (achado da Fase 1 que passou despercebido) | Reexecutei o `schema.sql` 2x do zero | ❌ bug real (constraint sem `if not exists`) — corrigido com `do $$ ... exception when duplicate_object$$` |
| `npm audit` do worker | Tinha 8 avisos (5 moderados, 1 alto, **2 críticos** — RCE via `tinypool`, usado pelo vitest) | ❌ 2 achados reais — corrigidos: `node-cron` trocado por `node-cron@4` (zero dependências, elimina o `uuid` vulnerável por completo) e `tinypool` fixado via `overrides` do npm. Restam só avisos do próprio `vite`/`esbuild` do vitest (dev-only, mesma classe já reportada na Fase 1) |
| `tsc --noEmit` do worker | Compilado após todas as mudanças | ✅ Zero erros |
| 18 testes automatizados do worker (12 da Fase 1 + 6 novos) | `vitest run` — os 6 novos cobrem: disparo pra todos os destinos ativos, Isolamento de Destinos (um webhook falho não trava os outros), montagem do texto do resumo (urgentes primeiro), resumo não enviado sem notícia nas 24h, dedupe funcionando, e isolamento do dedupe entre destinos diferentes | ❌ 1 bug real encontrado no 1º run — corrigido (ver abaixo) — ✅ 18/18 passando depois |
| Build do worker + smoke run (`node dist/index.js`) | Sem `.env` | ✅ Falha exatamente no ponto certo (variável obrigatória ausente) |
| `npm audit` do app web após instalar `@supabase/ssr`/`server-only` | Checado | ✅ Nenhuma vulnerabilidade nova introduzida |
| `npm run build` do app web com as rotas `/admin/*` | Buildado com chaves Supabase sintaticamente válidas (mas falsas) | ✅ Build limpo — todas as rotas `/admin/*` corretamente marcadas como dinâmicas (não tentam pré-renderizar e bater no Supabase durante o build) |
| Middleware bloqueando `/admin/*` sem sessão | `npm run start` real + `curl` em `/admin`, `/admin/noticias`, `/admin/noticias/[id]`, `/admin/fontes`, `/admin/banners`, `/admin/whatsapp` | ✅ Todas retornaram **307** pro `/admin/login` com o `redirecionar` certo na URL; `/admin/login` continua 200 |
| Site público não regrediu | `curl` em `/`, `/editoria/roraima`, `/noticia/[slug]` depois de todas as mudanças do admin | ✅ Todas 200, sem erro no log do servidor |
| Tratamento de erro do login (rede fora do ar vs. senha errada) | Testei `signInWithPassword` de verdade contra um host Supabase inexistente | ❌ bug real de UX — o erro de rede (`status: 0`) caía na mesma mensagem de "senha inválida", o que levaria quem administra a trocar a senha à toa num problema de configuração/conectividade — corrigido: mensagens diferentes para cada caso |

### Bug real encontrado e corrigido (Fase 3)
**Dedupe do resumo diário dependia de um default do banco que o código nunca gravava.** `resumos_diarios_enviados.data_envio` tem `default current_date` no Postgres, e o código só inseria `{ destino_id }`, sem passar a data — funcionava em produção (Postgres preenche o default), mas é frágil: `current_date` roda no fuso do *servidor do banco*, enquanto a leitura de dedupe usava `new Date().toISOString()` do *Node*. Perto da virada do dia (ex: 23h59 UTC), os dois podem calcular "hoje" como datas diferentes e o resumo seria enviado em dobro. Encontrado pelo teste automatizado (não eu lendo o código) — corrigido gravando a mesma data calculada no Node tanto na leitura quanto na escrita, eliminando a dependência do default do banco.

### Item que não pôde ser testado aqui (precisa do seu Supabase real)
Este ambiente não tem Docker disponível (sandbox sem acesso privilegiado), então não dá pra rodar um Supabase Auth local de verdade. O que **foi** validado com execução real: o middleware bloqueia/redireciona corretamente qualquer acesso sem sessão (testado com `curl` contra o servidor de produção rodando), e `signInWithPassword` não derruba o servidor em caso de falha de rede (testado isoladamente com `@supabase/supabase-js` puro contra um host inexistente). O que falta — login de verdade com e-mail/senha reais contra Auth — só se confirma com o seu projeto Supabase e um usuário cadastrado em Authentication → Users.

## 7. Próximas fases
Com Fases 1, 2 e 3 entregues, não há uma "Fase 4" definida no plano original — o que resta é o item abaixo (escala) e o preenchimento das chaves reais (Supabase, Gemini, Claude, Groq, Unsplash/Pexels, webhook de WhatsApp) pra sair do modo demonstração.

## 8. O que mais pode ser escalado (além das Fases 1-3)
- **Mais fontes e parsers dedicados:** hoje o `tipo: 'html'` trata a página inteira como 1 item genérico; fontes importantes (Diário Oficial, por ex.) valem um parser próprio que já extrai só a seção de interesse, economizando tokens do Gemini.
- **Backoff ao invés de corte seco:** hoje a fonte é desativada após 10 erros seguidos; um backoff exponencial (tenta de novo em 1h, depois 6h, depois 24h) recupera fontes instáveis sem precisar de intervenção manual.
- **Alertas automáticos sobre os logs:** o dashboard admin já mostra fontes com erro e logs recentes; o próximo passo é um alerta proativo (webhook de WhatsApp pro seu número pessoal, por exemplo) quando `nivel = 'critico'` aparecer, em vez de precisar abrir o painel pra notar.
- **Fila de gotejamento resiliente a restart:** hoje o próximo horário livre vive em memória do processo; persistir isso (ex: numa tabela `estado_fila`) evita que um restart do worker cause uma rajada de publicações simultâneas se houver muitos itens "agendado" acumulados.
- **Cache/CDN de imagens:** hoje as imagens do Unsplash/Pexels ficam só linkadas por URL externa; subir uma cópia pro Supabase Storage (ou um CDN) evita ficar na mão da disponibilidade de terceiros e permite otimizar formato/tamanho pro site.
- **SEO e descoberta:** sitemap.xml dinâmico, dados estruturados (schema.org NewsArticle) e AMP/Core Web Vitals entram naturalmente na Fase 2 e ajudam a crescer audiência orgânica sem depender só do WhatsApp.
- **Monetização adicional:** newsletter diária automática (reaproveitando o mesmo pipeline de resumo), conteúdo patrocinado nativo (matéria identificada como publicidade, já dá pra reaproveitar `tipo_anunciante`), e métricas de clique por banner (`cliques`/`visualizacoes` já existem no schema — falta só instrumentar o clique no frontend).
- **Escala horizontal do worker:** se o volume de fontes crescer muito, dá pra separar "coleta" e "redação" em dois processos/filas (ex: fila no Supabase ou Redis) ao invés de um loop sequencial único — hoje é sequencial de propósito pra não estourar rate limit das IAs gratuitas, mas isso tem limite de throughput.
- **Expansão nacional/internacional:** a arquitetura já é editoria-agnóstica; crescer pra "Brasil & Mundo" é basicamente cadastrar novas fontes com `editoria_padrao` diferente — nenhuma mudança estrutural necessária.
- **Mesa de Redação ao vivo de verdade:** hoje o ticker da Home é um placeholder estático; plugar no Supabase Realtime (ouvindo `logs_sistema`) faz ele mostrar o pulso de coleta/redação acontecendo em tempo real — reforça ainda mais a transparência que é o diferencial do produto.
- **Métricas de clique/visualização instrumentadas:** as colunas `cliques`/`visualizacoes` já existem no schema; falta um endpoint (ou Server Action) que o frontend chame ao exibir/clicar um banner ou abrir uma matéria, pra essas colunas saírem de "existem" pra "alimentadas de verdade".
- **Imagem de capa com `next/image` otimizada de ponta a ponta:** hoje a imagem só é otimizada quando já é uma URL do Unsplash/Pexels/Supabase (via `remotePatterns`); subir a própria imagem pro Supabase Storage (ponto já citado na Fase 1) also destrava otimização de formato (AVIF/WebP) sem depender de terceiro.
- **sitemap.xml e robots.txt dinâmicos:** usando as mesmas funções `getNoticias`/`EDITORIAS` já escritas em `lib/`, dá pra gerar isso com as convenções nativas do Next (`app/sitemap.ts`, `app/robots.ts`) sem nenhuma dependência nova.
- **Papéis/permissões no admin:** hoje qualquer conta no Supabase Auth do projeto pode entrar e usar o painel inteiro (natural pra 1 operador); se mais gente for usar, uma tabela `admin_usuarios` com papel (editor/admin) e checagem nas Server Actions restringe quem pode excluir/publicar vs. só editar rascunho.
- **Trilha de auditoria do admin:** hoje uma edição/exclusão no painel não deixa rastro de quem fez o quê; gravar em `logs_sistema` (que já existe) a cada ação do admin — "usuário X excluiu a notícia Y" — dá rastreabilidade sem precisar de tabela nova.
- **Preview antes de publicar:** a edição de notícia salva direto; um botão "pré-visualizar" (abrindo a página pública com a notícia ainda em rascunho, via um token temporário) evita publicar erro de digitação sem querer.
- **Teste de webhook direto do admin:** a tela de WhatsApp cadastra o destino mas não confirma se o webhook responde; um botão "testar envio" que dispara uma mensagem de teste na hora economiza o ciclo de "cadastrar → esperar a próxima notícia → descobrir que o webhook estava errado".
