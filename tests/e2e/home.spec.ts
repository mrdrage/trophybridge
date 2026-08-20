import { expect, test } from "@playwright/test";

test("hardened landing page renders", async ({ page, request }) => {
  const response = await page.goto("/");
  expect(response).not.toBeNull();
  expect(response?.headers()["x-frame-options"]).toBe("DENY");
  expect(response?.headers()["x-content-type-options"]).toBe("nosniff");
  expect(response?.headers()["referrer-policy"]).toBe("no-referrer");
  expect(response?.headers()["content-security-policy"]).toContain("frame-ancestors 'none'");

  await expect(page).toHaveTitle(/TrophyBridge/);
  await expect(
    page.getByRole("heading", { name: /PlayStation trophy progress/i }),
  ).toBeVisible();
  await expect(page.getByText("M10 · Release hardened")).toBeVisible();
  await expect(page.getByRole("link", { name: "Apri dashboard" })).toBeVisible();

  const robotsMeta = page.locator('meta[name="robots"]');
  await expect(robotsMeta).toHaveAttribute("content", /noindex/i);

  const robots = await request.get("/robots.txt");
  expect(robots.ok()).toBe(true);
  expect(await robots.text()).toContain("Disallow: /");
});
