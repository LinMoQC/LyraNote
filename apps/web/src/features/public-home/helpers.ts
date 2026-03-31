import type { PublicNotebook, PublicPortraitSnapshot, PublicSiteProfile } from "@/types"

// ── Shared types ─────────────────────────────────────────────────────────────

export type KnowledgeGroup = {
  label: string
  items: string[]
  tone: "mastered" | "learning" | "emerging"
}

export type SignalBar = {
  label: string
  value: string
  score: number
}

export type TFunc = (key: string, values?: Record<string, string | number | Date>) => string

// ── Animation variants ───────────────────────────────────────────────────────

export const fadeUp = {
  hidden: { opacity: 0, y: 28, filter: "blur(6px)" },
  visible: {
    opacity: 1,
    y: 0,
    filter: "blur(0px)",
    transition: { duration: 0.7, ease: [0.22, 1, 0.36, 1] as const },
  },
}

export const stagger = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.09 } },
}

// ── Tag helper ───────────────────────────────────────────────────────────────

export function truncateTag(label: string, max = 44) {
  const s = label.trim().replace(/\s+/g, " ")
  if (s.length <= max) return s
  return `${s.slice(0, Math.max(0, max - 1))}…`
}

// ── Data builders ────────────────────────────────────────────────────────────

export function buildHeroParagraphs(
  profile: PublicSiteProfile | null,
  portrait: PublicPortraitSnapshot | null,
  t: TFunc,
) {
  const paragraphs = [portrait?.identitySummary, profile?.heroSummary].filter(Boolean) as string[]
  if (paragraphs.length === 0) return splitSummary(t("subtitle"))
  return uniqueStrings(paragraphs).flatMap(splitSummary).slice(0, 3)
}

export function buildFocusTags(
  profile: PublicSiteProfile | null,
  portrait: PublicPortraitSnapshot | null,
) {
  if (!profile) return []
  return uniqueStrings(
    [
      portrait?.identity.primaryRole,
      portrait?.identity.expertiseLevel,
      portrait?.identity.personalityType,
      profile.professionGuess,
      portrait?.researchTrajectory.currentFocus,
      ...profile.interestTags,
    ].filter(Boolean) as string[],
  ).slice(0, 5)
}

export function buildKnowledgeGroups(
  profile: PublicSiteProfile | null,
  portrait: PublicPortraitSnapshot | null,
  t: TFunc,
): KnowledgeGroup[] {
  if (!profile) return []

  if (portrait) {
    return [
      { label: t("knowledgeMastered"), items: uniqueStrings(portrait.knowledgeMap.expertDomains).slice(0, 6), tone: "mastered" as const },
      { label: t("knowledgeLearning"), items: uniqueStrings(portrait.knowledgeMap.learningDomains).slice(0, 6), tone: "learning" as const },
      { label: t("knowledgeEmerging"), items: uniqueStrings(portrait.knowledgeMap.emergingInterest).slice(0, 6), tone: "emerging" as const },
    ].filter((g) => g.items.length > 0)
  }

  const mastered = uniqueStrings(profile.topicClusters).slice(0, 6)
  const learning = uniqueStrings(profile.currentResearch).slice(0, 6)
  const emerging = uniqueStrings(
    profile.interestTags.filter((tag) => !mastered.includes(tag) && !learning.includes(tag)),
  ).slice(0, 6)

  return [
    { label: t("knowledgeMastered"), items: mastered, tone: "mastered" as const },
    { label: t("knowledgeLearning"), items: learning, tone: "learning" as const },
    { label: t("knowledgeEmerging"), items: emerging, tone: "emerging" as const },
  ].filter((g) => g.items.length > 0)
}

export function buildSignals(
  profile: PublicSiteProfile | null,
  portrait: PublicPortraitSnapshot | null,
  stats: { notebookCount: number; wordCount: number; sourceCount: number; topicCount: number },
  notebooks: PublicNotebook[],
  t: TFunc,
): SignalBar[] {
  const interaction = portrait?.interactionStyle
  if (interaction) {
    const entries = [
      { label: t("signalDepth"), value: interaction.preferredDepth },
      { label: t("signalFormat"), value: interaction.answerFormat },
      { label: t("signalLanguage"), value: interaction.preferredLanguage },
      { label: t("signalEngagement"), value: interaction.engagementStyle },
    ].filter((e) => e.value)
    if (entries.length > 0) {
      return entries.map((e) => ({ label: e.label, value: e.value, score: scoreFromRange(e.value.length, 4, 22) }))
    }
  }

  const averageWords = stats.notebookCount > 0 ? stats.wordCount / stats.notebookCount : 0
  const breadthScore = scoreFromRange(stats.topicCount || profile?.topicClusters.length || 0, 1, 8)
  const depthScore = scoreFromRange(averageWords, 120, 2400)
  const continuityScore = scoreFromRange(profile?.timelineItems.length || notebooks.length, 1, 8)

  return [
    { label: t("signalBreadth"), value: labelForScore(breadthScore, t), score: breadthScore },
    { label: t("signalDepth"), value: labelForScore(depthScore, t), score: depthScore },
    { label: t("signalContinuity"), value: labelForScore(continuityScore, t), score: continuityScore },
  ]
}

export function buildArchiveModeLabel(
  profile: PublicSiteProfile | null,
  portrait: PublicPortraitSnapshot | null,
  stats: { notebookCount: number; wordCount: number; sourceCount: number; topicCount: number },
  t: TFunc,
) {
  const focus =
    portrait?.researchTrajectory.currentFocus ||
    profile?.currentResearch[0] ||
    profile?.interestTags[0] ||
    profile?.topicClusters[0]
  if (focus) return t("signalStatusFocus", { focus })
  if (stats.notebookCount > 0) return t("signalStatusArchive", { count: stats.notebookCount })
  return t("signalStatusEarly")
}

export function dedupeNotebooks(items: PublicNotebook[]) {
  const seen = new Set<string>()
  return items.filter((item) => {
    if (seen.has(item.id)) return false
    seen.add(item.id)
    return true
  })
}

// ── Internal helpers ─────────────────────────────────────────────────────────

function splitSummary(text: string) {
  const normalized = text.split(/\n+/).map((p) => p.trim()).filter(Boolean)
  if (normalized.length > 1) return normalized
  const sentences = text.split(/(?<=[。！？.!?])/).map((p) => p.trim()).filter(Boolean)
  if (sentences.length <= 1) return sentences.length ? sentences : [text]
  const mid = Math.ceil(sentences.length / 2)
  return [sentences.slice(0, mid).join(""), sentences.slice(mid).join("")].filter(Boolean)
}

function uniqueStrings(items: string[]) {
  return Array.from(new Set(items.filter(Boolean)))
}

function scoreFromRange(value: number, min: number, max: number) {
  if (value <= min) return 28
  if (value >= max) return 94
  return Math.round(((value - min) / (max - min)) * 66 + 28)
}

function labelForScore(score: number, t: TFunc) {
  if (score >= 76) return t("signalHigh")
  if (score >= 52) return t("signalMedium")
  return t("signalLow")
}
