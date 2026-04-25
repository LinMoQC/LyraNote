"use client";

/**
 * @file 独立对话页视图
 * @description 全屏对话界面的布局组件。业务逻辑由 useChatPage 提供，
 *              移动端会话列表由 MobileConvSheet 渲染。
 */

import { AnimatePresence, m } from "framer-motion";
import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback } from "react";

import { ChatInput, ChatToolbar } from "@/components/chat-input";
import { AttachmentPreviewBar } from "@/components/chat-input/attachment-preview-bar";
import { cn } from "@/lib/utils";
import { DrPlanCard } from "@/components/deep-research/dr-plan-card";
import { DrProgressCard } from "@/components/deep-research/dr-progress-card";
import { DrResearchDrawer } from "@/components/deep-research/dr-research-drawer";
import { DeepResearchSaveNoteDialog } from "@/components/deep-research/dr-save-note-dialog";
import { ChatInputContainer, ChatMessageList } from "@/features/chat/chat-layout";
import { ArtifactPanel } from "@lyranote/ui/genui";
import { approveToolCall } from "@/services/ai-service";
import { ApprovalCard } from "@lyranote/ui/message-render";

import { ChatEmptyState } from "./chat-empty-state";
import { ChatSidebarPanel } from "./chat-sidebar-panel";
import { ChatMessageBubble } from "./chat-message-bubble";
import { MobileConvSheet } from "./mobile-conv-sheet";
import { useChatPage } from "./use-chat-page";
export function ChatView() {
  const p = useChatPage();
  const t = useTranslations("chat");
  const tc = useTranslations("common");
  const tDr = useTranslations("deepResearch");
  const { fileInputRef, fileAttachments, setIsDeepResearch, setThinkingEnabled } = p;
  const handleToolbarFileClick = useCallback(() => {
    fileInputRef.current?.click();
  }, [fileInputRef]);
  const handleToggleDeepResearch = useCallback(() => {
    setIsDeepResearch((v: boolean) => !v);
  }, [setIsDeepResearch]);
  const handleToggleThinking = useCallback(() => {
    setThinkingEnabled((v: boolean) => !v);
  }, [setThinkingEnabled]);
  const handleFileInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      fileAttachments.addFiles(e.target.files);
    }
    e.target.value = "";
  }, [fileAttachments]);

  return (
    <div className="flex h-full dark:border border-border/40">
      <ChatSidebarPanel
        conversationList={p.conversationList}
        activeConvId={p.activeConvId}
        hasMoreConversations={p.hasMoreConversations}
        deletePending={p.deletePending}
        onSelectConv={p.handleSelectConv}
        onNewChat={p.handleNewChat}
        onDeleteConv={p.handleDeleteConv}
        onLoadMore={p.loadMoreConversations}
      />

      <div className="relative flex min-w-0 flex-1 flex-col overflow-hidden">
        <AnimatePresence mode="popLayout" initial={false}>
        {p.messages.length > 0 || p.pendingChatPayload.current || p.pendingAutoSendRef.current ? (
          <m.div
            key="chat-messages"
            className="flex min-h-0 flex-1 flex-col"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
          >
          <ChatMessageList>
            {p.hasMoreMessages && p.activeConvId && (
              <div className="flex justify-center">
                <button
                  type="button"
                  onClick={p.loadMoreMessages}
                  className="rounded-lg border border-border/40 px-3 py-1.5 text-xs text-muted-foreground/70 transition-colors hover:bg-accent/50 hover:text-foreground"
                >
                  {tc("loadMore")}
                </button>
              </div>
            )}
            <AnimatePresence initial={false}>
              {p.messages.map((msg: import("./chat-types").LocalMessage, idx: number) => (
                <ChatMessageBubble
                  key={msg._animKey ?? msg.id}
                  msg={msg}
                  isLastAssistant={msg.role === "assistant" && idx === p.messages.length - 1}
                  streaming={p.streaming}
                  liveAgentSteps={p.chat.agentSteps}
                  feedbackRating={p.feedbackMap[msg.id]}
                  copied={p.copied}
                  avatarUrl={p.avatarUrl}
                  initials={p.initials}
                  showReasoning={p.isThinkingModel && p.thinkingEnabled}
                  onCopy={p.copy}
                  onFeedback={p.handleFeedback}
                  onRegenerate={p.stableRegenerate}
                  onFollowUp={p.stableFollowUp}
                  onSaveDeepResearchNote={
                    msg.deepResearch ? p.dr.handleSaveAsNote : undefined
                  }
                  onSaveDeepResearchSources={
                    msg.deepResearch &&
                    p.dr.taskId &&
                    p.activeConvId === p.drConversationId
                      ? p.dr.handleSaveSources
                      : undefined
                  }
                  onArtifact={p.setArtifactState}
                />
              ))}
            </AnimatePresence>

            {p.streaming && p.chat.pendingApproval && (
              <div className="px-4 pb-2">
                <ApprovalCard
                  toolCalls={p.chat.pendingApproval.toolCalls}
                  onDecision={async (approved) => {
                    await approveToolCall(p.chat.pendingApproval!.approvalId, approved);
                    p.chat.setPendingApproval(null);
                  }}
                />
              </div>
            )}

            <AnimatePresence>
              {/* Plan loading indicator */}
              {p.dr.isPlanLoading && (!p.activeConvId || p.activeConvId === p.drConversationId) && (
                <m.div key="dr-plan-loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex items-center gap-2 px-5 pb-4 text-[12px] text-muted-foreground/50">
                  <Loader2 size={13} className="animate-spin" />
                  <span>{tDr("planLoading")}</span>
                </m.div>
              )}

              {/* Plan confirmation card */}
              {p.dr.planData && !p.dr.isPlanLoading && (!p.activeConvId || p.activeConvId === p.drConversationId) && (
                <m.div key="dr-plan-card" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="px-4 pb-4">
                  <DrPlanCard
                    plan={p.dr.planData}
                    mode={p.drMode}
                    onConfirm={p.dr.confirmPlan}
                    onCancel={p.dr.cancelPlan}
                  />
                </m.div>
              )}

              {/* Compact progress card while researching */}
              {p.dr.drProgress && !p.dr.planData && !p.dr.isPlanLoading && (!p.activeConvId || p.activeConvId === p.drConversationId) && (
                <m.div key="dr-progress-live" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="px-4 pb-4">
                  <DrProgressCard
                    progress={p.dr.drProgress}
                    mode={p.drMode}
                    onOpenDrawer={() => p.dr.setDrawerOpen(true)}
                  />
                </m.div>
              )}
            </AnimatePresence>

            <div ref={p.bottomRef} />
          </ChatMessageList>
          </m.div>
        ) : (
          <m.div
            key="chat-empty"
            className="flex min-h-0 flex-1 flex-col"
            exit={{
              opacity: 0,
              scale: 0.97,
              y: -30,
              filter: "blur(6px)",
              transition: { duration: 0.25, ease: [0.4, 0, 1, 1] },
            }}
          >
          <ChatEmptyState
            suggestionsLoading={p.suggestionsLoading}
            dynamicSuggestions={p.dynamicSuggestions}
            onSend={p.chat.handleSend}
          />
          </m.div>
        )}
        </AnimatePresence>

        <ChatInputContainer>
          <ChatInput
            ref={p.chatInputRef}
            value={p.input}
            onChange={p.setInput}
            onSubmit={p.handleSubmit}
            placeholder={p.isDeepResearch ? t("deepResearchPlaceholder") : t("placeholder")}
            disabled={p.fileAttachments.isUploading}
            streaming={p.streaming}
            onCancel={p.chat.handleCancelStreaming}
            variant="default"
            shadow
            maxHeight={140}
            accentBorder={p.isDeepResearch
              ? "border-amber-500/25 focus-within:border-amber-500/50 focus-within:shadow-[0_0_0_3px_rgba(245,158,11,0.08)]"
              : undefined
            }
            showHint
            hideHintOnMobile
            hintText={t("sendHint")}
            sendTitle={t("send")}
            cancelTitle={t("cancelGenerate")}
            onFilePaste={(files) => p.fileAttachments.addFiles(files)}
            aboveInput={
              <AttachmentPreviewBar
                attachments={p.fileAttachments.attachments}
                onRemove={p.fileAttachments.removeAttachment}
              />
            }
            toolbarLeft={
              <>
                <input
                  ref={p.fileInputRef}
                  type="file"
                  multiple
                  accept=".pdf,.doc,.docx,.txt,.md,.markdown,.png,.jpg,.jpeg,.webp,text/markdown"
                  className="hidden"
                  onChange={handleFileInputChange}
                />
                <ChatToolbar
                  onFileClick={handleToolbarFileClick}
                  isDeepResearch={p.isDeepResearch}
                  onToggleDeepResearch={handleToggleDeepResearch}
                  drMode={p.drMode}
                  onDrModeChange={p.setDrMode}
                  isThinkingModel={p.isThinkingModel}
                  thinkingEnabled={p.thinkingEnabled}
                  onToggleThinking={handleToggleThinking}
                  onMenuOpenChange={p.setMenuOpen}
                  tools={p.toolItems}
                  selectedToolId={p.selectedToolId}
                  onToolSelect={p.setSelectedToolId}
                  toolsLabel={p.th("tools")}
                  notebooks={p.notebooks}
                  selectedNotebook={p.selectedNotebook}
                  onNotebookSelect={p.setSelectedNotebook}
                  notebookLabel={p.th("notebook")}
                  notebookEmptyLabel={p.tn("empty")}
                  clearNotebookLabel={p.th("clearNotebook")}
                />
              </>
            }
            toolbarRight={
              p.input.length > 0 ? (
                <span className={cn(
                  "text-[11px] tabular-nums transition-colors",
                  p.input.length > 800 ? "text-amber-400/70" : "text-muted-foreground/30",
                )}>
                  {p.input.length}
                </span>
              ) : undefined
            }
          />
        </ChatInputContainer>
      </div>

      <MobileConvSheet
        isOpen={p.convSheetOpen}
        onClose={() => p.setConvSheetOpen(false)}
        conversationList={p.conversationList}
        activeConvId={p.activeConvId}
        hasMoreConversations={p.hasMoreConversations}
        onSelectConv={p.handleSelectConv}
        onNewChat={p.handleNewChat}
        onLoadMore={p.loadMoreConversations}
      />

      <ArtifactPanel artifact={p.artifactState} onClose={() => p.setArtifactState(null)} />

      {/* Deep research right-side drawer */}
      <DrResearchDrawer
        open={p.dr.drawerOpen}
        progress={p.dr.drProgress}
        mode={p.drMode}
        isActive={!!p.dr.drProgress && p.dr.drProgress.status !== "done"}
        onClose={() => p.dr.setDrawerOpen(false)}
        onSaveNote={p.dr.handleSaveAsNote}
        onSaveSources={p.dr.handleSaveSources}
        onFollowUp={(q) => p.chat.handleSend(q)}
        onRate={p.dr.handleDrRate}
        onCopy={p.copy}
        savedMessageId={p.dr.deliverableMessageIdRef.current}
      />

      <DeepResearchSaveNoteDialog
        open={!!p.dr.pendingSaveNoteRequest}
        reportTitle={p.dr.pendingSaveNoteRequest?.title}
        onClose={p.dr.cancelPendingSaveNote}
        onSelectNotebook={p.dr.confirmPendingSaveNote}
      />
    </div>
  );
}
