import type { ReactNode } from "react";
import Link from "next/link";
import { logout } from "@/features/auth/actions";
import { SiteHeader } from "@/features/bookings/components/site-header";

export function AccountPageShell({ title, activeSection, isAdmin, children }: {
  title: string;
  activeSection: "rentals" | "profile";
  isAdmin: boolean;
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-stone-50 text-stone-950">
      <SiteHeader activeSection={activeSection} />
      <main className="page-shell py-10 sm:py-14">
        <header className="flex flex-wrap items-center justify-between gap-6 border-b border-stone-200 pb-6">
          <h1 className="page-title">{title}</h1>
          <div className="flex flex-wrap gap-3">
            {isAdmin ? <Link className="button-secondary" href="/admin">Owner area</Link> : null}
            <form action={logout}><button className="button-secondary" type="submit">Sign out</button></form>
          </div>
        </header>
        {children}
      </main>
    </div>
  );
}
