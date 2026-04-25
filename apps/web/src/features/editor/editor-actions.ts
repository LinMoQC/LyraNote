export type EditorActionScope = "selection" | "cursor" | "block";

export type InlineRewriteAction = "polish" | "proofread" | "reformat" | "shorten";

export type EditorActionType =
  | InlineRewriteAction
  | "continue"
  | "summarize"
  | "askCopilot"
  | "explain"
  | "customEdit"
  | "comment"
  | "editSuggestion";

export interface EditorActionRequest {
  scope: EditorActionScope;
  action: EditorActionType;
  text: string;
  from?: number;
  to?: number;
  blockPos?: number;
  intent?: string;
  noteId?: string;
  notebookId?: string;
}

export function isInlineRewriteAction(action: EditorActionType): action is InlineRewriteAction {
  return action === "polish" || action === "proofread" || action === "reformat" || action === "shorten";
}
