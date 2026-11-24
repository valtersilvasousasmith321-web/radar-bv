-- ============================================================================
-- NOVAS FONTES: imprensa local tradicional de Boa Vista/Roraima
-- ============================================================================
-- POR QUE ISSO RESOLVE O PROBLEMA:
-- Hoje o Radar BV só monitora direto órgãos oficiais (Prefeitura, Governo,
-- Câmara, Polícia Civil, ALE-RR) + buscas genéricas de IA tipo "notícias de
-- Boa Vista hoje". Isso cobre bem o que sai em nota oficial, mas perde o
-- jornalismo de rua que os jornais locais tradicionais fazem todo dia:
-- acidente, reclamação de bairro, pauta de comércio, evento, etc. — fatos
-- que nunca viram nota oficial de governo, só reportagem direta.
--
-- A correção: monitorar DIRETO as páginas desses jornais (não mais só via
-- busca genérica), do mesmo jeito que já é feito com a Câmara e a ALE-RR
-- (tipo 'html' lê a página de notícias e separa cada matéria automaticamente).
-- Isso pega TODA matéria nova que esses jornais publicam, em vez de só
-- flagrar uma amostra de vez em quando como a busca genérica fazia.
--
-- creditar_publicamente = false em todas: são concorrentes, então — igual já
-- acontece com G1 — nunca aparecem como crédito público da notícia; o
-- sistema sempre busca a fonte primária real (prefeitura, polícia, pessoa
-- envolvida etc.) dentro do próprio texto pra creditar. Isso já é a mesma
-- regra que corrigimos hoje mais cedo pro caso do G1 em Macapá.
--
-- editoria_padrao fica em branco (null) de propósito: diferente da
-- Prefeitura (que só fala de Boa Vista) ou da Polícia Civil (que só fala de
-- polícia), um jornal geral cobre política, polícia, economia, esporte,
-- cultura etc. tudo junto — é a própria triagem de IA que vai ler cada
-- matéria e decidir a editoria certa, matéria por matéria.
-- ============================================================================

insert into fontes_monitoradas (nome, url_base, tipo, editoria_padrao, creditar_publicamente)
values
  ('Folha de Boa Vista (FolhaBV)', 'https://www.folhabv.com.br/', 'html', null, false),
  ('Roraima em Foco', 'https://roraimaemfoco.com/', 'html', null, false)
on conflict do nothing;
