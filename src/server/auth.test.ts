import { afterEach, describe, expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { startVisparkCodeServer } from "./server"
import { persistProjectUpload } from "./uploads"

const tempDirs: string[] = []

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

async function startPasswordServer(options: { trustProxy?: boolean } = {}) {
  const projectDir = await mkdtemp(path.join(tmpdir(), "vispark-code-auth-test-"))
  tempDirs.push(projectDir)
  const server = await startVisparkCodeServer({
    port: 4320,
    strictPort: true,
    password: "secret",
    trustProxy: options.trustProxy,
  })
  const project = await server.store.openProject(projectDir, "Project")
  return { server, projectDir, project }
}

function extractCookie(response: Response) {
  const header = response.headers.get("set-cookie")
  expect(header).toBeTruthy()
  return header!.split(";", 1)[0]
}

async function login(server: { port: number }, init: { password?: string; next?: string; origin?: string; headers?: HeadersInit } = {}) {
  const { password = "secret", next = "/", origin = `http://localhost:${server.port}`, headers } = init
  return fetch(`http://localhost:${server.port}/auth/login`, {
    method: "POST",
    body: JSON.stringify({ password, next }),
    headers: {
      "Content-Type": "application/json",
      Origin: origin,
      ...headers,
    },
  })
}

describe("password auth", () => {
  test("redirects unauthenticated html requests to the login page", async () => {
    const { server } = await startPasswordServer()

    try {
      const response = await fetch(`http://localhost:${server.port}/`, { redirect: "manual", headers: { Accept: "text/html" } })
      expect(response.status).toBe(200)
      expect(response.headers.get("content-type")).toContain("text/html")
    } finally {
      await server.stop()
    }
  })

  test("keeps health public even when password auth is enabled", async () => {
    const { server } = await startPasswordServer()

    try {
      const response = await fetch(`http://localhost:${server.port}/health`, { redirect: "manual" })
      expect(response.status).toBe(200)
    } finally {
      await server.stop()
    }
  })

  test("redirects login page requests back to the app", async () => {
    const { server } = await startPasswordServer()

    try {
      const response = await fetch(`http://localhost:${server.port}/auth/login`, { redirect: "manual" })
      expect(response.status).toBe(302)
      expect(response.headers.get("location")).toBe(`http://localhost:${server.port}/`)
    } finally {
      await server.stop()
    }
  })

  test("sets a session cookie after a successful login", async () => {
    const { server } = await startPasswordServer()

    try {
      const response = await login(server)

      expect(response.status).toBe(200)
      expect(await response.json()).toEqual({ ok: true, nextPath: "/" })
      expect(extractCookie(response)).toContain("vispark_code_session=")
    } finally {
      await server.stop()
    }
  })

  test("rejects an invalid password", async () => {
    const { server } = await startPasswordServer()

    try {
      const response = await login(server, { password: "wrong" })

      expect(response.status).toBe(401)
      expect(response.headers.get("set-cookie")).toBeNull()
    } finally {
      await server.stop()
    }
  })

  test("rejects cross-origin login attempts", async () => {
    const { server } = await startPasswordServer()

    try {
      const response = await login(server, { origin: "http://evil.test" })

      expect(response.status).toBe(403)
    } finally {
      await server.stop()
    }
  })

  test("trusts forwarded proto for redirects and secure cookies when trustProxy is enabled", async () => {
    const { server } = await startPasswordServer({ trustProxy: true })

    try {
      const redirectResponse = await fetch(`http://localhost:${server.port}/auth/login?next=/settings`, {
        redirect: "manual",
        headers: {
          "x-forwarded-proto": "https",
        },
      })
      expect(redirectResponse.status).toBe(302)
      expect(redirectResponse.headers.get("location")).toBe(`https://localhost:${server.port}/settings`)

      const loginResponse = await login(server, {
        origin: `https://localhost:${server.port}`,
        headers: {
          "x-forwarded-proto": "https",
        },
      })

      expect(loginResponse.status).toBe(200)
      expect(loginResponse.headers.get("set-cookie")).toContain("Secure")
    } finally {
      await server.stop()
    }
  })

  test("allows authenticated access to protected routes", async () => {
    const { server, project, projectDir } = await startPasswordServer()

    try {
      const attachment = await persistProjectUpload({
        projectId: project.id,
        localPath: projectDir,
        fileName: "hello.txt",
        bytes: new TextEncoder().encode("hello from upload"),
        fallbackMimeType: "text/plain",
      })

      const loginResponse = await login(server)
      const cookie = extractCookie(loginResponse)

      const healthResponse = await fetch(`http://localhost:${server.port}/health`, {
        headers: {
          Cookie: cookie,
        },
      })
      expect(healthResponse.status).toBe(200)

      const contentResponse = await fetch(`http://localhost:${server.port}${attachment.contentUrl}`, {
        headers: {
          Cookie: cookie,
        },
      })
      expect(contentResponse.status).toBe(200)
      expect(await contentResponse.text()).toBe("hello from upload")
    } finally {
      await server.stop()
    }
  })

  test("clears the session cookie on logout", async () => {
    const { server } = await startPasswordServer()

    try {
      const loginResponse = await login(server)
      const cookie = extractCookie(loginResponse)

      const logoutResponse = await fetch(`http://localhost:${server.port}/auth/logout`, {
        method: "POST",
        headers: {
          Cookie: cookie,
          Origin: `http://localhost:${server.port}`,
        },
      })

      expect(logoutResponse.status).toBe(200)
      expect(logoutResponse.headers.get("set-cookie")).toContain("Max-Age=0")

      const healthResponse = await fetch(`http://localhost:${server.port}/health`, {
        headers: {
          Cookie: cookie,
        },
      })
      expect(healthResponse.status).toBe(200)

      const protectedResponse = await fetch(`http://localhost:${server.port}/api/projects`, {
        headers: {
          Cookie: cookie,
        },
      })
      expect(protectedResponse.status).toBe(401)
    } finally {
      await server.stop()
    }
  })
})
