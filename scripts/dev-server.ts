import process from "node:process"

process.env.VISPARK_RUNTIME_PROFILE = "dev"
process.env.VISPARK_CODE_DISABLE_SELF_UPDATE = "1"

await import("../src/server/cli")
