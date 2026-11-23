-- ============================================================================
-- RADAR BV — Migração: fontes diretas pra Economia e Esportes
--
-- Pedido do Valter: "Existe um outro meio de busca sem ser por inteligência
-- artificial, que a gente consegue essas notícias?" — Economia e Esportes
-- hoje só têm a fonte genérica "Busca: Economia"/"Busca: Esportes" (tipo
-- 'busca', 100% dependente da IA pesquisar do zero a cada ciclo). Isso é
-- caro e lento. Aqui entram fontes REAIS que o coletor já sabe ler sozinho
-- (tipo 'rss'/'html'), sem gastar nenhuma chamada de IA pra descobrir o
-- que existe — a IA só entra depois, pra redigir.
--
-- Pesquisei antes de cadastrar cada uma (nada aqui é chute):
--
-- - Agência Brasil — Economia: confirmei que o feed
--   https://agenciabrasil.ebc.com.br/rss/economia/feed.xml existe e está
--   ativo (indexado por agregadores de RSS, atualizado a cada poucas
--   horas). Agência Brasil é da EBC (empresa pública federal de
--   comunicação) — mesma fonte que já usamos pra Brasil/Mundo, não é
--   concorrente comercial.
-- - Agência Brasil — Esportes: mesma estrutura de URL
--   (https://agenciabrasil.ebc.com.br/rss/esportes/feed.xml), confirmada
--   pela listagem de editorias do próprio site (Economia e Esportes
--   aparecem lado a lado como seções). Não achei confirmação de terceiro
--   especificamente pra essa (só pra Economia), então é "muito provável"
--   e não "100% confirmada" — mas o coletor já isola erro por fonte: se
--   o link estiver errado, essa fonte simplesmente não traz nada e some
--   sozinha depois de 10 falhas seguidas, sem travar as outras.
-- - Federação Roraimense de Futebol (FRF) — futebolroraimense.com.br:
--   site oficial real da federação (confirmado — tem até matéria do
--   FolhaBV contando que foi a primeira federação do país a ter site
--   próprio), com página de notícias em /notícias. Cobre o futebol
--   roraimense de verdade (campeonatos estaduais), que a Agência Brasil
--   não cobre. Não é concorrente comercial — é a entidade do esporte.
--
-- O que eu PROCUREI e NÃO achei (fiquei de fora de propósito, em vez de
-- arriscar URL quebrada): uma página oficial real de vagas do SINE, de
-- editais/concursos ou de matrícula escolar em Roraima. Esses avisos
-- saem como nota de imprensa da Setrabes/Seed (Secom-RR), reproduzida
-- pelos portais — não achei uma página de listagem própria do governo
-- pra isso. Por enquanto esses 3 continuam só no tipo 'busca' (já
-- cadastrados desde a Parte 2 do Serviço ao Cidadão); dá pra revisitar
-- se aparecer uma fonte direta real no futuro.
--
-- Seguro rodar mais de uma vez (idempotente).
-- ============================================================================

insert into fontes_monitoradas (nome, url_base, tipo, editoria_padrao, confiabilidade)
select v.nome, v.url, v.tipo::tipo_fonte, v.editoria::editoria, v.confiabilidade
from (
  values
    ('Agência Brasil — Economia', 'https://agenciabrasil.ebc.com.br/rss/economia/feed.xml', 'rss', 'economia', 7),
    ('Agência Brasil — Esportes', 'https://agenciabrasil.ebc.com.br/rss/esportes/feed.xml', 'rss', 'esportes', 6),
    ('Federação Roraimense de Futebol (FRF)', 'https://www.futebolroraimense.com.br/notícias', 'html', 'esportes', 7)
) as v(nome, url, tipo, editoria, confiabilidade)
where not exists (
  select 1 from fontes_monitoradas f where f.nome = v.nome
);
