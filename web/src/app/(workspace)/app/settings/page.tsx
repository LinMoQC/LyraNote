import { Badge } from "@/components/ui/badge";

const sections = [
  {
    title: "Environment",
    description: "Mock mode is enabled so the frontend can iterate before the real backend is connected."
  },
  {
    title: "Workspace preferences",
    description: "Theme, editor behavior, and source import settings will live here."
  },
  {
    title: "Account",
    description: "The auth store is scaffolded and can be replaced with real identity data later."
  }
];

export default function SettingsPage() {
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      {sections.map((section) => (
        <section key={section.title} className="surface-panel space-y-4 p-6">
          <Badge>{section.title}</Badge>
          <h1 className="text-2xl font-semibold">{section.title}</h1>
          <p className="text-sm leading-6 text-muted-foreground">{section.description}</p>
        </section>
      ))}
    </div>
  );
}
