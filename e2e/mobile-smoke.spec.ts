import { expect, test } from "@playwright/test";

test("mobile login screen renders", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "Macro Radar" })).toBeVisible();
  await expect(page.getByLabel("Password")).toBeVisible();
});
