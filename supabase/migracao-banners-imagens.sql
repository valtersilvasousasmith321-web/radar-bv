-- Migração: corrige as imagens de banner que nunca existiram de verdade
-- (apontavam pra "images.example.com", um domínio de exemplo que nunca
-- teve nada hospedado — por isso nenhum banner aparecia no site, só o
-- texto) e cadastra o banner do V.S.S (Agrimensura e Topografia, serviço
-- do próprio Valter), que ainda não tinha linha nenhuma na tabela.
--
-- Rode isto inteiro de uma vez só no SQL Editor do Supabase.

-- 1) Corrige a imagem do Metadoc Express
update banners_publicidade
set imagem_url = 'https://radarbv.com.br/img/banners/metadocexpress.jpg'
where nome_anunciante = 'Metadoc Express';

-- 2) Corrige a imagem do AzimuteGeo
update banners_publicidade
set imagem_url = 'https://radarbv.com.br/img/banners/azimutegeo.jpg'
where nome_anunciante = 'AzimuteGeo';

-- 3) Cadastra o banner do V.S.S (Agrimensura e Topografia), que entra
--    quando a matéria toca em documento/imóvel/regularização/agrimensura
--    (ver TAGS_CRUZAMENTO_ANUNCIOS em prompts.ts)
insert into banners_publicidade
  (nome_anunciante, tipo_anunciante, posicao, imagem_url, link_destino, link_whatsapp, tags_contextuais, editorias_contextuais, prioridade, data_inicio)
values
  (
    'V.S.S Agrimensura', 'interno_ecossistema', 'lateral',
    'https://radarbv.com.br/img/banners/vss-agrimensura.jpg', null, 'https://wa.me/5595984308025',
    array['agrimensura','topografia','regularizacao','imovel','lote','fundiario','incra','documento','cartorio'],
    array['boa_vista','roraima','economia']::editoria[],
    9, current_date
  )
on conflict do nothing;
