import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { NotebookTOC } from "@/features/notebook/notebook-toc";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

function buildEditor() {
  const scrollParent = document.createElement("div");
  scrollParent.scrollTop = 120;
  Object.defineProperty(scrollParent, "scrollHeight", {
    value: 1000,
    configurable: true,
  });
  Object.defineProperty(scrollParent, "clientHeight", {
    value: 400,
    configurable: true,
  });
  Object.defineProperty(scrollParent, "scrollTo", {
    value: vi.fn(),
    configurable: true,
  });

  const editorDom = document.createElement("div");
  Object.defineProperty(editorDom, "closest", {
    value: vi.fn(() => scrollParent),
  });
  Object.defineProperty(editorDom, "getBoundingClientRect", {
    value: () => ({ top: 0 }),
  });

  const headingOne = document.createElement("h1");
  headingOne.textContent = "Intro";
  Object.defineProperty(headingOne, "getBoundingClientRect", {
    value: () => ({ top: 80 }),
  });

  const headingTwo = document.createElement("h2");
  headingTwo.textContent = "Details";
  Object.defineProperty(headingTwo, "getBoundingClientRect", {
    value: () => ({ top: 220 }),
  });

  editorDom.appendChild(headingOne);
  editorDom.appendChild(headingTwo);

  return {
    on: vi.fn(),
    off: vi.fn(),
    state: {
      doc: {
        descendants: (cb: (node: { type: { name: string }; textContent: string; attrs: { level: number } }, pos: number) => void) => {
          cb({ type: { name: "heading" }, textContent: "Intro", attrs: { level: 1 } }, 1);
          cb({ type: { name: "heading" }, textContent: "Details", attrs: { level: 2 } }, 2);
        },
      },
    },
    view: {
      dom: editorDom,
    },
  };
}

describe("NotebookTOC", () => {
  it("renders the sheet variant and closes after navigation", () => {
    const onNavigate = vi.fn();
    const editor = buildEditor();

    render(<NotebookTOC editor={editor as never} variant="sheet" onNavigate={onNavigate} />);

    expect(screen.getByTestId("notebook-toc-sheet")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Details/i }));

    expect(editor.view.dom.closest(".overflow-y-auto")?.scrollTo).toHaveBeenCalled();
    expect(onNavigate).toHaveBeenCalled();
  });
});
