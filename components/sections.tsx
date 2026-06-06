"use client";

import Image from "next/image";
import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowRight } from "lucide-react";
import { Reveal } from "./ui";

const ease = [0.16, 1, 0.3, 1] as const;

/* Image panel — flat tinted block, no border / no shadow */
export function ImagePanel({
  src,
  alt,
  className = "",
  contain = true,
}: {
  src: string;
  alt: string;
  className?: string;
  contain?: boolean;
}) {
  return (
    <div
      className={`relative overflow-hidden rounded-[1.75rem] ${className}`}
      style={{ background: "var(--accent-soft)" }}
    >
      <Image
        src={src}
        alt={alt}
        fill
        sizes="(max-width: 1024px) 100vw, 560px"
        className={contain ? "object-contain p-6" : "object-cover"}
      />
    </div>
  );
}

/* Alternating feature row: image + text */
export function FeatureRow({
  kicker,
  title,
  body,
  image,
  reverse = false,
  before,
  after,
  metric,
}: {
  kicker?: string;
  title: string;
  body: string;
  image: string;
  reverse?: boolean;
  before?: string;
  after?: string;
  metric?: string;
}) {
  return (
    <Reveal>
      <div className={`grid items-center gap-8 lg:grid-cols-2 lg:gap-16 ${reverse ? "lg:[direction:rtl]" : ""}`}>
        <div className="lg:[direction:ltr]">
          <ImagePanel src={image} alt={title} className="aspect-[4/3] w-full" />
        </div>
        <div className="flex flex-col gap-4 lg:[direction:ltr]">
          {kicker ? (
            <span className="text-sm font-bold" style={{ color: "var(--accent)" }}>
              {kicker}
            </span>
          ) : null}
          <h3 className="headline text-2xl font-bold text-ink md:text-[1.9rem]">{title}</h3>
          <p className="text-base leading-relaxed text-ink-soft">{body}</p>

          {before && after ? (
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <span className="rounded-full bg-ink/[0.05] px-4 py-2 text-sm font-medium text-ink-faint line-through decoration-ink-faint/40">
                {before}
              </span>
              <ArrowRight size={18} className="text-ink-faint" />
              <span
                className="rounded-full px-4 py-2 text-sm font-bold"
                style={{ background: "var(--accent-soft)", color: "var(--accent-strong)" }}
              >
                {after}
              </span>
            </div>
          ) : null}

          {metric ? (
            <div
              className="mt-1 inline-flex w-fit items-center gap-2 rounded-full px-4 py-2 text-sm font-bold"
              style={{ background: "var(--accent-soft)", color: "var(--accent-strong)" }}
            >
              {metric}
            </div>
          ) : null}
        </div>
      </div>
    </Reveal>
  );
}

/* Tabbed showcase: left list, right crossfading image */
export function TabShowcase({
  items,
}: {
  items: { tag: string; title: string; body: string; image: string }[];
}) {
  const [active, setActive] = useState(0);
  return (
    <div className="grid items-center gap-8 lg:grid-cols-[1fr_1.05fr] lg:gap-14">
      <div className="flex flex-col gap-2">
        {items.map((it, i) => {
          const on = i === active;
          return (
            <button
              key={it.tag}
              onClick={() => setActive(i)}
              className={`rounded-2xl p-5 text-left transition-all duration-300 ${on ? "bg-white" : "hover:bg-white/60"}`}
              style={on ? { background: "var(--accent-soft)" } : undefined}
            >
              <div className="flex items-center gap-3">
                <span
                  className="flex h-6 items-center rounded-full px-2.5 text-xs font-bold text-white"
                  style={{ background: on ? "var(--accent-strong)" : "var(--color-ink-faint)" }}
                >
                  {it.tag}
                </span>
                <h4 className="text-lg font-bold text-ink">{it.title}</h4>
              </div>
              <AnimatePresence initial={false}>
                {on ? (
                  <motion.p
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.35, ease }}
                    className="overflow-hidden text-[0.95rem] leading-relaxed text-ink-soft"
                  >
                    <span className="block pt-2">{it.body}</span>
                  </motion.p>
                ) : null}
              </AnimatePresence>
            </button>
          );
        })}
      </div>

      <div
        className="relative aspect-[4/3] overflow-hidden rounded-[1.75rem]"
        style={{ background: "var(--accent-soft)" }}
      >
        <AnimatePresence mode="wait">
          <motion.div
            key={active}
            initial={{ opacity: 0, scale: 1.02 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.99 }}
            transition={{ duration: 0.45, ease }}
            className="absolute inset-0"
          >
            <Image
              src={items[active].image}
              alt={items[active].title}
              fill
              sizes="(max-width: 1024px) 100vw, 560px"
              className="object-contain p-6"
            />
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
