import { expect, test } from "@playwright/test";

test("renders the landing page and demo pod workspace", async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: /family coordination layer/i }),
  ).toBeVisible();

  const primaryAction = page.getByRole("link", {
    name: /open the demo pod|sign in with email|open your pod/i,
  });

  await expect(primaryAction).toBeVisible();
  const actionLabel = await primaryAction.innerText();

  await primaryAction.click();

  if (/open the demo pod/i.test(actionLabel)) {
    await page.waitForURL("**/pod/pod-sunrise");
    await expect(
      page.getByRole("heading", { name: /sunrise family keeps plans visible/i }),
    ).toBeVisible();
    return;
  }

  await page.waitForURL("**/sign-in");
  await expect(
    page.getByRole("heading", { name: /sign in with a magic link/i }),
  ).toBeVisible();
});
