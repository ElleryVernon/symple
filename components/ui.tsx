"use client";

import { motion, useInView, type Variants } from "motion/react";
import Image from "next/image";
import { useEffect, useRef, useState, type ReactNode } from "react";

/* ----------------------------------------------------------------- Logo */

export function Logo({ className = "h-6 w-auto", invert = false }: { className?: string; invert?: boolean }) {
  return (
    <Image
      src="/symple-logo.svg"
      alt="SYMPLE"
      width={434}
      height={100}
      priority
      className={className}
      style={invert ? { filter: "brightness(0) invert(1)" } : undefined}
    />
  );
}

/* ----------------------------------------------------------- Layout bits */

export function Container({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`mx-auto w-full max-w-6xl px-6 ${className}`}>{children}</div>;
}

export function Eyebrow({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={`text-[0.8rem] font-semibold tracking-tight ${className}`}
      style={{ color: "var(--accent)" }}
    >
      {children}
    </span>
  );
}

export function AccentText({ children }: { children: ReactNode }) {
  return <span style={{ color: "var(--accent)" }}>{children}</span>;
}

/* ----------------------------------------------------------------- Reveal */

const variants: Variants = {
  hidden: { opacity: 0, y: 22 },
  show: { opacity: 1, y: 0, transition: { duration: 0.7, ease: [0.16, 1, 0.3, 1] } },
};

export function Reveal({
  children,
  delay = 0,
  className = "",
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
}) {
  return (
    <motion.div
      className={className}
      variants={variants}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, margin: "-60px" }}
      transition={{ delay }}
    >
      {children}
    </motion.div>
  );
}

/* -------------------------------------------------------- Section heading */

export function SectionHeading({
  eyebrow,
  children,
  desc,
  align = "left",
  dark = false,
  className = "",
}: {
  eyebrow?: string;
  children: ReactNode;
  desc?: ReactNode;
  align?: "left" | "center";
  dark?: boolean;
  className?: string;
}) {
  const alignCls = align === "center" ? "items-center text-center mx-auto" : "items-start text-left";
  return (
    <Reveal className={`flex max-w-2xl flex-col gap-4 ${alignCls} ${className}`}>
      {eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}
      <h2
        className={`headline text-balance text-[1.9rem] font-bold leading-[1.15] sm:text-4xl md:text-[2.6rem] ${
          dark ? "text-white" : "text-ink"
        }`}
      >
        {children}
      </h2>
      {desc ? (
        <p className={`balance text-base leading-relaxed md:text-lg ${dark ? "text-white/60" : "text-ink-soft"}`}>
          {desc}
        </p>
      ) : null}
    </Reveal>
  );
}

/* ----------------------------------------------------------------- Buttons */

export function ButtonPrimary({
  href,
  children,
  className = "",
}: {
  href: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <a
      href={href}
      className={`inline-flex h-12 items-center justify-center gap-2 whitespace-nowrap rounded-full px-6 text-[0.95rem] font-bold text-white transition-all duration-200 ease-out hover:-translate-y-0.5 hover:brightness-105 active:translate-y-0 active:scale-[0.98] ${className}`}
      style={{ background: "var(--accent-strong)" }}
    >
      {children}
    </a>
  );
}

export function ButtonGhost({
  href,
  children,
  className = "",
  dark = false,
}: {
  href: string;
  children: ReactNode;
  className?: string;
  dark?: boolean;
}) {
  return (
    <a
      href={href}
      className={`inline-flex h-12 items-center justify-center gap-2 whitespace-nowrap rounded-full px-6 text-[0.95rem] font-semibold transition-all duration-200 ease-out hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.98] ${
        dark ? "bg-white/10 text-white hover:bg-white/15" : "bg-ink/[0.05] text-ink hover:bg-ink/[0.08]"
      } ${className}`}
    >
      {children}
    </a>
  );
}

/* ----------------------------------------------------------------- CountUp */

export function CountUp({
  end,
  suffix = "",
  className = "",
}: {
  end: number;
  suffix?: string;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "-40px" });
  const [val, setVal] = useState(0);

  useEffect(() => {
    if (!inView) return;
    let raf = 0;
    const dur = 1400;
    let start = 0;
    const tick = (t: number) => {
      if (!start) start = t;
      const p = Math.min(1, (t - start) / dur);
      const eased = 1 - Math.pow(1 - p, 3);
      setVal(end * eased);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [inView, end]);

  const display = Number.isInteger(end) ? Math.round(val).toString() : val.toFixed(1);

  return (
    <span ref={ref} className={`num ${className}`}>
      {display}
      <span className="text-[0.5em]">{suffix}</span>
    </span>
  );
}
