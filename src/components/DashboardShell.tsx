"use client";

import { type ComponentType, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Logo } from "@/components/Logo";
import { LegalLinks } from "@/components/LegalLinks";
import {
  IconBilling,
  IconCampaign,
  IconDashboard,
  IconDeliverability,
  IconFormation,
  IconLogout,
  IconPuzzle,
  IconSettings,
  IconThreat,
  IconUsers,
} from "@/components/icons";

type NavIcon = ComponentType<{ className?: string }>;

type NavItem = {
  href: string;
  label: string;
  Icon: NavIcon;
};

/**
 * Groupes de la sidebar — ordre et libellés modifiables ici.
 * Pour réordonner une catégorie : déplacer l'objet dans NAV_SECTIONS.
 * Pour renommer : changer `title`. Pour déplacer un onglet : le sortir
 * d'un `items` et le coller dans un autre.
 */
const NAV_SECTIONS: { id: string; title: string; items: NavItem[] }[] = [
  {
    id: "pilotage",
    title: "Pilotage",
    items: [
      { href: "/dashboard", label: "Tableau de bord", Icon: IconDashboard },
      { href: "/menaces", label: "Menaces", Icon: IconThreat },
    ],
  },
  {
    id: "campagnes",
    title: "Campagnes",
    items: [
      { href: "/campaigns", label: "Campagnes", Icon: IconCampaign },
      { href: "/employees", label: "Employés", Icon: IconUsers },
      { href: "/settings/formations", label: "Formations", Icon: IconFormation },
    ],
  },
  {
    id: "conformite",
    title: "Conformité",
    items: [
      {
        href: "/settings/deliverability",
        label: "Délivrabilité",
        Icon: IconDeliverability,
      },
    ],
  },
  {
    id: "compte",
    title: "Compte",
    items: [
      { href: "/settings/extension", label: "Extension", Icon: IconPuzzle },
      { href: "/settings/company", label: "Paramètres", Icon: IconSettings },
      { href: "/settings/billing", label: "Facturation", Icon: IconBilling },
    ],
  },
];

/** Liste plate (nav mobile, lookup). */
const NAV_FLAT: NavItem[] = NAV_SECTIONS.flatMap((s) => s.items);

/** Lien actif : égalité exacte, ou préfixe sauf pour /dashboard. */
function isNavActive(pathname: string, href: string): boolean {
  return (
    pathname === href || (href !== "/dashboard" && pathname.startsWith(href))
  );
}

type AppShellProps = {
  companyName: string | null;
  userEmail: string;
  children: ReactNode;
};

/**
 * Coquille de l'espace connecté.
 * La sidebar reste repliée (icônes) et se déploie au survol.
 */
export function AppShell({ companyName, userEmail, children }: AppShellProps) {
  return (
    <div className="flex h-dvh overflow-hidden bg-background">
      <Sidebar companyName={companyName} userEmail={userEmail} />

      <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-background">
        <Header companyName={companyName} />
        <MobileNav />

        <main className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 py-5 lg:px-6 lg:py-6">
          {children}

          {/* Pied de page minimal : les liens légaux doivent rester
              atteignables depuis l'espace connecté, pas seulement du site
              public. « mt-auto » le colle en bas quand la page est courte. */}
          <footer className="mt-auto pt-10">
            <div className="border-t border-border pt-4">
              <LegalLinks />
            </div>
          </footer>
        </main>
      </div>
    </div>
  );
}

type SidebarProps = {
  companyName: string | null;
  userEmail: string;
};

/**
 * Rail étroit (72px) → 232px au survol.
 * Chaque onglet s'étire pour remplir la hauteur ; profil ancré en bas.
 */
function Sidebar({ companyName, userEmail }: SidebarProps) {
  const pathname = usePathname();
  const initiale = (companyName ?? userEmail).charAt(0).toUpperCase();

  return (
    <aside className="relative z-30 hidden w-[72px] shrink-0 lg:block">
      <div className="group/sidebar absolute inset-y-0 left-0 flex h-full w-[72px] flex-col border-r border-border bg-surface shadow-none transition-[width,box-shadow] duration-200 ease-out hover:w-[232px] hover:shadow-[8px_0_24px_-12px_rgba(0,0,0,0.65)]">
        {/* Logo */}
        <div className="flex h-14 shrink-0 items-center border-b border-border px-3 group-hover/sidebar:px-4">
          <Link
            href="/dashboard"
            aria-label="Safentreprise — tableau de bord"
            className="flex min-w-0 items-center overflow-hidden"
          >
            <span className="shrink-0">
              <Logo compact />
            </span>
            <span className="ml-0 max-w-0 overflow-hidden whitespace-nowrap opacity-0 transition-all duration-200 group-hover/sidebar:ml-2.5 group-hover/sidebar:max-w-[160px] group-hover/sidebar:opacity-100">
              <span className="text-[15px] font-semibold tracking-[-0.02em] text-foreground">
                Safentreprise
              </span>
            </span>
          </Link>
        </div>

        {/* Nav : flex-1 → les liens se partagent toute la hauteur restante */}
        <nav
          className="flex min-h-0 flex-1 flex-col px-2 py-2 group-hover/sidebar:px-3"
          aria-label="Navigation principale"
        >
          <ul className="flex min-h-0 flex-1 flex-col">
            {NAV_SECTIONS.map((section, sectionIndex) => (
              <li
                key={section.id}
                className="flex min-h-0 flex-col"
                /* Poids = nombre d'onglets → chaque lien a la même hauteur */
                style={{ flex: section.items.length }}
              >
                <div className="shrink-0 px-2.5 pt-1">
                  <p
                    className="max-h-0 overflow-hidden text-[10px] font-semibold uppercase tracking-[0.14em] text-faint opacity-0 transition-all duration-200 group-hover/sidebar:mb-0.5 group-hover/sidebar:max-h-4 group-hover/sidebar:opacity-100"
                    aria-hidden
                  >
                    {section.title}
                  </p>
                  {sectionIndex > 0 && (
                    <div
                      aria-hidden
                      className="mb-0.5 h-px bg-border transition-all duration-200 group-hover/sidebar:mb-0 group-hover/sidebar:h-0 group-hover/sidebar:opacity-0"
                    />
                  )}
                </div>

                <ul className="flex min-h-0 flex-1 flex-col gap-0.5" role="list">
                  {section.items.map(({ href, label, Icon }) => {
                    const active = isNavActive(pathname, href);
                    return (
                      <li key={href} className="flex min-h-0 flex-1">
                        <Link
                          href={href}
                          title={label}
                          aria-label={label}
                          aria-current={active ? "page" : undefined}
                          className={`relative flex h-full min-h-9 w-full items-center overflow-hidden rounded-md text-[13.5px] font-medium transition-colors ${
                            active
                              ? "bg-accent-soft text-accent-text"
                              : "text-muted hover:bg-surface-2 hover:text-foreground"
                          }`}
                        >
                          {active && (
                            <span
                              aria-hidden
                              className="absolute inset-y-[20%] left-0 w-[2px] rounded-full bg-accent-text opacity-0 group-hover/sidebar:opacity-100"
                            />
                          )}
                          <span className="flex w-10 shrink-0 items-center justify-center self-stretch">
                            <Icon />
                          </span>
                          <span className="max-w-0 overflow-hidden whitespace-nowrap opacity-0 transition-all duration-200 group-hover/sidebar:max-w-[140px] group-hover/sidebar:pr-3 group-hover/sidebar:opacity-100">
                            {label}
                          </span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </li>
            ))}
          </ul>
        </nav>

        {/* Profil ancré en bas */}
        <div className="shrink-0 border-t border-border p-2 group-hover/sidebar:p-3">
          <div className="flex h-10 items-center overflow-hidden rounded-md">
            <span className="flex w-10 shrink-0 items-center justify-center">
              <span className="flex h-8 w-8 items-center justify-center rounded-md bg-surface-2 text-[12px] font-semibold uppercase text-accent-text">
                {initiale}
              </span>
            </span>
            <span className="min-w-0 max-w-0 overflow-hidden opacity-0 transition-all duration-200 group-hover/sidebar:max-w-[160px] group-hover/sidebar:pr-2 group-hover/sidebar:opacity-100">
              <span className="block truncate text-[12.5px] font-medium text-foreground">
                {companyName ?? "Société"}
              </span>
              <span className="block truncate text-[11px] text-faint">
                {userEmail}
              </span>
            </span>
          </div>
        </div>
      </div>
    </aside>
  );
}

/** Barre horizontale mobile — mêmes liens, ordre des sections aplati. */
function MobileNav() {
  const pathname = usePathname();

  return (
    <nav className="flex gap-1 overflow-x-auto border-b border-border bg-surface px-3 py-2 lg:hidden">
      {NAV_FLAT.map(({ href, label, Icon }) => {
        const active = isNavActive(pathname, href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={`flex shrink-0 items-center gap-2 rounded-md px-3 py-1.5 text-[13px] font-medium ${
              active
                ? "bg-accent-soft text-accent-text"
                : "text-muted hover:text-foreground"
            }`}
          >
            <Icon />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

function Header({ companyName }: { companyName: string | null }) {
  return (
    <header className="flex h-14 shrink-0 items-center justify-between gap-4 border-b border-border bg-background px-4 lg:px-6">
      <div className="flex min-w-0 items-center gap-3">
        <span className="lg:hidden">
          <Logo compact />
        </span>
        <p className="truncate text-[13.5px] font-medium text-foreground">
          {companyName ?? "Configuration"}
        </p>
      </div>
      <LogoutButton />
    </header>
  );
}

/** Bouton de déconnexion réutilisable (aussi utilisé par l'onboarding). */
export function LogoutButton({ className = "" }: { className?: string }) {
  const router = useRouter();

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={handleLogout}
      className={`inline-flex h-8 items-center gap-2 rounded-md px-2.5 text-[13px] text-muted transition-colors hover:bg-surface-2 hover:text-foreground ${className}`}
    >
      <IconLogout className="shrink-0" />
      Déconnexion
    </button>
  );
}
