"use client";

import { Node, mergeAttributes } from "@tiptap/core";
import { ReactNodeViewRenderer, NodeViewWrapper, NodeViewContent } from "@tiptap/react";
import { AlertCircle, CheckCircle2, Info, TriangleAlert, X } from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────────

type CalloutType = "info" | "success" | "warning" | "error";

const CALLOUT_CONFIG: Record<CalloutType, {
  icon: React.ElementType;
  label: string;
  bg: string;
  border: string;
  iconColor: string;
  textColor: string;
}> = {
  info: {
    icon: Info,
    label: "信息",
    bg: "bg-sky-500/8",
    border: "border-sky-500/25",
    iconColor: "text-sky-400",
    textColor: "text-sky-100/90",
  },
  success: {
    icon: CheckCircle2,
    label: "提示",
    bg: "bg-emerald-500/8",
    border: "border-emerald-500/25",
    iconColor: "text-emerald-400",
    textColor: "text-emerald-100/90",
  },
  warning: {
    icon: TriangleAlert,
    label: "警告",
    bg: "bg-amber-500/8",
    border: "border-amber-500/25",
    iconColor: "text-amber-400",
    textColor: "text-amber-100/90",
  },
  error: {
    icon: AlertCircle,
    label: "错误",
    bg: "bg-red-500/8",
    border: "border-red-500/25",
    iconColor: "text-red-400",
    textColor: "text-red-100/90",
  },
};

// ── Node View ──────────────────────────────────────────────────────────────────

function CalloutNodeView({ node, deleteNode, updateAttributes }: {
  node: { attrs: { type: CalloutType } };
  deleteNode: () => void;
  updateAttributes: (attrs: Record<string, unknown>) => void;
  selected: boolean;
}) {
  const calloutType = (node.attrs.type as CalloutType) ?? "info";
  const config = CALLOUT_CONFIG[calloutType] ?? CALLOUT_CONFIG.info;
  const Icon = config.icon;

  return (
    <NodeViewWrapper>
      <div
        contentEditable={false}
        className={`group relative my-2 flex gap-3 rounded-[10px] border px-4 py-3 ${config.bg} ${config.border}`}
        data-callout-type={calloutType}
      >
        {/* Icon */}
        <div className="mt-[2px] shrink-0">
          <Icon size={16} className={config.iconColor} />
        </div>

        {/* Content area */}
        <div className="min-w-0 flex-1">
          {/* Type badge */}
          <span className={`mb-1 inline-block text-[11px] font-semibold uppercase tracking-wide opacity-70 ${config.iconColor}`}>
            {config.label}
          </span>
          {/* Editable content */}
          <NodeViewContent
            as="div"
            className={`text-[14px] leading-[1.7] outline-none ${config.textColor} [&>p]:m-0`}
          />
        </div>

        {/* Delete button */}
        <button
          type="button"
          contentEditable={false}
          onClick={deleteNode}
          className="absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded-[4px] text-white/20 opacity-0 transition-all group-hover:opacity-100 hover:bg-white/[0.08] hover:text-white/60"
        >
          <X size={12} />
        </button>

        {/* Type switcher */}
        <div
          contentEditable={false}
          className="absolute bottom-2 right-2 flex gap-1 opacity-0 transition-all group-hover:opacity-100"
        >
          {(Object.keys(CALLOUT_CONFIG) as CalloutType[]).map((t) => {
            const C = CALLOUT_CONFIG[t];
            const CIcon = C.icon;
            return (
              <button
                key={t}
                type="button"
                onClick={() => updateAttributes({ type: t })}
                className={`flex h-5 w-5 items-center justify-center rounded-[4px] transition-all hover:bg-white/[0.1] ${
                  t === calloutType ? "opacity-100" : "opacity-40 hover:opacity-100"
                } ${C.iconColor}`}
                title={C.label}
              >
                <CIcon size={11} />
              </button>
            );
          })}
        </div>
      </div>
    </NodeViewWrapper>
  );
}

// ── Extension ──────────────────────────────────────────────────────────────────

export const CalloutExtension = Node.create({
  name: "callout",
  group: "block",
  content: "block+",
  defining: true,
  isolating: true,

  addAttributes() {
    return {
      type: {
        default: "info",
        parseHTML: (el) => el.getAttribute("data-callout-type") ?? "info",
        renderHTML: (attrs) => ({ "data-callout-type": attrs.type }),
      },
    };
  },

  parseHTML() {
    return [{ tag: "div[data-callout-type]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { class: "callout" }), 0];
  },

  addNodeView() {
    return ReactNodeViewRenderer(
      CalloutNodeView as unknown as Parameters<typeof ReactNodeViewRenderer>[0]
    );
  },

  addKeyboardShortcuts() {
    return {
      // Press Enter at end of empty callout to exit it
      Enter: () => {
        const { selection, doc } = this.editor.state;
        const { $from } = selection;
        // Check if we're in a callout and the paragraph is empty
        if ($from.parent.type.name === "paragraph" && $from.parent.textContent === "") {
          const grandParent = $from.node($from.depth - 1);
          if (grandParent?.type.name === "callout") {
            // Exit the callout by lifting the node
            return this.editor.chain().focus().liftEmptyBlock().run();
          }
        }
        return false;
      },
    };
  },
});
