import { spawn } from "node:child_process"
import process from "node:process"
import { LOG_PREFIX } from "../shared/branding"
import { hasCommand } from "./process-utils"

export async function pickDirectory(title = "Select Folder"): Promise<string | null> {
  const platform = process.platform

  if (platform === "darwin") {
    return pickDirectoryMac(title)
  }

  if (platform === "win32") {
    return pickDirectoryWindows(title)
  }

  return pickDirectoryLinux(title)
}

async function pickDirectoryMac(title: string): Promise<string | null> {
  const script = `POSIX path of (choose folder with prompt "${title}")`
  return runCommand("osascript", ["-e", "tell application \"System Events\" to activate", "-e", script])
}

async function pickDirectoryWindows(title: string): Promise<string | null> {
  // Use Shell.Application to open a folder picker without requiring WinForms or WPF
  const script = `
    $app = New-Object -ComObject Shell.Application
    $folder = $app.BrowseForFolder(0, "${title}", 0)
    if ($folder) { $folder.Self.Path }
  `
  return runCommand("powershell", ["-Command", script])
}

async function pickDirectoryLinux(title: string): Promise<string | null> {
  if (hasCommand("zenity")) {
    return runCommand("zenity", ["--file-selection", "--directory", `--title=${title}`])
  }
  if (hasCommand("kdialog")) {
    return runCommand("kdialog", ["--getexistingdirectory", ".", "--title", title])
  }
  return null
}

function runCommand(command: string, args: string[]): Promise<string | null> {
  return new Promise((resolve) => {
    const proc = spawn(command, args)
    let stdout = ""
    let stderr = ""

    proc.stdout.on("data", (data) => {
      stdout += data.toString()
    })

    proc.stderr.on("data", (data) => {
      stderr += data.toString()
    })

    proc.on("close", (code) => {
      if (code === 0) {
        resolve(stdout.trim() || null)
      } else {
        if (stderr.trim()) {
          console.error(`${LOG_PREFIX} Picker error (code ${code}):`, stderr.trim())
        }
        resolve(null)
      }
    })

    proc.on("error", (err) => {
      console.error(`${LOG_PREFIX} Picker process error:`, err.message)
      resolve(null)
    })
  })
}
