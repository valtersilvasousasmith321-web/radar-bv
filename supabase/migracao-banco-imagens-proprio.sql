-- Migração: transforma o "imagens_fallback" (que hoje só tem 1 imagem
-- genérica repetida pras 7 editorias) num banco de imagens PRÓPRIAS de
-- verdade, com várias fotos por tema (obras, prédio público, polícia,
-- rio/seca, panorama da cidade), buscadas por tag antes mesmo de tentar
-- Unsplash/Pixabay/Pexels — porque foto de estoque internacional nunca vai
-- mostrar a rua, o prédio ou a viatura de verdade de Boa Vista.
--
-- Rode isto inteiro de uma vez só no SQL Editor do Supabase.

-- 1) Nova coluna de tags (uma imagem pode servir pra mais de um assunto)
alter table imagens_fallback add column if not exists tags text[] not null default '{}';

-- 2) Cadastra as fotos próprias enviadas pelo Valter, já com URL pública
--    (arquivos publicados em apps/web/public/img/fallback/, servidos pelo
--    próprio domínio radarbv.com.br — mesmo esquema da imagem genérica atual)
-- Observação: a IA gera a palavra-chave de imagem EM INGLÊS (ver prompts.ts),
-- então cada foto leva tags em português E em inglês, pra bater nos dois casos.
insert into imagens_fallback (editoria, url, descricao, padrao, tags)
values
  ('boa_vista', 'https://radarbv.com.br/img/fallback/pavimentacao-1.jpg', 'Obra de pavimentação em via de Boa Vista', false, array['pavimentacao','obras','asfalto','infraestrutura','road paving','asphalt','construction work','road work']),
  ('boa_vista', 'https://radarbv.com.br/img/fallback/pavimentacao-2.jpg', 'Obra de pavimentação e drenagem em Boa Vista', false, array['pavimentacao','obras','drenagem','infraestrutura','road paving','drainage work','excavator','construction']),
  ('boa_vista', 'https://radarbv.com.br/img/fallback/panorama-cidade-1.jpg', 'Vista aérea panorâmica de Boa Vista', false, array['panorama','cidade','vista aerea','boa vista','city aerial view','city skyline','aerial view city']),
  ('roraima', 'https://radarbv.com.br/img/fallback/rio-1.jpg', 'Rio em Roraima ao entardecer', false, array['rio','entardecer','natureza','river sunset','riverbank']),
  ('roraima', 'https://radarbv.com.br/img/fallback/seca-rio-1.jpg', 'Banco de areia por estiagem em rio de Roraima', false, array['seca','estiagem','rio','nivel do rio','banco de areia','drought','dry river','low water level','sandbank']),
  ('roraima', 'https://radarbv.com.br/img/fallback/seca-rio-2.jpg', 'Banco de areia e ponte por estiagem em Roraima', false, array['seca','estiagem','rio','nivel do rio','banco de areia','drought','dry river','low water level','sandbank']),
  ('politica', 'https://radarbv.com.br/img/fallback/predio-publico-1.jpg', 'Prédio público institucional de Roraima', false, array['predio publico','governo','orgao publico','institucional','government building','public office']),
  ('politica', 'https://radarbv.com.br/img/fallback/predio-publico-2.jpg', 'Palácio 9 de Julho, sede da Prefeitura de Boa Vista', false, array['prefeitura','palacio 9 de julho','governo municipal','predio publico','city hall','municipal government']),
  ('politica', 'https://radarbv.com.br/img/fallback/predio-publico-3.jpg', 'Casa da Mulher Brasileira, Boa Vista', false, array['casa da mulher brasileira','predio publico','servico publico','public service building','women support center']),
  ('policia', 'https://radarbv.com.br/img/fallback/policia-1.jpg', '5º Distrito Policial, Boa Vista', false, array['policia','delegacia','distrito policial','seguranca','police station','police department']),
  ('policia', 'https://radarbv.com.br/img/fallback/policia-2.jpg', 'Viatura do programa Polícia Na Rua', false, array['policia','viatura','seguranca','patrulhamento','police car','police patrol']),
  ('policia', 'https://radarbv.com.br/img/fallback/policia-3.jpg', 'Viatura policial em ação noturna', false, array['policia','viatura','seguranca','ocorrencia','police car night','police lights'])
on conflict do nothing;
