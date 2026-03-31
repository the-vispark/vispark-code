import path from "node:path"
import type { ChatAttachment } from "../shared/types"
import { APP_NAME, LOG_PREFIX } from "../shared/branding"
import { DEV_CLIENT_PORT } from "../shared/ports"
import { AppSettingsStore } from "./app-settings"
import { EventStore } from "./event-store"
import { AgentCoordinator } from "./agent"
import { generateTitleForChat } from "./generate-title"
import { getHarnessRuntimeInfo } from "./harness-sdk"
import { discoverProjects, type DiscoveredProject } from "./discovery"
import { FileTreeManager } from "./file-tree-manager"
import { KeybindingsManager } from "./keybindings"
import { getMachineDisplayName } from "./machine-name"
import { TerminalManager } from "./terminal-manager"
import { ensureVendoredHarness } from "./vendor-harness"
import { VisionProxyServer } from "./vision-proxy"
import { createWsRouter, type ClientState } from "./ws-router"
import { clearSourceSyncData } from "./source-sync"
import { deleteProjectUpload, inferAttachmentContentType, persistProjectUpload } from "./uploads"
import { getProjectUploadDir } from "./paths"

const MAX_UPLOAD_FILE_SIZE_BYTES = 25 * 1024 * 1024

export async function persistUploadedFiles(args: {
  projectId: string
  localPath: string
  files: File[]
  persistUpload?: typeof persistProjectUpload
}): Promise<ChatAttachment[]> {
  const persistUpload = args.persistUpload ?? persistProjectUpload
  const attachments: ChatAttachment[] = []

  try {
    for (const file of args.files) {
      if (file.size > MAX_UPLOAD_FILE_SIZE_BYTES) {
        const error = new Error(`File "${file.name}" exceeds the 25 MB limit.`)
        ;(error as Error & { status?: number }).status = 413
        throw error
      }

      const bytes = new Uint8Array(await file.arrayBuffer())
      const attachment = await persistUpload({
        projectId: args.projectId,
        localPath: args.localPath,
        fileName: file.name,
        bytes,
        fallbackMimeType: file.type || undefined,
      })
      attachments.push(attachment)
    }

    return attachments
  } catch (error) {
    await Promise.all(attachments.map((attachment) => (
      deleteProjectUpload({
        localPath: args.localPath,
        storedName: path.basename(attachment.absolutePath),
      }).catch(() => false)
    )))
    throw error
  }
}

function jsonResponse(body: unknown, init?: ResponseInit) {
  return Response.json(body, init)
}

function extractStoredUploadName(pathname: string, prefix: string, suffix = "") {
  if (!pathname.startsWith(prefix) || (suffix && !pathname.endsWith(suffix))) {
    return null
  }

  const encoded = pathname.slice(prefix.length, suffix ? -suffix.length : undefined)
  if (!encoded) return null

  const storedName = decodeURIComponent(encoded)
  if (!storedName || storedName.includes("/") || storedName.includes("\\") || storedName === "." || storedName === "..") {
    return null
  }

  return storedName
}

export interface StartVisparkCodeServerOptions {
  port?: number
  host?: string
  strictPort?: boolean
}

export async function startVisparkCodeServer(options: StartVisparkCodeServerOptions = {}) {
  const port = options.port ?? 3210
  const hostname = options.host ?? "127.0.0.1"
  const strictPort = options.strictPort ?? false
  const devClientPort = Number.parseInt(process.env.VISPARK_DEV_CLIENT_PORT ?? "", 10)
  const devClientOrigin = Number.isFinite(devClientPort) ? `http://localhost:${devClientPort || DEV_CLIENT_PORT}` : null
  ensureVendoredHarness()
  const harnessRuntime = getHarnessRuntimeInfo()
  const settings = new AppSettingsStore()
  const store = new EventStore()
  const machineDisplayName = getMachineDisplayName()
  await store.initialize()
  settings.initialize()
  let discoveredProjects: DiscoveredProject[] = []
  const visionProxy = new VisionProxyServer(settings)
  const proxyBaseUrl = await visionProxy.start()
  
  // Set the environment variables exactly as the harness expects them.
  // VISPARK_CODE_REMOTE is critical to bypass internal "Not logged in" crashes.
  process.env.VISPARK_CODE_REMOTE = "true"
  process.env.Vispark_BASE_URL = proxyBaseUrl
  process.env.Vispark_API_KEY = "vispark-code-local-proxy"
  process.env.VISPARK_BASE_URL = proxyBaseUrl
  process.env.VISPARK_API_KEY = "vispark-code-local-proxy"

  if (harnessRuntime.source === "env" && harnessRuntime.path && !harnessRuntime.exists) {
    console.warn(
      `${LOG_PREFIX} configured harness was not found at ${harnessRuntime.path} (${harnessRuntime.envVar})`
    )
  } else if (harnessRuntime.path) {
    console.log(`${LOG_PREFIX} using ${harnessRuntime.source} harness at ${harnessRuntime.path}`)
  }
  console.log(`${LOG_PREFIX} routing harness traffic through ${proxyBaseUrl}`)

  async function refreshDiscovery() {
    discoveredProjects = discoverProjects()
    return discoveredProjects
  }

  await refreshDiscovery()

  let server: ReturnType<typeof Bun.serve<ClientState>>
  let router: ReturnType<typeof createWsRouter>
  const terminals = new TerminalManager()
  const keybindings = new KeybindingsManager()
  await keybindings.initialize()
  const fileTree = new FileTreeManager({
    getProject: (projectId) => store.getProject(projectId),
  })
  const agent = new AgentCoordinator({
    store,
    onStateChange: () => {
      router.broadcastSnapshots()
    },
    generateTitle: (messageContent, cwd) =>
      generateTitleForChat(messageContent, cwd, {
        apiKey: settings.getSnapshot().visionApiKey,
      }),
  })
  router = createWsRouter({
    store,
    settings,
    agent,
    terminals,
    keybindings,
    fileTree,
    refreshDiscovery,
    getDiscoveredProjects: () => discoveredProjects,
    machineDisplayName,
    clearCachedSourceData: clearSourceSyncData,
  })

  const distDir = path.join(import.meta.dir, "..", "..", "dist", "client")

  const MAX_PORT_ATTEMPTS = 20
  let actualPort = port

  for (let attempt = 0; attempt < MAX_PORT_ATTEMPTS; attempt++) {
    try {
      server = Bun.serve<ClientState>({
        port: actualPort,
        hostname,
        fetch(req, serverInstance) {
          const url = new URL(req.url)

          if (url.pathname === "/ws") {
            const upgraded = serverInstance.upgrade(req, {
              data: {
                subscriptions: new Map(),
              },
            })
            return upgraded ? undefined : new Response("WebSocket upgrade failed", { status: 400 })
          }

          if (url.pathname === "/health") {
            return Response.json({ ok: true, port: actualPort })
          }

          const uploadBatchMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/uploads$/)
          if (uploadBatchMatch) {
            const project = store.getProject(uploadBatchMatch[1] ?? "")
            if (!project) {
              return jsonResponse({ error: "Project not found." }, { status: 404 })
            }

            if (req.method !== "POST") {
              return new Response(null, {
                status: 405,
                headers: {
                  Allow: "POST",
                },
              })
            }

            return (async () => {
              try {
                const formData = await req.formData()
                const files = formData
                  .getAll("files")
                  .filter((value): value is File => value instanceof File)

                if (files.length === 0) {
                  return jsonResponse({ error: "Attach at least one file." }, { status: 400 })
                }

                const attachments = await persistUploadedFiles({
                  projectId: project.id,
                  localPath: project.localPath,
                  files,
                })

                return jsonResponse({ attachments })
              } catch (error) {
                const status = error instanceof Error && "status" in error && typeof (error as { status?: unknown }).status === "number"
                  ? (error as { status: number }).status
                  : 500
                const message = error instanceof Error ? error.message : "Upload failed."
                return jsonResponse({ error: message }, { status })
              }
            })()
          }

          const uploadContentMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/uploads\/(.+)\/content$/)
          if (uploadContentMatch) {
            const project = store.getProject(uploadContentMatch[1] ?? "")
            if (!project) {
              return jsonResponse({ error: "Project not found." }, { status: 404 })
            }

            if (req.method !== "GET") {
              return new Response(null, {
                status: 405,
                headers: {
                  Allow: "GET",
                },
              })
            }

            const storedName = extractStoredUploadName(
              url.pathname,
              `/api/projects/${project.id}/uploads/`,
              "/content"
            )
            if (!storedName) {
              return jsonResponse({ error: "Attachment not found." }, { status: 404 })
            }

            const file = Bun.file(path.join(getProjectUploadDir(project.localPath), storedName))
            return (async () => {
              if (!(await file.exists())) {
                return jsonResponse({ error: "Attachment not found." }, { status: 404 })
              }

              return new Response(file, {
                headers: {
                  "Content-Type": inferAttachmentContentType(storedName, file.type || undefined),
                },
              })
            })()
          }

          const uploadDeleteMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/uploads\/(.+)$/)
          if (uploadDeleteMatch) {
            const project = store.getProject(uploadDeleteMatch[1] ?? "")
            if (!project) {
              return jsonResponse({ error: "Project not found." }, { status: 404 })
            }

            if (req.method !== "DELETE") {
              return new Response(null, {
                status: 405,
                headers: {
                  Allow: "DELETE",
                },
              })
            }

            const storedName = extractStoredUploadName(
              url.pathname,
              `/api/projects/${project.id}/uploads/`
            )
            if (!storedName) {
              return jsonResponse({ error: "Attachment not found." }, { status: 404 })
            }

            return (async () => {
              const deleted = await deleteProjectUpload({
                localPath: project.localPath,
                storedName,
              })
              if (!deleted) {
                return jsonResponse({ error: "Attachment not found." }, { status: 404 })
              }

              return jsonResponse({ ok: true })
            })()
          }

          if (devClientOrigin) {
            return Response.redirect(`${devClientOrigin}${url.pathname}${url.search}`, 307)
          }

          return serveStatic(distDir, url.pathname)
        },
        websocket: {
          open(ws) {
            router.handleOpen(ws)
          },
          message(ws, raw) {
            router.handleMessage(ws, raw)
          },
          close(ws) {
            router.handleClose(ws)
          },
        },
      })
      break
    } catch (err: unknown) {
      const isAddrInUse =
        err instanceof Error && "code" in err && (err as NodeJS.ErrnoException).code === "EADDRINUSE"
      if (!isAddrInUse || strictPort || attempt === MAX_PORT_ATTEMPTS - 1) {
        throw err
      }
      console.log(`Port ${actualPort} is in use, trying ${actualPort + 1}...`)
      actualPort++
    }
  }

  const shutdown = async () => {
    for (const chatId of [...agent.activeTurns.keys()]) {
      await agent.cancel(chatId)
    }
    router.dispose()
    keybindings.dispose()
    fileTree.dispose()
    terminals.closeAll()
    await visionProxy.stop()
    await store.compact()
    server.stop(true)
  }

  return {
    port: actualPort,
    store,
    stop: shutdown,
  }
}

export const startVisparkCodeServer = startVisparkCodeServer

async function serveStatic(distDir: string, pathname: string) {
  const requestedPath = pathname === "/" ? "/index.html" : pathname
  const filePath = path.join(distDir, requestedPath)
  const indexPath = path.join(distDir, "index.html")

  const file = Bun.file(filePath)
  if (await file.exists()) {
    return new Response(file)
  }

  const indexFile = Bun.file(indexPath)
  if (await indexFile.exists()) {
    return new Response(indexFile, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
      },
    })
  }

  return new Response(
    `${APP_NAME} client bundle not found. Reinstall the package, or if you're running from source, run \`bun run build\` in the package root first.`,
    { status: 503 }
  )
}
