-- ============================================================================
-- Item 16 do plano — Algoritmo de Personalização + Notificações
--
-- Guarda as inscrições de notificação push dos leitores (sem cadastro/login
-- — é por navegador, via a API nativa de Push do próprio navegador). Cada
-- leitor escolhe, no momento que ativa a notificação, quais editorias quer
-- acompanhar (vazio = recebe de todas) — essa escolha é a "personalização"
-- do item 16: mais simples e honesta que tentar adivinhar o interesse do
-- leitor sem ele nunca ter dito nada.
-- ============================================================================

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

alter table push_subscriptions enable row level security;
-- Sem policy de leitura/escrita pública — só o service_role (worker e as
-- rotas /api/notificacoes/* do site, via supabaseAdmin()) acessa esta
-- tabela, igual destinos_whatsapp e dicas_bairro.
