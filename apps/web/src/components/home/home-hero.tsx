"use client";

import { useAuth } from "@/features/auth/auth-provider";

export function HomeHero({
  greeting,
  tagline,
  align = "left",
}: HomeHeroProps) {
  const { user } = useAuth();
  const displayName = user?.name?.trim() || user?.username?.trim() || "";
  const isCentered = align === "center";

  return (
    <div className={`w-full space-y-2 ${isCentered ? "text-center" : "text-left"}`}>
      <p
        className={`flex items-center gap-2 text-base text-muted-foreground/70 ${isCentered ? "justify-center" : "justify-start"}`}
      >
        <span className="relative flex h-4 w-4 flex-shrink-0 items-center justify-center" aria-hidden>
          <span className="h-1.5 w-1.5 rounded-full bg-primary/90" />
          <span className="absolute h-4 w-4 rounded-full border border-primary/25" />
        </span>
        <span>{displayName ? `${greeting}，${displayName}` : greeting}</span>
      </p>
      <h1 className={`w-full text-[2rem] font-bold leading-tight tracking-tight text-foreground ${isCentered ? "text-center" : "text-left"}`}>
        {tagline}
      </h1>
    </div>
  );
}

interface HomeHeroProps {
  greeting: string;
  tagline: string;
  align?: "left" | "center";
}
