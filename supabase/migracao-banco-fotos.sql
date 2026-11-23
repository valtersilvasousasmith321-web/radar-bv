-- ============================================================================
-- Banco de fotos do painel admin + bucket de Storage
-- ============================================================================
-- Pedido do Valter: ele quer (1) poder trocar a foto de uma notícia já
-- publicada por uma mais recente/nítida que ele tiver, (2) ter um "banco de
-- fotos" reutilizável dentro do painel pra guardar fotos (inclusive de
-- eventos em tempo real, tipo um acidente) e usar em várias notícias, e
-- (3) poder criar uma notícia manualmente (foto + texto), sem passar pela
-- esteira de IA.
--
-- Isso é DIFERENTE da tabela `imagens_fallback` que já existe: aquela é só
-- pro pipeline automático de IA usar quando nenhuma API de banco de imagem
-- (Unsplash/Pexels/Pixabay) acha uma foto adequada pra uma editoria. Esta
-- aqui (`banco_fotos`) é de uso manual do Valter, com fotos que ele mesmo
-- envia.
--
-- Rode este arquivo inteiro de uma vez no SQL Editor do Supabase.
-- ============================================================================

-- 1) Tabela que guarda os metadados de cada foto enviada pelo painel admin.
--    O arquivo em si fica no Storage (bucket "fotos" criado abaixo); aqui só
--    fica a URL pública, o caminho interno (pra poder excluir o arquivo
--    depois) e uma descrição/editoria pra facilitar achar a foto certa.
create table if not exists banco_fotos (
  id              uuid primary key default gen_random_uuid(),
  url             text not null,
  caminho_storage text not null,          -- caminho dentro do bucket "fotos", usado pra excluir o arquivo
  descricao       text,                    -- texto livre pra identificar a foto (ex: "Acidente na BR-174, km 12")
  editoria        editoria,                -- opcional: facilita filtrar fotos por assunto
  enviada_por     text,                    -- quem fez o upload (hoje sempre "Valter", mas deixa pronto pra mais de 1 admin)
  criado_em       timestamptz not null default now()
);

create index if not exists idx_banco_fotos_editoria on banco_fotos (editoria);
create index if not exists idx_banco_fotos_criado_em on banco_fotos (criado_em desc);

-- RLS ligado, mas sem nenhuma policy: só o painel admin acessa esta tabela,
-- e ele usa a service_role key (supabaseAdmin), que ignora RLS. Isso impede
-- qualquer acesso via chave pública (anon), que é o que o site usa.
alter table banco_fotos enable row level security;

-- 2) Bucket de Storage "fotos" — público pra leitura (as imagens precisam
--    aparecer no site), mas sem policy de escrita/exclusão pública: só quem
--    tem a service_role key (o painel admin) consegue enviar ou apagar
--    arquivos. Buckets no Supabase Storage podem ser criados direto via SQL,
--    sem precisar mexer no painel.
insert into storage.buckets (id, name, public)
values ('fotos', 'fotos', true)
on conflict (id) do nothing;

-- Policy de leitura pública do bucket "fotos" (necessária mesmo com
-- public=true em algumas versões do Supabase, pra liberar SELECT no
-- storage.objects pra qualquer um, inclusive visitante não-logado do site).
do $$ begin
  create policy "Leitura publica do bucket fotos"
    on storage.objects for select
    using (bucket_id = 'fotos');
exception
  when duplicate_object then null;
end $$;

-- Nenhuma policy de insert/update/delete é criada de propósito: uploads e
-- exclusões só acontecem via Server Action do painel admin, que usa a
-- service_role key e por isso ignora RLS — não precisa de policy pra isso,
-- e não queremos abrir escrita pública no bucket.
