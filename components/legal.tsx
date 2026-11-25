"use client";

import { AppShell, TopBar } from "./shell";

export function LegalPage({ title, updated, sections }: { title: string; updated: string; sections: { h: string; p: string[] }[] }) {
  return (
    <AppShell hideNav>
      <TopBar title={title} />
      <article className="px-5 py-6">
        <h1 className="text-2xl font-extrabold tracking-tight">{title}</h1>
        <p className="mt-1 text-sm text-muted">Last updated: {updated}</p>
        {sections.map((s) => (
          <section key={s.h} className="mt-6">
            <h2 className="text-lg font-bold">{s.h}</h2>
            {s.p.map((para, i) => (
              <p key={i} className="mt-2 text-[15px] leading-relaxed text-ink-2">
                {para}
              </p>
            ))}
          </section>
        ))}
        <p className="mt-10 text-sm text-muted">Questions? Email support@kazikenya.co.ke</p>
      </article>
    </AppShell>
  );
}
