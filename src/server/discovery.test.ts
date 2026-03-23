import { afterEach, describe, expect, test } from "bun:test"
import { mkdtempSync, mkdirSync, rmSync, utimesSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import {
  HarnessProjectDiscoveryAdapter,
  discoverProjects,
  type ProjectDiscoveryAdapter,
} from "./discovery"

const tempDirs: string[] = []

function makeTempDir() {
  const directory = mkdtempSync(path.join(tmpdir(), "vispark-code-discovery-"))
  tempDirs.push(directory)
  return directory
}

function encodeHarnessProjectPath(localPath: string) {
  return `-${localPath.replace(/\//g, "-")}`
}

afterEach(() => {
  for (const directory of tempDirs.splice(0)) {
    rmSync(directory, { recursive: true, force: true })
  }
})

describe("project discovery", () => {
  test("the harness adapter decodes saved project paths", () => {
    const homeDir = makeTempDir()
    const projectDir = path.join(homeDir, "workspace", "alpha-project")
    const harnessProjectsDir = path.join(homeDir, [".c", "laude"].join(""), "projects")
    const projectMarkerDir = path.join(harnessProjectsDir, encodeHarnessProjectPath(projectDir))

    mkdirSync(projectDir, { recursive: true })
    mkdirSync(projectMarkerDir, { recursive: true })
    utimesSync(projectMarkerDir, new Date("2026-03-16T10:00:00.000Z"), new Date("2026-03-16T10:00:00.000Z"))

    const projects = new HarnessProjectDiscoveryAdapter().scan(homeDir)

    expect(projects).toEqual([
      {
        provider: "vision",
        localPath: projectDir,
        title: "alpha-project",
        modifiedAt: new Date("2026-03-16T10:00:00.000Z").getTime(),
      },
    ])
  })

  test("discoverProjects de-dupes results by normalized path and keeps the newest timestamp", () => {
    const adapters: ProjectDiscoveryAdapter[] = [
      {
        provider: "vision",
        scan() {
          return [
            {
              provider: "vision",
              localPath: "/tmp/project",
              title: "Older Project",
              modifiedAt: 10,
            },
            {
              provider: "vision",
              localPath: "/tmp/project",
              title: "Newer Project",
              modifiedAt: 20,
            },
            {
              provider: "vision",
              localPath: "/tmp/other-project",
              title: "Other Project",
              modifiedAt: 15,
            },
          ]
        },
      },
    ]

    expect(discoverProjects("/unused-home", adapters)).toEqual([
      {
        localPath: "/tmp/project",
        title: "Newer Project",
        modifiedAt: 20,
      },
      {
        localPath: "/tmp/other-project",
        title: "Other Project",
        modifiedAt: 15,
      },
    ])
  })
})
