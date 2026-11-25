"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, ImagePlus, Trash2, X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { useCategories } from "@/lib/queries";
import { uploadFile } from "@/lib/upload";
import { cn, displayPhone, errorText, normalizeKenyanPhone } from "@/lib/utils";
import { AppShell, RequireAuth, TopBar } from "@/components/shell";
import { Button, Card, Field, Input, PageLoader, Select, Switch, Textarea } from "@/components/ui";
import { CategoryIcon } from "@/components/bits";
import { useToast } from "@/components/toast";

function ProviderEditor() {
  const { t, catName } = useI18n();
  const { user, provider, refresh } = useAuth();
  const { data: categories } = useCategories();
  const router = useRouter();
  const params = useSearchParams();
  const setup = params.get("setup") === "1" || !provider;
  const toast = useToast();
  const qc = useQueryClient();

  const [cats, setCats] = useState<number[]>([]);
  const [headline, setHeadline] = useState("");
  const [about, setAbout] = useState("");
  const [rate, setRate] = useState("");
  const [unit, setUnit] = useState<"job" | "hour" | "day">("job");
  const [years, setYears] = useState("1");
  const [skills, setSkills] = useState<string[]>([]);
  const [skillDraft, setSkillDraft] = useState("");
  const [remote, setRemote] = useState(false);
  const [available, setAvailable] = useState(true);
  const [mpesa, setMpesa] = useState("");
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const loaded = useRef(false);

  const extra = useQuery({
    queryKey: ["provider-extra", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const [pc, priv, port] = await Promise.all([
        supabase.from("provider_categories").select("category_id").eq("provider_id", user!.id),
        supabase.from("profile_private").select("*").eq("user_id", user!.id).maybeSingle(),
        supabase.from("portfolio_items").select("*").eq("provider_id", user!.id).order("created_at", { ascending: false }),
      ]);
      return {
        cats: (pc.data ?? []).map((r) => r.category_id as number),
        mpesa: (priv.data?.mpesa_phone ?? priv.data?.phone ?? "") as string,
        portfolio: (port.data ?? []) as { id: string; image_url: string; caption: string }[],
      };
    },
  });

  useEffect(() => {
    if (loaded.current || !extra.data) return;
    loaded.current = true;
    setCats(extra.data.cats);
    setMpesa(extra.data.mpesa ? displayPhone(extra.data.mpesa) : "");
    if (provider) {
      setHeadline(provider.headline);
      setAbout(provider.about);
      setRate(provider.rate_kes ? String(provider.rate_kes) : "");
      setUnit(provider.rate_unit);
      setYears(String(provider.years_experience));
      setSkills(provider.skills);
      setRemote(provider.remote_ok);
      setAvailable(provider.available);
    }
  }, [extra.data, provider]);

  function toggleCat(id: number) {
    setCats((c) => (c.includes(id) ? c.filter((x) => x !== id) : c.length >= 3 ? c : [...c, id]));
  }

  function addSkill() {
    const s = skillDraft.trim().replace(/,$/, "");
    if (s && !skills.includes(s) && skills.length < 12) setSkills([...skills, s]);
    setSkillDraft("");
  }

  async function save() {
    if (!user) return;
    const e: Record<string, string> = {};
    if (!cats.length) e.cats = t("err.required");
    if (headline.trim().length < 5) e.headline = t("err.titleShort");
    const phone = normalizeKenyanPhone(mpesa);
    if (!phone) e.mpesa = t("err.INVALID_PHONE");
    setErrors(e);
    if (Object.keys(e).length) {
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    setBusy(true);
    try {
      const row = {
        id: user.id,
        headline: headline.trim(),
        about: about.trim(),
        rate_kes: rate ? Math.max(0, Number(rate)) : null,
        rate_unit: unit,
        years_experience: Math.min(60, Math.max(0, Number(years) || 0)),
        skills,
        remote_ok: remote,
        available,
      };
      const { error } = await supabase.from("provider_profiles").upsert(row);
      if (error) throw error;
      const current = extra.data?.cats ?? [];
      const toDel = current.filter((c) => !cats.includes(c));
      const toAdd = cats.filter((c) => !current.includes(c));
      if (toDel.length) {
        const { error: dErr } = await supabase.from("provider_categories").delete().eq("provider_id", user.id).in("category_id", toDel);
        if (dErr) throw dErr;
      }
      if (toAdd.length) {
        const { error: aErr } = await supabase.from("provider_categories").insert(toAdd.map((category_id) => ({ provider_id: user.id, category_id })));
        if (aErr) throw aErr;
      }
      const { error: pErr } = await supabase.from("profile_private").update({ mpesa_phone: phone }).eq("user_id", user.id);
      if (pErr) throw pErr;
      await refresh();
      qc.invalidateQueries({ queryKey: ["provider-extra", user.id] });
      qc.invalidateQueries({ queryKey: ["search"] });
      toast(t("pro.saved"));
      if (setup) router.replace("/verify?welcome=1");
    } catch (err) {
      toast(errorText(err), "error");
    } finally {
      setBusy(false);
    }
  }

  async function addPortfolio(files: FileList | null) {
    if (!files?.length || !user) return;
    if (!provider) return toast(t("err.NOT_PROVIDER"), "error");
    try {
      for (const f of Array.from(files).slice(0, 6)) {
        const { url } = await uploadFile("portfolio", user.id, f);
        await supabase.from("portfolio_items").insert({ provider_id: user.id, image_url: url });
      }
      qc.invalidateQueries({ queryKey: ["provider-extra", user.id] });
    } catch (err) {
      toast(errorText(err), "error");
    }
  }

  async function removePortfolio(id: string) {
    await supabase.from("portfolio_items").delete().eq("id", id);
    qc.invalidateQueries({ queryKey: ["provider-extra", user?.id] });
  }

  if (extra.isLoading) return <PageLoader />;

  return (
    <>
      <TopBar title={setup ? t("pro.setupTitle") : t("me.providerProfile")} back={setup ? false : "/me"} />
      <div className="space-y-6 px-4 py-5">
        {setup && <p className="text-muted">{t("pro.setupSub")}</p>}

        <Field label={t("pro.services")} hint={t("pro.servicesHint")} error={errors.cats}>
          <div className="flex flex-wrap gap-2">
            {categories?.map((c) => {
              const on = cats.includes(c.id);
              return (
                <button
                  key={c.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggleCat(c.id)}
                  className={cn(
                    "inline-flex h-10 items-center gap-1.5 rounded-full border px-3.5 text-sm font-semibold transition",
                    on ? "border-brand bg-brand text-brand-ink" : "border-line bg-surface text-ink-2",
                    !on && cats.length >= 3 && "opacity-40",
                  )}
                >
                  {on ? <Check className="size-4" aria-hidden /> : <CategoryIcon icon={c.icon} className="size-4" />}
                  {catName(c)}
                </button>
              );
            })}
          </div>
        </Field>

        <Field label={t("pro.headline")} htmlFor="headline" error={errors.headline}>
          <Input id="headline" maxLength={90} placeholder={t("pro.headlinePh")} value={headline} onChange={(e) => setHeadline(e.target.value)} />
        </Field>

        <Field label={t("pro.about")} htmlFor="about" optional={`${about.length}/1500`}>
          <Textarea id="about" rows={5} maxLength={1500} placeholder={t("pro.aboutPh")} value={about} onChange={(e) => setAbout(e.target.value)} />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label={t("pro.rate")} htmlFor="rate" optional="KES">
            <Input id="rate" inputMode="numeric" placeholder="1,500" value={rate} onChange={(e) => setRate(e.target.value.replace(/\D/g, ""))} />
          </Field>
          <Field label={t("pro.rateUnit")} htmlFor="unit">
            <Select id="unit" value={unit} onChange={(e) => setUnit(e.target.value as typeof unit)}>
              <option value="job">{t("pro.unit.job")}</option>
              <option value="hour">{t("pro.unit.hour")}</option>
              <option value="day">{t("pro.unit.day")}</option>
            </Select>
          </Field>
        </div>

        <Field label={t("pro.years")} htmlFor="years">
          <Input id="years" inputMode="numeric" value={years} onChange={(e) => setYears(e.target.value.replace(/\D/g, "").slice(0, 2))} />
        </Field>

        <Field label={t("pro.skills")} htmlFor="skills">
          <div className="flex min-h-12 flex-wrap items-center gap-2 rounded-2xl border border-line bg-surface p-2">
            {skills.map((s) => (
              <span key={s} className="inline-flex items-center gap-1 rounded-full bg-surface-2 py-1 pl-3 pr-1 text-sm font-medium">
                {s}
                <button type="button" aria-label={`${t("common.delete")} ${s}`} onClick={() => setSkills(skills.filter((x) => x !== s))} className="rounded-full p-1 hover:bg-line">
                  <X className="size-3.5" />
                </button>
              </span>
            ))}
            <input
              id="skills"
              className="h-8 min-w-[10ch] flex-1 bg-transparent px-2 text-[16px] outline-none placeholder:text-muted/70"
              placeholder={t("pro.skillsPh")}
              value={skillDraft}
              enterKeyHint="done"
              onChange={(e) => (e.target.value.endsWith(",") ? (setSkillDraft(e.target.value), setTimeout(addSkill)) : setSkillDraft(e.target.value))}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addSkill();
                }
              }}
              onBlur={addSkill}
            />
          </div>
        </Field>

        <Field label={t("pro.mpesa")} htmlFor="mpesa" error={errors.mpesa}>
          <Input id="mpesa" type="tel" inputMode="tel" placeholder="0712 345 678" value={mpesa} onChange={(e) => setMpesa(e.target.value)} />
        </Field>

        <Card className="divide-y divide-line px-4">
          <div className="py-3">
            <Switch checked={available} onChange={setAvailable} label={t("pro.available")} sub={t("pro.availableSub")} />
          </div>
          <div className="py-3">
            <Switch checked={remote} onChange={setRemote} label={t("pro.remoteOk")} />
          </div>
        </Card>

        {provider && (
          <Field label={t("pro.portfolio")} hint={t("pro.portfolioSub")}>
            <div className="grid grid-cols-3 gap-2">
              {extra.data?.portfolio.map((p) => (
                <div key={p.id} className="relative aspect-square overflow-hidden rounded-2xl bg-surface-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p.image_url} alt="" loading="lazy" className="size-full object-cover" />
                  <button
                    aria-label={t("common.delete")}
                    onClick={() => removePortfolio(p.id)}
                    className="absolute right-1.5 top-1.5 rounded-full bg-black/55 p-1.5 text-white"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>
              ))}
              <label className="flex aspect-square cursor-pointer flex-col items-center justify-center gap-1 rounded-2xl border-2 border-dashed border-line text-sm font-semibold text-muted hover:bg-surface-2">
                <ImagePlus className="size-6" aria-hidden />
                {t("pro.addPhoto")}
                <input type="file" accept="image/*" multiple className="sr-only" onChange={(e) => addPortfolio(e.target.files)} />
              </label>
            </div>
          </Field>
        )}

        <Button size="lg" block loading={busy} onClick={save}>
          {setup ? t("pro.publish") : t("common.save")}
        </Button>
      </div>
    </>
  );
}

export default function ProviderSetupPage() {
  return (
    <RequireAuth>
      <AppShell hideNav>
        <Suspense fallback={<PageLoader />}>
          <ProviderEditor />
        </Suspense>
      </AppShell>
    </RequireAuth>
  );
}
