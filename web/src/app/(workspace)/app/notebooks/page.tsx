import { NotebooksView } from "@/features/notebook/notebooks-view";
import { getNotebooks } from "@/services/notebook-service";

export default async function NotebooksPage() {
  const notebooks = await getNotebooks();
  return <NotebooksView notebooks={notebooks} />;
}
