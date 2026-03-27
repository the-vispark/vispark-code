import process from "node:process"
import {
  fetchLatestPackageVersion,
  installPackageVersion,
  openUrl,
  relaunchCli,
  runCli,
} from "./cli-runtime"
import { startBackgroundSourceSync } from "./source-sync"
import { startVisparkCodeServer } from "./server"

// Read version from package.json at the package root
const pkg = await Bun.file(new URL("../../package.json", import.meta.url)).json()
const VERSION: string = pkg.version ?? "0.0.0"

const result = await runCli(process.argv.slice(2), {
  version: VERSION,
  bunVersion: Bun.version,
  startServer: startVisparkCodeServer,
  fetchLatestVersion: fetchLatestPackageVersion,
  installVersion: installPackageVersion,
  relaunch: relaunchCli,
  openUrl,
  log: console.log,
  warn: console.warn,
})

if (result.kind === "exited") {
  process.exit(result.code)
}

startBackgroundSourceSync()

const shutdown = async () => {
  await result.stop()
  process.exit(0)
}

process.on("SIGINT", () => {
  void shutdown()
})
process.on("SIGTERM", () => {
  void shutdown()
})
