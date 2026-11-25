"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { useErrorMessage, useI18n } from "@/lib/i18n";
import { uploadFile } from "@/lib/upload";
import { AppShell, RequireAuth, TopBar } from "@/components/shell";
import { Button, Field, Input, Spinner } from "@/components/ui";
import { Avatar } from "@/components/bits";
import { CountySelect } from "@/components/county-select";
import { Sheet } from "@/components/sheet";
import { useToast } from "@/components/toast";

function EditProfile() {
  const { t } = useI18n();
  const errMsg = useErrorMessage();
  const { user, profile, refresh } = useAuth();
  const router = useRouter();
  const toast = useToast();
  const [name, setName] = useState("");
  const [county, setCounty] = useState<number | null>(null);
  const [town, setTown] = useState("");
  const [avatar, setAvatar] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  useEffect(() => {
    if (profile) {
      setName(profile.full_name);
      setCounty(profile.county_id);
      setTown(profile.town ?? "");
      setAvatar(profile.avatar_url);
    }
  }, [profile]);

  async function onPhoto(f: File | undefined) {
    if (!f || !user) return;
    setUploading(true);
    try {
      const { url } = await uploadFile("avatars", user.id, f);
      setAvatar(url);
      await supabase.from("profiles").update({ avatar_url: url }).eq("id", user.id);
      await refresh();
    } catch (e) {
      toast(errMsg(e), "error");
    } finally {
      setUploading(false);
    }
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!user || name.trim().length < 2) return;
    setBusy(true);
    const { error } = await supabase.from("profiles").update({ full_name: name.trim(), county_id: county, town: town.trim() || null }).eq("id", user.id);
    setBusy(false);
    if (error) return toast(errMsg(error), "error");
    await refresh();
    toast(t("pro.saved"));
    router.back();
  }

  return (
    <>
      <TopBar title={t("me.editProfile")} />
      <form onSubmit={save} className="space-y-5 px-4 py-6">
        <div className="flex flex-col items-center">
          <label className="relative cursor-pointer">
            <Avatar src={avatar} name={name} size={104} />
            <span className="absolute bottom-0 right-0 flex size-9 items-center justify-center rounded-full border-4 border-bg bg-brand text-brand-ink">
              {uploading ? <Spinner className="size-4 text-brand-ink" /> : <Camera className="size-4" aria-hidden />}
            </span>
            <input type="file" accept="image/*" className="sr-only" onChange={(e) => onPhoto(e.target.files?.[0])} aria-label={t("me.photo")} />
          </label>
          <span className="mt-2 text-sm font-semibold text-brand">{t("me.photo")}</span>
        </div>
        <Field label={t("onb.nameLabel")} htmlFor="name">
          <Input id="name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
        </Field>
        <Field label={t("common.county")} htmlFor="county">
          <CountySelect id="county" value={county} onChange={setCounty} />
        </Field>
        <Field label={t("common.town")} htmlFor="town">
          <Input id="town" placeholder={t("common.townPh")} value={town} onChange={(e) => setTown(e.target.value)} />
        </Field>
        <Button type="submit" block size="lg" loading={busy}>
          {t("common.save")}
        </Button>
        <button type="button" onClick={() => setDeleteOpen(true)} className="mx-auto block pt-4 text-sm font-semibold text-danger">
          {t("me.deleteAccount")}
        </button>
      </form>
      <Sheet open={deleteOpen} onClose={() => setDeleteOpen(false)} title={t("me.deleteAccount")}>
        <p className="pb-4 text-ink-2">{t("me.deleteBody")}</p>
        <a href="mailto:support@kazikenya.co.ke?subject=Delete%20my%20KaziKenya%20account" className="mb-3 block">
          <Button variant="danger" block size="lg" type="button">
            support@kazikenya.co.ke
          </Button>
        </a>
      </Sheet>
    </>
  );
}

export default function EditProfilePage() {
  return (
    <RequireAuth>
      <AppShell hideNav>
        <EditProfile />
      </AppShell>
    </RequireAuth>
  );
}
