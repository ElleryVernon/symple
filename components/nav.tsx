"use client";

import { useEffect, useState } from "react";
import { Menu, X, ArrowUpRight } from "lucide-react";
import { Logo } from "./ui";
import { tabs, CONTACT_HREF, type ProductId } from "./content";

export function Nav({
  active,
  onSelect,
}: {
  active: ProductId;
  onSelect: (id: ProductId) => void;
}) {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const pick = (id: ProductId) => {
    onSelect(id);
    setOpen(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <header className="fixed inset-x-0 top-0 z-50">
      <div
        className={`mx-auto flex max-w-6xl items-center justify-between px-5 transition-all duration-300 ${
          scrolled ? "my-2.5 rounded-full bg-white/75 py-2.5 backdrop-blur-xl" : "my-3 py-3"
        }`}
      >
        <button onClick={() => pick("kkebi")} aria-label="SYMPLE 홈" className="shrink-0">
          <Logo className="h-[22px] w-auto" />
        </button>

        {/* Tabs */}
        <nav className="hidden items-center gap-1 rounded-full bg-ink/[0.04] p-1 md:flex">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => pick(t.id)}
              className={`rounded-full px-4 py-2 text-sm font-semibold transition-all ${
                active === t.id ? "bg-white text-ink" : "text-ink-soft hover:text-ink"
              }`}
              style={active === t.id ? { color: "var(--accent-strong)" } : undefined}
            >
              {t.label}
            </button>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <a
            href={CONTACT_HREF}
            className="hidden h-10 items-center gap-1.5 rounded-full px-5 text-sm font-bold text-white transition-all hover:brightness-105 md:inline-flex"
            style={{ background: "var(--accent-strong)" }}
          >
            문의하기
            <ArrowUpRight size={15} />
          </a>
          <button
            aria-label="메뉴"
            onClick={() => setOpen((v) => !v)}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-ink/[0.05] text-ink md:hidden"
          >
            {open ? <X size={18} /> : <Menu size={18} />}
          </button>
        </div>
      </div>

      {open ? (
        <div className="mx-3 mt-1 rounded-3xl bg-white/95 p-3 backdrop-blur-xl md:hidden">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => pick(t.id)}
              className={`flex w-full items-center justify-between rounded-2xl px-4 py-3.5 text-left text-base font-semibold ${
                active === t.id ? "bg-ink/[0.04]" : ""
              }`}
            >
              <span>{t.label}</span>
              <span className="text-xs text-ink-faint">{t.sub}</span>
            </button>
          ))}
          <a
            href={CONTACT_HREF}
            className="mt-1 flex h-12 items-center justify-center rounded-full text-base font-bold text-white"
            style={{ background: "var(--accent-strong)" }}
          >
            문의하기
          </a>
        </div>
      ) : null}
    </header>
  );
}
