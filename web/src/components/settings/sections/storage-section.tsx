"use client";

import { HardDrive, Loader2 } from "lucide-react";
import Image from "next/image";
import { useTranslations } from "next-intl";

import { STORAGE_LOGO, type StorageBackend } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { useConfigForm } from "../hooks/use-config-form";
import { FieldInput, SaveButton } from "../settings-primitives";

export function StorageSection() {
  const t = useTranslations("settings");
  const { form, loading, saving, saved, error, set, save } = useConfigForm();

  const storageProviders: { value: StorageBackend; desc: string }[] = [
    { value: "local", desc: t("storage.noConfig") },
    { value: "minio", desc: t("storage.selfHosted") },
    { value: "s3",    desc: t("storage.aws") },
    { value: "oss",   desc: t("storage.cnFast") },
    { value: "cos",   desc: t("storage.cnFast") },
  ];

  const backend = (form.storage_backend ?? "local") as StorageBackend;

  async function handleSave() {
    await save({
      storage_backend: form.storage_backend,
      storage_region: form.storage_region,
      storage_s3_endpoint_url: form.storage_s3_endpoint_url,
      storage_s3_bucket: form.storage_s3_bucket,
      storage_s3_access_key: form.storage_s3_access_key,
      storage_s3_secret_key: form.storage_s3_secret_key,
    });
  }

  if (loading) return <div className="flex justify-center py-8"><Loader2 size={18} className="animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <p className="text-sm font-medium">{t("storage.backend")}</p>
        <div className="grid grid-cols-3 gap-2">
          {storageProviders.map((p) => {
            const logo = STORAGE_LOGO[p.value];
            const isActive = backend === p.value;
            return (
              <button key={p.value} type="button" onClick={() => set("storage_backend", p.value)}
                className={cn("flex h-16 flex-col items-center justify-center gap-1 rounded-xl border p-2 text-center transition-all", isActive ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:border-border/80 hover:bg-muted/30")}>
                <div className="flex h-7 items-center justify-center">
                  {p.value === "local" ? <HardDrive size={22} className={isActive ? "text-primary" : "text-muted-foreground"} /> : logo ? (
                    <Image src={logo.src} alt={p.value} width={logo.w} height={logo.h} style={{ maxWidth: logo.w, maxHeight: 24, objectFit: "contain" }} />
                  ) : null}
                </div>
                <span className="text-[11px]">{p.desc}</span>
              </button>
            );
          })}
        </div>
      </div>
      {(backend === "minio" || backend === "oss") && (
        <FieldInput label={t("storage.endpoint")} description={backend === "minio" ? t("storage.minioEndpointDesc") : t("storage.ossEndpointDesc")}
          value={form.storage_s3_endpoint_url ?? ""} onChange={(v) => set("storage_s3_endpoint_url", v)}
          placeholder={backend === "minio" ? "http://localhost:9000" : "https://oss-cn-hangzhou.aliyuncs.com"} />
      )}
      {(backend === "s3" || backend === "cos") && (
        <FieldInput label={t("storage.region")} description={backend === "s3" ? t("storage.awsRegionDesc") : t("storage.cosRegionDesc")}
          value={form.storage_region ?? ""} onChange={(v) => set("storage_region", v)}
          placeholder={backend === "s3" ? "us-east-1" : "ap-guangzhou"} />
      )}
      {backend !== "local" && (
        <>
          <FieldInput label={t("storage.bucket")} value={form.storage_s3_bucket ?? ""} onChange={(v) => set("storage_s3_bucket", v)} placeholder="lyranote" />
          <FieldInput label={t("storage.accessKey")} type="password"
            value={form.storage_s3_access_key === "••••••••" ? "" : (form.storage_s3_access_key ?? "")}
            onChange={(v) => set("storage_s3_access_key", v)}
            placeholder={form.storage_s3_access_key === "••••••••" ? "Already set" : "Access Key ID"} />
          <FieldInput label={t("storage.secretKey")} type="password"
            value={form.storage_s3_secret_key === "••••••••" ? "" : (form.storage_s3_secret_key ?? "")}
            onChange={(v) => set("storage_s3_secret_key", v)}
            placeholder={form.storage_s3_secret_key === "••••••••" ? "Already set" : "Secret Access Key"} />
        </>
      )}
      {error && <p className="text-xs text-destructive">{error}</p>}
      <SaveButton onClick={handleSave} saving={saving} saved={saved} />
    </div>
  );
}
