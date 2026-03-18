import { notFound } from "next/navigation";
import { NotebookWorkspace } from "@/features/notebook/notebook-workspace";
import { getConversation } from "@/services/ai-service";
import { getNotebook } from "@/services/notebook-service";

export default async function NotebookDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const notebook = await getNotebook(id);

  if (!notebook) notFound();

  const messages = await getConversation();

  return (
    <div className="flex h-full flex-col dark:border border-border/40">
      <NotebookWorkspace
        notebookId={id}
        title={notebook.title}
        initialMessages={messages}
      />
    </div>
  );
}
