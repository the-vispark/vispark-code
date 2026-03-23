import { existsSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

function vendorRoot() {
  return fileURLToPath(new URL("../../vendor/vispark-code-harness", import.meta.url))
}

export function ensureVendoredHarness() {
  const targetRoot = vendorRoot()
  const targetCli = path.join(targetRoot, "cli.js")

  if (!existsSync(targetCli)) {
    throw new Error(`Vendored Vispark Code harness not found at ${targetCli}`)
  }

  return targetCli
}
