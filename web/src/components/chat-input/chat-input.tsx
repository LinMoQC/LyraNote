"use client";

import { ArrowUp, Square } from "lucide-react";
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  type ReactNode,
} from "react";

import { cn } from "@/lib/utils";

export interface ChatInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (text: string) => void;
  placeholder?: string;
  disabled?: boolean;
  streaming?: boolean;
  onCancel?: () => void;

  variant?: "default" | "compact";
  shadow?: boolean;
  accentBorder?: string;

  toolbarLeft?: ReactNode;
  toolbarRight?: ReactNode;
  aboveInput?: ReactNode;

  onFilePaste?: (files: File[]) => void;
  onAtTrigger?: () => void;

  maxHeight?: number;
  showHint?: boolean;
  hintText?: string;
  sendTitle?: string;
  cancelTitle?: string;
}

export interface ChatInputHandle {
  focus: () => void;
  textarea: HTMLTextAreaElement | null;
}

export const ChatInput = forwardRef<ChatInputHandle, ChatInputProps>(
  function ChatInput(
    {
      value,
      onChange,
      onSubmit,
      placeholder,
      disabled = false,
      streaming = false,
      onCancel,

      variant = "default",
      shadow = false,
      accentBorder,

      toolbarLeft,
      toolbarRight,
      aboveInput,

      onFilePaste,
      onAtTrigger,

      maxHeight,
      showHint = false,
      hintText,
      sendTitle,
      cancelTitle,
    },
    ref,
  ) {
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const isCompact = variant === "compact";
    const resolvedMaxHeight = maxHeight ?? (isCompact ? 100 : 160);

    useImperativeHandle(ref, () => ({
      focus: () => textareaRef.current?.focus(),
      textarea: textareaRef.current,
    }));

    const autoResize = useCallback(() => {
      const el = textareaRef.current;
      if (!el) return;
      el.style.height = "auto";
      el.style.height = `${Math.min(el.scrollHeight, resolvedMaxHeight)}px`;
      el.style.overflowY =
        el.scrollHeight > resolvedMaxHeight ? "auto" : "hidden";
    }, [resolvedMaxHeight]);

    useEffect(() => {
      autoResize();
    }, [value, autoResize]);

    const handleKeyDown = useCallback(
      (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
          e.preventDefault();
          if (streaming) return;
          const q = value.trim();
          if (q) onSubmit(q);
        }
      },
      [value, onSubmit, streaming],
    );

    const handlePaste = useCallback(
      (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
        if (!onFilePaste) return;
        const files = Array.from(e.clipboardData.files);
        if (files.length > 0) {
          e.preventDefault();
          onFilePaste(files);
        }
      },
      [onFilePaste],
    );

    const handleChange = useCallback(
      (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        const newValue = e.target.value;
        // Detect newly typed "@" at the end of input
        if (
          onAtTrigger &&
          newValue.length === value.length + 1 &&
          newValue.endsWith("@")
        ) {
          onAtTrigger();
          // Remove the trailing "@" so it doesn't appear in the input
          onChange(newValue.slice(0, -1));
          return;
        }
        onChange(newValue);
      },
      [onChange, onAtTrigger, value],
    );

    const handleSendClick = useCallback(() => {
      if (streaming) {
        onCancel?.();
      } else {
        const q = value.trim();
        if (q) onSubmit(q);
      }
    }, [streaming, value, onSubmit, onCancel]);

    const canSend = !disabled && !streaming && !!value.trim();

    return (
      <div>
        <div
          className={cn(
            "relative rounded-3xl border bg-card transition-all",
            shadow && "shadow-lg shadow-black/5 dark:shadow-black/20",
            accentBorder ??
              "border-border/40 focus-within:border-border/60",
            isCompact && "rounded-2xl bg-background",
          )}
        >
          {aboveInput && (
            <div className={isCompact ? "px-3 pt-3" : "px-4 pt-3"}>
              {aboveInput}
            </div>
          )}
          <textarea
            ref={textareaRef}
            value={value}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            placeholder={placeholder}
            rows={1}
            disabled={disabled || streaming}
            className={cn(
              "no-scrollbar w-full resize-none bg-transparent text-foreground placeholder:text-muted-foreground/40 focus:outline-none disabled:opacity-60",
              isCompact
                ? "px-3.5 pb-1.5 text-[13px] leading-5"
                : "px-5 pb-1 text-[15px] leading-6",
              aboveInput ? "pt-2" : isCompact ? "pt-3" : "pt-4",
            )}
            style={{ maxHeight: resolvedMaxHeight }}
          />
          <div
            className={cn(
              "flex items-center justify-between",
              isCompact ? "px-2.5 pb-2 pt-0.5" : "px-3 pb-3 pt-0.5",
            )}
          >
            <div className="flex items-center gap-2">{toolbarLeft}</div>
            <div className="flex items-center gap-2">
              {toolbarRight}
              <button
                type="button"
                onClick={handleSendClick}
                disabled={!streaming && !canSend}
                className={cn(
                  "flex items-center justify-center rounded-full transition-all",
                  isCompact ? "h-8 w-8" : "h-9 w-9",
                  streaming
                    ? "bg-foreground text-background hover:bg-foreground/80"
                    : canSend
                      ? "bg-foreground text-background hover:bg-foreground/80 active:scale-95"
                      : "cursor-not-allowed bg-muted/60 text-muted-foreground/30",
                )}
                title={
                  streaming ? (cancelTitle ?? "Cancel") : (sendTitle ?? "Send")
                }
              >
                {streaming ? (
                  <Square size={isCompact ? 11 : 13} fill="currentColor" />
                ) : (
                  <ArrowUp size={isCompact ? 16 : 20} strokeWidth={2.5} />
                )}
              </button>
            </div>
          </div>
        </div>
        {showHint && hintText && (
          <p className="mt-1.5 px-1 text-center text-[10px] text-muted-foreground/25">
            {hintText}
          </p>
        )}
      </div>
    );
  },
);
