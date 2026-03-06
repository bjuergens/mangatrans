import { test as base } from "@playwright/test";
import fs from "fs";

export const test = base.extend<{ captureConsole: void }>({
  captureConsole: [
    async ({ page }, use, testInfo) => {
      const messages: string[] = [];
      page.on("console", (msg) => {
        messages.push(`[${msg.type()}] ${msg.text()}`);
      });

      await use();

      const logPath = testInfo.outputPath("console.txt");
      await fs.promises.writeFile(logPath, messages.join("\n"));
      if (messages.length > 0) {
        await testInfo.attach("browser-console", {
          path: logPath,
          contentType: "text/plain",
        });
      }
    },
    { auto: true },
  ],
});
