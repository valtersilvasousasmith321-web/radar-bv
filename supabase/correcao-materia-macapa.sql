-- ============================================================================
-- Correção pontual: matéria de Macapá publicada como editoria "boa_vista",
-- ilustrada por engano com foto real de Boa Vista creditada "Foto: Radar BV"
-- ============================================================================
-- Reclassifica pra "brasil_mundo" (fato aconteceu em Macapá/AP, não aqui) e
-- troca a imagem pela institucional genérica, já que a foto de Boa Vista não
-- tem nada a ver com o fato e estava com crédito enganoso.
--
-- Rode no SQL Editor do Supabase.
-- ============================================================================

update noticias
set
  editoria = 'brasil_mundo',
  imagem_url = 'https://www.radarbv.com.br/img/fallback/generico.jpg',
  imagem_credito = 'Imagem institucional Radar BV',
  imagem_e_fallback = true
where slug = 'batalha-de-rap-macapa-reune-mcs-e-empreendedores-no-mercado-central-luyx8';
