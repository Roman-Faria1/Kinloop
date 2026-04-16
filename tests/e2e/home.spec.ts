import { expect, test } from "@playwright/test";

test("renders the landing page and demo pod workspace", async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: /family coordination layer/i }),
  ).toBeVisible();
  await page.getByRole("link", { name: /open the demo pod/i }).click();
  await page.waitForURL("**/pod/pod-sunrise");
  await expect(
    page.getByRole("heading", { name: /sunrise family keeps plans visible/i }),
  ).toBeVisible();
});
