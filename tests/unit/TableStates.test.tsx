/**
 * Unit tests for `TableStates`.
 *
 * The three states (error / loading / empty) each render a single
 * full-width <td>. We just assert the testid is present so e2e &
 * other vitest specs can rely on a stable hook.
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";

import TableStates from "@/components/TableStates";

describe("TableStates", () => {
  it("renders the error row when error is set", () => {
    render(
      <table>
        <tbody>
          <TableStates
            isLoading={false}
            error={new Error("nope")}
            isEmpty={false}
            colSpan={6}
            emptyTitle="x"
          />
        </tbody>
      </table>,
    );
    expect(screen.getByTestId("table-state-error")).toBeTruthy();
  });

  it("renders the loading row when isLoading=true", () => {
    render(
      <table>
        <tbody>
          <TableStates
            isLoading
            error={null}
            isEmpty={false}
            colSpan={6}
            emptyTitle="x"
          />
        </tbody>
      </table>,
    );
    expect(screen.getByTestId("table-state-loading")).toBeTruthy();
  });

  it("renders the empty row when isEmpty=true", () => {
    render(
      <table>
        <tbody>
          <TableStates
            isLoading={false}
            error={null}
            isEmpty
            colSpan={6}
            emptyTitle="Nothing yet"
            emptyHint="Add a row."
          />
        </tbody>
      </table>,
    );
    expect(screen.getByTestId("table-state-empty")).toBeTruthy();
    expect(screen.getByText("Nothing yet")).toBeTruthy();
  });

  it("renders nothing on the happy path", () => {
    const { container } = render(
      <table>
        <tbody>
          <TableStates
            isLoading={false}
            error={null}
            isEmpty={false}
            colSpan={6}
            emptyTitle="x"
          />
        </tbody>
      </table>,
    );
    expect(container.querySelector("tr")).toBeNull();
  });
});
