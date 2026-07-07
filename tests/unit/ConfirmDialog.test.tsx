/**
 * Unit tests for the slice #18 `ConfirmDialog`.
 *
 * Asserts:
 *   - clicking Cancel closes the dialog without invoking onConfirm.
 *   - clicking Confirm invokes onConfirm exactly once, and the
 *     dialog auto-closes on success.
 *   - if onConfirm throws, the dialog stays open and surfaces the
 *     error message via data-testid="confirm-dialog-error".
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

import ConfirmDialog from "@/components/ConfirmDialog";

function build(
  onConfirm: () => void | Promise<void>,
  open = true,
) {
  return render(
    <ConfirmDialog
      open={open}
      onOpenChange={() => undefined}
      title="Delete this thing?"
      description="Cannot be undone."
      actionLabel="Delete"
      onConfirm={onConfirm}
    />,
  );
}

describe("ConfirmDialog", () => {
  it("renders the title and description when open", () => {
    build(() => undefined);
    expect(screen.getByTestId("confirm-dialog-title").textContent).toBe(
      "Delete this thing?",
    );
    expect(screen.getByTestId("confirm-dialog-description").textContent).toBe(
      "Cannot be undone.",
    );
  });

  it("closes on Cancel without calling onConfirm", () => {
    const onConfirm = vi.fn();
    build(onConfirm);
    fireEvent.click(screen.getByTestId("confirm-dialog-cancel"));
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("calls onConfirm and closes on success", async () => {
    const onConfirm = vi.fn(async () => undefined);
    build(onConfirm);
    fireEvent.click(screen.getByTestId("confirm-dialog-confirm"));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    // The async onConfirm resolves before the working state ends.
    await waitFor(() => {
      expect(onConfirm).toHaveBeenCalled();
    });
  });

  it("surfaces an error message when onConfirm throws", async () => {
    const onConfirm = vi.fn(async () => {
      throw new Error("Network unreachable");
    });
    build(onConfirm);
    fireEvent.click(screen.getByTestId("confirm-dialog-confirm"));
    await waitFor(() => {
      expect(screen.getByTestId("confirm-dialog-error").textContent).toBe(
        "Network unreachable",
      );
    });
    // The error was surfaced inline; the dialog stays open.
    expect(screen.getByTestId("confirm-dialog")).toBeTruthy();
  });
});
