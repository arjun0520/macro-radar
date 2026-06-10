import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { RunDigestButton } from "@/components/RunDigestButton";

describe("RunDigestButton", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows digest counts after a successful run", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          status: "completed",
          details: { signalCount: 3, sourceItemCount: 12 }
        })
      }))
    );

    render(React.createElement(RunDigestButton));
    fireEvent.click(screen.getByRole("button", { name: /run now/i }));

    await waitFor(() => {
      expect(screen.getByText(/Stored 3 signals from 12 source items/i)).toBeInTheDocument();
    });
  });
});
