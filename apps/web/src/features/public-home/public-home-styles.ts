export const publicHomeStyles = `
  @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,500;0,600;1,300;1,400;1,500&family=DM+Sans:wght@300;400;500&display=swap');

  .lp {
    --bg:         #070B14;
    --surface:    #0D1525;
    --surface2:   #111D30;
    --border:     rgba(255,255,255,0.07);
    --border-mid: rgba(255,255,255,0.12);
    --text:       #EDE7DA;
    --text-2:     rgba(237,231,218,0.55);
    --text-3:     rgba(237,231,218,0.28);
    --gold:       #C8943C;
    --gold-l:     #E0AB4E;
    --gold-dim:   rgba(200,148,60,0.12);
    --gold-glow:  rgba(200,148,60,0.20);
    --teal:       #3DA99A;
    --display:    'Cormorant Garamond', ui-serif, Georgia, serif;
    --ui:         'DM Sans', ui-sans-serif, system-ui, sans-serif;
    --section-gap: 128px;
    --section-gap-tight: 40px;
    font-family: var(--ui);
    color: var(--text);
    background: var(--bg);
  }

  /* ── Noise grain overlay ───────────────────────────────── */
  .lp-grain::after {
    content: '';
    position: fixed; inset: 0; z-index: 0;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='300' height='300'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.72' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='1'/%3E%3C/svg%3E");
    opacity: 0.022;
    pointer-events: none;
  }

  /* ── Floating orbs ─────────────────────────────────────── */
  .lp-orb {
    position: fixed; border-radius: 50%;
    pointer-events: none; z-index: 0;
  }
  .lp-orb-1 {
    top: -80px; right: -60px;
    width: 600px; height: 600px;
    background: radial-gradient(ellipse, rgba(255,228,180,0.055) 0%, transparent 68%);
    animation: lp-orb-drift-1 14s ease-in-out infinite alternate;
  }
  .lp-orb-2 {
    bottom: 8%; left: -80px;
    width: 440px; height: 440px;
    background: radial-gradient(ellipse, rgba(61,169,154,0.045) 0%, transparent 68%);
    animation: lp-orb-drift-2 9s ease-in-out infinite alternate;
  }
  .lp-orb-3 {
    top: 42%; right: 12%;
    width: 300px; height: 300px;
    background: radial-gradient(ellipse, rgba(200,148,60,0.028) 0%, transparent 68%);
    animation: lp-orb-drift-1 11s ease-in-out 2s infinite alternate-reverse;
  }
  @keyframes lp-orb-drift-1 {
    from { transform: translate(0, 0); }
    to   { transform: translate(28px, 42px); }
  }
  @keyframes lp-orb-drift-2 {
    from { transform: translate(0, 0); }
    to   { transform: translate(-20px, -30px); }
  }

  /* ── Typography ────────────────────────────────────────── */
  .lp-display { font-family: var(--display); }
  .lp-eyebrow {
    font-family: var(--ui);
    font-size: 10px;
    letter-spacing: 0.3em;
    text-transform: uppercase;
    color: var(--gold);
  }

  /* ── Nav ───────────────────────────────────────────────── */
  .lp-nav {
    position: sticky; top: 0; z-index: 30;
    height: 60px; display: flex; align-items: center;
    border-bottom: 1px solid transparent;
    /* background / blur / border-color driven by framer-motion */
  }
  .lp-nav-inner {
    max-width: 1100px; margin: 0 auto; padding: 0 48px; width: 100%;
    display: flex; align-items: center; justify-content: space-between;
  }

  /* Brand */
  .lp-nav-brand {
    display: flex; align-items: center; gap: 9px;
  }
  .lp-nav-brand-name {
    font-size: 1.3rem; letter-spacing: -0.03em; color: var(--text);
    transition: color 0.2s;
  }
  .lp-nav-brand:hover .lp-nav-brand-name { color: var(--gold-l); }

  /* Center links — opacity driven by framer-motion */
  .lp-nav-links {
    display: flex; align-items: center; gap: 20px;
  }
  .lp-nav-dot {
    width: 3px; height: 3px; border-radius: 50%;
    background: rgba(200,148,60,0.35); flex-shrink: 0;
  }
  .lp-nav-link {
    font-size: 12.5px; color: var(--text);
    transition: color 0.2s; text-decoration: none;
    letter-spacing: 0.015em;
  }
  .lp-nav-link:hover { color: var(--gold-l); }

  /* CTA */
  .lp-nav-cta {
    padding: 7px 16px; font-size: 12.5px; border-radius: 6px;
    letter-spacing: 0.01em;
  }

  /* ── Buttons ───────────────────────────────────────────── */
  .lp-btn-ghost {
    display: inline-flex; align-items: center; gap: 7px;
    padding: 8px 18px; border-radius: 7px;
    border: 1px solid var(--border-mid);
    color: var(--text-2); font-size: 13px; text-decoration: none;
    transition: border-color 0.2s, color 0.2s;
  }
  .lp-btn-ghost:hover { border-color: var(--gold-dim); color: var(--text); }

  .lp-btn-gold {
    display: inline-flex; align-items: center; gap: 8px;
    padding: 9px 20px; border-radius: 7px;
    background: var(--gold); color: #05080F;
    font-size: 13px; font-weight: 500; text-decoration: none;
    transition: background 0.2s, transform 0.15s;
  }
  .lp-btn-gold:hover { background: var(--gold-l); transform: translateY(-1px); }

  .lp-btn-cta {
    display: inline-flex; align-items: center; gap: 9px;
    padding: 11px 24px; border-radius: 8px;
    background: var(--gold); color: #05080F;
    font-size: 13px; font-weight: 500; text-decoration: none;
    transition: background 0.2s, transform 0.15s;
  }
  .lp-btn-cta:hover { background: var(--gold-l); transform: translateY(-2px); }

  /* ── Page container ────────────────────────────────────── */
  .lp-page-inner {
    max-width: 1100px; margin: 0 auto; padding: 0 48px; width: 100%;
  }

  /* ── Shared two-col rhythm ─────────────────────────────── */
  .lp-split {
    display: grid;
    grid-template-columns: 1.12fr 0.88fr;
    gap: 56px;
    align-items: start;
  }
  .lp-hero-layout {
    display: grid;
    grid-template-columns: minmax(0, 760px);
  }
  .lp-hero-layout.is-split {
    grid-template-columns: minmax(0, 1.04fr) minmax(320px, 0.96fr);
    gap: 68px;
    align-items: stretch;
  }

  /* ── Hero ──────────────────────────────────────────────── */
  .lp-hero {
    min-height: calc(100svh - 64px);
    display: flex; align-items: center;
    padding: 88px 0 var(--section-gap);
  }

  .lp-hero-left {
    display: flex; flex-direction: column;
    justify-content: center;
    min-height: 100%;
  }
  .lp-hero-layout:not(.is-split) .lp-hero-left { max-width: 760px; }

  .lp-hero-right {
    min-height: 100%;
    display: flex;
    align-items: stretch;
    background: rgba(255,255,255,0.026);
    border-radius: 14px;
    border: 1px solid rgba(255,255,255,0.055);
    padding: 28px 28px;
  }
  .lp-hero-knowledge {
    width: 100%;
    display: flex;
    flex-direction: column;
    gap: 22px;
  }

  /* Avatar + name row */
  .lp-hero-identity {
    display: flex; align-items: flex-start; gap: 20px;
    margin-top: 24px;
  }
  .lp-hero-identity-text {
    padding-top: 2px;
  }

  /* Avatar float animation */
  .lp-avatar-float {
    animation: lp-float 5s ease-in-out infinite;
    flex-shrink: 0;
  }
  @keyframes lp-float {
    0%, 100% { transform: translateY(0px); }
    50%       { transform: translateY(-7px); }
  }

  .lp-hero-greeting {
    font-family: var(--ui);
    font-size: 13px; font-weight: 300;
    color: var(--text-3); margin: 0 0 6px;
  }

  .lp-hero-h1 {
    font-size: clamp(1.25rem, 2.2vw, 1.75rem);
    line-height: 1.35;
    letter-spacing: -0.02em;
    color: var(--text); margin: 0;
    font-weight: 500;
  }

  .lp-hero-bio {
    margin-top: 28px;
    max-width: 52ch;
    font-size: 15px; line-height: 1.9;
    color: var(--text-2);
  }

  /* Typing shimmer */
  .lp-typing-active {
    text-shadow: 0 0 28px rgba(200,148,60,0.22);
  }

  /* Tags */
  .lp-tag {
    display: inline-flex;
    align-items: center;
    max-width: 100%;
    padding: 7px 13px;
    border-radius: 100px;
    border: 1px solid rgba(200,148,60,0.3);
    background: rgba(200,148,60,0.065);
    color: rgba(237,231,218,0.92);
    font-family: var(--ui);
    font-size: 11px;
    font-weight: 500;
    letter-spacing: 0.045em;
    text-transform: uppercase;
    line-height: 1.3;
  }
  .lp-hero-tags {
    display: flex; flex-wrap: wrap; gap: 10px 8px;
    margin-top: 22px;
  }

  .lp-hero-actions {
    display: flex; align-items: center; gap: 12px;
    margin-top: 32px; flex-wrap: wrap;
  }

  /* AI Generated badge */
  .lp-ai-badge {
    display: inline-flex; align-items: center; gap: 6px;
    font-size: 10.5px; color: var(--gold);
    animation: lp-ai-glow 2.8s ease-in-out infinite;
  }
  @keyframes lp-ai-glow {
    0%, 100% { opacity: 0.8;  filter: drop-shadow(0 0 3px rgba(200,148,60,0.25)); }
    50%       { opacity: 1;   filter: drop-shadow(0 0 9px rgba(200,148,60,0.6)); }
  }

  /* ── AI Insight card (bio wrapper) ──────────────────────── */
  .lp-ai-insight-card {
    margin-top: 28px;
    border-radius: 12px;
    border: 1px solid rgba(200,148,60,0.14);
    background: rgba(200,148,60,0.035);
    padding: 18px 20px 20px;
  }
  .lp-ai-insight-header {
    display: flex; justify-content: space-between; align-items: center;
    margin-bottom: 14px;
    padding-bottom: 12px;
    border-bottom: 1px solid rgba(200,148,60,0.10);
  }
  .lp-ai-gen-label {
    font-size: 9px; letter-spacing: 0.18em;
    text-transform: uppercase; color: var(--text-3);
  }

  /* ── Cards ─────────────────────────────────────────────── */
  .lp-card {
    background: var(--surface); border-radius: 18px; padding: 28px;
    box-shadow:
      0 0 0 1px rgba(200,148,60,0.07),
      0 8px 40px rgba(0,0,0,0.32),
      0 0 60px rgba(200,148,60,0.04);
    transition: box-shadow 0.3s;
  }
  .lp-card:hover {
    box-shadow:
      0 0 0 1px rgba(200,148,60,0.13),
      0 8px 48px rgba(0,0,0,0.38),
      0 0 80px rgba(200,148,60,0.08);
  }

  /* ── Signal bar ────────────────────────────────────────── */
  .lp-signal-track {
    height: 2px; border-radius: 2px;
    background: rgba(255,255,255,0.06); overflow: hidden;
  }
  .lp-signal-fill {
    height: 100%;
    background: linear-gradient(90deg, var(--gold) 0%, var(--gold-l) 100%);
    border-radius: 2px; transition: width 1s ease;
  }

  /* ── Archive rows ──────────────────────────────────────── */
  .lp-nb-row {
    display: grid;
    grid-template-columns: 120px 1fr 110px;
    gap: 24px; padding: 20px 16px; border-radius: 12px;
    transition: background 0.18s; text-decoration: none;
  }
  .lp-nb-row:hover { background: rgba(200,148,60,0.05); }
  .lp-nb-title {
    font-family: var(--display);
    font-size: 1.65rem; letter-spacing: -0.03em; line-height: 1.1;
    color: var(--text); transition: color 0.25s;
  }
  .lp-nb-row:hover .lp-nb-title { color: var(--gold-l); }

  /* ── Timeline ──────────────────────────────────────────── */
  .lp-timeline {
    margin-top: 40px; position: relative; padding-left: 28px;
  }
  .lp-timeline-line {
    position: absolute; left: 4px; top: 8px; bottom: 8px; width: 1px;
    background: linear-gradient(180deg, var(--gold), transparent);
  }
  .lp-timeline-dot {
    position: absolute; left: -31px; top: 8px;
    width: 9px; height: 9px; border-radius: 50%;
    background: var(--bg); border: 1.5px solid var(--gold);
    box-shadow: 0 0 12px var(--gold-glow);
  }
  .lp-timeline-items { display: flex; flex-direction: column; gap: 40px; }

  /* ── Cursor ────────────────────────────────────────────── */
  .lp-cursor {
    display: inline-block; width: 2px; height: 0.85em;
    background: var(--gold); vertical-align: text-bottom; margin-left: 2px;
    animation: lp-blink 1.1s ease-in-out infinite;
  }
  @keyframes lp-blink { 0%, 100% { opacity: 1; } 50% { opacity: 0; } }
  @keyframes lp-term-blink { 0%, 100% { opacity: 0.75; } 50% { opacity: 0; } }

  /* ── Content sections wrapper ──────────────────────────── */
  .lp-sections { padding: 0 0 var(--section-gap); display: flex; flex-direction: column; gap: var(--section-gap); }
  .lp-section { }

  .lp-section-lead {
    display: grid;
    grid-template-columns: 1.12fr 0.88fr;
    gap: 56px;
    align-items: end;
    margin-bottom: var(--section-gap-tight);
  }
  .lp-section-title {
    font-family: var(--display);
    font-size: clamp(2rem, 3.5vw, 3rem);
    letter-spacing: -0.04em; line-height: 1.0;
    color: var(--text); margin: 0;
  }
  .lp-section-desc {
    font-size: 14px; line-height: 1.85;
    color: var(--text-2); padding-bottom: 4px;
  }

  /* ── Notebook rail ─────────────────────────────────────── */
  .lp-nb-rail-item {
    display: block; text-decoration: none; padding: 16px;
    margin: 0 -16px; border-radius: 12px;
    transition: background 0.2s;
  }
  .lp-nb-rail-item:hover { background: rgba(200,148,60,0.05); }
  .lp-nb-rail-title {
    font-family: var(--display);
    font-size: 1.4rem; letter-spacing: -0.025em; line-height: 1.15;
    color: var(--text); transition: color 0.2s; margin-top: 6px;
  }
  .lp-nb-rail-item:hover .lp-nb-rail-title { color: var(--gold-l); }

  /* ── Research Trajectory ───────────────────────────────── */
  .lp-rt { display: flex; flex-direction: column; gap: 0; }
  .lp-rt-focus {
    padding: 20px 22px; border-radius: 12px;
    background: rgba(200,148,60,0.07);
    border-left: 2px solid rgba(200,148,60,0.5);
  }
  .lp-rt-focus-text {
    font-size: 15px; line-height: 1.85; color: var(--text-2);
    margin: 0;
  }
  .lp-rt-next { display: flex; flex-direction: column; gap: 10px; }
  .lp-rt-next-item {
    display: flex; align-items: flex-start; gap: 10px;
    font-size: 14px; line-height: 1.7; color: var(--text-2);
  }
  .lp-rt-direction {
    padding: 18px 22px; border-radius: 12px;
    background: rgba(61,169,154,0.06);
    border-left: 2px solid rgba(61,169,154,0.35);
  }
  .lp-rt-direction-text {
    font-size: 14px; line-height: 1.8; color: var(--text-2);
    margin: 0;
  }
  .lp-rt-block { margin-top: 28px; }

  /* ── Featured badge ────────────────────────────────────── */
  .lp-featured-badge {
    display: inline-flex; align-items: center;
    padding: 2px 8px; border-radius: 100px;
    font-size: 9px; font-weight: 500;
    letter-spacing: 0.16em; text-transform: uppercase;
    background: rgba(200,148,60,0.15);
    color: var(--gold);
    border: 1px solid rgba(200,148,60,0.28);
    flex-shrink: 0;
  }

  /* ── Footer ────────────────────────────────────────────── */
  .lp-footer {
    padding: var(--section-gap) 0 56px;
    display: flex; flex-direction: column; align-items: center; gap: 18px;
  }
  .lp-footer-rule {
    width: 100%; height: 1px;
    background: linear-gradient(90deg, transparent 0%, rgba(200,148,60,0.28) 40%, rgba(200,148,60,0.28) 60%, transparent 100%);
    margin-bottom: 10px;
  }
  .lp-footer-brand {
    display: flex; align-items: center; gap: 9px;
  }
  .lp-footer-links {
    display: flex; align-items: center; gap: 14px;
    font-size: 10px; letter-spacing: 0.22em;
    text-transform: uppercase; color: var(--text-3);
  }
  .lp-footer-sep {
    width: 3px; height: 3px; border-radius: 50%;
    background: rgba(200,148,60,0.3); flex-shrink: 0;
    display: inline-block;
  }
  .lp-footer-ws-link {
    color: var(--text-2); text-decoration: none;
    transition: color 0.2s;
  }
  .lp-footer-ws-link:hover { color: var(--gold); }
  .lp-footer-copy {
    margin: 0; font-size: 9px; letter-spacing: 0.32em;
    text-transform: uppercase; color: var(--text-3);
    opacity: 0.6;
  }

  /* ── Notebook TOC sidebar (responsive) ─────────────────── */
  @media (min-width: 1024px) {
    .lp-toc-aside { display: block !important; }
  }

  /* ── Notebook prose content ─────────────────────────────── */
  .lp-prose { font-size: 14.5px; line-height: 1.9; color: var(--text-2); }
  .lp-prose h1, .lp-prose h2, .lp-prose h3 {
    font-family: var(--display); color: var(--text);
    letter-spacing: -0.025em; margin: 1.6em 0 0.5em;
  }
  .lp-prose h1 { font-size: 1.55rem; }
  .lp-prose h2 { font-size: 1.3rem; }
  .lp-prose h3 { font-size: 1.1rem; }
  .lp-prose p { margin: 0 0 1em; }
  .lp-prose ul, .lp-prose ol { padding-left: 1.4em; margin: 0.6em 0 1em; }
  .lp-prose li { margin-bottom: 0.3em; }
  .lp-prose blockquote {
    margin: 1.2em 0; padding: 10px 16px;
    border-left: 2px solid rgba(200,148,60,0.45);
    background: rgba(200,148,60,0.04); border-radius: 0 6px 6px 0;
    color: var(--text-2); font-style: italic;
  }
  .lp-prose code {
    font-family: 'JetBrains Mono', 'Fira Code', monospace;
    font-size: 0.82em; background: rgba(255,255,255,0.06);
    padding: 2px 6px; border-radius: 4px; color: var(--gold-l);
  }
  .lp-prose pre {
    background: #1a1d2e; border-radius: 8px; padding: 16px;
    border: 1px solid rgba(200,148,60,0.12); overflow-x: auto;
    margin: 1.2em 0;
  }
  .lp-prose pre code { background: none; padding: 0; color: rgba(251,235,226,0.82); }
  .lp-prose a { color: var(--gold); text-decoration: underline; text-underline-offset: 3px; }
  .lp-prose a:hover { color: var(--gold-l); }
  .lp-prose hr { border: none; border-top: 1px solid rgba(255,255,255,0.07); margin: 2em 0; }
  .lp-prose strong { color: var(--text); font-weight: 600; }

  /* ── Loader ────────────────────────────────────────────── */
  @keyframes lp-spin { to { transform: rotate(360deg); } }
  .lp-spin { animation: lp-spin 1s linear infinite; }

  /* ── Responsive ────────────────────────────────────────── */
  @media (max-width: 1024px) {
    .lp { --section-gap: 72px; --section-gap-tight: 28px; }
    .lp-split { grid-template-columns: 1fr; gap: 48px; }
    .lp-hero-layout.is-split { grid-template-columns: 1fr; gap: 36px; }
    .lp-hero-right {
      padding: 22px 20px;
    }
    .lp-hero-krow { grid-template-columns: 1fr; gap: 10px; }
    .lp-section-lead { grid-template-columns: 1fr; gap: 12px; }
    .lp-nb-row { grid-template-columns: 1fr; gap: 8px; }
    .lp-nav-links { display: none; }
    .lp-page-inner { padding: 0 24px; }
  }
  @media (max-width: 640px) {
    .lp { --section-gap: 56px; --section-gap-tight: 24px; }
    .lp-hero { padding: 56px 0 var(--section-gap); }
    .lp-hero-kitem { font-size: 13.5px; }
  }
`
