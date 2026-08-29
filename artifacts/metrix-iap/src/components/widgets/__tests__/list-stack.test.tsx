// ListStack — the pile contract. The load-bearing claims: hidden items
// are genuinely unmounted (not visually hidden) while stacked, the face
// states the exact hidden count as ONE text node (TaskTray's History
// tests match the literal "History (N)" string), fan-out mounts them,
// and restack unmounts them synchronously — a delayed exit would leave
// "hidden" items findable after the reader stacked them away.

import { describe, it, expect } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { ListStack } from "../ListStack";

const ITEMS = ["Alpha", "Bravo", "Charlie", "Delta", "Echo"];

function renderStack(items: string[], visible = 0) {
  return render(
    <ListStack
      items={items}
      visible={visible}
      itemKey={(s) => s}
      renderItem={(s) => <div>{s}</div>}
      faceLabel={(n) => `History (${n})`}
      data-testid="stack"
    />,
  );
}

describe("ListStack", () => {
  it("piles everything behind the face when visible=0, and fans out on click", () => {
    renderStack(ITEMS);
    const face = screen.getByTestId("stack-face");
    expect(face.textContent).toContain("History (5)");
    expect(face.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByText("Alpha")).toBeNull();

    fireEvent.click(face);
    expect(face.getAttribute("aria-expanded")).toBe("true");
    for (const s of ITEMS) expect(screen.getByText(s)).toBeTruthy();
  });

  it("restacking unmounts the fanned items synchronously", () => {
    renderStack(ITEMS);
    const face = screen.getByTestId("stack-face");
    fireEvent.click(face);
    expect(screen.getByText("Echo")).toBeTruthy();
    fireEvent.click(face);
    expect(screen.queryByText("Echo")).toBeNull();
    expect(face.getAttribute("aria-expanded")).toBe("false");
  });

  it("keeps the first `visible` items permanently mounted above the pile", () => {
    renderStack(ITEMS, 3);
    const stack = screen.getByTestId("stack");
    expect(within(stack).getByText("Alpha")).toBeTruthy();
    expect(within(stack).getByText("Bravo")).toBeTruthy();
    expect(within(stack).getByText("Charlie")).toBeTruthy();
    expect(within(stack).queryByText("Delta")).toBeNull();
    // Only the overflow is counted on the face — never the visible lead.
    expect(screen.getByTestId("stack-face").textContent).toContain("History (2)");
  });

  it("piles a single overflow item too — a disclosure of one is still a disclosure", () => {
    renderStack(["Alpha", "Bravo", "Charlie", "Delta"], 3);
    const face = screen.getByTestId("stack-face");
    expect(face.textContent).toContain("History (1)");
    expect(screen.queryByText("Delta")).toBeNull();
    fireEvent.click(face);
    expect(screen.getByText("Delta")).toBeTruthy();
  });

  it("renders no face at all when nothing overflows", () => {
    renderStack(["Alpha", "Bravo"], 3);
    expect(screen.getByText("Alpha")).toBeTruthy();
    expect(screen.getByText("Bravo")).toBeTruthy();
    expect(screen.queryByTestId("stack-face")).toBeNull();
  });
});
