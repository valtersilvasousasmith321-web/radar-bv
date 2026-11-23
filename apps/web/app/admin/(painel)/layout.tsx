import Link from "next/link";
import { redirect } from "next/navigation";
import { sair } from "../logout-action";
import { usuarioLogado } from "@/lib/auth";

const ITENS_NAV = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/noticias", label: "Notícias" },
  { href: "/admin/dicas", label: "Dicas dos Leitores" },
  { href: "/admin/ouvidoria", label: "Ouvidoria" },
  { href: "/admin/redacao-ia", label: "Central de Transparência" },
  { href: "/admin/fontes", label: "Fontes" },
  { href: "/admin/banners", label: "Banners" },
  { href: "/admin/whatsapp", label: "WhatsApp" },
];

export default async function LayoutAdmin({ children }: { children: React.ReactNode }) {
  // O middleware já bloqueia quem não está logado antes de chegar aqui —
  // esta checagem é só defesa em profundidade (nunca confiar em uma só
  // camada), igual ao exigirLogin() usado dentro de cada Server Action.
  const usuario = await usuarioLogado();
  if (!usuario) redirect("/admin/login");

  return (
    <div className="min-h-screen flex bg-slate-100">
      <aside className="w-60 bg-navy text-white flex flex-col shrink-0">
        <div className="px-5 py-5 border-b border-white/10">
          <div className="font-display text-lg font-bold">
            Radar<span className="text-esmeralda">BV</span>
          </div>
          <div className="text-[11px] text-slate-400 mt-0.5">Painel administrativo</div>
        </div>

        <nav className="flex-1 px-3 py-4 flex flex-col gap-1">
          {ITENS_NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="px-3 py-2 rounded-md text-sm font-medium text-slate-200 hover:bg-white/10 hover:text-white transition-colors"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="px-4 py-4 border-t border-white/10 text-xs text-slate-400">
          <div className="truncate mb-2">{usuario?.email}</div>
          <form action={sair}>
            <button type="submit" className="text-slate-300 hover:text-white underline">
              Sair
            </button>
          </form>
        </div>
      </aside>

      <main className="flex-1 min-w-0 p-8">{children}</main>
    </div>
  );
}
