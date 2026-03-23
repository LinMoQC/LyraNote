import { useCallback, useRef, useState } from "react";
import type { AgentEvent } from "@/services/ai-service";
import type { AgentStep } from "@/types";

export type PendingApproval = {
  approvalId: string;
  toolCalls: Array<{ name: string; arguments: Record<string, unknown> }>;
};

/**
 * Shared hook for agent streaming state used by both the full-screen chat
 * (use-chat-stream.ts) and the copilot sidebar (copilot-panel.tsx).
 *
 * Manages:
 * - agentSteps + agentStepsRef  (live steps during streaming)
 * - pendingApproval             (MCP human-in-the-loop)
 * - handleAgentEvent()          (common SSE event branches)
 * - buildSavedSteps()           (snapshot to persist on stream done)
 * - reset()                     (clear all at stream start)
 *
 * Usage pattern in onAgentEvent:
 *   1. Handle domain-specific events first (with early `return` if needed)
 *   2. Call `handleAgentEvent(event)` at the end — it handles
 *      `human_approve_required` and appends everything else to agentSteps
 */
export function useAgentStreamEvents() {
  const [agentSteps, setAgentSteps] = useState<AgentEvent[]>([]);
  const agentStepsRef = useRef<AgentEvent[]>([]);
  const [pendingApproval, setPendingApproval] = useState<PendingApproval | null>(null);

  const reset = useCallback(() => {
    agentStepsRef.current = [];
    setAgentSteps([]);
    setPendingApproval(null);
  }, []);

  /**
   * Process a common agent event branch.
   * Call this at the end of your `onAgentEvent` after handling domain-specific
   * event types with early returns. This function will:
   * - Handle `human_approve_required` → set pendingApproval (does not append to steps)
   * - Append everything else to agentSteps
   */
  const handleAgentEvent = useCallback((event: AgentEvent) => {
    if (event.type === "human_approve_required") {
      if (event.approval_id && event.tool_calls) {
        setPendingApproval({
          approvalId: event.approval_id,
          toolCalls: event.tool_calls,
        });
      }
      return;
    }
    agentStepsRef.current = [...agentStepsRef.current, event];
    setAgentSteps((prev) => [...prev, event]);
  }, []);

  /**
   * Build the AgentStep[] snapshot to persist on the message when streaming ends.
   * Only includes thought / tool_call / tool_result steps.
   */
  const buildSavedSteps = useCallback((): AgentStep[] =>
    agentStepsRef.current
      .filter(
        (e) => e.type === "thought" || e.type === "tool_call" || e.type === "tool_result"
      )
      .map((e) => ({
        type: e.type as AgentStep["type"],
        content: e.content,
        tool: e.tool,
        input: e.input,
      })),
  []);

  return {
    agentSteps,
    agentStepsRef,
    pendingApproval,
    setPendingApproval,
    handleAgentEvent,
    buildSavedSteps,
    reset,
  };
}
