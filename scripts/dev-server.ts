import process from "node:process"

process.env.VISPARK_RUNTIME_PROFILE = "dev"
process.env["VISPARK-CODE_DISABLE_SELF_UPDATE"] = "1"

await import("../src/server/cli")
