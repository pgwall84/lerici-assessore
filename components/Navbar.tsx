"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { useEffect, useRef, useState } from "react";

// Voci principali — sempre visibili.
const links = [
  { href: "/dashboard", label: "Dashboard", icon: "📋" },
  { href: "/dashboard/nuova", label: "Nuova", icon: "➕" },
  { href: "/dashboard/import-mail", label: "Mail", icon: "📨" },
  { href: "/dashboard/progetti", label: "Progetti", icon: "📁" },
  { href: "/dashboard/politica", label: "Politica", icon: "🏛️" },
  { href: "/dashboard/riunioni", label: "Riunioni", icon: "🎙️" },
];

// Voci secondarie — dentro il menu "Altro".
const altroLinks = [
  { href: "/dashboard/appuntamenti", label: "Agenda", icon: "📅" },
  { href: "/dashboard/rubrica", label: "Rubrica", icon: "👥" },
  { href: "/dashboard/bandi", label: "Bandi", icon: "📢" },
  { href: "/dashboard/contestazioni", label: "Contestazioni", icon: "⚠️" },
  { href: "/dashboard/giustifiche", label: "Giustifiche", icon: "📝" },
];

export default function Navbar() {
  const pathname = usePathname();
  const [bandiBadge, setBandiBadge] = useState(0);
  const [giustificheBadge, setGiustificheBadge] = useState(0);
  const [politicaBadge, setPoliticaBadge] = useState(0);
  const [altroOpen, setAltroOpen] = useState(false);
  const altroRef = useRef<HTMLDivElement>(null);
  const badgeTotale = bandiBadge + giustificheBadge;

  useEffect(() => {
    fetch("/api/bandi?stato=NUOVO")
      .then(r => r.ok ? r.json() : [])
      .then((data: unknown[]) => setBandiBadge(data.length))
      .catch(() => {});
    fetch("/api/giustifiche?visualizzata=false")
      .then(r => r.ok ? r.json() : [])
      .then((data: unknown[]) => setGiustificheBadge(data.length))
      .catch(() => {});
    fetch("/api/atti?visualizzato=false")
      .then(r => r.ok ? r.json() : [])
      .then((data: unknown[]) => setPoliticaBadge(data.length))
      .catch(() => {});
  }, [pathname]);

  useEffect(() => { setAltroOpen(false); }, [pathname]);

  useEffect(() => {
    function onClickFuori(e: MouseEvent) {
      if (altroRef.current && !altroRef.current.contains(e.target as Node)) setAltroOpen(false);
    }
    document.addEventListener("mousedown", onClickFuori);
    return () => document.removeEventListener("mousedown", onClickFuori);
  }, []);

  const altroAttivo = altroLinks.some(l => l.href === pathname);

  return (
    <>
      {/* Top bar */}
      <header className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between gap-4">
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-xl">🏛️</span>
          <span className="font-semibold text-gray-900 hidden sm:inline">Assessore Lerici</span>
        </div>

        {/* Nav links — visibili solo su desktop */}
        <nav className="hidden md:flex items-center gap-1">
          {links.map(l => (
            <Link
              key={l.href}
              href={l.href}
              className={`relative flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                pathname === l.href
                  ? "bg-blue-50 text-blue-700"
                  : "text-gray-600 hover:bg-gray-100"
              }`}
            >
              <span>{l.icon}</span>
              {l.label}
              {l.href === "/dashboard/politica" && politicaBadge > 0 && (
                <span className="absolute -top-1 -right-1 bg-red-600 text-white text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center">
                  {politicaBadge > 9 ? "9+" : politicaBadge}
                </span>
              )}
            </Link>
          ))}

          {/* Menu Altro */}
          <div className="relative" ref={altroRef}>
            <button
              onClick={() => setAltroOpen(o => !o)}
              className={`relative flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                altroAttivo ? "bg-blue-50 text-blue-700" : "text-gray-600 hover:bg-gray-100"
              }`}
            >
              <span>⋯</span>
              Altro
              {badgeTotale > 0 && (
                <span className="absolute -top-1 -right-1 bg-red-600 text-white text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center">
                  {badgeTotale > 9 ? "9+" : badgeTotale}
                </span>
              )}
            </button>
            {altroOpen && (
              <div className="absolute right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg py-1 min-w-[160px] z-50">
                {altroLinks.map(l => (
                  <Link
                    key={l.href}
                    href={l.href}
                    className={`relative flex items-center gap-2 px-3 py-2 text-sm ${
                      pathname === l.href ? "bg-blue-50 text-blue-700" : "text-gray-600 hover:bg-gray-50"
                    }`}
                  >
                    <span>{l.icon}</span>
                    {l.label}
                    {l.href === "/dashboard/bandi" && bandiBadge > 0 && (
                      <span className="ml-auto bg-blue-600 text-white text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center">
                        {bandiBadge > 9 ? "9+" : bandiBadge}
                      </span>
                    )}
                    {l.href === "/dashboard/giustifiche" && giustificheBadge > 0 && (
                      <span className="ml-auto bg-red-600 text-white text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center">
                        {giustificheBadge > 9 ? "9+" : giustificheBadge}
                      </span>
                    )}
                  </Link>
                ))}
              </div>
            )}
          </div>
        </nav>

        <button
          onClick={() => signOut({ callbackUrl: "/login" })}
          className="text-sm text-gray-500 hover:text-gray-700 shrink-0"
        >
          Esci
        </button>
      </header>

      {/* Bottom nav mobile */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 flex md:hidden z-50">
        {links.map(l => (
          <Link
            key={l.href}
            href={l.href}
            className={`relative flex-1 flex flex-col items-center py-2 text-xs gap-1 ${
              pathname === l.href ? "text-blue-600" : "text-gray-500"
            }`}
          >
            <span className="text-lg">{l.icon}</span>
            {l.label}
            {l.href === "/dashboard/politica" && politicaBadge > 0 && (
              <span className="absolute top-1 right-1/4 bg-red-600 text-white text-[9px] font-bold w-3.5 h-3.5 rounded-full flex items-center justify-center">
                {politicaBadge > 9 ? "9+" : politicaBadge}
              </span>
            )}
          </Link>
        ))}
        <button
          onClick={() => setAltroOpen(o => !o)}
          className={`relative flex-1 flex flex-col items-center py-2 text-xs gap-1 ${
            altroAttivo || altroOpen ? "text-blue-600" : "text-gray-500"
          }`}
        >
          <span className="text-lg">⋯</span>
          Altro
          {badgeTotale > 0 && (
            <span className="absolute top-1 right-1/4 bg-red-600 text-white text-[9px] font-bold w-3.5 h-3.5 rounded-full flex items-center justify-center">
              {badgeTotale > 9 ? "9+" : badgeTotale}
            </span>
          )}
        </button>
      </nav>

      {/* Sheet "Altro" mobile */}
      {altroOpen && (
        <div className="fixed inset-0 z-40 md:hidden" onClick={() => setAltroOpen(false)}>
          <div className="absolute inset-0 bg-black/30" />
          <div
            className="absolute bottom-16 left-0 right-0 bg-white rounded-t-xl border-t border-gray-200 shadow-xl py-2"
            onClick={e => e.stopPropagation()}
          >
            {altroLinks.map(l => (
              <Link
                key={l.href}
                href={l.href}
                className={`relative flex items-center gap-3 px-5 py-3 text-sm ${
                  pathname === l.href ? "bg-blue-50 text-blue-700" : "text-gray-700"
                }`}
              >
                <span className="text-lg">{l.icon}</span>
                {l.label}
                {l.href === "/dashboard/bandi" && bandiBadge > 0 && (
                  <span className="ml-auto bg-blue-600 text-white text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center">
                    {bandiBadge > 9 ? "9+" : bandiBadge}
                  </span>
                )}
                {l.href === "/dashboard/giustifiche" && giustificheBadge > 0 && (
                  <span className="ml-auto bg-red-600 text-white text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center">
                    {giustificheBadge > 9 ? "9+" : giustificheBadge}
                  </span>
                )}
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Spacer for mobile bottom nav */}
      <div className="h-16 md:hidden" />
    </>
  );
}
