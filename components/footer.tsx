"use client";

import { Logo, Container } from "./ui";
import { footer, brand, EMAIL, type ProductId } from "./content";

export function Footer({ onSelect }: { onSelect: (id: ProductId) => void }) {
  const pick = (id: ProductId) => {
    onSelect(id);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <footer className="bg-night text-white">
      <Container className="py-16 md:py-20">
        <div className="grid gap-10 md:grid-cols-[1.6fr_repeat(2,1fr)]">
          <div className="flex flex-col gap-4">
            <Logo className="h-6 w-auto" invert />
            <p className="max-w-xs text-sm leading-relaxed text-white/55">{footer.tagline}</p>
            <a href={`mailto:${EMAIL}`} className="text-sm font-semibold text-white/80 hover:text-white">
              {EMAIL}
            </a>
          </div>

          {footer.columns.map((col) => (
            <div key={col.title} className="flex flex-col gap-3">
              <span className="text-sm font-bold text-white/90">{col.title}</span>
              {col.links.map((link) =>
                "tab" in link && link.tab ? (
                  <button
                    key={link.label}
                    onClick={() => pick(link.tab)}
                    className="text-left text-sm text-white/55 transition-colors hover:text-white"
                  >
                    {link.label}
                  </button>
                ) : (
                  <a
                    key={link.label}
                    href={"href" in link ? link.href : "#"}
                    className="text-sm text-white/55 transition-colors hover:text-white"
                  >
                    {link.label}
                  </a>
                ),
              )}
            </div>
          ))}
        </div>

        <div className="mt-12 flex flex-col items-start justify-between gap-3 text-sm text-white/40 sm:flex-row sm:items-center">
          <span>© 2026 {brand.name}. All rights reserved.</span>
          <div className="flex gap-5">
            {footer.legal.map((l) => (
              <a key={l} href="#" className="hover:text-white/70">
                {l}
              </a>
            ))}
          </div>
        </div>
      </Container>
    </footer>
  );
}
