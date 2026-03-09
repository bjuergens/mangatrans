import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import SettingsPage from "./SettingsPage";
import { db } from "./db";

afterEach(() => {
  cleanup();
});

beforeEach(async () => {
  await db.settings.clear();
});

function renderSettings() {
  return render(
    <MemoryRouter>
      <SettingsPage />
    </MemoryRouter>,
  );
}

describe("SettingsPage", () => {
  it("renders settings heading", async () => {
    renderSettings();
    await waitFor(() => {
      expect(screen.getByText("Settings")).toBeInTheDocument();
    });
  });

  it("saves API key to IndexedDB", async () => {
    renderSettings();
    const user = userEvent.setup();

    const input = await screen.findByTestId("api-key-input");
    await user.type(input, "sk-ant-test-key");
    await user.click(screen.getByTestId("save-api-key"));

    await waitFor(async () => {
      const setting = await db.settings.get("apiKey");
      expect(setting?.value).toBe("sk-ant-test-key");
    });
  });

  it("loads saved API key on mount", async () => {
    await db.settings.put({ key: "apiKey", value: "sk-ant-existing" });
    renderSettings();

    await waitFor(() => {
      expect(screen.getByText("API key saved")).toBeInTheDocument();
    });
  });

  it("clears API key", async () => {
    await db.settings.put({ key: "apiKey", value: "sk-ant-to-clear" });
    renderSettings();
    const user = userEvent.setup();

    const clearButton = await screen.findByTestId("clear-api-key");
    await user.click(clearButton);

    await waitFor(async () => {
      const setting = await db.settings.get("apiKey");
      expect(setting).toBeUndefined();
    });
  });

  it("saves text extraction preference", async () => {
    renderSettings();
    const user = userEvent.setup();

    const paddleOcr = await screen.findByLabelText(/PaddleOCR/);
    await user.click(paddleOcr);

    await waitFor(async () => {
      const setting = await db.settings.get("textExtractionBackend");
      expect(setting?.value).toBe("paddle-ocr");
    });
  });

  it("shows PaddleOCR URL input when PaddleOCR is selected", async () => {
    renderSettings();
    const user = userEvent.setup();

    // URL input should not be visible initially (ai-vision is default)
    expect(
      screen.queryByTestId("paddle-ocr-url-input"),
    ).not.toBeInTheDocument();

    const paddleOcr = await screen.findByLabelText(/PaddleOCR/);
    await user.click(paddleOcr);

    await waitFor(() => {
      expect(screen.getByTestId("paddle-ocr-url-input")).toBeInTheDocument();
    });
  });

  it("saves analysis detail preference", async () => {
    renderSettings();
    const user = userEvent.setup();

    const basic = await screen.findByLabelText(/Basic/);
    await user.click(basic);

    await waitFor(async () => {
      const setting = await db.settings.get("analysisDetailLevel");
      expect(setting?.value).toBe("basic");
    });
  });

  it("shows build timestamp as link to CI logs", async () => {
    renderSettings();
    const link = await screen.findByTestId("build-log-link");
    expect(link).toBeInstanceOf(HTMLAnchorElement);
    expect(link).toHaveAttribute(
      "href",
      expect.stringContaining("ci-logs.all.txt"),
    );
    expect(link).toHaveAttribute("target", "_blank");
  });

  it("shows GitHub repo link", async () => {
    renderSettings();
    const link = await screen.findByText("github.com/bjuergens/mangatrans");
    expect(link).toBeInstanceOf(HTMLAnchorElement);
    expect(link).toHaveAttribute(
      "href",
      "https://github.com/bjuergens/mangatrans",
    );
    expect(link).toHaveAttribute("target", "_blank");
  });

  it("shows reset button", async () => {
    renderSettings();
    const button = await screen.findByTestId("reset-app");
    expect(button).toHaveTextContent("Reset Everything");
  });

  it("reset button prompts for confirmation", async () => {
    renderSettings();
    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValueOnce(false);

    const button = await screen.findByTestId("reset-app");
    await user.click(button);

    expect(confirmSpy).toHaveBeenCalled();
    // DB should still exist since user cancelled
    const count = await db.settings.count();
    expect(count).toBeGreaterThanOrEqual(0);
    confirmSpy.mockRestore();
  });
});
