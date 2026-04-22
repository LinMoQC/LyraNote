import { type CSSProperties, type KeyboardEvent, type MouseEvent, type ReactNode, type RefObject, useCallback, useEffect, useRef } from "react"

import { cn } from "@/lib/cn"

export function ChatComposer({
  value,
  onChange,
  placeholder,
  onSubmit,
  textareaRef,
  disabled = false,
  isSubmitDisabled = false,
  submitOnEnter = true,
  maxHeight = 200,
  topContent,
  toolbarLeft,
  toolbarRight,
  containerClassName,
  textareaClassName,
  containerStyle,
  textareaStyle,
}: ChatComposerProps) {
  const fallbackTextareaRef = useRef<HTMLTextAreaElement>(null)
  const resolvedTextareaRef = textareaRef ?? fallbackTextareaRef
  const isComposingRef = useRef(false)

  const autoResize = useCallback(() => {
    const el = resolvedTextareaRef.current
    if (!el) return
    el.style.height = "auto"
    el.style.height = `${Math.min(el.scrollHeight, maxHeight)}px`
    el.style.overflowY = el.scrollHeight > maxHeight ? "auto" : "hidden"
  }, [maxHeight, resolvedTextareaRef])

  useEffect(() => {
    autoResize()
  }, [value, autoResize])

  function handleContainerClick(event: MouseEvent<HTMLDivElement>) {
    const target = event.target as HTMLElement
    if (target.closest("button, input, label, a, [role=button]")) return
    resolvedTextareaRef.current?.focus()
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (!submitOnEnter) return
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing && !isComposingRef.current) {
      event.preventDefault()
      if (!isSubmitDisabled) onSubmit?.()
    }
  }

  return (
    <div
      className={cn("relative flex flex-col rounded-[20px] transition-all duration-200", containerClassName)}
      style={{
        background: "var(--color-bg-elevated)",
        border: "none",
        boxShadow: "0 16px 48px rgba(0, 0, 0, 0.4), 0 4px 16px rgba(0, 0, 0, 0.2)",
        ...containerStyle,
      }}
      onClick={handleContainerClick}
    >
      {topContent}

      <textarea
        ref={resolvedTextareaRef}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={handleKeyDown}
        onCompositionStart={() => { isComposingRef.current = true }}
        onCompositionEnd={() => { requestAnimationFrame(() => { isComposingRef.current = false }) }}
        placeholder={placeholder}
        rows={2}
        disabled={disabled}
        className={cn(
          "block w-full resize-none bg-transparent px-5 pb-2 text-[14px] leading-relaxed outline-none no-scrollbar",
          textareaClassName,
        )}
        style={{
          color: "var(--color-text-primary)",
          fontFamily: "var(--font-sans)",
          minHeight: "44px",
          maxHeight,
          overflowY: "hidden",
          caretColor: "var(--color-accent)",
          ...textareaStyle,
        }}
      />

      <div className="flex items-center justify-between px-4 pb-2.5 pt-0.5">
        <div className="relative flex items-center gap-1.5">
          {toolbarLeft}
        </div>
        <div className="flex items-center">
          {toolbarRight}
        </div>
      </div>
    </div>
  )
}

interface ChatComposerProps {
  value: string
  onChange: (value: string) => void
  placeholder: string
  onSubmit?: () => void
  textareaRef?: RefObject<HTMLTextAreaElement | null>
  disabled?: boolean
  isSubmitDisabled?: boolean
  submitOnEnter?: boolean
  maxHeight?: number
  topContent?: ReactNode
  toolbarLeft?: ReactNode
  toolbarRight?: ReactNode
  containerClassName?: string
  textareaClassName?: string
  containerStyle?: CSSProperties
  textareaStyle?: CSSProperties
}
