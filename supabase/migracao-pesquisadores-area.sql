-- ============================================================================
-- RADAR BV — Migração: Pesquisadores por Área (item 3 do Plano da Redação de IA)
--
-- Duas frentes, do jeito que o Valter decidiu:
--   A) VARREDURA NA WEB: novas fontes do tipo "busca" (já existente desde o
--      pesquisador.ts) perguntando por bairro/zona/interior — reaproveita
--      100% do pipeline normal (triagem -> redação -> fila), sem código novo
--      no worker. Entram como qualquer outra fonte, sem vigilância extra,
--      porque já é conteúdo pesquisado e filtrado como notícia real.
--   B) DENÚNCIAS/DICAS VIA WHATSAPP: tabela nova pra guardar mensagens de
--      moradores recebidas por um webhook novo (ainda sem recepção hoje, só
--      disparo). Como é relato de cidadão sem qualquer verificação prévia —
--      e pode vir com acusação contra alguém — a matéria rascunhada por IA
--      a partir disso SEMPRE cai em draft (rascunho) pra revisão humana
--      obrigatória no próprio painel admin (Notícias -> aba Rascunho ->
--      Publicar), que já existe e não precisa de nada novo.
--
-- Rode este arquivo completo no SQL Editor do Supabase. É seguro rodar mais
-- de uma vez (idempotente).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- A) Varredura na web por bairro/zona/interior — fontes tipo "busca"
-- ----------------------------------------------------------------------------
insert into fontes_monitoradas (nome, url_base, tipo, editoria_padrao, confiabilidade)
select v.nome, v.tema, 'busca', v.editoria, 6
from (
  values
    (
      'Pesquisador de Bairro — Centro e Liberdade (Boa Vista)',
      'notícias de hoje ou dos últimos dias nos bairros Centro, Liberdade, Caranã e São Francisco em Boa Vista, Roraima: buraco na rua, falta de pavimentação, problema de iluminação pública, pequeno furto ou roubo, acidente de trânsito local, problema em posto de saúde, reclamação de moradores sobre serviço público',
      'boa_vista'
    ),
    (
      'Pesquisador de Bairro — Zona Oeste (Boa Vista)',
      'notícias de hoje ou dos últimos dias nos bairros Pricumã, Caimbé, Cinturão Verde, São Vicente e São Pedro em Boa Vista, Roraima: buraco na rua, falta de pavimentação, problema de iluminação pública, pequeno furto ou roubo, acidente de trânsito local, problema em posto de saúde, reclamação de moradores sobre serviço público',
      'boa_vista'
    ),
    (
      'Pesquisador de Bairro — Zona Leste (Boa Vista)',
      'notícias de hoje ou dos últimos dias nos bairros Cidade Satélite, União, Equatorial, Mecejana e Aeroporto em Boa Vista, Roraima: buraco na rua, falta de pavimentação, problema de iluminação pública, pequeno furto ou roubo, acidente de trânsito local, problema em posto de saúde, reclamação de moradores sobre serviço público',
      'boa_vista'
    ),
    (
      'Pesquisador de Bairro — Zona Sul (Boa Vista)',
      'notícias de hoje ou dos últimos dias nos bairros Jardim Floresta, Tancredo Neves, Raiar do Sol, Buritis e Treze de Setembro em Boa Vista, Roraima: buraco na rua, falta de pavimentação, problema de iluminação pública, pequeno furto ou roubo, acidente de trânsito local, problema em posto de saúde, reclamação de moradores sobre serviço público',
      'boa_vista'
    ),
    (
      'Pesquisador de Zona Rural — PA Nova Amazônia e entorno',
      'notícias de hoje ou dos últimos dias na zona rural de Boa Vista, Roraima, especialmente no PA Nova Amazônia, Murupu e vicinais do entorno: problema em estrada/vicinal, ponte danificada, falta de energia ou água, dificuldade de acesso, problema em posto de saúde rural, assistência do INCRA, pequeno incidente local',
      'roraima'
    ),
    (
      'Pesquisador do Interior — municípios de Roraima',
      'notícias de hoje ou dos últimos dias nos municípios do interior de Roraima (Rorainópolis, Mucajaí, Alto Alegre, Caracaraí, Cantá, Bonfim, Normandia, Pacaraima, Amajari, Caroebe, Iracema, São João da Baliza, São Luiz, Uiramutã): problema de infraestrutura local, estrada, saúde, educação, pequeno incidente, ação da prefeitura ou de órgão público',
      'roraima'
    )
) as v(nome, tema, editoria)
where not exists (
  select 1 from fontes_monitoradas f where f.nome = v.nome
);

-- ----------------------------------------------------------------------------
-- B) Denúncias/dicas de moradores via WhatsApp
-- ----------------------------------------------------------------------------
do $$ begin
  create type status_dica as enum ('pendente', 'processada', 'descartada');
exception when duplicate_object then null; end $$;

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

alter table dicas_bairro enable row level security;
-- Sem policy de leitura pública: só o worker (processamento) e o painel
-- admin (transparência/revisão), ambos via service_role, acessam esta
-- tabela — mesma regra de destinos_whatsapp e logs_sistema.
