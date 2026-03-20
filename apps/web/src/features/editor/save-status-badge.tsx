import { Badge } from "@/components/ui/badge";

export function SaveStatusBadge({
  status
}: {
  status: "saving" | "saved" | "error";
}) {
  const labelMap = {
    error: "Error",
    saved: "Saved",
    saving: "Saving"
  };

  return <Badge>{labelMap[status]}</Badge>;
}
