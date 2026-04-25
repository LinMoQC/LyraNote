/**
 * Stub for next/image in the desktop (Vite/Tauri) context.
 * Renders a plain <img> element with the same essential props.
 */

import type { ImgHTMLAttributes } from "react"

interface ImageProps extends ImgHTMLAttributes<HTMLImageElement> {
  src: string
  alt: string
  width?: number
  height?: number
  unoptimized?: boolean
  fill?: boolean
  priority?: boolean
  quality?: number
  onError?: React.ReactEventHandler<HTMLImageElement>
}

export default function Image({ src, alt, width, height, fill, className, style, onError }: ImageProps) {
  if (fill) {
    return (
      <img
        src={src}
        alt={alt}
        className={className}
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", ...style }}
        onError={onError}
      />
    )
  }
  return (
    <img
      src={src}
      alt={alt}
      width={width}
      height={height}
      className={className}
      style={style}
      onError={onError}
    />
  )
}
