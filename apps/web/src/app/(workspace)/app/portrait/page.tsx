import { getTranslations } from "next-intl/server";
import { PortraitView } from "@/features/portrait/portrait-view";

export async function generateMetadata() {
  const t = await getTranslations("portrait");
  return { title: t("pageTitle") };
}

export default function PortraitPage() {
  return <PortraitView />;
}
