-- Migração: corrige o desequilíbrio flagrado por Valter em 21/11/2026 —
-- "tá saindo muita matéria do Brasil e do mundo" dominando o feed, que é um
-- portal primariamente LOCAL (Boa Vista/Roraima). Causa raiz: a fonte
-- "Busca: Brasil e Mundo" é um tema sempre-renovado (sempre tem notícia
-- nacional/internacional nova), então ela trazia item inédito em quase
-- todo ciclo de coleta (a cada 45min no horário comercial), enquanto temas
-- locais têm bem menos novidade por ciclo — sem teto, isso sufocava a
-- cobertura local na proporção do feed publicado.
--
-- Rode direto no SQL Editor do Supabase, numa única execução (só adiciona
-- uma coluna e atualiza uma linha — não mexe em nenhum ENUM).

alter table fontes_monitoradas add column if not exists limite_diario smallint;

-- Limita "Busca: Brasil e Mundo" a no máximo 5 notícias publicadas/agendadas
-- por dia — continua existindo (cobertura nacional/internacional é
-- desejada), só para de dominar o feed. As demais fontes continuam sem
-- limite (limite_diario fica null nelas).
update fontes_monitoradas set limite_diario = 5 where nome = 'Busca: Brasil e Mundo';
