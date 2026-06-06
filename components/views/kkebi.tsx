"use client";

import Image from "next/image";
import { ArrowRight } from "lucide-react";
import {
  Container,
  Eyebrow,
  Reveal,
  SectionHeading,
  ButtonPrimary,
  ButtonGhost,
  CountUp,
  AccentText,
} from "../ui";
import { FeatureRow } from "../sections";
import { kkebi } from "../content";

export function KkebiView() {
  const k = kkebi;
  return (
    <>
      {/* ───────── Hero */}
      <section className="px-6 pt-28 md:pt-32">
        <div className="mx-auto grid max-w-6xl items-center gap-10 lg:grid-cols-[1.25fr_0.85fr] lg:gap-12">
          <div className="flex flex-col gap-6">
            <Reveal>
              <span
                className="inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-[0.8rem] font-semibold"
                style={{ background: "var(--accent-soft)", color: "var(--accent-strong)" }}
              >
                {k.hero.eyebrow}
              </span>
            </Reveal>
            <Reveal delay={0.05}>
              <h1 className="display whitespace-pre-line text-[2.3rem] font-extrabold text-ink sm:text-5xl md:text-[3.4rem]">
                {k.hero.titleA}
                <AccentText>{k.hero.titleAccent}</AccentText>
                {k.hero.titleB}
              </h1>
            </Reveal>
            <Reveal delay={0.1}>
              <p className="max-w-xl text-base leading-relaxed text-ink-soft md:text-lg">{k.hero.desc}</p>
            </Reveal>
            <Reveal delay={0.15}>
              <div className="flex flex-wrap gap-3">
                <ButtonPrimary href={k.hero.primary.href}>
                  {k.hero.primary.text}
                  <ArrowRight size={17} />
                </ButtonPrimary>
                <ButtonGhost href={k.hero.secondary.href}>{k.hero.secondary.text}</ButtonGhost>
              </div>
            </Reveal>
            {k.hero.note ? (
              <Reveal delay={0.2}>
                <p className="flex items-center gap-2 text-sm text-ink-faint">
                  <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: "var(--accent)" }} />
                  {k.hero.note}
                </p>
              </Reveal>
            ) : null}
          </div>

          {/* Hero image + floating chips */}
          <Reveal delay={0.1}>
            <div
              className="relative aspect-[4/5] overflow-hidden rounded-[2rem] sm:aspect-[5/5]"
              style={{ background: "var(--accent-soft)" }}
            >
              <Image
                src={k.hero.image}
                alt="KKEBI 앱 화면"
                fill
                priority
                sizes="(max-width: 1024px) 100vw, 560px"
                className="object-contain p-4"
              />
              {k.hero.chips.map((c, i) => (
                <span
                  key={c}
                  className={`absolute rounded-full bg-white px-3.5 py-2 text-xs font-bold text-ink ${
                    ["left-5 top-6", "right-5 top-1/3", "bottom-7 left-8"][i]
                  }`}
                >
                  <span className="mr-1.5 inline-block h-2 w-2 rounded-full align-middle" style={{ background: "var(--accent)" }} />
                  {c}
                </span>
              ))}
            </div>
          </Reveal>
        </div>
      </section>

      {/* ───────── Trust */}
      <section className="py-16 md:py-20">
        <Container>
          <Reveal className="flex flex-col items-center gap-7 text-center">
            <p className="text-sm font-semibold text-ink-faint">{k.trust.label}</p>
            <div className="flex flex-wrap items-center justify-center gap-x-10 gap-y-4 md:gap-x-14">
              {k.trust.logos.map((logo) => (
                <span key={logo} className="text-lg font-bold tracking-tight text-ink/35 md:text-xl">
                  {logo}
                </span>
              ))}
            </div>
          </Reveal>
        </Container>
      </section>

      {/* ───────── Problem */}
      <section className="bg-surface py-20 md:py-28">
        <Container>
          <SectionHeading eyebrow={k.problem.eyebrow}>
            {k.problem.title}
            <AccentText>{k.problem.titleAccent}</AccentText>
            {k.problem.titleAfter}
          </SectionHeading>

          {/* Stats */}
          <div className="mt-12 grid gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-4">
            {k.problem.stats.map((s, i) => (
              <Reveal key={s.label} delay={i * 0.06} className="flex flex-col gap-1.5">
                <div className="text-5xl font-extrabold md:text-6xl" style={{ color: "var(--accent)" }}>
                  <CountUp end={parseFloat(s.num)} suffix={s.suffix} />
                </div>
                <p className="mt-1 text-[0.95rem] font-semibold leading-snug text-ink">{s.label}</p>
                <p className="text-xs text-ink-faint">출처 · {s.source}</p>
              </Reveal>
            ))}
          </div>

          {/* Pains */}
          <div className="mt-16 grid gap-5 md:grid-cols-3">
            {k.problem.pains.map((p, i) => (
              <Reveal key={p.no} delay={i * 0.06} className="flex flex-col gap-3 rounded-3xl bg-bg p-7">
                <span className="num text-3xl text-ink-faint">{p.no}</span>
                <h3 className="text-lg font-bold text-ink">{p.title}</h3>
                <p className="text-[0.95rem] leading-relaxed text-ink-soft">{p.body}</p>
                <div className="mt-3">
                  <span className="text-2xl font-bold" style={{ color: "var(--accent)" }}>
                    {p.stat}
                  </span>
                  <span className="ml-2 text-sm text-ink-faint">{p.statLabel}</span>
                </div>
              </Reveal>
            ))}
          </div>

          {/* Definition */}
          <Reveal className="mt-16">
            <div className="rounded-[2rem] bg-night px-8 py-16 text-center md:py-20">
              <p className="text-sm font-semibold tracking-tight" style={{ color: "var(--accent)" }}>
                {k.problem.definition.eyebrow}
              </p>
              <p className="display balance mx-auto mt-5 max-w-3xl whitespace-pre-line text-3xl font-extrabold text-white md:text-[2.6rem]">
                {k.problem.definition.a}
                <AccentText>{k.problem.definition.accent}</AccentText>
                {k.problem.definition.b}
              </p>
            </div>
          </Reveal>
        </Container>
      </section>

      {/* ───────── Differentiation */}
      <section className="py-20 md:py-28">
        <Container>
          <SectionHeading eyebrow={k.diff.eyebrow} desc={k.diff.desc}>
            {k.diff.title}
            <AccentText>{k.diff.titleAccent}</AccentText>
            {k.diff.titleAfter}
          </SectionHeading>
          <div className="mt-16 flex flex-col gap-20 md:gap-28">
            {k.diff.items.map((it, i) => (
              <FeatureRow
                key={it.title}
                kicker={it.kicker}
                title={it.title}
                body={it.body}
                image={it.image}
                before={it.before}
                after={it.after}
                reverse={i % 2 === 1}
              />
            ))}
          </div>
        </Container>
      </section>

      {/* ───────── Flow */}
      <section className="bg-surface py-20 md:py-28">
        <Container>
          <SectionHeading eyebrow={k.flow.eyebrow} desc={k.flow.desc}>
            {k.flow.title}
            <AccentText>{k.flow.titleAccent}</AccentText>
            {k.flow.titleAfter}
          </SectionHeading>
          <div className="mt-12 grid gap-5 md:grid-cols-2 lg:grid-cols-4">
            {k.flow.steps.map((s, i) => (
              <Reveal key={s.no} delay={i * 0.06} className="flex flex-col gap-3 rounded-3xl bg-bg p-7">
                <span
                  className="flex h-10 w-10 items-center justify-center rounded-full text-sm font-bold text-white"
                  style={{ background: "var(--accent)" }}
                >
                  {s.no}
                </span>
                <h3 className="mt-1 text-lg font-bold text-ink">{s.title}</h3>
                <p className="text-[0.92rem] leading-relaxed text-ink-soft">{s.body}</p>
              </Reveal>
            ))}
          </div>
        </Container>
      </section>

      {/* ───────── Characters (dark) */}
      <section className="bg-night py-20 text-white md:py-28">
        <Container>
          <SectionHeading eyebrow={k.characters.eyebrow} desc={k.characters.desc} dark>
            {k.characters.title}
          </SectionHeading>
          <div className="mt-12 grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5">
            {k.characters.items.map((c, i) => (
              <Reveal key={c.name} delay={i * 0.05} className="flex flex-col items-center gap-3 rounded-3xl bg-night-2 p-5 text-center">
                <div className="relative aspect-square w-full overflow-hidden rounded-2xl bg-night-3">
                  <video
                    src={c.video}
                    autoPlay
                    loop
                    muted
                    playsInline
                    className="h-full w-full object-cover"
                  />
                </div>
                <h3 className="text-base font-bold text-white">{c.name}</h3>
                <p className="text-[0.82rem] leading-relaxed text-white/55">{c.desc}</p>
              </Reveal>
            ))}
          </div>
        </Container>
      </section>

      {/* ───────── Audience */}
      <section className="py-20 md:py-28">
        <Container>
          <SectionHeading eyebrow={k.audience.eyebrow}>
            {k.audience.title}
            <AccentText>{k.audience.titleAccent}</AccentText>
            {k.audience.titleAfter}
          </SectionHeading>
          <div className="mt-12 grid gap-5 md:grid-cols-3">
            {k.audience.items.map((a, i) => (
              <Reveal key={a.tag} delay={i * 0.06} className="flex flex-col gap-4 rounded-3xl bg-surface p-8">
                <span
                  className="w-fit rounded-full px-3 py-1 text-sm font-bold"
                  style={{ background: "var(--accent-soft)", color: "var(--accent-strong)" }}
                >
                  {a.tag}
                </span>
                <h3 className="text-xl font-bold leading-snug text-ink">{a.title}</h3>
                <p className="text-[0.95rem] text-ink-soft">{a.sub}</p>
                <ul className="mt-2 flex flex-col gap-2.5">
                  {a.points.map((pt) => (
                    <li key={pt} className="flex items-center gap-2.5 text-[0.95rem] text-ink">
                      <span className="h-1.5 w-1.5 rounded-full" style={{ background: "var(--accent)" }} />
                      {pt}
                    </li>
                  ))}
                </ul>
              </Reveal>
            ))}
          </div>
        </Container>
      </section>

      {/* ───────── Security */}
      <section className="bg-surface py-20 md:py-28">
        <Container>
          <SectionHeading eyebrow={k.security.eyebrow}>
            {k.security.title}
            <AccentText>{k.security.titleAccent}</AccentText>
            {k.security.titleAfter}
          </SectionHeading>
          <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {k.security.items.map((s, i) => (
              <Reveal key={s.title} delay={i * 0.05} className="flex flex-col gap-3 rounded-3xl bg-bg p-7">
                <h3 className="text-base font-bold text-ink">{s.title}</h3>
                <p className="text-[0.9rem] leading-relaxed text-ink-soft">{s.body}</p>
              </Reveal>
            ))}
          </div>
        </Container>
      </section>

      {/* ───────── CTA */}
      <section className="px-6 pb-24 md:pb-32">
        <Reveal className="mx-auto max-w-6xl">
          <div className="rounded-[2.5rem] bg-night px-8 py-20 text-center md:py-24">
            <p className="text-sm font-semibold tracking-tight" style={{ color: "var(--accent)" }}>{k.cta.eyebrow}</p>
            <h2 className="display mx-auto mt-4 max-w-2xl text-3xl font-extrabold text-white md:text-5xl">
              {k.cta.title}
            </h2>
            <p className="mx-auto mt-5 max-w-md text-base text-white/85">{k.cta.desc}</p>
            <div className="mt-9 flex flex-wrap justify-center gap-3">
              <a
                href={k.cta.primary.href}
                className="inline-flex h-12 items-center gap-2 rounded-full bg-white px-7 text-[0.95rem] font-bold transition-all hover:-translate-y-0.5"
                style={{ color: "var(--accent-strong)" }}
              >
                {k.cta.primary.text}
                <ArrowRight size={17} />
              </a>
              <a
                href={k.cta.secondary.href}
                className="inline-flex h-12 items-center rounded-full bg-white/15 px-7 text-[0.95rem] font-semibold text-white transition-all hover:-translate-y-0.5 hover:bg-white/25"
              >
                {k.cta.secondary.text}
              </a>
            </div>
          </div>
        </Reveal>
      </section>
    </>
  );
}
