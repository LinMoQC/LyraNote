import { type CSSProperties, type KeyboardEvent, type MouseEvent, type ReactNode, type RefObject, useRef } from "react"

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

  function handleContainerClick(event: MouseEvent<HTMLDivElement>) {
    const target = event.target as HTMLElement
    if (target.closest("button, input, label, a, [role=button]")) return
    resolvedTextareaRef.current?.focus()
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (!submitOnEnter) return
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
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
        placeholder={placeholder}
        rows={2}
        disabled={disabled}
        className={cn(
          "block w-full resize-none bg-transparent px-5 pb-12 text-[14px] leading-relaxed outline-none no-scrollbar",
          textareaClassName,
        )}
        style={{
          color: "var(--color-text-primary)",
          fontFamily: "var(--font-sans)",
          minHeight: "44px",
          caretColor: "var(--color-accent)",
          ...textareaStyle,
        }}
      />

      <div className="pointer-events-none absolute bottom-2 left-2 right-2 flex items-center justify-between">
        <div className="pointer-events-auto relative flex items-center gap-1.5 pl-2 pb-1">
          {toolbarLeft}
        </div>
        <div className="pointer-events-auto flex items-center pr-2 pb-1">
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
  topContent?: ReactNode
  toolbarLeft?: ReactNode
  toolbarRight?: ReactNode
  containerClassName?: string
  textareaClassName?: string
  containerStyle?: CSSProperties
  textareaStyle?: CSSProperties
}
