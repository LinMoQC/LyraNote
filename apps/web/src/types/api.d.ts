import type { Artifact, Message, Notebook, Source } from "@/types";

export type ApiResponse<T> = {
  data: T;
};

export type NotebookListResponse = ApiResponse<Notebook[]>;
export type SourceListResponse = ApiResponse<Source[]>;
export type ArtifactListResponse = ApiResponse<Artifact[]>;
export type ChatResponse = ApiResponse<Message>;
