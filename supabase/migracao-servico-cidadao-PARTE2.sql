-- ============================================================================
-- RADAR BV — Migração: Serviço ao Cidadão (item 5 do Plano da Redação de IA)
-- PARTE 2 de 2 — só rode depois que a Parte 1 já tiver rodado com sucesso.
--
-- Item 5 do plano: "conecta toda manhã no SINE (vagas de emprego), editais
-- públicos, período de matrícula escolar/curso, e publica como seção fixa
-- recorrente". Reaproveita 100% o pipeline normal e o tipo de fonte "busca"
-- já existente (mesma ideia do item 3) — zero código novo no worker. A
-- "seção fixa recorrente" é a nova categoria "Serviço ao Cidadão", que já
-- aparece sozinha no menu do site e na página inicial assim que a primeira
-- matéria for publicada nela.
--
-- Seguro rodar mais de uma vez (idempotente).
-- ============================================================================

insert into fontes_monitoradas (nome, url_base, tipo, editoria_padrao, confiabilidade)
select v.nome, v.tema, 'busca', v.editoria::editoria, 6
from (
  values
    (
      'Serviço ao Cidadão — Vagas de emprego (SINE Roraima)',
      'vagas de emprego abertas hoje no SINE de Boa Vista e Roraima, oportunidades de emprego cadastradas no Sistema Nacional de Emprego em Roraima',
      'servico_cidadao'
    ),
    (
      'Serviço ao Cidadão — Editais públicos de Roraima',
      'editais públicos abertos em Roraima: concurso público, processo seletivo, licitação, chamada pública, prefeitura de Boa Vista ou governo do estado de Roraima',
      'servico_cidadao'
    ),
    (
      'Serviço ao Cidadão — Matrícula escolar e cursos em Roraima',
      'período de matrícula escolar aberto em Roraima, matrícula em escola estadual ou municipal de Boa Vista, inscrição em curso técnico ou profissionalizante gratuito em Roraima (SENAI, SENAC, IFRR, Pronatec)',
      'servico_cidadao'
    )
) as v(nome, tema, editoria)
where not exists (
  select 1 from fontes_monitoradas f where f.nome = v.nome
);

-- Imagem de segurança para a nova categoria, seguindo o mesmo padrão das
-- demais (ver seed original em schema.sql).
insert into imagens_fallback (editoria, url, descricao, padrao)
select 'servico_cidadao'::editoria, 'https://radarbv.com.br/img/fallback/generico.jpg', 'Imagem institucional Radar BV', true
where not exists (
  select 1 from imagens_fallback where editoria = 'servico_cidadao'::editoria and padrao = true
);
