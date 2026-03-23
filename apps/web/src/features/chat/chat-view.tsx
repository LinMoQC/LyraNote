"use client";

/**
 * @file 独立对话页视图
 * @description 全屏对话界面的布局组件。业务逻辑由 useChatPage 提供，
 *              移动端会话列表由 MobileConvSheet 渲染。
 */

import { AnimatePresence, m } from "framer-motion";
import { useTranslations } from "next-intl";

import { ChatInput, ChatToolbar } from "@/components/chat-input";
import { AttachmentPreviewBar } from "@/components/chat-input/attachment-preview-bar";
import { cn } from "@/lib/utils";
import { DeepResearchProgress } from "@/components/deep-research/deep-research-progress";
import { ChatInputContainer, ChatMessageList } from "@/features/chat/chat-layout";
import { ArtifactPanel } from "@/components/genui";
import { ClarifyingPanel, ClarifyingLoading } from "@/components/deep-research/clarifying-panel";
import { ApprovalCard } from "@/components/message-render/approval-card";
import { approveToolCall } from "@/services/ai-service";

import { ChatEmptyState } from "./chat-empty-state";
import { ChatSidebarPanel } from "./chat-sidebar-panel";
import { ChatMessageBubble } from "./chat-message-bubble";
import { MobileConvSheet } from "./mobile-conv-sheet";
import { useChatPage } from "./use-chat-page";
export function ChatView() {
  const p = useChatPage();
  const t = useTranslations("chat");
  const tc = useTranslations("common");

  return (
    <div className="flex h-full dark:border border-border/40">
      <ChatSidebarPanel
        conversationList={p.conversationList}
        activeConvId={p.activeConvId}
        globalNotebookId={p.globalNotebookId}
        hasMoreConversations={p.hasMoreConversations}
        deletePending={p.deletePending}
        onSelectConv={p.handleSelectConv}
        onNewChat={p.handleNewChat}
        onDeleteConv={p.handleDeleteConv}
        onLoadMore={p.loadMoreConversations}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        {p.messages.length > 0 || p.pendingChatPayload.current || p.pendingAutoSendRef.current ? (
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
                  key={msg.id}
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
              {p.dr.drProgress && (!p.activeConvId || p.activeConvId === p.drConversationId) && (
                <m.div
                  key="dr-progress-live"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="px-4 pb-4"
                >
                  <DeepResearchProgress
                    progress={p.dr.drProgress}
                    onSaveNote={p.dr.handleSaveAsNote}
                    onFollowUp={(q) => p.chat.handleSend(q)}
                    onRate={p.dr.handleDrRate}
                    onCopy={p.copy}
                    savedMessageId={p.dr.deliverableMessageIdRef.current}
                  />
                </m.div>
              )}
            </AnimatePresence>

            <div ref={p.bottomRef} />
          </ChatMessageList>
        ) : (
          <ChatEmptyState
            suggestionsLoading={p.suggestionsLoading}
            dynamicSuggestions={p.dynamicSuggestions}
            onSend={p.chat.handleSend}
          />
        )}

        <AnimatePresence>
          {p.dr.isFetchingClarifications && <ClarifyingLoading />}
          {p.dr.clarifyingState && (
            <ClarifyingPanel
              questions={p.dr.clarifyingState.questions}
              onSubmit={p.dr.submitClarifications}
              onSkip={() => p.dr.submitClarifications({})}
            />
          )}
        </AnimatePresence>

        <ChatInputContainer>
          <ChatInput
            ref={p.chatInputRef}
            value={p.input}
            onChange={p.setInput}
            onSubmit={p.handleSubmit}
            placeholder={p.isDeepResearch ? t("deepResearchPlaceholder") : t("placeholder")}
            disabled={!p.globalNotebookId || p.fileAttachments.isUploading || !!p.dr.clarifyingState || p.dr.isFetchingClarifications}
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
                  accept=".pdf,.doc,.docx,.txt,.png,.jpg,.jpeg,.webp"
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files && e.target.files.length > 0) {
                      p.fileAttachments.addFiles(e.target.files);
                    }
                    e.target.value = "";
                  }}
                />
                <ChatToolbar
                  onFileClick={() => p.fileInputRef.current?.click()}
                  isDeepResearch={p.isDeepResearch}
                  onToggleDeepResearch={() => p.setIsDeepResearch((v: boolean) => !v)}
                  drMode={p.drMode}
                  onDrModeChange={p.setDrMode}
                  isThinkingModel={p.isThinkingModel}
                  thinkingEnabled={p.thinkingEnabled}
                  onToggleThinking={() => p.setThinkingEnabled((v: boolean) => !v)}
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
                  clearNotebookLabel="清除笔记本限制"
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
    </div>
  );
}
