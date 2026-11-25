"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { ImagePlus, X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { useErrorMessage, useI18n } from "@/lib/i18n";
import { useCategories } from "@/lib/queries";
import { uploadFile } from "@/lib/upload";
import { cn } from "@/lib/utils";
import type { Urgency } from "@/lib/types";
import { AppShell, RequireAuth, TopBar } from "@/components/shell";
import { Button, Chip, Field, Input, PageLoader, Switch, Textarea } from "@/components/ui";
import { CategoryIcon } from "@/components/bits";
import { CountySelect } from "@/components/county-select";
import { useToast } from "@/components/toast";

function NewJobForm() {
  const { t, catName } = useI18n();
  const errMsg = useErrorMessage();
  const { user, profile } = useAuth();
  const { data: categories } = useCategories();
  const router = useRouter();
  const sp = useSearchParams();
  const toast = useToast();
  const qc = useQueryClient();

  const [category, setCategory] = useState<number | null>(sp.get("cat") ? Number(sp.get("cat")) : null);
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [min, setMin] = useState("");
  const [max, setMax] = useState("");
  const [urgency, setUrgency] = useState<Urgency>("this_week");
  const [remote, setRemote] = useState(false);
  const [county, setCounty] = useState<number | null>(null);
  const [town, setTown] = useState("");
  const [photos, setPhotos] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (profile) {
      setCounty((c) => c ?? profile.county_id);
      setTown((tw) => tw || profile.town || "");
    }
  }, [profile]);

  const selectedCat = categories?.find((c) => c.id === category);
  useEffect(() => {
    if (selectedCat?.kind === "remote") setRemote(true);
  }, [selectedCat]);

  async function addPhotos(files: FileList | null) {
    if (!files || !user) return;
    setUploading(true);
    try {
      const urls: string[] = [];
      for (const f of Array.from(files).slice(0, 4 - photos.length)) {
        const { url } = await uploadFile("job-photos", user.id, f);
        if (url) urls.push(url);
      }
      setPhotos((p) => [...p, ...urls]);
    } catch (e) {
      toast(errMsg(e), "error");
    } finally {
      setUploading(false);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    const er: Record<string, string> = {};
    if (!category) er.category = t("err.required");
    if (title.trim().length < 5) er.title = t("err.titleShort");
    if (!remote && !county) er.county = t("err.required");
    setErrors(er);
    if (Object.keys(er).length) {
      document.getElementById(Object.keys(er)[0])?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    let bmin = min ? Number(min) : null;
    let bmax = max ? Number(max) : null;
    if (bmin && bmax && bmin > bmax) [bmin, bmax] = [bmax, bmin];
    setBusy(true);
    const { data, error } = await supabase
      .from("jobs")
      .insert({
        buyer_id: user.id,
        category_id: category,
        title: title.trim(),
        description: desc.trim(),
        budget_min: bmin,
        budget_max: bmax,
        urgency,
        is_remote: remote,
        county_id: county,
        town: town.trim() || null,
        photos,
      })
      .select("id")
      .single();
    setBusy(false);
    if (error) return toast(errMsg(error), "error");
    qc.invalidateQueries({ queryKey: ["my-jobs"] });
    toast(t("jobs.posted"));
    router.replace(`/jobs/${data.id}`);
  }

  return (
    <>
      <TopBar title={t("jobs.postTitle")} />
      <form onSubmit={submit} className="space-y-6 px-4 py-5" noValidate>
        <p className="text-muted">{t("jobs.postSub")}</p>

        <div id="category">
          <Field label={t("jobs.category")} error={errors.category}>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {categories?.map((c) => (
                <button
                  type="button"
                  key={c.id}
                  onClick={() => setCategory(c.id)}
                  aria-pressed={category === c.id}
                  className={cn(
                    "flex flex-col items-center gap-1.5 rounded-2xl border-2 px-1.5 py-3 text-center text-[12px] font-semibold leading-tight transition",
                    category === c.id ? "border-brand bg-brand-soft text-brand-soft-ink" : "border-line bg-surface text-ink-2",
                  )}
                >
                  <CategoryIcon icon={c.icon} className="size-5" />
                  <span className="line-clamp-2">{catName(c)}</span>
                </button>
              ))}
            </div>
          </Field>
        </div>

        <Field label={t("jobs.title")} htmlFor="title" error={errors.title}>
          <Input id="title" maxLength={120} placeholder={t("jobs.titlePh")} value={title} onChange={(e) => setTitle(e.target.value)} />
        </Field>

        <Field label={t("jobs.desc")} htmlFor="desc" optional={`${desc.length}/4000`}>
          <Textarea id="desc" rows={5} maxLength={4000} placeholder={t("jobs.descPh")} value={desc} onChange={(e) => setDesc(e.target.value)} />
        </Field>

        <Field label={t("jobs.photos")} hint={t("jobs.photosHint")} optional={t("common.optional")}>
          <div className="grid grid-cols-4 gap-2">
            {photos.map((p) => (
              <div key={p} className="relative aspect-square overflow-hidden rounded-2xl bg-surface-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p} alt="" className="size-full object-cover" />
                <button
                  type="button"
                  aria-label={t("common.delete")}
                  onClick={() => setPhotos(photos.filter((x) => x !== p))}
                  className="absolute right-1 top-1 rounded-full bg-black/55 p-1 text-white"
                >
                  <X className="size-3.5" />
                </button>
              </div>
            ))}
            {photos.length < 4 && (
              <label className="flex aspect-square cursor-pointer flex-col items-center justify-center gap-1 rounded-2xl border-2 border-dashed border-line text-muted">
                {uploading ? <span className="text-xs">{t("common.loading")}</span> : <ImagePlus className="size-6" aria-hidden />}
                <input type="file" accept="image/*" multiple className="sr-only" onChange={(e) => addPhotos(e.target.files)} disabled={uploading} />
              </label>
            )}
          </div>
        </Field>

        <Field label={t("jobs.budget")} optional={t("common.optional")}>
          <div className="grid grid-cols-2 gap-3">
            <Input aria-label={t("jobs.min")} inputMode="numeric" placeholder={t("jobs.min")} value={min} onChange={(e) => setMin(e.target.value.replace(/\D/g, ""))} />
            <Input aria-label={t("jobs.max")} inputMode="numeric" placeholder={t("jobs.max")} value={max} onChange={(e) => setMax(e.target.value.replace(/\D/g, ""))} />
          </div>
        </Field>

        <Field label={t("jobs.urgency")}>
          <div className="flex flex-wrap gap-2">
            {(["asap", "this_week", "flexible"] as Urgency[]).map((u) => (
              <Chip key={u} active={urgency === u} onClick={() => setUrgency(u)}>
                {t(`jobs.urgency.${u}`)}
              </Chip>
            ))}
          </div>
        </Field>

        <Switch checked={remote} onChange={setRemote} label={t("jobs.remote")} />

        {!remote && (
          <div className="grid grid-cols-2 gap-3" id="county">
            <Field label={t("common.county")} error={errors.county}>
              <CountySelect value={county} onChange={setCounty} />
            </Field>
            <Field label={t("common.town")} htmlFor="town">
              <Input id="town" placeholder={t("common.townPh")} value={town} onChange={(e) => setTown(e.target.value)} />
            </Field>
          </div>
        )}

        <Button type="submit" size="lg" variant="accent" block loading={busy} disabled={uploading}>
          {busy ? t("jobs.posting") : t("jobs.publish")}
        </Button>
      </form>
    </>
  );
}

export default function NewJobPage() {
  return (
    <RequireAuth>
      <AppShell hideNav>
        <Suspense fallback={<PageLoader />}>
          <NewJobForm />
        </Suspense>
      </AppShell>
    </RequireAuth>
  );
}
