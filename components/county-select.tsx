"use client";

import { COUNTIES, COUNTIES_SORTED, POPULAR_COUNTY_IDS } from "@/lib/data";
import { useI18n } from "@/lib/i18n";
import { Select } from "./ui";

export function CountySelect({
  value,
  onChange,
  allowAll,
  id,
  required,
}: {
  value: number | null;
  onChange: (v: number | null) => void;
  allowAll?: boolean;
  id?: string;
  required?: boolean;
}) {
  const { t, locale } = useI18n();
  const popular = POPULAR_COUNTY_IDS.map((pid) => COUNTIES.find((c) => c.id === pid)!);
  return (
    <Select
      id={id}
      required={required}
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}
    >
      {allowAll ? <option value="">{t("common.allCounties")}</option> : <option value="" disabled>{t("common.county")}…</option>}
      <optgroup label={locale === "sw" ? "Maarufu" : "Popular"}>
        {popular.map((c) => (
          <option key={`p${c.id}`} value={c.id}>
            {c.name}
          </option>
        ))}
      </optgroup>
      <optgroup label={t("common.allCounties")}>
        {COUNTIES_SORTED.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </optgroup>
    </Select>
  );
}
