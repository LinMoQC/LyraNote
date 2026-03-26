import { AppShell } from "@/components/layout/app-shell";
import { DrFloatingIndicator } from "@/components/deep-research/dr-floating-indicator";
import { WorkspaceEffects } from "@/components/layout/workspace-effects";

export default function WorkspaceLayout({
  children,
  modal
}: Readonly<{
  children: React.ReactNode;
  modal: React.ReactNode;
}>) {
  return (
    <AppShell>
      {children}
      {modal}
      <DrFloatingIndicator />
      <WorkspaceEffects />
    </AppShell>
  );
}
