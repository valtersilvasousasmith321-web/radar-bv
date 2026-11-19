import { entrar } from "./actions";

const MENSAGENS_ERRO: Record<string, string> = {
  campos_vazios: "Preencha e-mail e senha.",
  credenciais_invalidas: "E-mail ou senha inválidos.",
  supabase_nao_configurado: "Supabase não configurado — preencha apps/web/.env.local com as chaves do projeto.",
  falha_conexao_supabase: "Não foi possível conectar ao Supabase (verifique a URL do projeto e a internet) — não é problema de senha.",
};

export default async function PaginaLogin({
  searchParams,
}: {
  searchParams: Promise<{ erro?: string; redirecionar?: string }>;
}) {
  const { erro, redirecionar } = await searchParams;
  const mensagemErro = erro ? MENSAGENS_ERRO[erro] ?? "Não foi possível entrar." : null;

  return (
    <div className="min-h-screen bg-navy flex items-center justify-center px-6">
      <div className="w-full max-w-sm bg-white rounded-xl shadow-xl p-8">
        <div className="text-center mb-6">
          <div className="inline-flex items-center gap-1.5 font-display text-2xl font-bold text-navy">
            Radar<span className="text-esmeralda">BV</span>
          </div>
          <p className="text-sm text-slate-500 mt-1">Painel administrativo</p>
        </div>

        {mensagemErro && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-md px-3.5 py-2.5 mb-5">
            {mensagemErro}
          </div>
        )}

        <form action={entrar} className="flex flex-col gap-4">
          <input type="hidden" name="redirecionarPara" value={redirecionar ?? "/admin"} />
          <div>
            <label htmlFor="email" className="block text-sm font-semibold text-slate-700 mb-1">
              E-mail
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="username"
              className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-esmeralda"
            />
          </div>
          <div>
            <label htmlFor="senha" className="block text-sm font-semibold text-slate-700 mb-1">
              Senha
            </label>
            <input
              id="senha"
              name="senha"
              type="password"
              required
              autoComplete="current-password"
              className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-esmeralda"
            />
          </div>
          <button
            type="submit"
            className="mt-2 bg-navy text-white font-semibold text-sm py-2.5 rounded-md hover:bg-slate-800 transition-colors"
          >
            Entrar
          </button>
        </form>

        <p className="text-xs text-slate-400 text-center mt-6">
          Usuários são criados no painel do Supabase (Authentication → Users).
        </p>
      </div>
    </div>
  );
}
