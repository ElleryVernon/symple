"use client";

import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { Nav } from "@/components/nav";
import { Footer } from "@/components/footer";
import { KkebiView } from "@/components/views/kkebi";
import { DucksView } from "@/components/views/ducks";
import { TeamView } from "@/components/views/team";
import { accents, type ProductId } from "@/components/content";

const TABS: ProductId[] = ["kkebi", "ducks", "team"];

function readTabFromUrl(): ProductId | null {
  const t = new URLSearchParams(window.location.search).get("tab");
  return TABS.includes(t as ProductId) ? (t as ProductId) : null;
}

export default function Home() {
  const [active, setActive] = useState<ProductId>("kkebi");

  // Keep the active tab in the URL (?tab=) so views are shareable and back/forward works.
  useEffect(() => {
    const sync = () => {
      const t = readTabFromUrl();
      if (t) setActive(t);
    };
    sync();
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, []);

  const select = (id: ProductId) => {
    setActive(id);
    const url = new URL(window.location.href);
    url.searchParams.set("tab", id);
    url.hash = "";
    window.history.pushState({ tab: id }, "", url);
  };

  const a = accents[active];

  return (
    <div
      style={
        {
          "--accent": a.accent,
          "--accent-strong": a.strong,
          "--accent-soft": a.soft,
        } as React.CSSProperties
      }
    >
      <Nav active={active} onSelect={select} />
      <main>
        <motion.div
          key={active}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
        >
          {active === "kkebi" ? <KkebiView /> : active === "ducks" ? <DucksView /> : <TeamView />}
        </motion.div>
      </main>
      <Footer onSelect={select} />
    </div>
  );
}
