import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";

describe("App", () => {
  beforeEach(() => {
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:test-video");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
  });

  it("renders the synchronized player shell", () => {
    render(<App />);

    expect(screen.getByRole("heading", { name: "Couples Player" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "同步状态" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /选择视频/ })).toBeInTheDocument();
  });

  it("adds local files to the playlist", async () => {
    const user = userEvent.setup();
    render(<App />);

    const file = new File(["video"], "Show.S01E01.mp4", {
      type: "video/mp4",
      lastModified: 123
    });

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(input, file);

    expect(screen.getAllByText("Show.S01E01.mp4").length).toBeGreaterThan(0);
    expect(screen.getByText(/(?:quick|seg256):/)).toBeInTheDocument();
  });

  it("updates subtitle offset controls", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "+100" }));

    expect(screen.getByText("100 ms")).toBeInTheDocument();
  });
});
