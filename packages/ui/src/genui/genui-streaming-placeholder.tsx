"use client"

import { memo, useRef, useEffect } from "react"

const SVG_NS = "http://www.w3.org/2000/svg"

// Rose curve parameters (simplified from "Original Thinking")
const BASE_R = 7
const DETAIL_AMP = 3
const PETALS = 7
const SCALE = 3.9
const VIEWBOX = 100
const CENTER = VIEWBOX / 2

const PARTICLE_COUNT = 48
const TRAIL_SPAN = 0.38
const DURATION_MS = 4600
const ROTATION_MS = 28000
const PULSE_MS = 4200
const STROKE_W = 4

function point(progress: number, detailScale: number) {
  const t = progress * Math.PI * 2
  const x = BASE_R * Math.cos(t) - DETAIL_AMP * detailScale * Math.cos(PETALS * t)
  const y = BASE_R * Math.sin(t) - DETAIL_AMP * detailScale * Math.sin(PETALS * t)
  return { x: CENTER + x * SCALE, y: CENTER + y * SCALE }
}

function detailScale(time: number) {
  const p = (time % PULSE_MS) / PULSE_MS
  return 0.52 + ((Math.sin(p * Math.PI * 2 + 0.55) + 1) / 2) * 0.48
}

function buildPath(ds: number) {
  const steps = 360
  const parts: string[] = []
  for (let i = 0; i <= steps; i++) {
    const { x, y } = point(i / steps, ds)
    parts.push(`${i === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`)
  }
  return parts.join(" ")
}

function GenUIStreamingPlaceholderInner() {
  const svgRef = useRef<SVGSVGElement>(null)

  useEffect(() => {
    const svg = svgRef.current
    if (!svg) return

    const group = svg.querySelector<SVGGElement>("[data-group]")!
    const path = svg.querySelector<SVGPathElement>("[data-path]")!

    // Create particles
    const particles: SVGCircleElement[] = []
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const c = document.createElementNS(SVG_NS, "circle")
      c.setAttribute("fill", "url(#genui-grad)")
      group.appendChild(c)
      particles.push(c)
    }

    let raf: number
    const start = performance.now()

    function render(now: number) {
      const time = now - start
      const progress = (time % DURATION_MS) / DURATION_MS
      const ds = detailScale(time)
      const rot = -((time % ROTATION_MS) / ROTATION_MS) * 360

      group.setAttribute("transform", `rotate(${rot} ${CENTER} ${CENTER})`)
      path.setAttribute("d", buildPath(ds))

      for (let i = 0; i < PARTICLE_COUNT; i++) {
        const tail = i / (PARTICLE_COUNT - 1)
        const p = point(((progress - tail * TRAIL_SPAN) % 1 + 1) % 1, ds)
        const fade = Math.pow(1 - tail, 0.56)
        particles[i].setAttribute("cx", p.x.toFixed(2))
        particles[i].setAttribute("cy", p.y.toFixed(2))
        particles[i].setAttribute("r", (0.7 + fade * 2.2).toFixed(2))
        particles[i].setAttribute("opacity", (0.04 + fade * 0.96).toFixed(3))
      }

      raf = requestAnimationFrame(render)
    }

    raf = requestAnimationFrame(render)
    return () => cancelAnimationFrame(raf)
  }, [])

  return (
    <div className="my-3 flex items-center justify-center rounded-xl border border-border/40 bg-[#0a0a12]/60">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${VIEWBOX} ${VIEWBOX}`}
        className="h-20 w-20 text-indigo-400/80"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id="genui-grad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#818cf8" />
            <stop offset="100%" stopColor="#6366f1" />
          </linearGradient>
        </defs>
        <g data-group>
          <path
            data-path
            stroke="url(#genui-grad)"
            strokeWidth={STROKE_W}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
            opacity="0.1"
          />
        </g>
      </svg>
    </div>
  )
}

export const GenUIStreamingPlaceholder = memo(GenUIStreamingPlaceholderInner)
