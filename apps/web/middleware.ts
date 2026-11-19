import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Protege /admin/*: sem sessão válida (Supabase Auth), redireciona pra
 * /admin/login. A página de login e as rotas públicas do site passam
 * direto. Isso é a primeira camada de defesa — a segunda é `exigirLogin()`
 * dentro de cada Server Action (lib/auth.ts), que não confia só nisso.
 */
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (!pathname.startsWith("/admin")) return NextResponse.next();
  if (pathname === "/admin/login") return NextResponse.next();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // Sem Supabase configurado, o admin não tem como autenticar ninguém —
  // bloqueia tudo (nunca abre o painel sem checagem de sessão).
  if (!url || !anonKey) {
    return NextResponse.redirect(new URL("/admin/login?erro=supabase_nao_configurado", request.url));
  }

  let resposta = NextResponse.next({ request });

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesParaSetar) {
        for (const { name, value } of cookiesParaSetar) request.cookies.set(name, value);
        resposta = NextResponse.next({ request });
        for (const { name, value, options } of cookiesParaSetar) resposta.cookies.set(name, value, options);
      },
    },
  });

  const { data } = await supabase.auth.getUser();

  if (!data.user) {
    const loginUrl = new URL("/admin/login", request.url);
    loginUrl.searchParams.set("redirecionar", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return resposta;
}

export const config = {
  matcher: ["/admin/:path*"],
};
