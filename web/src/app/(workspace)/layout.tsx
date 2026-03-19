import { AppShell } from "@/components/layout/app-shell";
import { DrFloatingIndicator } from "@/features/chat/dr-floating-indicator";

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
    </AppShell>
  );
}
