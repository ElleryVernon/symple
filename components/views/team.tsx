"use client";

import { motion } from "motion/react";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import {
  Container,
  Reveal,
  SectionHeading,
  ButtonPrimary,
  CountUp,
  AccentText,
} from "../ui";
import { team } from "../content";

export function TeamView() {
  const t = team;
  return (
    <>
      {/* ───────── Hero */}
      <section className="px-6 pt-32 md:pt-40">
        <Container className="flex flex-col items-center text-center">
          <Reveal>
            <span
              className="inline-flex items-center gap-2 whitespace-nowrap rounded-full px-3.5 py-1.5 text-[0.8rem] font-semibold"
              style={{ background: "var(--accent-soft)", color: "var(--accent-strong)" }}
            >
              {t.hero.eyebrow}
            </span>
          </Reveal>
          <Reveal delay={0.05}>
            <h1 className="display balance mt-6 max-w-2xl whitespace-pre-line text-[2.3rem] font-extrabold text-ink sm:text-5xl md:text-[3.4rem]">
              {t.hero.titleA}
              <AccentText>{t.hero.titleAccent}</AccentText>
              {t.hero.titleB}
            </h1>
          </Reveal>
          <Reveal delay={0.1}>
            <p className="keepall balance mt-6 max-w-xl text-base leading-relaxed text-ink-soft md:text-lg">{t.hero.desc}</p>
          </Reveal>
          <Reveal delay={0.15}>
            <div className="mt-8">
              <ButtonPrimary href={t.hero.primary.href}>
                {t.hero.primary.text}
                <ArrowRight size={17} />
              </ButtonPrimary>
            </div>
          </Reveal>
        </Container>

        <Reveal delay={0.1} className="mx-auto mt-14 max-w-5xl">
          <div className="relative aspect-video overflow-hidden rounded-[2rem] bg-night">
            <video
              src="/solution.mp4"
              autoPlay
              loop
              muted
              playsInline
              preload="metadata"
              className="h-full w-full object-cover"
            />
          </div>
        </Reveal>
      </section>

      {/* ───────── Why + stats */}
      <section className="py-20 md:py-28">
        <Container>
          <SectionHeading eyebrow={t.why.eyebrow}>
            {t.why.titleA}
            <AccentText>{t.why.titleAccent}</AccentText>
            {t.why.titleB}
          </SectionHeading>
          <div className="mt-14 grid gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-4">
            {t.stats.map((s, i) => (
              <Reveal key={s.label} delay={i * 0.06} className="flex flex-col gap-1.5">
                <div className="text-5xl font-extrabold md:text-6xl" style={{ color: "var(--accent)" }}>
                  <CountUp end={parseFloat(s.num)} suffix={s.suffix} />
                </div>
                <p className="mt-1 text-[0.95rem] font-semibold leading-snug text-ink">{s.label}</p>
              </Reveal>
            ))}
          </div>
        </Container>
      </section>

      {/* ───────── Pillars 측정·개입·연결 */}
      <section className="bg-night py-20 text-white md:py-28">
        <Container>
          <SectionHeading eyebrow={t.pillars.eyebrow} dark>
            {t.pillars.titleA}
            <AccentText>{t.pillars.titleAccent}</AccentText>
            {t.pillars.titleB}
          </SectionHeading>
          <div className="mt-12 grid gap-5 md:grid-cols-3">
            {t.pillars.items.map((p, i) => (
              <Reveal key={p.step} delay={i * 0.08} className="flex flex-col gap-4 rounded-3xl bg-night-2 p-8">
                <span className="num text-2xl" style={{ color: "var(--accent)" }}>
                  0{i + 1}
                </span>
                <h3 className="text-2xl font-bold text-white">{p.step}</h3>
                <p className="text-[0.97rem] leading-relaxed text-white/60">{p.body}</p>
              </Reveal>
            ))}
          </div>
        </Container>
      </section>

      {/* ───────── Evidence */}
      <section className="py-20 md:py-28">
        <Container>
          <SectionHeading eyebrow={t.evidence.eyebrow}>
            {t.evidence.titleA}
            <AccentText>{t.evidence.titleAccent}</AccentText>
            {t.evidence.titleB}
          </SectionHeading>
          <div className="mt-12 grid gap-5 sm:grid-cols-2">
            {t.evidence.items.map((e, i) => (
              <Reveal key={e.title} delay={i * 0.06} className="flex flex-col gap-4 rounded-3xl bg-surface p-8">
                <div className="flex items-baseline justify-between gap-4">
                  <h3 className="text-lg font-bold text-ink">{e.title}</h3>
                  <span className="text-sm font-bold" style={{ color: "var(--accent)" }}>
                    {e.metric}
                  </span>
                </div>
                <p className="text-[0.95rem] leading-relaxed text-ink-soft">{e.body}</p>
                <div className="mt-1 h-2 overflow-hidden rounded-full bg-ink/[0.06]">
                  <motion.div
                    className="h-full rounded-full"
                    style={{ background: "var(--accent)" }}
                    initial={{ width: 0 }}
                    whileInView={{ width: `${e.progress}%` }}
                    viewport={{ once: true, margin: "-40px" }}
                    transition={{ duration: 1, ease: [0.16, 1, 0.3, 1], delay: 0.1 }}
                  />
                </div>
              </Reveal>
            ))}
          </div>
        </Container>
      </section>

      {/* ───────── Resources */}
      <section className="bg-surface py-20 md:py-28">
        <Container>
          <SectionHeading eyebrow={t.resources.eyebrow}>
            {t.resources.titleA}
            <AccentText>{t.resources.titleAccent}</AccentText>
          </SectionHeading>
          <div className="mt-12 grid gap-5 md:grid-cols-3">
            {t.resources.items.map((r, i) => (
              <Reveal key={r.title} delay={i * 0.06}>
                <a
                  href="#"
                  className="group flex h-full flex-col gap-3 rounded-3xl bg-bg p-7 transition-transform hover:-translate-y-1"
                >
                  <span className="num text-2xl text-ink-faint">0{i + 1}</span>
                  <h3 className="text-lg font-bold text-ink">{r.title}</h3>
                  <p className="text-[0.92rem] leading-relaxed text-ink-soft">{r.sub}</p>
                  <span className="mt-2 inline-flex items-center gap-1 text-sm font-bold" style={{ color: "var(--accent)" }}>
                    읽어보기
                    <ArrowUpRight size={15} className="transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                  </span>
                </a>
              </Reveal>
            ))}
          </div>
        </Container>
      </section>

      {/* ───────── CTA */}
      <section className="px-6 pb-24 md:pb-32">
        <Reveal className="mx-auto max-w-6xl">
          <div className="rounded-[2.5rem] bg-night px-8 py-20 text-center md:py-24">
            <p className="text-sm font-semibold tracking-tight" style={{ color: "var(--accent)" }}>{t.cta.eyebrow}</p>
            <h2 className="display mx-auto mt-4 max-w-2xl whitespace-pre-line text-3xl font-extrabold text-white md:text-5xl">
              {t.cta.titleA}
              <span className="text-white/85">{t.cta.titleAccent}</span>
              {t.cta.titleB}
            </h2>
            <p className="mx-auto mt-5 max-w-lg text-base text-white/85">{t.cta.desc}</p>
            <div className="mt-9 flex flex-wrap justify-center gap-3">
              <a
                href={t.cta.primary.href}
                className="inline-flex h-12 items-center gap-2 rounded-full bg-white px-7 text-[0.95rem] font-bold transition-all hover:-translate-y-0.5"
                style={{ color: "var(--accent-strong)" }}
              >
                {t.cta.primary.text}
                <ArrowRight size={17} />
              </a>
              <a
                href={t.cta.secondary.href}
                className="inline-flex h-12 items-center rounded-full bg-white/15 px-7 text-[0.95rem] font-semibold text-white transition-all hover:-translate-y-0.5 hover:bg-white/25"
              >
                {t.cta.secondary.text}
              </a>
            </div>
          </div>
        </Reveal>
      </section>
    </>
  );
}
