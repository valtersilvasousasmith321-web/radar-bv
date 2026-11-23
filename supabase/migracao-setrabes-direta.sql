-- ============================================================================
-- RADAR BV — Migração: Setrabes direto (Serviço ao Cidadão)
--
-- Valter apontou: "uma fonte garantida é a Setrabes" — faz todo sentido,
-- é exatamente o órgão por trás do Sine-RR (vagas de emprego), que hoje
-- só aparece via busca por IA. Confirmei que o domínio oficial existe:
-- www.setrabes.rr.gov.br (Secretaria de Estado do Trabalho e Bem-Estar
-- Social de Roraima — citado como site oficial em matéria de concurso).
--
-- O que eu NÃO confirmei (sendo honesto): o caminho exato de uma página
-- de listagem de notícias/vagas dentro do site (tipo /noticias). Por
-- isso cadastrei a página inicial — o coletor HTML já lida com isso dos
-- dois jeitos: se achar links de notícia na home, coleta cada um
-- separado; se não achar nenhum link de matéria (ex: página só
-- institucional), trata a página inteira como 1 item só, sem quebrar
-- nada. E se a URL estiver errada ou o site mudar de estrutura, essa
-- fonte isola o erro sozinha e se desativa depois de 10 falhas seguidas
-- — não derruba as outras fontes.
--
-- Se depois de rodar um tempo a coleta vier fraca ou vazia dessa fonte,
-- me manda um print de /admin/fontes com ela aberta (campo "último
-- erro") que eu ajusto a URL certa.
--
-- Seguro rodar mais de uma vez (idempotente).
-- ============================================================================

insert into fontes_monitoradas (nome, url_base, tipo, editoria_padrao, confiabilidade)
select 'Setrabes-RR (Trabalho e Bem-Estar Social)', 'https://www.setrabes.rr.gov.br/', 'html', 'servico_cidadao'::editoria, 7
where not exists (
  select 1 from fontes_monitoradas where nome = 'Setrabes-RR (Trabalho e Bem-Estar Social)'
);
