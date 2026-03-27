import path from "node:path"
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
    `${APP_NAME} client bundle not found. Run \`bun run build\` inside workbench/ first.`,
    { status: 503 }
  )
}
