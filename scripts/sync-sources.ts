import { syncSources } from "../src/server/source-sync"

const result = syncSources()

if (!result) {
  console.log("Source sync is disabled.")
  process.exit(0)
}

console.log(`Source sync config: ${result.configPath}`)
if (result.changedSources.length === 0) {
  console.log("No new source commits detected.")
} else {
  console.log(`Updated hidden mirrors: ${result.changedSources.join(", ")}`)
}
