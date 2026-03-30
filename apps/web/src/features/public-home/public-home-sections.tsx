import { useEffect, useRef, useState } from "react"
import { m, useInView } from "framer-motion"
import { ArrowRight, LibraryBig, Sparkles } from "lucide-react"
import Image from "next/image"
import Link from "next/link"

import type { KnowledgeGroup, SignalBar, TFunc } from "./helpers"
import type { PublicNotebook, PublicPortraitSnapshot, PublicSiteProfile } from "@/types"
import { formatDate } from "@/utils/format-date"

interface SmallAvatarProps {
  profile: PublicSiteProfile | null
  portrait: PublicPortraitSnapshot | null
}

interface HeroInsightCardProps {
  typedLead: string
  supportingParagraphs: string[]
  generatedAt?: string | null
}

interface HeroKnowledgeRowProps {
  group: KnowledgeGroup
}

interface SignalRailProps {
  signals: SignalBar[]
  archiveModeLabel: string
  portrait: PublicPortraitSnapshot | null
  t: TFunc
}

interface ResearchTrajectoryProps {
  portrait: PublicPortraitSnapshot | null
  profile: PublicSiteProfile | null
  t: TFunc
}

interface ArchiveListProps {
  title: string
  items: PublicNotebook[]
  t: TFunc
  badge?: string
  emptyLabel?: string
  featuredIds?: Set<string>
}

interface InlineTypewriterTextProps {
  text: string
  speed?: number
}


export function SmallAvatar({
  profile,
  portrait,
}: SmallAvatarProps) {
  const seed = encodeURIComponent(
    portrait?.identity.primaryRole || profile?.professionGuess || "lyranote",
  )
  const fallbackUrl = `https://api.dicebear.com/9.x/lorelei/svg?seed=${seed}&backgroundColor=e8d5b7,fde8d0,dce8f5`
  const src = profile?.avatarUrl || fallbackUrl
  const isAiGenerated = Boolean(profile?.avatarUrl)

  return (
    <div className="lp-avatar-float" style={{ position: "relative", width: 88, height: 88, flexShrink: 0 }}>
      <div
        style={{
          width: 88, height: 88, borderRadius: "50%", overflow: "hidden",
          border: "2px solid var(--gold)",
          boxShadow: "0 0 28px var(--gold-glow), 0 0 8px rgba(200,148,60,0.14)",
          background: "var(--surface2)", position: "relative",
        }}
      >
        <Image
          src={src}
          alt="portrait"
          fill
          sizes="88px"
          style={{ objectFit: "cover" }}
          unoptimized={!isAiGenerated}
        />
      </div>
      {isAiGenerated ? (
        <div
          style={{
            position: "absolute", bottom: 2, right: 2,
            width: 20, height: 20, borderRadius: "50%",
            background: "var(--gold)", display: "flex",
            alignItems: "center", justifyContent: "center",
            boxShadow: "0 0 10px var(--gold-glow)",
          }}
        >
          <Sparkles size={10} style={{ color: "#05080F" }} />
        </div>
      ) : null}
    </div>
  )
}

export function HeroInsightCard({
  typedLead,
  supportingParagraphs,
  generatedAt,
}: HeroInsightCardProps) {
  return (
    <div
      className="lp-ai-insight-card"
      style={{
        background: "#1a1d2e",
        borderRadius: 10,
        padding: "14px 16px",
        border: "1px solid rgba(200,148,60,0.18)",
        fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', 'Consolas', monospace",
      }}
    >
      {/* macOS traffic lights */}
      <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 14 }}>
        <span style={{ display: "inline-block", width: 12, height: 12, borderRadius: "50%", background: "#ff5f57" }} />
        <span style={{ display: "inline-block", width: 12, height: 12, borderRadius: "50%", background: "#ffbd2e" }} />
        <span style={{ display: "inline-block", width: 12, height: 12, borderRadius: "50%", background: "#28c941" }} />
        <span
          style={{
            marginLeft: "auto",
            fontSize: 10,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            color: "rgba(237,231,218,0.3)",
          }}
        >
          AI · GEN{generatedAt ? ` · ${formatDate(generatedAt)}` : ""}
        </span>
      </div>

      {/* terminal prompt line */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 8, marginBottom: 12 }}>
        <span style={{ color: "#57c7ff", fontSize: "0.82rem", flexShrink: 0, lineHeight: 1.8 }}>~</span>
        <span style={{ color: "#ff6ac1", fontSize: "0.82rem", flexShrink: 0, lineHeight: 1.8 }}>❯</span>
        <div style={{ color: "rgba(251,235,226,0.88)", fontSize: "0.82rem", lineHeight: 1.8, flex: 1 }}>
          {typedLead ? (
            <>
              <span className="sr-only">{typedLead}</span>
              <TerminalTypewriterText text={typedLead} speed={16} />
            </>
          ) : null}
        </div>
      </div>

      {/* supporting output lines */}
      {supportingParagraphs.map((paragraph) => (
        <div key={paragraph} style={{ display: "flex", alignItems: "flex-start", gap: 8, marginTop: 8 }}>
          <span style={{ color: "rgba(237,231,218,0.25)", fontSize: "0.82rem", flexShrink: 0, lineHeight: 1.8, userSelect: "none" }}>{"  "}</span>
          <p style={{ margin: 0, color: "rgba(237,231,218,0.55)", fontSize: "0.82rem", lineHeight: 1.8, fontFamily: "inherit" }}>
            {paragraph}
          </p>
        </div>
      ))}
    </div>
  )
}

const TONE_CONFIG = {
  mastered: { dot: "var(--gold)",              text: 1,    subText: 0.55 },
  learning: { dot: "var(--teal)",              text: 0.65, subText: 0.38 },
  emerging: { dot: "rgba(255,255,255,0.22)",   text: 0.32, subText: 0.2  },
} as const

export function HeroKnowledgeRow({ group }: HeroKnowledgeRowProps) {
  const cfg = TONE_CONFIG[group.tone as keyof typeof TONE_CONFIG] ?? TONE_CONFIG.emerging

  return (
    <m.div
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true }}
      variants={{ visible: { transition: { staggerChildren: 0.06 } } }}
    >
      <m.p
        className="lp-eyebrow"
        style={{ marginBottom: 14 }}
        variants={{ hidden: { opacity: 0 }, visible: { opacity: 1, transition: { duration: 0.25 } } }}
      >
        {group.label}
      </m.p>

      <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
        {group.items.map((item, i) => (
          <m.div
            key={item}
            style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "5px 0" }}
            variants={{
              hidden: { opacity: 0, x: -8 },
              visible: { opacity: 1, x: 0, transition: { duration: 0.35, ease: "easeOut" } },
            }}
          >
            {/* dot indicator */}
            <span style={{
              flexShrink: 0,
              width:  i === 0 ? 5 : 3,
              height: i === 0 ? 5 : 3,
              borderRadius: "50%",
              marginTop: i === 0 ? 7 : 8,
              background: i === 0 ? cfg.dot : "rgba(255,255,255,0.15)",
              boxShadow: i === 0 ? `0 0 6px ${cfg.dot}` : "none",
            }} />
            <p style={{
              margin: 0,
              fontSize: i === 0 ? 14 : 12.5,
              lineHeight: 1.55,
              color: `rgba(237,231,218,${i === 0 ? cfg.text : cfg.subText})`,
              fontWeight: i === 0 ? 400 : 300,
            }}>
              {item}
            </p>
          </m.div>
        ))}
      </div>
    </m.div>
  )
}

export function SignalRail({
  signals,
  archiveModeLabel,
  portrait,
  t,
}: SignalRailProps) {
  const recurring = portrait?.growthSignals.recurringQuestions[0] || portrait?.growthSignals.thisPeriodLearned[0]
  const railRef = useRef<HTMLDivElement>(null)
  const inView = useInView(railRef, { once: true, margin: "-60px" })

  return (
    <div className="lp-card" ref={railRef}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 24 }}>
        <Sparkles size={13} style={{ color: "var(--gold)" }} />
        <span className="lp-eyebrow">{t("publicSignalsTitle")}</span>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        {signals.map((signal, index) => (
          <div key={signal.label}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <p style={{ fontSize: 10, letterSpacing: "0.18em", textTransform: "uppercase", color: "var(--text-3)" }}>{signal.label}</p>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <AnimatedCount target={signal.score} active={inView} delay={index * 120} suffix="%" />
                <p style={{ fontSize: 11, color: "var(--text-2)" }}>{signal.value}</p>
              </div>
            </div>
            <div className="lp-signal-track">
              <m.div
                className="lp-signal-fill"
                initial={{ width: 0 }}
                animate={inView ? { width: `${signal.score}%` } : { width: 0 }}
                transition={{ duration: 1.1, ease: "easeOut", delay: index * 0.12 }}
              />
            </div>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 24 }}>
        <p style={{ fontSize: 10, letterSpacing: "0.18em", textTransform: "uppercase", color: "var(--text-3)" }}>{t("signalStatus")}</p>
        <p style={{ marginTop: 8, fontSize: 13, lineHeight: 1.7, color: "var(--text-2)" }}>{archiveModeLabel}</p>
      </div>

      {recurring ? (
        <div style={{ marginTop: 20 }}>
          <p style={{ fontSize: 10, letterSpacing: "0.18em", textTransform: "uppercase", color: "var(--text-3)" }}>{t("recurringQuestionsLabel")}</p>
          <p style={{ marginTop: 8, fontSize: 13, lineHeight: 1.7, color: "var(--text-2)" }}>{recurring}</p>
        </div>
      ) : null}
    </div>
  )
}

export function ResearchTrajectory({
  portrait,
  profile,
  t,
}: ResearchTrajectoryProps) {
  const trajectory = portrait?.researchTrajectory

  if (!trajectory && (!profile?.timelineItems || profile.timelineItems.length === 0)) return null

  if (!trajectory) {
    return (
      <div className="lp-timeline">
        <div className="lp-timeline-line" />
        <div className="lp-timeline-items">
          {profile!.timelineItems.map((item, index) => (
            <div key={`${item.title}-${index}`} style={{ position: "relative" }}>
              <div className="lp-timeline-dot" />
              <p style={{ fontSize: 10, letterSpacing: "0.24em", textTransform: "uppercase", color: "var(--text-3)" }}>{item.timeLabel}</p>
              <h3 className="lp-display" style={{ marginTop: 8, fontSize: "1.75rem", letterSpacing: "-0.03em", lineHeight: 1.1, color: "var(--text)" }}>
                {item.title}
              </h3>
              <p style={{ marginTop: 10, fontSize: 14, lineHeight: 1.8, color: "var(--text-2)" }}>{item.summary}</p>
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="lp-rt">
      <p className="lp-eyebrow" style={{ marginBottom: 24 }}>{t("researchTrajectoryTitle")}</p>
      {trajectory.currentFocus ? (
        <div className="lp-rt-focus">
          <p className="lp-eyebrow" style={{ marginBottom: 10 }}>{t("portraitCurrentFocus")}</p>
          <p className="lp-rt-focus-text">{trajectory.currentFocus}</p>
        </div>
      ) : null}

      {trajectory.nextLikelyTopics.length > 0 ? (
        <div className="lp-rt-block">
          <p className="lp-eyebrow" style={{ marginBottom: 14 }}>Next explorations</p>
          <div className="lp-rt-next">
            {trajectory.nextLikelyTopics.slice(0, 5).map((topic, index) => (
              <div key={index} className="lp-rt-next-item">
                <ArrowRight size={11} style={{ color: "var(--gold)", flexShrink: 0, marginTop: 3 }} />
                <span>{topic}</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {trajectory.recentlyCompleted.length > 0 ? (
        <div className="lp-rt-block">
          <p className="lp-eyebrow" style={{ marginBottom: 12 }}>Recently completed</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {trajectory.recentlyCompleted.slice(0, 4).map((item, index) => (
              <p key={index} style={{ fontSize: 13, lineHeight: 1.7, color: "var(--text-2)", margin: 0 }}>
                <span style={{ color: "var(--gold)", marginRight: 8, fontSize: 11 }}>✓</span>{item}
              </p>
            ))}
          </div>
        </div>
      ) : null}

      {trajectory.longTermDirection ? (
        <div className="lp-rt-block lp-rt-direction">
          <p className="lp-eyebrow" style={{ marginBottom: 10 }}>{t("portraitLongTermDirection")}</p>
          <p className="lp-rt-direction-text">{trajectory.longTermDirection}</p>
        </div>
      ) : null}
    </div>
  )
}

export function ArchiveList({
  title,
  items,
  t,
  badge,
  emptyLabel,
  featuredIds,
}: ArchiveListProps) {
  return (
    <section>
      <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 8 }}>
        <h3 className="lp-display" style={{ fontSize: "1.65rem", letterSpacing: "-0.035em", color: "var(--text)" }}>{title}</h3>
        {badge ? <span className="lp-tag">{badge}</span> : null}
      </div>

      {items.length === 0 ? (
        <p style={{ marginTop: 20, fontSize: 14, color: "var(--text-2)" }}>
          {emptyLabel ?? t("empty")}
        </p>
      ) : (
        <m.div
          style={{ display: "flex", flexDirection: "column", gap: 4 }}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-60px" }}
          variants={{ visible: { transition: { staggerChildren: 0.06 } } }}
        >
          {items.map((notebook, index) => (
            <m.div
              key={`${notebook.id}-${index}`}
              variants={{
                hidden: { opacity: 0, y: 14 },
                visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: "easeOut" } },
              }}
              whileHover={{ x: 6 }}
              transition={{ type: "spring", stiffness: 480, damping: 32 }}
            >
              <Link href={`/notebooks/${notebook.id}`} className="lp-nb-row">
                <div style={{ fontSize: 10, letterSpacing: "0.20em", textTransform: "uppercase", color: "var(--text-3)", paddingTop: 4 }}>
                  {notebook.publishedAt ? formatDate(notebook.publishedAt) : t("archiveLabel")}
                </div>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                    <h4 className="lp-nb-title">{notebook.title}</h4>
                    {featuredIds?.has(notebook.id) ? (
                      <span className="lp-featured-badge">{t("featured")}</span>
                    ) : null}
                  </div>
                  <p style={{ marginTop: 9, fontSize: 14, lineHeight: 1.75, color: "var(--text-2)" }}>
                    {notebook.summary || notebook.description || t("emptyNote")}
                  </p>
                </div>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8, fontSize: 12, color: "var(--text-3)", paddingTop: 4 }}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                    <LibraryBig size={12} />
                    {t("sourceCount", { count: notebook.sourceCount })}
                  </span>
                  <span>
                    {notebook.wordCount >= 1000
                      ? t("wordCountK", { count: (notebook.wordCount / 1000).toFixed(1) })
                      : t("wordCount", { count: notebook.wordCount })}
                  </span>
                </div>
              </Link>
            </m.div>
          ))}
        </m.div>
      )}
    </section>
  )
}

function AnimatedCount({ target, active, delay = 0, suffix = "" }: { target: number; active: boolean; delay?: number; suffix?: string }) {
  const [count, setCount] = useState(0)

  useEffect(() => {
    if (!active) return
    const timeout = setTimeout(() => {
      let current = 0
      const duration = 900
      const step = 16
      const increment = target / (duration / step)
      const timer = setInterval(() => {
        current += increment
        if (current >= target) {
          setCount(target)
          clearInterval(timer)
        } else {
          setCount(Math.round(current))
        }
      }, step)
      return () => clearInterval(timer)
    }, delay)
    return () => clearTimeout(timeout)
  }, [target, active, delay])

  return (
    <span style={{ fontSize: 10, letterSpacing: "0.12em", color: "var(--gold)", fontVariantNumeric: "tabular-nums", minWidth: "3ch", textAlign: "right" }}>
      {count}{suffix}
    </span>
  )
}

function TerminalTypewriterText({ text, speed = 16 }: InlineTypewriterTextProps) {
  const [displayed, setDisplayed] = useState("")
  const [done, setDone] = useState(false)

  useEffect(() => {
    setDisplayed("")
    setDone(false)
    if (!text) return

    let index = 0
    const interval = window.setInterval(() => {
      index += 1
      setDisplayed(text.slice(0, index))
      if (index >= text.length) {
        window.clearInterval(interval)
        setDone(true)
      }
    }, speed)

    return () => window.clearInterval(interval)
  }, [text, speed])

  return (
    <span>
      {displayed}
      {!done ? (
        <span
          style={{
            display: "inline-block",
            width: 2,
            height: "0.85em",
            background: "rgba(180,173,173,0.75)",
            marginLeft: 2,
            verticalAlign: "text-bottom",
            animation: "lp-term-blink 0.8s ease infinite",
          }}
        />
      ) : null}
    </span>
  )
}

function InlineTypewriterText({ text, speed = 22 }: InlineTypewriterTextProps) {
  const [displayed, setDisplayed] = useState("")
  const [done, setDone] = useState(false)

  useEffect(() => {
    setDisplayed("")
    setDone(false)
    if (!text) return

    let index = 0
    const interval = window.setInterval(() => {
      index += 1
      setDisplayed(text.slice(0, index))
      if (index >= text.length) {
        window.clearInterval(interval)
        setDone(true)
      }
    }, speed)

    return () => window.clearInterval(interval)
  }, [text, speed])

  return (
    <span className={!done ? "lp-typing-active" : ""}>
      {displayed}
      {!done ? <span className="lp-cursor" /> : null}
    </span>
  )
}