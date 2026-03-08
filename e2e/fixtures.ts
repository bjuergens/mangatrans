import { test as base } from "@playwright/test";
import fs from "fs";

export const test = base.extend<{ captureConsole: void }>({
  captureConsole: [
    async ({ page }, use, testInfo) => {
      const messages: string[] = [];
      page.on("console", (msg) => {
        const line = `[${msg.type()}] ${msg.text()}`;
        messages.push(line);
        console.log(`  🌐 ${line}`);
      });

      const start = Date.now();
      console.log(`🧪 START: ${testInfo.title}`);

      await use();

      const elapsed = ((Date.now() - start) / 1000).toFixed(1);
      const status =
        testInfo.status === "passed"
          ? "✅ PASS"
          : `❌ ${testInfo.status?.toUpperCase()}`;
      console.log(`${status}: ${testInfo.title} (${elapsed}s)`);

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
