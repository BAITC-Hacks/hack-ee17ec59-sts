import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

execFileSync("git", ["config", "core.hooksPath", ".githooks"], {
  cwd: fileURLToPath(new URL("..", import.meta.url)), stdio: "inherit",
});
console.log("pre-push: npm run lint && npm test");
