import { cpSync, mkdirSync, renameSync, rmSync } from "node:fs";

rmSync("bundle", { recursive: true, force: true });
cpSync("dist", "bundle", { recursive: true });
mkdirSync("bundle/.brydio", { recursive: true });
renameSync("bundle/app.json", "bundle/.brydio/app.json");
