import { chromium } from "playwright";

const url = process.env.PDFDIFF_URL ?? "http://localhost:5173/";
const browser = await chromium.launch();
const errors = [];

async function check(name, fn) {
  try {
    await fn();
    console.log(`ok  ${name}`);
  } catch (error) {
    errors.push(name);
    console.error(`FAIL ${name}: ${error instanceof Error ? error.message : error}`);
  }
}

const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.setDefaultTimeout(60_000);

await page.goto(url, { waitUntil: "networkidle" });
await check("landing copy", async () => {
  await page.getByRole("heading", { name: /compare pdfs/i }).waitFor();
  await page.getByRole("button", { name: "Contract" }).waitFor();
});

await page.getByRole("button", { name: "Contract" }).click();
await page.locator('section[aria-label="PDF comparison workspace"]').waitFor({ state: "visible" });
await page.locator('section[aria-label="PDF comparison workspace"] img').first().waitFor({ state: "visible" });
await check("workspace after sample", async () => {
  if (!(await page.getByRole("button", { name: "Settings" }).isVisible())) throw new Error("settings missing");
});

await page.getByRole("button", { name: "Settings" }).click();
const settings = page.getByRole("dialog", { name: "Settings" });
await check("settings is a native open dialog", async () => {
  await settings.waitFor({ state: "visible" });
  const tag = await settings.evaluate((node) => ({
    tag: node.tagName,
    open: node instanceof HTMLDialogElement && node.open,
    modal: node instanceof HTMLDialogElement && node.matches(":modal"),
  }));
  if (tag.tag !== "DIALOG" || !tag.open || !tag.modal) throw new Error(JSON.stringify(tag));
  await settings.getByText("Overlay colours").waitFor();
  await settings.getByLabel("Colour for newer content").waitFor();
});
await page.keyboard.press("Escape");
await check("settings closes on Escape", async () => {
  await settings.waitFor({ state: "hidden" });
});

await page.getByRole("button", { name: "Keyboard shortcuts" }).click();
const help = page.getByRole("dialog", { name: "How to compare PDFs" });
await check("help is a native open dialog", async () => {
  await help.waitFor({ state: "visible" });
  const tag = await help.evaluate((node) => ({
    tag: node.tagName,
    open: node instanceof HTMLDialogElement && node.open,
    modal: node instanceof HTMLDialogElement && node.matches(":modal"),
  }));
  if (tag.tag !== "DIALOG" || !tag.open || !tag.modal) throw new Error(JSON.stringify(tag));
  await help.getByRole("heading", { name: "Shortcuts" }).waitFor();
});
await page.keyboard.press("Escape");
await check("help closes on Escape", async () => {
  await help.waitFor({ state: "hidden" });
});

await page.setViewportSize({ width: 390, height: 844 });
await check("mobile still shows settings", async () => {
  await page.getByRole("button", { name: "Settings" }).click();
  await page.getByRole("dialog", { name: "Settings" }).waitFor({ state: "visible" });
  await page.getByRole("button", { name: "Done" }).click();
  await page.getByRole("dialog", { name: "Settings" }).waitFor({ state: "hidden" });
});

await browser.close();
if (errors.length) {
  console.error(`\n${errors.length} failed: ${errors.join(", ")}`);
  process.exit(1);
}
console.log("\nall checks passed");
