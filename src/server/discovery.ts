import { existsSync, readdirSync, statSync } from "node:fs"
import { homedir } from "node:os"
import path from "node:path"
import type { AgentProvider } from "../shared/types"
import { resolveLocalPath } from "./paths"

export interface DiscoveredProject {
  localPath: string
  title: string
  modifiedAt: number
}

export interface ProviderDiscoveredProject extends DiscoveredProject {
  provider: AgentProvider
}

export interface ProjectDiscoveryAdapter {
  provider: AgentProvider
  scan(homeDir?: string): ProviderDiscoveredProject[]
}

function resolveEncodedHarnessPath(folderName: string) {
  const segments = folderName.replace(/^-/, "").split("-").filter(Boolean)
  let currentPath = ""
  let remainingSegments = [...segments]

  while (remainingSegments.length > 0) {
    let found = false

    for (let index = remainingSegments.length; index >= 1; index -= 1) {
      const segment = remainingSegments.slice(0, index).join("-")
      const candidate = `${currentPath}/${segment}`

      if (existsSync(candidate)) {
        currentPath = candidate
        remainingSegments = remainingSegments.slice(index)
        found = true
        break
      }
    }

    if (!found) {
      const [head, ...tail] = remainingSegments
      currentPath = `${currentPath}/${head}`
      remainingSegments = tail
    }
  }

  return currentPath || "/"
}

function normalizeExistingDirectory(localPath: string) {
  try {
    const normalized = resolveLocalPath(localPath)
    if (!statSync(normalized).isDirectory()) {
      return null
    }
    return normalized
  } catch {
    return null
  }
}

function mergeDiscoveredProjects(projects: Iterable<DiscoveredProject>): DiscoveredProject[] {
  const merged = new Map<string, DiscoveredProject>()

  for (const project of projects) {
    const existing = merged.get(project.localPath)
    if (!existing || project.modifiedAt > existing.modifiedAt) {
      merged.set(project.localPath, {
        localPath: project.localPath,
        title: project.title || path.basename(project.localPath) || project.localPath,
        modifiedAt: project.modifiedAt,
      })
      continue
    }

    if (!existing.title && project.title) {
      existing.title = project.title
    }
  }

  return [...merged.values()].sort((a, b) => b.modifiedAt - a.modifiedAt)
}

export class HarnessProjectDiscoveryAdapter implements ProjectDiscoveryAdapter {
  readonly provider = "vision" as const

  scan(homeDir: string = homedir()): ProviderDiscoveredProject[] {
    const projectsDir = path.join(homeDir, [".c", "laude"].join(""), "projects")
    if (!existsSync(projectsDir)) {
      return []
    }

    const entries = readdirSync(projectsDir, { withFileTypes: true })
    const projects: ProviderDiscoveredProject[] = []

    for (const entry of entries) {
      if (!entry.isDirectory()) continue

      const resolvedPath = resolveEncodedHarnessPath(entry.name)
      const normalizedPath = normalizeExistingDirectory(resolvedPath)
      if (!normalizedPath) {
        continue
      }

      const stat = statSync(path.join(projectsDir, entry.name))
      projects.push({
        provider: this.provider,
        localPath: normalizedPath,
        title: path.basename(normalizedPath) || normalizedPath,
        modifiedAt: stat.mtimeMs,
      })
    }

    const mergedProjects = mergeDiscoveredProjects(projects).map((project) => ({
      provider: this.provider,
      ...project,
    }))

    return mergedProjects
  }
}

export const DEFAULT_PROJECT_DISCOVERY_ADAPTERS: ProjectDiscoveryAdapter[] = [
  new HarnessProjectDiscoveryAdapter(),
]

export function discoverProjects(
  homeDir: string = homedir(),
  adapters: ProjectDiscoveryAdapter[] = DEFAULT_PROJECT_DISCOVERY_ADAPTERS
): DiscoveredProject[] {
  const mergedProjects = mergeDiscoveredProjects(
    adapters.flatMap((adapter) => adapter.scan(homeDir).map(({ provider: _provider, ...project }) => project))
  )

  return mergedProjects
}
