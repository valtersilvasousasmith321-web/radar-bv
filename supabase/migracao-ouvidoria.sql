-- Migração: Ouvidoria/correção pública (item 21 do plano) — canal pro
-- leitor apontar erro numa matéria, e nota de correção visível quando algo
-- é corrigido. Sem IA envolvida, só banco + painel admin.
--
-- IMPORTANTE: rode em DUAS ETAPAS SEPARADAS no SQL Editor do Supabase
-- (o Bloco 1 cria o tipo ENUM novo; o Postgres só deixa usar esse tipo
-- numa tabela depois que ele já foi confirmado — mesma regra das migrações
-- anteriores de ENUM).

-- ========== BLOCO 1 — rode isto primeiro ==========
create type status_reclamacao as enum ('pendente', 'respondida', 'arquivada');

-- ========== BLOCO 2 — rode isto DEPOIS do bloco 1 (numa segunda execução) ==========
alter table noticias add column if not exists correcoes jsonb not null default '[]';

create table if not exists reclamacoes_ouvidoria (
  id            uuid primary key default gen_random_uuid(),
  noticia_id    uuid references noticias(id) on delete set null,
  nome          text,
  email         text,
  mensagem      text not null,
  status        status_reclamacao not null default 'pendente',
  resposta_admin text,
  criado_em     timestamptz not null default now(),
  respondido_em timestamptz
);

create index if not exists idx_reclamacoes_status on reclamacoes_ouvidoria (status);
create index if not exists idx_reclamacoes_criado_em on reclamacoes_ouvidoria (criado_em desc);
