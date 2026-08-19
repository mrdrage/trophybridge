import { expect, test } from "@playwright/test";

test("foundation landing page renders", async ({ page }) => {
  await page.goto("/");

  await expect(page).toHaveTitle(/TrophyBridge/);
  await expect(
    page.getByRole("heading", { name: /PlayStation trophy progress/i }),
  ).toBeVisible();
  await expect(page.getByText("M0 · Foundation in progress")).toBeVisible();
});
