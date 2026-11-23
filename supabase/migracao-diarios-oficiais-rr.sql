-- Fontes diretas: Diários Oficiais (governo do Estado e da Assembleia
-- Legislativa de Roraima). Pedido do Valter: continuar cadastrando fontes
-- diretas (não dependentes de busca por IA), priorizando outros portais de
-- governo que, como o Portal da Transparência da Prefeitura, só publicam
-- PDF pra baixar — o tipo 'pdf' já existe no sistema (com filtro de data e
-- extração de texto) desde a migração anterior.
--
-- O QUE FOI VERIFICADO ANTES DE CADASTRAR:
--
-- 1) Diário Oficial do Estado de Roraima (Imprensa Oficial)
--    URL: https://www.imprensaoficial.rr.gov.br/app/_inicial/
--    Confirmado como site real e oficial: citado repetidamente em leis,
--    decretos e portarias publicados pelo próprio governo (SEPLAN, etc.)
--    como "Diário Oficial do Estado de Roraima - www.imprensaoficial.rr.gov.br".
--    Publica leis, decretos, portarias, editais, extratos de contrato de
--    TODOS os órgãos do Estado (cobre bem a editoria "política").
--    AVISO HONESTO: o endereço "/app/_inicial/" sugere uma aplicação em
--    JavaScript (carrega os dados por trás, não direto no HTML). Se for
--    esse o caso, o coletor pode não achar nenhum link na primeira
--    tentativa — não é erro grave, graças ao Isolamento de Fontes: a fonte
--    só vai acumular erros/zero itens e se autodesativar depois de 10
--    tentativas malsucedidas, sem afetar as outras fontes. Vale tentar
--    porque, se funcionar, é a fonte mais completa que existe pra atos do
--    governo estadual.
--
-- 2) Diário Oficial da Assembleia Legislativa de Roraima (ALE-RR)
--    URL: https://diarios.al.rr.leg.br/
--    Confirmado como site real: dezenas de edições em PDF (leis,
--    resoluções, autógrafos, extratos de contrato da ALE-RR) hospedadas
--    nesse domínio desde 2017, em estrutura de blog/WordPress
--    (.../wp-content/uploads/AAAA/MM/arquivo.pdf), com o nome do arquivo já
--    trazendo a data da edição. Isso é DIFERENTE do site
--    "Assembleia Legislativa de Roraima (ALE-RR)" que já está cadastrado
--    (provavelmente apontando pro site institucional al.rr.leg.br, que
--    está perto de se autodesativar por excesso de erros) — este é o
--    domínio dedicado só ao diário oficial, então tende a ter uma página
--    de listagem mais simples de ler.
insert into fontes_monitoradas (nome, url_base, tipo, editoria_padrao, confiabilidade)
select v.nome, v.url, v.tipo::tipo_fonte, v.editoria::editoria, v.confiabilidade
from (
  values
    ('Diário Oficial do Estado de Roraima (Imprensa Oficial)', 'https://www.imprensaoficial.rr.gov.br/app/_inicial/', 'pdf', 'politica', 7),
    ('Diário Oficial da ALE-RR', 'https://diarios.al.rr.leg.br/', 'pdf', 'politica', 7)
) as v(nome, url, tipo, editoria, confiabilidade)
where not exists (
  select 1 from fontes_monitoradas f where f.nome = v.nome
);
