import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

interface GhostState {
  suggestion: string;
  pos: number;
}

const ghostTextKey = new PluginKey<GhostState | null>("ghostText");

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    ghostText: {
      setGhostSuggestion: (suggestion: string, pos: number) => ReturnType;
      clearGhostSuggestion: () => ReturnType;
      insertGhostSuggestion: () => ReturnType;
    };
  }
}

export const GhostText = Extension.create({
  name: "ghostText",

  addCommands() {
    return {
      setGhostSuggestion:
        (suggestion: string, pos: number) =>
        ({ dispatch, tr }) => {
          if (dispatch) {
            dispatch(tr.setMeta(ghostTextKey, { suggestion, pos }));
          }
          return true;
        },

      clearGhostSuggestion:
        () =>
        ({ dispatch, tr }) => {
          if (dispatch) {
            dispatch(tr.setMeta(ghostTextKey, null));
          }
          return true;
        },

      insertGhostSuggestion:
        () =>
        ({ dispatch, tr, editor }) => {
          const state = ghostTextKey.getState(editor.state);
          if (!state?.suggestion) return false;
          if (dispatch) {
            tr.insertText(state.suggestion, state.pos);
            tr.setMeta(ghostTextKey, null);
            dispatch(tr);
          }
          return true;
        },
    };
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: ghostTextKey,

        state: {
          init: (): GhostState | null => null,
          apply(tr, prev): GhostState | null {
            const meta = tr.getMeta(ghostTextKey) as GhostState | null | undefined;
            if (meta === null) return null;
            if (meta !== undefined) return meta;
            // Clear ghost text when user types (doc changes) or moves cursor
            if (tr.docChanged || tr.selectionSet) return null;
            return prev;
          },
        },

        props: {
          decorations(state) {
            const pluginState = ghostTextKey.getState(state);
            if (!pluginState?.suggestion) return DecorationSet.empty;

            const { suggestion, pos } = pluginState;
            const dom = document.createElement("span");
            dom.className = "ghost-text";
            dom.textContent = suggestion;

            return DecorationSet.create(state.doc, [
              Decoration.widget(pos, dom, { side: 1, key: "ghost-text" }),
            ]);
          },

          handleKeyDown(view, event) {
            const pluginState = ghostTextKey.getState(view.state);
            if (!pluginState?.suggestion) return false;

            if (event.key === "Tab") {
              event.preventDefault();
              const { tr } = view.state;
              tr.insertText(pluginState.suggestion, pluginState.pos);
              tr.setMeta(ghostTextKey, null);
              view.dispatch(tr);
              return true;
            }

            if (event.key === "Escape") {
              const { tr } = view.state;
              tr.setMeta(ghostTextKey, null);
              view.dispatch(tr);
              return true;
            }

            return false;
          },
        },
      }),
    ];
  },
});
