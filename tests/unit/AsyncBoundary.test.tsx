/**
 * Unit tests for the slice #18 `AsyncBoundary` and `TableStates`
 * components. The shared shape across both is that they take
 * `(isLoading, error, isEmpty)` and render one of four mutually
 * exclusive states; the tests cover each branch in isolation.
 */
import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

import AsyncBoundary from "@/components/AsyncBoundary";

describe("AsyncBoundary", () => {
  it("renders the error card when error is set, with optional retry", () => {
    const err = new Error("boom");
    render(
      <AsyncBoundary
        isLoading={false}
        error={err}
        isEmpty={false}
        emptyTitle="x"
        emptyBody="y"
      >
        <span data-testid="child" />
      </AsyncBoundary>,
    );
    expect(screen.getByTestId("async-boundary-error")).toBeTruthy();
    expect(screen.queryByTestId("child")).toBeNull();
    // No retry button when onRetry is not provided.
    expect(screen.queryByTestId("async-boundary-retry")).toBeNull();
  });

  it("renders the retry button and calls onRetry when clicked", () => {
    let clicked = 0;
    render(
      <AsyncBoundary
        isLoading={false}
        error={new Error("boom")}
        isEmpty={false}
        emptyTitle="x"
        emptyBody="y"
        onRetry={() => {
          clicked += 1;
        }}
      >
        <span />
      </AsyncBoundary>,
    );
    fireEvent.click(screen.getByTestId("async-boundary-retry"));
    expect(clicked).toBe(1);
  });

  it("renders skeleton rows when isLoading=true", () => {
    render(
      <AsyncBoundary
        isLoading
        error={null}
        isEmpty={false}
        emptyTitle="x"
        emptyBody="y"
        skeletonRows={3}
      >
        <span />
      </AsyncBoundary>,
    );
    expect(screen.getByTestId("async-boundary-loading")).toBeTruthy();
    // 3 skeleton rows.
    expect(
      screen.getByTestId("async-boundary-skeleton-list").children.length,
    ).toBe(3);
  });

  it("renders the empty card when isEmpty=true", () => {
    render(
      <AsyncBoundary
        isLoading={false}
        error={null}
        isEmpty
        emptyTitle="Nothing here"
        emptyBody="Add your first row."
      >
        <span />
      </AsyncBoundary>,
    );
    expect(screen.getByTestId("async-boundary-empty")).toBeTruthy();
    expect(screen.getByText("Nothing here")).toBeTruthy();
  });

  it("prefers error over loading (loading hides errors otherwise)", () => {
    render(
      <AsyncBoundary
        isLoading
        error={new Error("real issue")}
        isEmpty={false}
        emptyTitle="x"
        emptyBody="y"
      >
        <span />
      </AsyncBoundary>,
    );
    // Error must take precedence — we never want a spinner over
    // PERMISSION_DENIED.
    expect(screen.getByTestId("async-boundary-error")).toBeTruthy();
    expect(screen.queryByTestId("async-boundary-loading")).toBeNull();
  });

  it("renders children on success", () => {
    render(
      <AsyncBoundary
        isLoading={false}
        error={null}
        isEmpty={false}
        emptyTitle="x"
        emptyBody="y"
      >
        <span data-testid="happy-child" />
      </AsyncBoundary>,
    );
    expect(screen.getByTestId("async-boundary-content")).toBeTruthy();
    expect(screen.getByTestId("happy-child")).toBeTruthy();
  });
});
