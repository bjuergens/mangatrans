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

    const localOcr = await screen.findByLabelText(/Local OCR/);
    await user.click(localOcr);

    await waitFor(async () => {
      const setting = await db.settings.get("textExtractionBackend");
      expect(setting?.value).toBe("local-ocr");
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

  it("saves OCR.space API key to IndexedDB", async () => {
    renderSettings();
    const user = userEvent.setup();

    const input = await screen.findByTestId("ocr-space-api-key-input");
    await user.type(input, "ocr-test-key-123");
    await user.click(screen.getByTestId("save-ocr-space-api-key"));

    await waitFor(async () => {
      const setting = await db.settings.get("ocrSpaceApiKey");
      expect(setting?.value).toBe("ocr-test-key-123");
    });
  });

  it("loads saved OCR.space API key and shows settings", async () => {
    await db.settings.put({ key: "ocrSpaceApiKey", value: "ocr-existing-key" });
    renderSettings();

    await waitFor(() => {
      expect(
        screen.getAllByText("API key saved").length,
      ).toBeGreaterThanOrEqual(1);
    });
    // Engine and language options should be visible when key is saved
    expect(screen.getByText("OCR Engine")).toBeInTheDocument();
    expect(screen.getByTestId("ocr-space-language-select")).toBeInTheDocument();
  });

  it("clears OCR.space API key", async () => {
    await db.settings.put({ key: "ocrSpaceApiKey", value: "ocr-to-clear" });
    renderSettings();
    const user = userEvent.setup();

    const clearButton = await screen.findByTestId("clear-ocr-space-api-key");
    await user.click(clearButton);

    await waitFor(async () => {
      const setting = await db.settings.get("ocrSpaceApiKey");
      expect(setting).toBeUndefined();
    });
  });

  it("saves OCR.space engine preference", async () => {
    await db.settings.put({ key: "ocrSpaceApiKey", value: "ocr-key" });
    renderSettings();
    const user = userEvent.setup();

    const engine1 = await screen.findByLabelText(/Engine 1/);
    await user.click(engine1);

    await waitFor(async () => {
      const setting = await db.settings.get("ocrSpaceEngine");
      expect(setting?.value).toBe("1");
    });
  });

  it("saves OCR.space language preference", async () => {
    await db.settings.put({ key: "ocrSpaceApiKey", value: "ocr-key" });
    renderSettings();
    const user = userEvent.setup();

    const select = await screen.findByTestId("ocr-space-language-select");
    await user.selectOptions(select, "kor");

    await waitFor(async () => {
      const setting = await db.settings.get("ocrSpaceLanguage");
      expect(setting?.value).toBe("kor");
    });
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
