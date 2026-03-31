"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";

import { notifyError, notifySuccess } from "@/lib/notify";
import {
  approvePublicHomeDraft,
  backfillPublicHomePortrait,
  discardPublicHomeDraft,
  generatePublicHomeDraft,
  getPublicHomeAdminState,
} from "@/services/public-home-service";
import { formatDate } from "@/utils/format-date";

export function PublicHomeSection() {
  const t = useTranslations("settings.publicHome");
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["public-home-admin"],
    queryFn: getPublicHomeAdminState,
  });

  const generateMutation = useMutation({
    mutationFn: generatePublicHomeDraft,
    onSuccess: (next) => {
      queryClient.setQueryData(["public-home-admin"], next);
      notifySuccess(t("generateSuccess"));
    },
    onError: () => notifyError(t("generateFailed")),
  });

  const approveMutation = useMutation({
    mutationFn: approvePublicHomeDraft,
    onSuccess: (next) => {
      queryClient.setQueryData(["public-home-admin"], next);
      notifySuccess(t("approveSuccess"));
    },
    onError: () => notifyError(t("approveFailed")),
  });

  const backfillMutation = useMutation({
    mutationFn: backfillPublicHomePortrait,
    onSuccess: (next) => {
      queryClient.setQueryData(["public-home-admin"], next);
      notifySuccess(t("backfillSuccess"));
    },
    onError: () => notifyError(t("backfillFailed")),
  });

  const discardMutation = useMutation({
    mutationFn: discardPublicHomeDraft,
    onSuccess: (next) => {
      queryClient.setQueryData(["public-home-admin"], next);
      notifySuccess(t("discardSuccess"));
    },
    onError: () => notifyError(t("discardFailed")),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
        <Loader2 size={18} className="mr-2 animate-spin" />
        {t("loading")}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-border/50 bg-muted/20 p-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-medium">{t("title")}</p>
            <p className="mt-1 text-xs leading-6 text-muted-foreground">{t("desc")}</p>
          </div>
          <div className="rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-[11px] font-medium text-primary">
            {t("reviewRequired")}
          </div>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-4">
          <MiniStat label={t("publicNotebookCount")} value={String(data?.stats.notebookCount ?? 0)} />
          <MiniStat label={t("publicTopicCount")} value={String(data?.stats.topicCount ?? 0)} />
          <MiniStat label={t("featuredCount")} value={String(data?.featuredNotebooks.length ?? 0)} />
          <MiniStat label={t("approvedPortrait")} value={data?.approvedProfile?.portraitSnapshot ? t("ready") : t("missing")} />
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <ActionButton label={t("generate")} busy={generateMutation.isPending} onClick={() => generateMutation.mutate()} />
          <ActionButton
            label={t("approve")}
            busy={approveMutation.isPending}
            disabled={!data?.draftProfile}
            onClick={() => approveMutation.mutate()}
          />
          <ActionButton
            label={t("backfillPortrait")}
            busy={backfillMutation.isPending}
            disabled={!data?.approvedProfile}
            onClick={() => backfillMutation.mutate()}
            variant="secondary"
          />
          <ActionButton
            label={t("discard")}
            busy={discardMutation.isPending}
            disabled={!data?.draftProfile}
            onClick={() => discardMutation.mutate()}
            variant="secondary"
          />
        </div>
      </div>

      <ProfilePreview
        title={t("draft")}
        subtitle={data?.draftGeneratedAt ? t("generatedAt", { date: formatDate(data.draftGeneratedAt) }) : t("notGenerated")}
        profile={data?.draftProfile ?? null}
        emptyText={t("draftEmpty")}
      />

      <ProfilePreview
        title={t("approved")}
        subtitle={data?.approvedAt ? t("approvedAt", { date: formatDate(data.approvedAt) }) : t("notApproved")}
        profile={data?.approvedProfile ?? null}
        emptyText={t("approvedEmpty")}
      />
    </div>
  );
}

function ProfilePreview({
  title,
  subtitle,
  profile,
  emptyText,
}: {
  title: string;
  subtitle: string;
  profile: {
    heroSummary: string;
    professionGuess?: string;
    interestTags: string[];
    currentResearch: string[];
    portraitSnapshot?: {
      identitySummary?: string;
      identity?: {
        primaryRole?: string;
      };
    } | null;
  } | null;
  emptyText: string;
}) {
  return (
    <div className="rounded-xl border border-border/50 p-4">
      <div className="mb-3 flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-medium">{title}</p>
          <p className="text-xs text-muted-foreground">{subtitle}</p>
        </div>
        <Sparkles size={14} className="text-primary/70" />
      </div>

      {!profile ? (
        <p className="text-sm text-muted-foreground">{emptyText}</p>
      ) : (
        <div className="space-y-3">
          <p className="text-sm leading-6 text-foreground/85">{profile.heroSummary}</p>
          {profile.portraitSnapshot?.identitySummary ? (
            <p className="text-xs leading-6 text-muted-foreground">{profile.portraitSnapshot.identitySummary}</p>
          ) : null}
          {profile.portraitSnapshot?.identity?.primaryRole ? (
            <p className="text-xs text-primary/80">{profile.portraitSnapshot.identity.primaryRole}</p>
          ) : null}
          {profile.professionGuess ? <p className="text-xs text-muted-foreground">{profile.professionGuess}</p> : null}
          {profile.interestTags.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {profile.interestTags.slice(0, 6).map((tag) => (
                <span
                  key={tag}
                  className="rounded-full border border-border/50 bg-muted/30 px-2.5 py-1 text-[11px] text-foreground/75"
                >
                  {tag}
                </span>
              ))}
            </div>
          ) : null}
          {profile.currentResearch.length > 0 ? (
            <div className="space-y-1">
              {profile.currentResearch.slice(0, 4).map((item) => (
                <p key={item} className="text-xs text-muted-foreground">
                  • {item}
                </p>
              ))}
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

function ActionButton({
  label,
  busy,
  disabled,
  onClick,
  variant = "primary",
}: {
  label: string;
  busy: boolean;
  disabled?: boolean;
  onClick: () => void;
  variant?: "primary" | "secondary";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || busy}
      className={
        variant === "primary"
          ? "inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          : "inline-flex items-center gap-2 rounded-xl border border-border/60 bg-card px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
      }
    >
      {busy ? <Loader2 size={14} className="animate-spin" /> : null}
      {label}
    </button>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border/50 bg-card/70 px-3 py-3">
      <p className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground/70">{label}</p>
      <p className="mt-2 text-xl font-semibold text-foreground">{value}</p>
    </div>
  );
}
