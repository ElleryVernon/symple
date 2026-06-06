"use client";

import { useState } from "react";
import { motion } from "motion/react";
import { Nav } from "@/components/nav";
import { Footer } from "@/components/footer";
import { KkebiView } from "@/components/views/kkebi";
import { DucksView } from "@/components/views/ducks";
import { TeamView } from "@/components/views/team";
import { accents, type ProductId } from "@/components/content";

export default function Home() {
  const [active, setActive] = useState<ProductId>("kkebi");
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
      <Nav active={active} onSelect={setActive} />
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
      <Footer onSelect={setActive} />
    </div>
  );
}
