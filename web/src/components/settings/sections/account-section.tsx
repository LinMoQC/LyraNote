"use client";

import Image from "next/image";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { useAuth } from "@/features/auth/auth-provider";
import { updateProfile, updatePassword } from "@/services/auth-service";
import { FieldInput, SaveButton } from "../settings-primitives";

export function AccountSection() {
  const t = useTranslations("settings");
  const tc = useTranslations("common");
  const { user, refetch } = useAuth();
  const [name, setName] = useState(user?.name ?? "");
  const [avatarUrl, setAvatarUrl] = useState(user?.avatar_url ?? "");
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileSaved, setProfileSaved] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [oldPw, setOldPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [pwSaving, setPwSaving] = useState(false);
  const [pwSaved, setPwSaved] = useState(false);
  const [pwError, setPwError] = useState<string | null>(null);

  async function handleProfileSave() {
    setProfileSaving(true); setProfileError(null);
    try {
      await updateProfile({ name: name || undefined, avatar_url: avatarUrl || undefined });
      await refetch();
      setProfileSaved(true);
      setTimeout(() => setProfileSaved(false), 2500);
    } catch { setProfileError(tc("saveFailed")); }
    finally { setProfileSaving(false); }
  }

  async function handlePasswordSave() {
    setPwError(null);
    if (newPw !== confirmPw) { setPwError(t("account.passwordMismatch")); return; }
    if (newPw.length < 6) { setPwError(t("account.passwordMinLength")); return; }
    setPwSaving(true);
    try {
      await updatePassword({ old_password: oldPw, new_password: newPw });
      setOldPw(""); setNewPw(""); setConfirmPw("");
      setPwSaved(true);
      setTimeout(() => setPwSaved(false), 2500);
    } catch (e: unknown) {
      const detail = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setPwError(detail ?? t("account.changeFailed"));
    } finally { setPwSaving(false); }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-4 rounded-xl border border-border bg-muted/20 p-4">
        {user?.avatar_url ? (
          <Image src={user.avatar_url} alt="avatar" width={48} height={48} unoptimized className="h-12 w-12 rounded-full object-cover ring-1 ring-white/10" />
        ) : (
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/20 text-lg font-bold text-primary">
            {(user?.name?.[0] ?? user?.username?.[0] ?? "U").toUpperCase()}
          </div>
        )}
        <div>
          <p className="font-medium">{user?.name ?? user?.username ?? "—"}</p>
          <p className="text-xs text-muted-foreground">{user?.email ?? t("account.localAccount")}</p>
        </div>
      </div>

      <div className="space-y-4 rounded-xl border border-border/50 p-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("account.editProfile")}</p>
        <FieldInput label={t("account.displayName")} value={name} onChange={setName} placeholder={user?.username ?? t("account.namePlaceholder")} />
        <div className="space-y-1.5">
          <p className="text-sm font-medium">{t("account.avatarUrl")}</p>
          <div className="flex items-center gap-3">
            <input
              type="url"
              value={avatarUrl}
              onChange={(e) => setAvatarUrl(e.target.value)}
              placeholder="https://..."
              className="flex h-9 flex-1 rounded-xl border border-border/50 bg-muted/50 px-3 py-2 text-sm text-foreground outline-none transition placeholder:text-muted-foreground/50 focus:border-primary/60 focus:ring-2 focus:ring-primary/20"
            />
            {avatarUrl && (
              <Image src={avatarUrl} alt="preview" width={36} height={36} unoptimized className="h-9 w-9 rounded-full object-cover ring-1 ring-white/10" onError={(e) => ((e.target as HTMLElement).style.display = "none")} />
            )}
          </div>
        </div>
        {profileError && <p className="text-xs text-destructive">{profileError}</p>}
        <SaveButton onClick={handleProfileSave} saving={profileSaving} saved={profileSaved} />
      </div>

      <div className="space-y-4 rounded-xl border border-border/50 p-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("account.changePassword")}</p>
        <FieldInput label={t("account.currentPassword")} type="password" value={oldPw} onChange={setOldPw} placeholder={t("account.currentPasswordPlaceholder")} />
        <FieldInput label={t("account.newPassword")} type="password" value={newPw} onChange={setNewPw} placeholder={t("account.newPasswordPlaceholder")} />
        <FieldInput label={t("account.confirmPassword")} type="password" value={confirmPw} onChange={setConfirmPw} placeholder={t("account.confirmPasswordPlaceholder")} />
        {pwError && <p className="text-xs text-destructive">{pwError}</p>}
        <SaveButton onClick={handlePasswordSave} saving={pwSaving} saved={pwSaved} />
      </div>
    </div>
  );
}
