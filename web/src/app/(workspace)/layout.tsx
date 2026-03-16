import { AppShell } from "@/components/layout/app-shell";

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
    </AppShell>
  );
}
