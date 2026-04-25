"use client"

import { useEffect, useRef } from "react"

const SVG_NS = "http://www.w3.org/2000/svg"

const CFG = {
  particleCount: 48,
  trailSpan: 0.38,
  durationMs: 4600,
  rotationDurationMs: 28000,
  pulseDurationMs: 4200,
  strokeWidth: 6,
  baseRadius: 7,
  detailAmplitude: 3,
  petalCount: 7,
  curveScale: 3.9,
}

function normalizeProgress(p: number) {
  return ((p % 1) + 1) % 1
}

function getDetailScale(time: number) {
  const angle = ((time % CFG.pulseDurationMs) / CFG.pulseDurationMs) * Math.PI * 2
  return 0.52 + ((Math.sin(angle + 0.55) + 1) / 2) * 0.48
}

function getRotation(time: number) {
  return -((time % CFG.rotationDurationMs) / CFG.rotationDurationMs) * 360
}

function curvePoint(progress: number, detailScale: number) {
  const t = progress * Math.PI * 2
  const k = Math.round(CFG.petalCount)
  return {
    x: 50 + (CFG.baseRadius * Math.cos(t) - CFG.detailAmplitude * detailScale * Math.cos(k * t)) * CFG.curveScale,
    y: 50 + (CFG.baseRadius * Math.sin(t) - CFG.detailAmplitude * detailScale * Math.sin(k * t)) * CFG.curveScale,
  }
}

function buildPath(detailScale: number, steps = 360) {
  return Array.from({ length: steps + 1 }, (_, i) => {
    const p = curvePoint(i / steps, detailScale)
    return `${i === 0 ? "M" : "L"} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`
  }).join(" ")
}

export function OriginalThinkingLoader({
  size = 28,
  className,
}: {
  size?: number
  className?: string
}) {
  const groupRef = useRef<SVGGElement>(null)
  const pathRef = useRef<SVGPathElement>(null)
  const rafRef = useRef<number>(0)

  useEffect(() => {
    const group = groupRef.current
    const path = pathRef.current
    if (!group || !path) return

    path.setAttribute("stroke-width", String(CFG.strokeWidth))

    const particles = Array.from({ length: CFG.particleCount }, () => {
      const circle = document.createElementNS(SVG_NS, "circle")
      circle.setAttribute("fill", "currentColor")
      group.appendChild(circle)
      return circle
    })

    const startedAt = performance.now()

    function render(now: number) {
      const time = now - startedAt
      const progress = (time % CFG.durationMs) / CFG.durationMs
      const ds = getDetailScale(time)

      group!.setAttribute("transform", `rotate(${getRotation(time).toFixed(2)} 50 50)`)
      path!.setAttribute("d", buildPath(ds))

      particles.forEach((node, i) => {
        const tail = i / (CFG.particleCount - 1)
        const p = curvePoint(normalizeProgress(progress - tail * CFG.trailSpan), ds)
        const fade = Math.pow(1 - tail, 0.56)
        node.setAttribute("cx", p.x.toFixed(2))
        node.setAttribute("cy", p.y.toFixed(2))
        node.setAttribute("r", (0.9 + fade * 2.7).toFixed(2))
        node.setAttribute("opacity", (0.04 + fade * 0.96).toFixed(3))
      })

      rafRef.current = requestAnimationFrame(render)
    }

    rafRef.current = requestAnimationFrame(render)
    return () => {
      cancelAnimationFrame(rafRef.current)
      particles.forEach((p) => p.remove())
    }
  }, [])

  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <g ref={groupRef}>
        <path
          ref={pathRef}
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity="0.15"
        />
      </g>
    </svg>
  )
}
