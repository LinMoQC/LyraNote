"use client"

import { useQuery } from "@tanstack/react-query"
import { m, useScroll, useTransform } from "framer-motion"
import { ArrowRight, ArrowUpRight, Loader2 } from "lucide-react"
import Image from "next/image"
import Link from "next/link"
import { useTranslations } from "next-intl"

import {
  buildArchiveModeLabel,
  buildFocusTags,
  buildHeroParagraphs,
  buildKnowledgeGroups,
  buildSignals,
  dedupeNotebooks,
  fadeUp,
  stagger,
  truncateTag,
} from "./helpers"
import {
  ArchiveList,
  HeroInsightCard,
  HeroKnowledgeRow,
  ResearchTrajectory,
  SignalRail,
  SmallAvatar,
} from "./public-home-sections"
import { publicHomeStyles } from "./public-home-styles"
import { getPublicSite } from "@/services/public-home-service"

export function PublicHomePage() {
  const t = useTranslations("marketing")
  const { data, isLoading } = useQuery({
    queryKey: ["public-site"],
    queryFn: getPublicSite,
  })

  const profile = data?.profile ?? null
  const portrait = profile?.portraitSnapshot ?? null
  const stats = data?.stats ?? { notebookCount: 0, wordCount: 0, sourceCount: 0, topicCount: 0 }
  const notebooks = dedupeNotebooks(data?.notebooks ?? [])
  const featuredNotebooks = dedupeNotebooks(data?.featuredNotebooks ?? [])
  const heroParagraphs = buildHeroParagraphs(profile, portrait, t)
  const typedLead = heroParagraphs[0] ?? ""
  const supportingParagraphs = heroParagraphs.slice(1, 2)
  const heroTags = buildFocusTags(profile, portrait)
    .slice(0, 3)
    .map(truncateTag)
    .filter((tag) => tag.replace(/[.\s…]/g, "").length > 2)
  const knowledgeGroups = buildKnowledgeGroups(profile, portrait, t)
  const signals = buildSignals(profile, portrait, stats, notebooks, t)
  const archiveModeLabel = buildArchiveModeLabel(profile, portrait, stats, t)
  const featuredIds = new Set(featuredNotebooks.map((notebook) => notebook.id))
  const unifiedNotebooks = [
    ...featuredNotebooks,
    ...notebooks.filter((notebook) => !featuredIds.has(notebook.id)),
  ]
  const displayName = portrait?.identity.primaryRole || profile?.professionGuess || null
  const researchHref = profile ? "#research-trajectory" : "#public-notebooks"

  const { scrollY } = useScroll()
  const heroOpacity = useTransform(scrollY, [0, 420], [1, 0])
  const heroY = useTransform(scrollY, [0, 420], ["0px", "-38px"])

  // Nav scroll reveal
  const navBg = useTransform(scrollY, [0, 80], ["rgba(7,11,20,0)", "rgba(7,11,20,0.88)"])
  const navBlur = useTransform(scrollY, [0, 80], [0, 32])
  const navBorderOpacity = useTransform(scrollY, [0, 80], [0, 0.12])

  // Orb parallax
  const orb1Y = useTransform(scrollY, [0, 1200], [0, -180])
  const orb2Y = useTransform(scrollY, [0, 1200], [0, 110])
  const orb3Y = useTransform(scrollY, [0, 1200], [0, -90])

  return (
    <>
      <style>{publicHomeStyles}</style>

      <main className="lp lp-grain" style={{ minHeight: "100vh" }}>
        <m.div className="lp-orb lp-orb-1" style={{ y: orb1Y }} />
        <m.div className="lp-orb lp-orb-2" style={{ y: orb2Y }} />
        <m.div className="lp-orb lp-orb-3" style={{ y: orb3Y }} />

        <div style={{ position: "relative", zIndex: 1 }}>
          <m.nav
            className="lp-nav"
            style={{
              backgroundColor: navBg,
              backdropFilter: useTransform(navBlur, (v) => `blur(${v}px)`),
              WebkitBackdropFilter: useTransform(navBlur, (v) => `blur(${v}px)`),
              borderBottomColor: useTransform(navBorderOpacity, (v) => `rgba(200,148,60,${v})`),
            }}
          >
            <div className="lp-nav-inner">
              {/* Brand */}
              <Link href="/" className="lp-nav-brand" style={{ textDecoration: "none" }}>
                <Image src="/lyra.png" alt="LyraNote" width={22} height={22} style={{ borderRadius: 5, display: "block" }} />
                <span className="lp-display lp-nav-brand-name">LyraNote</span>
              </Link>

            </div>
          </m.nav>

          {isLoading ? (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "60vh" }}>
              <Loader2 size={24} className="lp-spin" style={{ color: "var(--gold)" }} />
            </div>
          ) : (
            <>
              <section id="about-archive" className="lp-hero">
                <m.div className="lp-page-inner" style={{ opacity: heroOpacity, y: heroY }}>
                  <m.div
                    className={`lp-hero-layout${knowledgeGroups.length > 0 ? " is-split" : ""}`}
                    initial="hidden"
                    animate="visible"
                    variants={stagger}
                  >
                    <div className="lp-hero-left">
                      <m.p variants={fadeUp} className="lp-eyebrow" style={{ color: "var(--text-3)" }}>
                        {profile ? t("selfPortraitTitle") : t("archiveTitle")}
                      </m.p>

                      <m.div variants={fadeUp} className="lp-hero-identity">
                        <SmallAvatar profile={profile} portrait={portrait} />
                        <div className="lp-hero-identity-text">
                          <p className="lp-hero-greeting">
                            {profile ? "Hi there 👋" : "Welcome"}
                          </p>
                          <h1 className="lp-display lp-hero-h1">
                            {displayName ? (
                              displayName
                            ) : (
                              <>
                                <span style={{ fontWeight: 300 }}>LyraNote </span>
                                <span style={{ fontWeight: 500 }}>Archive</span>
                              </>
                            )}
                          </h1>
                        </div>
                      </m.div>

                      {(typedLead || supportingParagraphs.length > 0) ? (
                        <m.div variants={fadeUp}>
                          <HeroInsightCard
                            typedLead={typedLead}
                            supportingParagraphs={supportingParagraphs}
                            generatedAt={profile?.generatedAt}
                          />
                        </m.div>
                      ) : null}

                      {heroTags.length > 0 ? (
                        <m.div
                          className="lp-hero-tags"
                          variants={{
                            hidden: {},
                            visible: { transition: { staggerChildren: 0.1 } },
                          }}
                        >
                          {heroTags.map((tag) => (
                            <m.span
                              key={tag}
                              className="lp-tag"
                              variants={{
                                hidden: { opacity: 0, scale: 0.82, y: 8 },
                                visible: { opacity: 1, scale: 1, y: 0, transition: { type: "spring", stiffness: 380, damping: 24 } },
                              }}
                            >
                              {tag}
                            </m.span>
                          ))}
                        </m.div>
                      ) : null}

                      <m.div variants={fadeUp} className="lp-hero-actions">
                        <Link href="#public-notebooks" className="lp-btn-cta">
                          {t("viewArchive")}
                          <ArrowUpRight size={15} />
                        </Link>
                      </m.div>
                    </div>

                    {knowledgeGroups.length > 0 ? (
                      <div className="lp-hero-right">
                        <m.div variants={fadeUp} className="lp-hero-knowledge">
                          {knowledgeGroups.map((group) => (
                            <HeroKnowledgeRow key={group.label} group={group} />
                          ))}
                        </m.div>
                      </div>
                    ) : null}
                  </m.div>
                </m.div>
              </section>

              <div className="lp-page-inner">
                <div className="lp-sections">
                  {profile ? (
                    <m.section
                      id="research-trajectory"
                      className="lp-section"
                      initial="hidden"
                      whileInView="visible"
                      viewport={{ once: true, margin: "-80px" }}
                      variants={stagger}
                    >
                      <m.div variants={fadeUp} className="lp-split">
                        <div>
                          <ResearchTrajectory portrait={portrait} profile={profile} t={t} />
                        </div>
                        <div>
                          <SignalRail
                            signals={signals}
                            archiveModeLabel={archiveModeLabel}
                            portrait={portrait}
                            t={t}
                          />
                        </div>
                      </m.div>
                    </m.section>
                  ) : null}

                  <m.section
                    id="public-notebooks"
                    className="lp-section"
                    initial="hidden"
                    whileInView="visible"
                    viewport={{ once: true, margin: "-80px" }}
                    variants={stagger}
                  >
                    <m.div variants={fadeUp}>
                      <ArchiveList
                        title={t("allNotebooks")}
                        items={unifiedNotebooks}
                        t={t}
                        emptyLabel={t("empty")}
                        featuredIds={featuredIds}
                      />
                    </m.div>
                  </m.section>
                </div>

                <footer className="lp-footer">
                  {/* Gradient rule */}
                  <div className="lp-footer-rule" />

                  {/* Brand mark */}
                  <div className="lp-footer-brand">
                    <div className="lp-nav-logo-wrap" style={{ width: 28, height: 28 }}>
                      <Image src="/lyra.png" alt="LyraNote" width={18} height={18} style={{ borderRadius: 4, opacity: 0.65 }} />
                    </div>
                    <span className="lp-display" style={{ fontSize: "1.15rem", letterSpacing: "-0.025em", color: "var(--text-3)" }}>
                      LyraNote
                    </span>
                  </div>

                  {/* Links row */}
                  <div className="lp-footer-links">
                    <span>{t("footerPrivacy")}</span>
                    <span className="lp-footer-sep" />
                    <span>{t("footerColophon")}</span>
                    <span className="lp-footer-sep" />
                    <span>{t("footerRss")}</span>
                  </div>

                  {/* Copyright */}
                  <p className="lp-footer-copy">{t("footerArchive")}</p>
                </footer>
              </div>
            </>
          )}
        </div>
      </main>
    </>
  )
}
