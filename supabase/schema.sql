-- ============================================================================
-- RADAR BV — Schema Supabase/PostgreSQL — Fase 1
-- Tabelas: noticias, fontes_monitoradas, banners_publicidade,
--          imagens_fallback, logs_sistema
-- ============================================================================

create extension if not exists "pgcrypto"; -- gen_random_uuid()

-- ----------------------------------------------------------------------------
-- ENUMs
-- ----------------------------------------------------------------------------
do $$ begin
  create type status_noticia as enum ('rascunho', 'agendado', 'publicado', 'erro', 'removido');
exception when duplicate_object then null; end $$;

do $$ begin
  -- "servico_cidadao" (item 5 — Serviço ao Cidadão: SINE, editais, matrícula)
  -- e "saude", "educacao", "cultura" (item 17 — Editorias temáticas) foram
  -- adicionados depois via "alter type ... add value" (ver
  -- supabase/migracao-servico-cidadao-PARTE1.sql e
  -- supabase/migracao-editorias-tematicas.sql) — mantidos aqui pra quem
  -- recriar o banco do zero já nascer com os valores certos.
  create type editoria as enum ('boa_vista', 'roraima', 'policia', 'politica', 'economia', 'esportes', 'brasil_mundo', 'servico_cidadao', 'saude', 'educacao', 'cultura');
exception when duplicate_object then null; end $$;

do $$ begin
  -- 'mistral' e 'cohere' adicionados em 22/11/2026 (ver
  -- supabase/migracao-mistral-cohere.sql) — mais 2 elos gratuitos na
  -- bancada de IA, a pedido do Valter.
  create type origem_ia as enum ('claude', 'gemini', 'groq', 'openrouter', 'mistral', 'cohere', 'manual');
exception when duplicate_object then null; end $$;

do $$ begin
  -- "busca": fonte por TEMA pesquisado na web (via pesquisador.ts), não por
  -- URL fixa — a mesma estrutura de busca que a IA usa no chat, por trás dos
  -- panos do coletor de notícias.
  create type tipo_fonte as enum ('rss', 'html', 'api', 'busca');
exception when duplicate_object then null; end $$;

do $$ begin
  create type nivel_log as enum ('info', 'warning', 'error', 'critico');
exception when duplicate_object then null; end $$;

do $$ begin
  create type posicao_banner as enum ('topo', 'meio_materia', 'lateral', 'rodape');
exception when duplicate_object then null; end $$;

do $$ begin
  create type tipo_anunciante as enum ('patrocinador_externo', 'interno_ecossistema', 'captacao_anunciante', 'adsense');
exception when duplicate_object then null; end $$;

do $$ begin
  create type tipo_destino_whatsapp as enum ('grupo', 'canal');
exception when duplicate_object then null; end $$;

do $$ begin
  -- Dicas/denúncias de moradores via WhatsApp (item 3 do plano —
  -- Pesquisadores por área). "pendente" até o worker tentar redigir a
  -- partir dela; "processada" quando virou notícia (rascunho); "descartada"
  -- quando faltou informação suficiente ou não teve valor jornalístico.
  create type status_dica as enum ('pendente', 'processada', 'descartada');
exception when duplicate_object then null; end $$;

do $$ begin
  -- Ouvidoria/correção pública (item 21 do plano): status do atendimento
  -- do relato do leitor — não confundir com status_dica (que é sobre
  -- virar matéria nova; aqui é reclamação/apontamento de erro).
  create type status_reclamacao as enum ('pendente', 'respondida', 'arquivada');
exception when duplicate_object then null; end $$;

do $$ begin
  -- Painel do Administrador / Central de Transparência (item 22 do plano).
  create type tipo_relatorio_redacao as enum ('informe', 'pergunta');
exception when duplicate_object then null; end $$;

do $$ begin
  create type status_relatorio_redacao as enum ('novo', 'lido', 'respondido');
exception when duplicate_object then null; end $$;

-- ----------------------------------------------------------------------------
-- fontes_monitoradas: de onde o coletor busca notícias + Trava de Silêncio
-- ----------------------------------------------------------------------------
create table if not exists fontes_monitoradas (
  id                uuid primary key default gen_random_uuid(),
  nome              text not null,                       -- ex: "Prefeitura de Boa Vista"
  url_base          text not null,
  tipo              tipo_fonte not null default 'rss',
  editoria_padrao   editoria,
  ativa             boolean not null default true,
  confiabilidade    smallint not null default 5 check (confiabilidade between 1 and 10),
  ultima_verificacao timestamptz,
  ultimo_erro       text,
  erros_consecutivos smallint not null default 0,          -- isolamento de fontes
  limite_diario     smallint,                             -- teto de notícias/dia desta fonte (null = sem limite)
  creditar_publicamente boolean not null default true,     -- false = veículo concorrente (G1, Folha etc.): só aparece no crédito público se a IA não achar fonte primária melhor no texto
  criado_em         timestamptz not null default now()
);

create index if not exists idx_fontes_ativas on fontes_monitoradas (ativa);

-- Hash/URL já vistos pela Trava de Silêncio (evita gastar tokens em duplicado)
create table if not exists urls_processadas (
  id            uuid primary key default gen_random_uuid(),
  fonte_id      uuid references fontes_monitoradas(id) on delete set null,
  url           text not null,
  hash_conteudo text not null,          -- sha256(url + trecho do conteúdo)
  noticia_id    uuid,                   -- preenchido após publicar (fk abaixo)
  criado_em     timestamptz not null default now(),
  unique (hash_conteudo)
);

create index if not exists idx_urls_hash on urls_processadas (hash_conteudo);
create index if not exists idx_urls_url on urls_processadas (url);

-- ----------------------------------------------------------------------------
-- noticias
-- ----------------------------------------------------------------------------
create table if not exists noticias (
  id                  uuid primary key default gen_random_uuid(),
  titulo              text not null,
  subtitulo           text,
  slug                text not null unique,
  conteudo            text not null,              -- corpo redigido (Claude/fallback)
  resumo_whatsapp      text,                        -- resumo curto + link p/ WhatsApp
  editoria            editoria not null,
  tags                text[] default '{}',
  imagem_url          text,
  imagem_credito      text,                        -- crédito Unsplash/Pexels ou "fallback"
  imagem_e_fallback   boolean not null default false,
  infografico         jsonb,                       -- item 18: gráfico/linha do tempo gerado pelo Infografista (null = sem infográfico)
  correcoes           jsonb not null default '[]', -- item 21: histórico de notas de correção pública [{data, texto}]
  fonte_id            uuid references fontes_monitoradas(id) on delete set null,
  fonte_url_original  text not null,
  fonte_credito       text,                        -- nome exibido da fonte original (ou "X e Y" quando curadoria multi-fonte)
  fontes_cruzadas     jsonb,                       -- Curadoria Multi-Fonte (22/11/2026): [{nome, url}] de TODAS as fontes cruzadas, ou null quando a matéria veio de 1 fonte só
  origem_ia           origem_ia not null default 'claude',
  status              status_noticia not null default 'rascunho',
  destaque            boolean not null default false,
  urgente             boolean not null default false,
  visualizacoes       integer not null default 0,
  data_publicacao     timestamptz,                 -- usada pela Fila de Gotejamento
  criado_em           timestamptz not null default now(),
  atualizado_em       timestamptz not null default now()
);

do $$ begin
  alter table urls_processadas
    add constraint fk_urls_noticia foreign key (noticia_id) references noticias(id) on delete set null;
exception when duplicate_object then null; end $$;

create index if not exists idx_noticias_status on noticias (status);
create index if not exists idx_noticias_editoria on noticias (editoria);
create index if not exists idx_noticias_publicacao on noticias (data_publicacao);
create index if not exists idx_noticias_destaque on noticias (destaque) where destaque = true;

-- trigger simples para atualizado_em
create or replace function set_atualizado_em()
returns trigger as $$
begin
  new.atualizado_em = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_noticias_atualizado on noticias;
create trigger trg_noticias_atualizado
  before update on noticias
  for each row execute function set_atualizado_em();

-- ----------------------------------------------------------------------------
-- banners_publicidade: Motor de Publicidade Inteligente (4 níveis)
--   1. patrocinador_externo  — clientes pagos, com vigência e métricas
--   2. interno_ecossistema   — Metadoc Express, AzimuteGeo, Agrimensura
--   3. captacao_anunciante   — banners institucionais "Anuncie Aqui" (-> WhatsApp comercial)
--   4. adsense               — slots do Google AdSense
-- ----------------------------------------------------------------------------
create table if not exists banners_publicidade (
  id                  uuid primary key default gen_random_uuid(),
  nome_anunciante     text not null,
  tipo_anunciante     tipo_anunciante not null default 'captacao_anunciante',
  posicao             posicao_banner not null,
  imagem_url          text,                          -- null quando for slot de AdSense
  link_destino        text,                           -- URL de destino (ex: metadocexpress.com.br)
  link_whatsapp       text,                           -- usado por captacao_anunciante (WhatsApp comercial)
  is_adsense          boolean not null default false,
  ad_slot_id          text,                          -- id do slot do Google AdSense
  -- Exibição Contextual: palavras-chave/tags de matéria que priorizam este banner
  -- (ex: {'documento','cartorio','imovel','prefeitura'} prioriza Metadoc Express/Agrimensura;
  --      {'tecnologia','obra','engenharia','meio_ambiente'} prioriza AzimuteGeo)
  tags_contextuais    text[] not null default '{}',
  editorias_contextuais editoria[] not null default '{}',
  prioridade          smallint not null default 5 check (prioridade between 1 and 10), -- maior = prioridade maior no rodízio
  data_inicio         date not null default current_date,
  data_fim            date,
  ativo               boolean not null default true,
  cliques             integer not null default 0,
  visualizacoes       integer not null default 0,
  criado_em           timestamptz not null default now()
);

create index if not exists idx_banners_ativos on banners_publicidade (ativo, posicao);
create index if not exists idx_banners_tipo on banners_publicidade (tipo_anunciante);
create index if not exists idx_banners_tags on banners_publicidade using gin (tags_contextuais);
create index if not exists idx_banners_editorias on banners_publicidade using gin (editorias_contextuais);

-- ----------------------------------------------------------------------------
-- Função: seleciona o melhor banner para um slot, dado o contexto da matéria.
-- Prioridade de resolução:
--   1) interno_ecossistema / patrocinador_externo cujo tags_contextuais ou
--      editorias_contextuais casem com o contexto da matéria (maior prioridade primeiro)
--   2) patrocinador_externo ativo sem contexto específico (rodízio aleatório)
--   3) rodízio aleatório entre interno_ecossistema, captacao_anunciante e adsense
-- Uso típico (Fase 2, no frontend/API):
--   select * from obter_banner_contextual('lateral', array['documento','imovel'], 'boa_vista');
-- ----------------------------------------------------------------------------
create or replace function obter_banner_contextual(
  p_posicao posicao_banner,
  p_tags text[] default '{}',
  p_editoria editoria default null
)
returns setof banners_publicidade as $$
  with candidatos as (
    select b.*,
      case
        when b.tags_contextuais && p_tags then 2
        when p_editoria is not null and b.editorias_contextuais @> array[p_editoria] then 1
        else 0
      end as peso_contexto
    from banners_publicidade b
    where b.posicao = p_posicao
      and b.ativo = true
      and b.data_inicio <= current_date
      and (b.data_fim is null or b.data_fim >= current_date)
  )
  select id, nome_anunciante, tipo_anunciante, posicao, imagem_url, link_destino, link_whatsapp,
         is_adsense, ad_slot_id, tags_contextuais, editorias_contextuais, prioridade,
         data_inicio, data_fim, ativo, cliques, visualizacoes, criado_em
  from candidatos
  order by
    peso_contexto desc,                         -- casamento contextual primeiro
    (tipo_anunciante = 'patrocinador_externo') desc, -- depois quem paga
    prioridade desc,
    random()                                     -- rodízio entre os empatados
  limit 1;
$$ language sql stable;

-- ----------------------------------------------------------------------------
-- imagens_fallback: banco de imagens de segurança por categoria
-- ----------------------------------------------------------------------------
create table if not exists imagens_fallback (
  id         uuid primary key default gen_random_uuid(),
  editoria   editoria not null,
  url        text not null,
  descricao  text,
  padrao     boolean not null default false,  -- imagem padrão da categoria
  criado_em  timestamptz not null default now()
);

create index if not exists idx_imagens_fallback_editoria on imagens_fallback (editoria);

-- ----------------------------------------------------------------------------
-- logs_sistema: observabilidade do pipeline (coleta, IA, fallback, erros)
-- ----------------------------------------------------------------------------
create table if not exists logs_sistema (
  id          uuid primary key default gen_random_uuid(),
  nivel       nivel_log not null default 'info',
  origem      text not null,              -- ex: 'collector', 'gemini', 'claude', 'groq', 'queue'
  mensagem    text not null,
  detalhes    jsonb,
  fonte_id    uuid references fontes_monitoradas(id) on delete set null,
  noticia_id  uuid references noticias(id) on delete set null,
  criado_em   timestamptz not null default now()
);

create index if not exists idx_logs_nivel on logs_sistema (nivel);
create index if not exists idx_logs_criado_em on logs_sistema (criado_em desc);

-- ----------------------------------------------------------------------------
-- destinos_whatsapp: Fase 3 — Automação WhatsApp (grupos/canais de distribuição)
--   Cada destino tem seu próprio webhook (ex: Evolution API, WPPConnect, Z-API
--   ou similar) apontando pro grupo/canal certo. O worker e o admin nunca
--   guardam número/sessão do WhatsApp aqui — só a URL do webhook já configurado
--   no provedor escolhido na Fase 3.
-- ----------------------------------------------------------------------------
create table if not exists destinos_whatsapp (
  id            uuid primary key default gen_random_uuid(),
  nome          text not null,                 -- ex: "Grupo Boa Vista Notícias"
  tipo          tipo_destino_whatsapp not null default 'grupo',
  webhook_url   text not null,
  ativo         boolean not null default true,
  resumo_diario boolean not null default true, -- também recebe o resumo diário (além do disparo por matéria)
  criado_em     timestamptz not null default now()
);

create index if not exists idx_destinos_whatsapp_ativo on destinos_whatsapp (ativo);

-- ----------------------------------------------------------------------------
-- dicas_bairro: Pesquisadores por área (item 3) — frente B, denúncias/dicas
-- de moradores recebidas via webhook de WhatsApp (ainda a ser cadastrado no
-- provedor). O worker tenta redigir uma matéria a partir de cada dica
-- pendente; o resultado SEMPRE cai como notícia em status 'rascunho' —
-- nunca publica direto — porque é relato de cidadão sem qualquer verificação
-- prévia e pode envolver acusação contra alguém (risco de difamação).
-- ----------------------------------------------------------------------------
create table if not exists dicas_bairro (
  id                  uuid primary key default gen_random_uuid(),
  telefone_remetente  text,                         -- nunca exibido publicamente, só uso interno
  nome_remetente      text,
  mensagem_texto      text not null,
  midia_url           text,                         -- foto/áudio enviado pelo morador, se houver
  status              status_dica not null default 'pendente',
  motivo_descarte     text,
  noticia_id          uuid references noticias(id) on delete set null,
  criado_em           timestamptz not null default now(),
  processado_em       timestamptz
);

create index if not exists idx_dicas_status on dicas_bairro (status);
create index if not exists idx_dicas_criado_em on dicas_bairro (criado_em desc);

-- ----------------------------------------------------------------------------
-- reclamacoes_ouvidoria: Ouvidoria/correção pública (item 21) — canal pro
-- leitor apontar erro numa matéria (ou reclamação geral do portal). Pode
-- não estar ligado a nenhuma matéria específica (noticia_id null = relato
-- geral sobre o portal). Puramente mecânico, sem IA nenhuma envolvida —
-- o Valter lê e decide, igual um jornal de verdade faz com carta do leitor.
-- ----------------------------------------------------------------------------
create table if not exists reclamacoes_ouvidoria (
  id            uuid primary key default gen_random_uuid(),
  noticia_id    uuid references noticias(id) on delete set null,
  nome          text,                         -- opcional, leitor pode mandar anônimo
  email         text,                         -- opcional, só pra Valter responder se quiser
  mensagem      text not null,
  status        status_reclamacao not null default 'pendente',
  resposta_admin text,                        -- anotação interna de como foi resolvido
  criado_em     timestamptz not null default now(),
  respondido_em timestamptz
);

create index if not exists idx_reclamacoes_status on reclamacoes_ouvidoria (status);
create index if not exists idx_reclamacoes_criado_em on reclamacoes_ouvidoria (criado_em desc);

-- ----------------------------------------------------------------------------
-- relatorios_redacao: Painel do Administrador / Central de Transparência
-- (item 22) — evolução da Mesa de Redação IA. Cada área da redação de IA
-- (Editor-chefe, Editor de Imagens, Supervisor de Provedores de IA etc.)
-- registra um relato em linguagem simples do que fez e como está indo, e
-- pode marcar como 'pergunta' quando precisa de opinião/decisão do Valter,
-- que responde direto aqui, sem abrir SQL.
-- ----------------------------------------------------------------------------
create table if not exists relatorios_redacao (
  id             uuid primary key default gen_random_uuid(),
  papel          text not null,
  tipo           tipo_relatorio_redacao not null default 'informe',
  mensagem       text not null,
  detalhes       jsonb,
  status         status_relatorio_redacao not null default 'novo',
  resposta_admin text,
  criado_em      timestamptz not null default now(),
  respondido_em  timestamptz
);

create index if not exists idx_relatorios_status on relatorios_redacao (status);
create index if not exists idx_relatorios_tipo on relatorios_redacao (tipo);
create index if not exists idx_relatorios_criado_em on relatorios_redacao (criado_em desc);

-- Dedup do resumo diário — garante 1 envio por destino por dia mesmo se o
-- worker reiniciar ou o cron disparar 2x por engano.
create table if not exists resumos_diarios_enviados (
  id          uuid primary key default gen_random_uuid(),
  destino_id  uuid not null references destinos_whatsapp(id) on delete cascade,
  data_envio  date not null default current_date,
  enviado_em  timestamptz not null default now(),
  unique (destino_id, data_envio)
);

-- ----------------------------------------------------------------------------
-- Item 15 — Analista de Desempenho/Estratégia: funções que o site chama (via
-- service_role) pra incrementar visualizacoes/cliques de verdade. Ver
-- migracao-metricas-desempenho.sql pro contexto completo.
-- ----------------------------------------------------------------------------
create or replace function incrementar_visualizacao_noticia(p_id uuid)
returns void
language sql
as $$
  update noticias set visualizacoes = visualizacoes + 1 where id = p_id;
$$;

create or replace function incrementar_metrica_banner(p_id uuid, p_campo text)
returns void
language plpgsql
as $$
begin
  if p_campo = 'visualizacoes' then
    update banners_publicidade set visualizacoes = visualizacoes + 1 where id = p_id;
  elsif p_campo = 'cliques' then
    update banners_publicidade set cliques = cliques + 1 where id = p_id;
  end if;
end;
$$;

-- ----------------------------------------------------------------------------
-- Item 16 — Algoritmo de Personalização + Notificações: inscrições de push
-- dos leitores (sem cadastro/login, por navegador). Ver
-- migracao-push-notificacoes.sql pro contexto completo.
-- ----------------------------------------------------------------------------
create table if not exists push_subscriptions (
  id                   uuid primary key default gen_random_uuid(),
  endpoint             text not null unique,
  chave_p256dh         text not null,
  chave_auth           text not null,
  editorias_interesse  editoria[] not null default '{}', -- vazio = todas
  ativo                boolean not null default true,
  criado_em            timestamptz not null default now()
);

create index if not exists idx_push_subscriptions_ativo on push_subscriptions (ativo) where ativo = true;

-- ----------------------------------------------------------------------------
-- Seed inicial: fontes de exemplo e imagens de fallback padrão
-- ----------------------------------------------------------------------------
insert into fontes_monitoradas (nome, url_base, tipo, editoria_padrao)
values
  ('Prefeitura de Boa Vista', 'https://www.boavista.rr.gov.br/feed', 'rss', 'boa_vista'),
  ('Governo de Roraima', 'https://www.rr.gov.br/feed', 'rss', 'roraima'),
  ('Câmara Municipal de Boa Vista', 'https://camaraboavista.rr.gov.br/feed', 'rss', 'politica'),
  ('Diário Oficial de Roraima', 'https://doe.rr.gov.br', 'html', 'politica'),
  ('Polícia Civil de Roraima', 'https://pc.rr.gov.br/feed', 'rss', 'policia'),
  ('Assembleia Legislativa de Roraima (ALE-RR)', 'https://al.rr.leg.br/noticias/', 'html', 'politica')
on conflict do nothing;

-- Fontes de busca adicionadas depois, pra cobrir órgãos oficiais sem
-- página de notícias própria confiável (ver supabase/migracao-fontes-primarias.sql
-- pra detalhes da pesquisa que levou a cada uma).
insert into fontes_monitoradas (nome, url_base, tipo, editoria_padrao)
values
  ('Busca: Polícia Militar e Bombeiros de Roraima', 'notas oficiais da Polícia Militar de Roraima e do Corpo de Bombeiros Militar de Roraima', 'busca', 'policia'),
  ('Busca: Tribunal de Justiça de Roraima', 'notícias e decisões do Tribunal de Justiça de Roraima (TJRR)', 'busca', 'politica'),
  ('Busca: Diário Oficial do Município de Boa Vista', 'atos e publicações do Diário Oficial do Município de Boa Vista', 'busca', 'politica'),
  ('Busca: Diário Oficial da União em Roraima', 'atos do Diário Oficial da União sobre Roraima e Boa Vista', 'busca', 'politica'),
  ('Busca: Alertas meteorológicos INMET Roraima', 'alerta meteorológico do INMET para Roraima e Boa Vista hoje', 'busca', 'roraima'),
  ('Busca: IBGE Roraima', 'dados do IBGE sobre Roraima e Boa Vista', 'busca', 'roraima'),
  ('Busca: Banco Central e Receita Federal em Roraima', 'Banco Central e Receita Federal: economia e tributos em Roraima', 'busca', 'economia'),
  ('Busca: Portal da Transparência Roraima', 'Portal da Transparência: gastos públicos em Roraima e Boa Vista', 'busca', 'politica')
on conflict do nothing;

-- Equilíbrio de Proporção, parte 2 (22/11/2026): essas 8 fontes de busca são
-- cobertura suplementar (não o foco local principal), e sem teto podiam
-- aumentar demais o volume diário coletado, empurrando a Fila de
-- Gotejamento pra além do que consegue escoar em 24h — notícia saindo
-- atrasada pro dia seguinte. Mesmo princípio do teto da "Busca: Brasil e
-- Mundo" abaixo, só que mais conservador (2/dia cada).
update fontes_monitoradas set limite_diario = 2
where nome in (
  'Busca: Polícia Militar e Bombeiros de Roraima',
  'Busca: Tribunal de Justiça de Roraima',
  'Busca: Diário Oficial do Município de Boa Vista',
  'Busca: Diário Oficial da União em Roraima',
  'Busca: Alertas meteorológicos INMET Roraima',
  'Busca: IBGE Roraima',
  'Busca: Banco Central e Receita Federal em Roraima',
  'Busca: Portal da Transparência Roraima'
);

-- Temas de busca já prontos de fábrica — a IA já sai pesquisando esses temas
-- sozinha a cada ciclo, sem precisar de nenhuma configuração manual extra.
-- Um tema por editoria, cobrindo o fluxo diário de notícias.
insert into fontes_monitoradas (nome, url_base, tipo, editoria_padrao)
values
  ('Busca: Boa Vista', 'notícias de Boa Vista hoje', 'busca', 'boa_vista'),
  ('Busca: Roraima', 'notícias de Roraima hoje', 'busca', 'roraima'),
  ('Busca: Polícia', 'ocorrências policiais em Boa Vista e Roraima', 'busca', 'policia'),
  ('Busca: Política', 'política em Roraima e Boa Vista', 'busca', 'politica'),
  ('Busca: Economia', 'economia em Roraima e Boa Vista', 'busca', 'economia'),
  ('Busca: Esportes', 'esportes em Roraima e Boa Vista', 'busca', 'esportes'),
  ('Busca: Brasil e Mundo', 'principais notícias do Brasil e do mundo hoje', 'busca', 'brasil_mundo'),
  ('Busca: Saúde', 'saúde em Roraima e Boa Vista', 'busca', 'saude'),
  ('Busca: Educação', 'educação em Roraima e Boa Vista', 'busca', 'educacao'),
  ('Busca: Cultura', 'cultura em Roraima e Boa Vista', 'busca', 'cultura')
on conflict do nothing;

-- Equilíbrio de Proporção (flagrado na auditoria de 21/11/2026): "Busca:
-- Brasil e Mundo" é um tema sempre-renovado que, sem teto, dominava o feed
-- em cima da cobertura local — que é o foco principal do portal. Limita a
-- no máximo 5 notícias/dia vindas dessa fonte.
update fontes_monitoradas set limite_diario = 5 where nome = 'Busca: Brasil e Mundo';

-- Rede própria (interno_ecossistema) + banner de captação comercial
insert into banners_publicidade
  (nome_anunciante, tipo_anunciante, posicao, imagem_url, link_destino, link_whatsapp, tags_contextuais, editorias_contextuais, prioridade, data_inicio)
values
  (
    'Metadoc Express', 'interno_ecossistema', 'meio_materia',
    'https://images.example.com/banners/metadoc-express.jpg', 'https://metadocexpress.com.br', null,
    array['documento','cartorio','imovel','prefeitura','procuracao','recibo','termo','regularizacao'],
    array['boa_vista','roraima','politica']::editoria[],
    8, current_date
  ),
  (
    'AzimuteGeo', 'interno_ecossistema', 'lateral',
    'https://images.example.com/banners/azimutegeo.jpg', 'https://azimutegeo.com.br', null,
    array['tecnologia','obra','engenharia','meio_ambiente','topografia','geoprocessamento','cartografia'],
    array['economia','roraima']::editoria[],
    8, current_date
  ),
  (
    'Serviços de Agrimensura e Topografia', 'interno_ecossistema', 'rodape',
    'https://images.example.com/banners/agrimensura.jpg', 'https://radarbv.com.br/parceiros/agrimensura', null,
    array['agrimensura','topografia','regularizacao','imovel','lote','fundiario','incra'],
    array['boa_vista','roraima']::editoria[],
    8, current_date
  ),
  (
    'Anuncie Aqui no Radar BV', 'captacao_anunciante', 'topo',
    'https://images.example.com/banners/anuncie-aqui.jpg', null,
    'https://wa.me/5595000000000?text=Quero%20anunciar%20no%20Radar%20BV',
    '{}', '{}', 3, current_date
  )
on conflict do nothing;

-- Imagem institucional real (não uma URL fictícia) usada como fallback de
-- segurança quando nenhuma API de banco de fotos livre (Unsplash/Pexels/
-- Pixabay) encontra uma foto para a matéria.
insert into imagens_fallback (editoria, url, descricao, padrao)
values
  ('boa_vista', 'https://radarbv.com.br/img/fallback/generico.jpg', 'Imagem institucional Radar BV', true),
  ('roraima', 'https://radarbv.com.br/img/fallback/generico.jpg', 'Imagem institucional Radar BV', true),
  ('policia', 'https://radarbv.com.br/img/fallback/generico.jpg', 'Imagem institucional Radar BV', true),
  ('politica', 'https://radarbv.com.br/img/fallback/generico.jpg', 'Imagem institucional Radar BV', true),
  ('economia', 'https://radarbv.com.br/img/fallback/generico.jpg', 'Imagem institucional Radar BV', true),
  ('esportes', 'https://radarbv.com.br/img/fallback/generico.jpg', 'Imagem institucional Radar BV', true),
  ('brasil_mundo', 'https://radarbv.com.br/img/fallback/generico.jpg', 'Imagem institucional Radar BV', true),
  ('servico_cidadao', 'https://radarbv.com.br/img/fallback/generico.jpg', 'Imagem institucional Radar BV', true)
on conflict do nothing;

-- ----------------------------------------------------------------------------
-- RLS básico (leitura pública de notícias publicadas; escrita só via service_role)
-- ----------------------------------------------------------------------------
alter table noticias enable row level security;
alter table banners_publicidade enable row level security;
alter table imagens_fallback enable row level security;
alter table fontes_monitoradas enable row level security;
alter table urls_processadas enable row level security;
alter table logs_sistema enable row level security;
alter table destinos_whatsapp enable row level security;
alter table resumos_diarios_enviados enable row level security;
alter table dicas_bairro enable row level security;
alter table push_subscriptions enable row level security;
alter table reclamacoes_ouvidoria enable row level security;
alter table relatorios_redacao enable row level security;

drop policy if exists "noticias_leitura_publica" on noticias;
create policy "noticias_leitura_publica" on noticias
  for select using (status = 'publicado');

drop policy if exists "banners_leitura_publica" on banners_publicidade;
create policy "banners_leitura_publica" on banners_publicidade
  for select using (ativo = true);

-- As demais tabelas (fontes_monitoradas, urls_processadas, logs_sistema, imagens_fallback
-- em escrita, e noticias em insert/update/delete) são acessadas exclusivamente pelo
-- worker usando a service_role key do Supabase, que ignora RLS por padrão.
-- destinos_whatsapp e resumos_diarios_enviados seguem a mesma regra: sem policy
-- de leitura pública — só o worker (coleta/disparo) e o painel admin (Fase 3,
-- também com service_role, nunca exposta ao navegador) têm acesso.
-- dicas_bairro segue a mesma regra: sem policy de leitura pública — só o
-- worker (processamento) e o painel admin (revisão/transparência) acessam.

-- ----------------------------------------------------------------------------
-- Pesquisadores por área (item 3) — varredura na web por bairro/zona/interior.
-- Reaproveita 100% o tipo de fonte "busca" já existente (pesquisador.ts) —
-- sem tabela nova, sem código novo no worker, só mais fontes cadastradas.
-- Ver supabase/migracao-pesquisadores-area.sql para o insert idempotente
-- (roda separado porque usa "where not exists" em vez de "on conflict",
-- já que nome não é unique nesta tabela).
-- ----------------------------------------------------------------------------
