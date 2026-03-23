import { query } from "./harness-sdk"

type JsonSchema = {
  type: "object"
  properties: Record<string, unknown>
  required?: readonly string[]
  additionalProperties?: boolean
}

export interface StructuredQuickResponseArgs<T> {
  cwd: string
  task: string
  prompt: string
  schema: JsonSchema
  parse: (value: unknown) => T | null
}

interface QuickResponseAdapterArgs {
  runStructured?: (args: Omit<StructuredQuickResponseArgs<unknown>, "parse">) => Promise<unknown | null>
}

const STRUCTURED_RESPONSE_TIMEOUT_MS = 8_000

async function runStructured(args: Omit<StructuredQuickResponseArgs<unknown>, "parse">): Promise<unknown | null> {
  const q = query({
    prompt: args.prompt,
    options: {
      cwd: args.cwd,
      model: "vispark/vision-small",
      tools: [],
      systemPrompt: "",
      permissionMode: "bypassPermissions",
      outputFormat: {
        type: "json_schema",
        schema: args.schema,
      },
      env: { ...process.env },
    },
  })

  try {
    return await new Promise<unknown | null>((resolve) => {
      let settled = false

      const finish = (value: unknown | null) => {
        if (settled) return
        settled = true
        resolve(value)
      }

      const timeoutId = setTimeout(() => {
        q.close()
        finish(null)
      }, STRUCTURED_RESPONSE_TIMEOUT_MS)

      void (async () => {
        try {
          for await (const message of q) {
            if ("result" in message) {
              clearTimeout(timeoutId)
              finish((message as Record<string, unknown>).structured_output ?? null)
              return
            }
          }

          clearTimeout(timeoutId)
          finish(null)
        } catch {
          clearTimeout(timeoutId)
          finish(null)
        }
      })()
    })
  } finally {
    q.close()
  }
}

export class QuickResponseAdapter {
  private readonly runStructured: (args: Omit<StructuredQuickResponseArgs<unknown>, "parse">) => Promise<unknown | null>

  constructor(args: QuickResponseAdapterArgs = {}) {
    this.runStructured = args.runStructured ?? runStructured
  }

  async generateStructured<T>(args: StructuredQuickResponseArgs<T>): Promise<T | null> {
    return await this.tryProvider(args.parse, () => this.runStructured({
      cwd: args.cwd,
      task: args.task,
      prompt: args.prompt,
      schema: args.schema,
    }))
  }

  private async tryProvider<T>(
    parse: (value: unknown) => T | null,
    run: () => Promise<unknown | null>
  ): Promise<T | null> {
    try {
      const result = await run()
      return result === null ? null : parse(result)
    } catch {
      return null
    }
  }
}
