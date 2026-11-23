-- ----------------------------------------------------------------------------
-- Item 22 do plano — Painel do Administrador / Central de Transparência:
-- evolução da "Mesa de Redação IA" (que só mostra UMA etapa técnica atual).
-- Aqui cada área da redação de IA (Editor-chefe, Editor de Imagens, Supervisor
-- de Provedores de IA, etc.) registra um relato em linguagem simples do que
-- fez e como está indo — e pode marcar como "pergunta" quando precisa de uma
-- opinião/decisão do Valter, que responde direto no painel, sem abrir SQL.
-- ----------------------------------------------------------------------------

do $$ begin
  create type tipo_relatorio_redacao as enum ('informe', 'pergunta');
exception when duplicate_object then null; end $$;

do $$ begin
  create type status_relatorio_redacao as enum ('novo', 'lido', 'respondido');
exception when duplicate_object then null; end $$;

create table if not exists relatorios_redacao (
  id             uuid primary key default gen_random_uuid(),
  papel          text not null,                -- ex: 'Editor-chefe', 'Editor de Imagens', 'Supervisor de Provedores de IA'
  tipo           tipo_relatorio_redacao not null default 'informe',
  mensagem       text not null,                -- sempre em português simples, pronto pra um leigo ler
  detalhes       jsonb,                         -- contexto estruturado opcional (url, titulo, provedor etc.)
  status         status_relatorio_redacao not null default 'novo',
  resposta_admin text,                         -- opinião/decisão do Valter, quando tipo = 'pergunta'
  criado_em      timestamptz not null default now(),
  respondido_em  timestamptz
);

create index if not exists idx_relatorios_status on relatorios_redacao (status);
create index if not exists idx_relatorios_tipo on relatorios_redacao (tipo);
create index if not exists idx_relatorios_criado_em on relatorios_redacao (criado_em desc);

alter table relatorios_redacao enable row level security;
-- Sem policy pública — só o worker (service_role, grava) e o painel admin
-- (service_role, lê/responde) acessam esta tabela, igual ao resto do banco.
