import { test as setup } from "@playwright/test";
import { LoginPage } from "./pages/LoginPage";

setup("log in through the real demo form", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("lifeos-onboarded", "true"));
  await new LoginPage(page).login();
  await page.context().storageState({ path: "e2e/.auth/demo.json" });
});
