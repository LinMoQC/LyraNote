import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { FilePlus, FileText, Search } from "lucide-react";
import { useUiStore } from "@/store/use-ui-store";
import { getHttpClient } from "@/lib/http-client";
import { createNoteService } from "@lyranote/api-client";
import type { Note } from "@lyranote/types";
import { cn } from "@/lib/utils";

export function NotesPage() {
  const { selectedNotebookId, selectedNoteId, selectNote } = useUiStore();
  const [search, setSearch] = useState("");
  const qc = useQueryClient();

  const noteService = createNoteService(getHttpClient());

  const { data: notes = [] } = useQuery({
    queryKey: ["notes", selectedNotebookId],
    queryFn: () => noteService.getNotes(selectedNotebookId!),
    enabled: !!selectedNotebookId,
  });

  const createNote = useMutation({
    mutationFn: () => noteService.createNote(selectedNotebookId!, "Untitled"),
    onSuccess: (note) => {
      qc.invalidateQueries({ queryKey: ["notes", selectedNotebookId] });
      selectNote(note.id);
    },
  });

  const selectedNote = notes.find((n) => n.id === selectedNoteId);
  const filtered = notes.filter((n) =>
    (n.title ?? "").toLowerCase().includes(search.toLowerCase())
  );

  if (!selectedNotebookId) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-sidebar-text-muted text-sm">Select a notebook to view notes</p>
      </div>
    );
  }

  return (
    <div className="flex h-full">
      {/* 笔记列表面板 */}
      <div className="w-56 shrink-0 border-r border-sidebar-border flex flex-col">
        <div className="p-2 border-b border-sidebar-border">
          <div className="flex items-center gap-1.5 bg-surface-raised rounded-md px-2 py-1.5">
            <Search size={12} className="text-sidebar-text-muted shrink-0" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search notes..."
              className="bg-transparent text-xs text-sidebar-text placeholder-sidebar-text-muted outline-none flex-1 w-0"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-1">
          {filtered.map((note) => (
            <NoteListItem
              key={note.id}
              note={note}
              isSelected={note.id === selectedNoteId}
              onSelect={() => selectNote(note.id)}
            />
          ))}
        </div>

        <div className="p-2 border-t border-sidebar-border">
          <button
            onClick={() => createNote.mutate()}
            disabled={createNote.isPending}
            className="flex items-center gap-2 w-full px-2 py-1.5 rounded text-xs text-sidebar-text-muted hover:text-sidebar-text hover:bg-sidebar-hover transition-colors"
          >
            <FilePlus size={13} />
            New note
          </button>
        </div>
      </div>

      {/* 编辑器区 */}
      <div className="flex-1 min-w-0 overflow-hidden">
        {selectedNote ? (
          <NoteEditor note={selectedNote} />
        ) : (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-sidebar-text-muted">
            <FileText size={36} className="opacity-20" />
            <p className="text-sm opacity-60">Select a note to start editing</p>
          </div>
        )}
      </div>
    </div>
  );
}

function NoteListItem({
  note,
  isSelected,
  onSelect,
}: {
  note: Note;
  isSelected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      onClick={onSelect}
      className={cn(
        "flex flex-col w-full px-2 py-2 rounded text-left transition-colors",
        isSelected
          ? "bg-sidebar-active"
          : "hover:bg-sidebar-hover"
      )}
    >
      <span className={cn("text-xs font-medium truncate", isSelected ? "text-sidebar-text" : "text-sidebar-text-muted")}>
        {note.title ?? "Untitled"}
      </span>
      {note.contentText && (
        <span className="text-xs text-sidebar-text-muted truncate mt-0.5 opacity-60">
          {note.contentText.slice(0, 60)}
        </span>
      )}
    </button>
  );
}

function NoteEditor({ note }: { note: Note }) {
  const [content, setContent] = useState(note.contentText ?? "");
  const noteService = createNoteService(getHttpClient());
  const qc = useQueryClient();

  const saveNote = useMutation({
    mutationFn: (text: string) =>
      noteService.updateNote(note.id, { content_text: text }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["notes"] });
    },
  });

  return (
    <div className="flex flex-col h-full">
      <div className="px-8 py-6 border-b border-sidebar-border">
        <input
          defaultValue={note.title ?? ""}
          placeholder="Untitled"
          className="text-xl font-semibold bg-transparent outline-none text-sidebar-text w-full placeholder-sidebar-text-muted"
          onBlur={(e) =>
            noteService.updateNote(note.id, { title: e.target.value })
          }
        />
      </div>
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        onBlur={(e) => saveNote.mutate(e.target.value)}
        placeholder="Start writing..."
        className="flex-1 resize-none bg-transparent outline-none text-sm text-sidebar-text leading-relaxed px-8 py-4 placeholder-sidebar-text-muted"
      />
    </div>
  );
}
