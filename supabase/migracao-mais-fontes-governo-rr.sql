-- Pedido do Valter: continuar aumentando a lista de fontes diretas de
-- governo (estado, município, judiciário) em Boa Vista/Roraima, priorizando
-- o que puder ser puxado direto (HTML ou PDF), sem depender de busca por IA.
-- Esta é a terceira leva (depois da de Economia/Esportes e da dos dois
-- primeiros Diários Oficiais). Cada fonte abaixo foi checada numa busca
-- antes de entrar aqui — nada foi cadastrado "no chute".
--
-- O QUE FOI VERIFICADO:
--
-- 1) Diário Oficial do Município de Boa Vista (DOM)
--    URL: https://publicacoes.boavista.rr.gov.br/
--    Confirmado: dezenas de edições reais, acessíveis como páginas HTML
--    (ex: .../ler/diario/6367), com leis, decretos, extratos de contrato e
--    atos do Prefeito e da Câmara Municipal. Diferente do Portal da
--    Transparência (licitações) já cadastrado — este é o Diário Oficial
--    "geral" do município. Tipo 'html' (não é PDF puro, é página lida).
--
-- 2) Diário da Justiça Eletrônico do TJRR (DJe)
--    URL: https://diario.tjrr.jus.br/
--    Confirmado com MUITA segurança: dezenas de arquivos reais no padrão
--    .../dpj/dpj-AAAAMMDD.pdf (ex: dpj-20260610.pdf), um PDF por dia útil,
--    desde pelo menos 2015. É o melhor caso possível pro filtro de data,
--    porque a própria URL já carrega a data, sem precisar nem procurar no
--    HTML. Cobre atos administrativos e judiciais do Tribunal de Justiça.
--
-- 3) Atos Administrativos do TJRR
--    URL: https://atos.tjrr.jus.br/
--    Confirmado: dezenas de PDFs reais (originais e compilados) de
--    resoluções e atos normativos do TJRR, acessados via páginas
--    "/atos/detalhar/ID". É uma base diferente do Diário da Justiça (este
--    é só pra atos normativos/regimentais, não movimentação do dia a dia).
--
-- 4) Ministério Público do Estado de Roraima (MPRR)
--    URL: https://www.mprr.mp.br/
--    Confirmado como domínio oficial real, com muitos editais de concurso
--    e processo seletivo publicados em PDF. AVISO HONESTO: os links que
--    achei estão espalhados em caminhos bem diferentes dentro do site
--    (uploads/, servicos/.../download/, assets/...) — não achei uma única
--    página de listagem óbvia. Vale tentar pela página inicial mesmo assim
--    (o Isolamento de Fontes cobre o risco de não funcionar).
--
-- 5) Secretaria de Estado da Educação e Desporto de Roraima (SEED)
--    URL: https://www.educacao.rr.gov.br/
--    Confirmado como domínio oficial real, citado repetidamente pela
--    própria Secretaria como canal oficial de editais de convocação,
--    processos seletivos e concursos. AVISO HONESTO: não confirmei a
--    estrutura exata da página de notícias/editais dentro do site.
insert into fontes_monitoradas (nome, url_base, tipo, editoria_padrao, confiabilidade)
select v.nome, v.url, v.tipo::tipo_fonte, v.editoria::editoria, v.confiabilidade
from (
  values
    ('Diário Oficial do Município de Boa Vista (DOM)', 'https://publicacoes.boavista.rr.gov.br/', 'html', 'politica', 7),
    ('Diário da Justiça Eletrônico do TJRR', 'https://diario.tjrr.jus.br/', 'pdf', 'politica', 8),
    ('Atos Administrativos do TJRR', 'https://atos.tjrr.jus.br/', 'pdf', 'politica', 6),
    ('Ministério Público do Estado de Roraima (MPRR)', 'https://www.mprr.mp.br/', 'html', 'servico_cidadao', 5),
    ('Secretaria de Estado da Educação e Desporto de Roraima (SEED)', 'https://www.educacao.rr.gov.br/', 'html', 'educacao', 5)
) as v(nome, url, tipo, editoria, confiabilidade)
where not exists (
  select 1 from fontes_monitoradas f where f.nome = v.nome
);
