"use client";

import Image from "next/image";
import { ArrowRight } from "lucide-react";
import {
  Container,
  Reveal,
  SectionHeading,
  ButtonPrimary,
  ButtonGhost,
  AccentText,
} from "../ui";
import { FeatureRow, TabShowcase } from "../sections";
import { ducks } from "../content";

export function DucksView() {
  const d = ducks;
  return (
    <>
      {/* ───────── Hero */}
      <section className="px-6 pt-28 md:pt-32">
        <div className="mx-auto grid max-w-6xl items-center gap-10 lg:grid-cols-[1.25fr_0.85fr] lg:gap-12">
          <div className="flex flex-col gap-6">
            <Reveal>
              <span
                className="inline-flex items-center gap-2 whitespace-nowrap rounded-full px-3.5 py-1.5 text-[0.8rem] font-semibold"
                style={{ background: "var(--accent-soft)", color: "var(--accent-strong)" }}
              >
                {d.hero.eyebrow}
              </span>
            </Reveal>
            <Reveal delay={0.05}>
              <h1 className="display whitespace-pre-line text-[2.3rem] font-extrabold text-ink sm:text-5xl md:text-[3.4rem]">
                {d.hero.titleA}
                <AccentText>{d.hero.titleAccent}</AccentText>
                {d.hero.titleB}
              </h1>
            </Reveal>
            <Reveal delay={0.1}>
              <p className="max-w-xl text-base leading-relaxed text-ink-soft md:text-lg">{d.hero.desc}</p>
            </Reveal>
            <Reveal delay={0.15}>
              <div className="flex flex-wrap gap-3">
                <ButtonPrimary href={d.hero.primary.href}>
                  {d.hero.primary.text}
                  <ArrowRight size={17} />
                </ButtonPrimary>
                <ButtonGhost href={d.hero.secondary.href}>{d.hero.secondary.text}</ButtonGhost>
              </div>
            </Reveal>
            <Reveal delay={0.2}>
              <div className="mt-2 flex gap-8">
                {d.stats.map((s) => (
                  <div key={s.label} className="flex flex-col">
                    <span className="num text-4xl font-extrabold md:text-5xl" style={{ color: "var(--accent)" }}>
                      {s.value}
                    </span>
                    <span className="mt-1 text-sm text-ink-soft">{s.label}</span>
                  </div>
                ))}
              </div>
            </Reveal>
          </div>

          <Reveal delay={0.1}>
            <div
              className="relative aspect-[4/5] overflow-hidden rounded-[2rem] sm:aspect-square"
              style={{ background: "var(--accent-soft)" }}
            >
              <Image
                src={d.hero.image}
                alt="오리의 꿈 앱 화면"
                fill
                priority
                sizes="(max-width: 1024px) 100vw, 560px"
                className="object-contain p-4"
              />
            </div>
          </Reveal>
        </div>
      </section>

      {/* ───────── Why effective + feature rows */}
      <section className="py-20 md:py-28">
        <Container>
          <SectionHeading eyebrow={d.why.eyebrow} desc={d.why.desc}>
            {d.why.titleA}
            <AccentText>{d.why.titleAccent}</AccentText>
            {d.why.titleB}
          </SectionHeading>
          <div className="mt-16 flex flex-col gap-20 md:gap-28">
            {d.why.items.map((it, i) => (
              <FeatureRow
                key={it.title}
                title={it.title}
                body={it.body}
                image={it.image}
                metric={it.metric}
                reverse={i % 2 === 1}
              />
            ))}
          </div>
        </Container>
      </section>

      {/* ───────── Experience (tab showcase) */}
      <section id="experience" className="bg-surface py-20 md:py-28">
        <Container>
          <SectionHeading eyebrow={d.experience.eyebrow} desc={d.experience.desc}>
            {d.experience.titleA}
            <AccentText>{d.experience.titleAccent}</AccentText>
            {d.experience.titleB}
          </SectionHeading>
          <div className="mt-12">
            <TabShowcase items={d.experience.items} />
          </div>
        </Container>
      </section>

      {/* ───────── Testimonials */}
      <section className="py-20 md:py-28">
        <Container>
          <SectionHeading eyebrow={d.testimonials.eyebrow}>
            {d.testimonials.titleA}
            <AccentText>{d.testimonials.titleAccent}</AccentText>
            {d.testimonials.titleB}
          </SectionHeading>
          <div className="mt-12 grid gap-5 md:grid-cols-2">
            {d.testimonials.items.map((t, i) => (
              <Reveal key={t.name} delay={i * 0.06} className="flex flex-col gap-5 rounded-3xl bg-surface p-8">
                <p className="text-lg font-semibold leading-relaxed text-ink">“{t.quote}”</p>
                <div className="flex items-center gap-3">
                  <span
                    className="flex h-10 w-10 items-center justify-center rounded-full text-sm font-bold text-white"
                    style={{ background: "var(--accent)" }}
                  >
                    {t.name.slice(0, 1)}
                  </span>
                  <div>
                    <p className="text-sm font-bold text-ink">{t.name}</p>
                    <p className="text-xs text-ink-faint">{t.role}</p>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </Container>
      </section>

      {/* ───────── CTA */}
      <section className="px-6 pb-24 md:pb-32">
        <Reveal className="mx-auto max-w-6xl">
          <div className="rounded-[2.5rem] bg-night px-8 py-20 text-center md:py-24">
            <p className="text-sm font-semibold tracking-tight" style={{ color: "var(--accent)" }}>{d.cta.eyebrow}</p>
            <h2 className="display mx-auto mt-4 max-w-2xl whitespace-pre-line text-3xl font-extrabold text-white md:text-5xl">
              {d.cta.titleA}
              <span className="text-white/85">{d.cta.titleAccent}</span>
              {d.cta.titleB}
            </h2>
            <p className="mx-auto mt-5 max-w-md text-base text-white/85">{d.cta.desc}</p>
            <div className="mt-9 flex flex-wrap justify-center gap-3">
              <a
                href={d.cta.primary.href}
                className="inline-flex h-12 items-center gap-2 rounded-full bg-white px-7 text-[0.95rem] font-bold transition-all hover:-translate-y-0.5"
                style={{ color: "var(--accent-strong)" }}
              >
                {d.cta.primary.text}
                <ArrowRight size={17} />
              </a>
              <a
                href={d.cta.secondary.href}
                className="inline-flex h-12 items-center rounded-full bg-white/15 px-7 text-[0.95rem] font-semibold text-white transition-all hover:-translate-y-0.5 hover:bg-white/25"
              >
                {d.cta.secondary.text}
              </a>
            </div>
          </div>
        </Reveal>
      </section>
    </>
  );
}
