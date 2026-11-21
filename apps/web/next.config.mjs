/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**.unsplash.com" },
      { protocol: "https", hostname: "**.pexels.com" },
      { protocol: "https", hostname: "**.supabase.co" },
      { protocol: "https", hostname: "pixabay.com" },
      { protocol: "https", hostname: "**.pixabay.com" },
      { protocol: "https", hostname: "radarbv.com.br" },
      { protocol: "https", hostname: "www.radarbv.com.br" },
    ],
  },
  // Segurança da plataforma (item 14 do plano) — cabeçalhos de proteção
  // aplicados em TODO o site. Sem CSP aqui de propósito: o conteúdo vem de
  // vários domínios externos (Unsplash/Pexels/Pixabay/Supabase) e uma CSP
  // mal calibrada pode quebrar o site em produção sem aviso — fica pra
  // quando puder ser testada com calma antes de ir pro ar.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          // Impede que o painel admin (ou qualquer página) seja carregado
          // dentro de um <iframe> em outro site — proteção contra clickjacking.
          { key: "X-Frame-Options", value: "DENY" },
          // Impede o navegador de "adivinhar" o tipo de um arquivo servido
          // com Content-Type diferente do real (mitiga alguns ataques de upload).
          { key: "X-Content-Type-Options", value: "nosniff" },
          // Não vaza a URL completa (com parâmetros) como referrer ao sair
          // do site pra outro domínio.
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // Desliga o acesso a câmera/microfone/localização por padrão —
          // o site não usa nenhum desses.
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
