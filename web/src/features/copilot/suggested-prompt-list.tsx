"use client";

const prompts = [
  "Summarize the risk signals across current sources.",
  "Turn these notes into a short presentation outline.",
  "Compare the founder interview against the strategy report."
];

export function SuggestedPromptList({
  onSelect
}: {
  onSelect: (prompt: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {prompts.map((prompt) => (
        <button
          key={prompt}
          className="rounded-full border border-border/50 bg-muted/50 px-3 py-2 text-left text-xs text-muted-foreground transition hover:border-border/80 hover:text-foreground"
          onClick={() => onSelect(prompt)}
          type="button"
        >
          {prompt}
        </button>
      ))}
    </div>
  );
}
