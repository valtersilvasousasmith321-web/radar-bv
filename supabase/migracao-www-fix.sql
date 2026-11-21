-- Migração: o domínio "radarbv.com.br" sem "www" está com timeout de conexão
-- (confirmado testando direto no navegador), enquanto "www.radarbv.com.br"
-- funciona normal. Todas as imagens cadastradas até agora (banners e banco
-- de imagens próprias) usavam a versão sem www — por isso nenhuma imagem
-- própria carregava, mesmo com a URL certa no banco. Esta migração troca
-- todas de uma vez, nas duas tabelas.
--
-- Rode isto inteiro de uma vez só no SQL Editor do Supabase.

update banners_publicidade
set imagem_url = replace(imagem_url, 'https://radarbv.com.br', 'https://www.radarbv.com.br')
where imagem_url like 'https://radarbv.com.br%';

update imagens_fallback
set url = replace(url, 'https://radarbv.com.br', 'https://www.radarbv.com.br')
where url like 'https://radarbv.com.br%';

-- Confira o resultado:
select nome_anunciante, imagem_url from banners_publicidade order by nome_anunciante;
select editoria, url from imagens_fallback order by editoria;
