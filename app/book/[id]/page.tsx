"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { ShieldCheck } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { useErrorMessage, useI18n } from "@/lib/i18n";
import { useCategoryMap } from "@/lib/queries";
import { firstName } from "@/lib/utils";
import { AppShell, RequireAuth, TopBar } from "@/components/shell";
import { Button, Field, Input, PageLoader, Select, Textarea } from "@/components/ui";
import { Avatar, RatingInline, VerifiedBadge } from "@/components/bits";
import { CountySelect } from "@/components/county-select";
import { useToast } from "@/components/toast";

function BookForm() {
  const { id } = useParams<{ id: string }>();
  const { t, catName } = useI18n();
  const errMsg = useErrorMessage();
  const { profile } = useAuth();
  const cats = useCategoryMap();
  const router = useRouter();
  const toast = useToast();

  const prov = useQuery({
    queryKey: ["book-provider", id],
    queryFn: async () => {
      const [p, pp, pc] = await Promise.all([
        supabase.from("profiles").select("full_name,avatar_url,verification_level").eq("id", id).single(),
        supabase.from("provider_profiles").select("rate_kes,rating_avg,rating_count,headline").eq("id", id).single(),
        supabase.from("provider_categories").select("category_id").eq("provider_id", id),
      ]);
      return { p: p.data, pp: pp.data, cats: (pc.data ?? []).map((r) => r.category_id as number) };
    },
  });

  const [category, setCategory] = useState<number | null>(null);
  const [title, setTitle] = useState("");
  const [details, setDetails] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState("");
  const [county, setCounty] = useState<number | null>(null);
  const [town, setTown] = useState("");
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (prov.data?.cats.length && !category) setCategory(prov.data.cats[0]);
    if (prov.data?.pp?.rate_kes && !amount) setAmount(String(prov.data.pp.rate_kes));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prov.data]);
  useEffect(() => {
    if (profile) {
      setCounty((c) => c ?? profile.county_id);
      setTown((tw) => tw || profile.town || "");
    }
  }, [profile]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const er: Record<string, string> = {};
    if (title.trim().length < 3) er.title = t("err.titleShort");
    if (!amount || Number(amount) < 50) er.amount = t("err.amount");
    setErrors(er);
    if (Object.keys(er).length) return;
    setBusy(true);
    const { data, error } = await supabase.rpc("request_booking", {
      p_provider: id,
      p_category: category,
      p_title: title.trim(),
      p_description: details.trim(),
      p_amount: Number(amount),
      p_county: county,
      p_town: town.trim() || null,
      p_date: date || null,
    });
    setBusy(false);
    if (error) return toast(errMsg(error), "error");
    toast(t("book.sent", { name: firstName(prov.data?.p?.full_name) }));
    router.replace(`/bookings/${data}`);
  }

  if (prov.isLoading) return <PageLoader />;
  const name = prov.data?.p?.full_name ?? "";
  const today = new Date().toISOString().slice(0, 10);

  return (
    <>
      <TopBar title={t("book.title", { name: firstName(name) })} />
      <form onSubmit={submit} className="space-y-5 px-4 py-5">
        <div className="flex items-center gap-3 rounded-[var(--radius-card)] border border-line/70 bg-surface p-3.5">
          <Avatar src={prov.data?.p?.avatar_url} name={name} size={48} />
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-1 font-bold">
              {name} <VerifiedBadge level={prov.data?.p?.verification_level ?? 0} compact />
            </p>
            <p className="truncate text-sm text-muted">{prov.data?.pp?.headline}</p>
          </div>
          <RatingInline avg={Number(prov.data?.pp?.rating_avg ?? 0)} count={prov.data?.pp?.rating_count ?? 0} />
        </div>

        {(prov.data?.cats.length ?? 0) > 1 && (
          <Field label={t("jobs.category")} htmlFor="cat">
            <Select id="cat" value={category ?? ""} onChange={(e) => setCategory(Number(e.target.value))}>
              {prov.data!.cats.map((c) => (
                <option key={c} value={c}>
                  {catName(cats.get(c))}
                </option>
              ))}
            </Select>
          </Field>
        )}

        <Field label={t("book.what")} htmlFor="title" error={errors.title}>
          <Input id="title" maxLength={120} placeholder={t("book.whatPh")} value={title} onChange={(e) => setTitle(e.target.value)} />
        </Field>
        <Field label={t("book.details")} htmlFor="details" optional={t("common.optional")}>
          <Textarea id="details" maxLength={4000} placeholder={t("book.detailsPh")} value={details} onChange={(e) => setDetails(e.target.value)} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t("book.budget")} htmlFor="amount" error={errors.amount}>
            <Input id="amount" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value.replace(/\D/g, ""))} />
          </Field>
          <Field label={t("book.date")} htmlFor="date" optional={t("common.optional")}>
            <Input id="date" type="date" min={today} value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
        </div>
        <p className="-mt-2 text-xs text-muted">{t("book.budgetHint", { name: firstName(name) })}</p>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t("common.county")} htmlFor="county">
            <CountySelect id="county" value={county} onChange={setCounty} />
          </Field>
          <Field label={t("common.town")} htmlFor="town">
            <Input id="town" placeholder={t("common.townPh")} value={town} onChange={(e) => setTown(e.target.value)} />
          </Field>
        </div>

        <p className="flex items-start gap-2 rounded-2xl bg-brand-soft p-3.5 text-sm text-brand-soft-ink">
          <ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden />
          {t("pp.escrowNote")}
        </p>
        <Button type="submit" size="lg" block loading={busy}>
          {t("book.send")}
        </Button>
      </form>
    </>
  );
}

export default function BookPage() {
  return (
    <RequireAuth>
      <AppShell hideNav>
        <BookForm />
      </AppShell>
    </RequireAuth>
  );
}
