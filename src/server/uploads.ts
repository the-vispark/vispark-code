import { randomUUID } from "node:crypto"
import { mkdir, open, rm } from "node:fs/promises"
import path from "node:path"
import type { ChatAttachment } from "../shared/types"
import { getProjectUploadDir } from "./paths"

const DEFAULT_BINARY_MIME_TYPE = "application/octet-stream"
const IMAGE_MIME_PREFIX = "image/"
const TEXT_PLAIN_CONTENT_TYPE = "text/plain; charset=utf-8"

const TEXT_CONTENT_TYPE_BY_EXTENSION = new Map<string, string>([
  [".csv", "text/csv; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".jsonc", TEXT_PLAIN_CONTENT_TYPE],
  [".md", "text/markdown; charset=utf-8"],
  [".tsv", "text/tab-separated-values; charset=utf-8"],
])

const MIME_TYPE_BY_EXTENSION = new Map<string, string>([
  [".gif", "image/gif"],
  [".jpeg", "image/jpeg"],
  [".jpg", "image/jpeg"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
  [".webp", "image/webp"],
  [".bmp", "image/bmp"],
  [".pdf", "application/pdf"],
  [".mp3", "audio/mpeg"],
  [".m4a", "audio/mp4"],
  [".wav", "audio/wav"],
  [".ogg", "audio/ogg"],
  [".aac", "audio/aac"],
  [".flac", "audio/flac"],
  [".mp4", "video/mp4"],
  [".mov", "video/quicktime"],
  [".mkv", "video/x-matroska"],
  [".webm", "video/webm"],
  [".avi", "video/x-msvideo"],
])

const TEXT_LIKE_EXTENSIONS = new Set([
  ".c", ".cc", ".cfg", ".conf", ".cpp", ".cs", ".css", ".env", ".go", ".graphql", ".h", ".hpp", ".html",
  ".ini", ".java", ".js", ".jsx", ".kt", ".lua", ".mjs", ".php", ".pl", ".properties", ".py", ".rb", ".rs",
  ".scss", ".sh", ".sql", ".swift", ".toml", ".ts", ".tsx", ".txt", ".vue", ".xml", ".yaml", ".yml", ".zsh",
])

function sanitizeFileName(fileName: string) {
  const baseName = path.basename(fileName).trim()
  const cleaned = baseName.replace(/[^\w.-]+/g, "-").replace(/^-+|-+$/g, "")
  return cleaned || "upload"
}

function getUploadCandidateNames(originalName: string) {
  const sanitizedName = sanitizeFileName(originalName)
  const parsed = path.parse(sanitizedName)
  const extension = parsed.ext
  const name = parsed.name || "upload"

  return {
    first: sanitizedName,
    withCounter(counter: number) {
      return `${name}-${counter}${extension}`
    },
  }
}

export async function persistProjectUpload(args: {
  projectId: string
  localPath: string
  fileName: string
  bytes: Uint8Array
  fallbackMimeType?: string
}): Promise<ChatAttachment> {
  const uploadDir = getProjectUploadDir(args.localPath)
  await mkdir(uploadDir, { recursive: true })

  const extension = path.extname(args.fileName).toLowerCase()
  const mimeType = MIME_TYPE_BY_EXTENSION.get(extension) ?? args.fallbackMimeType ?? DEFAULT_BINARY_MIME_TYPE
  const candidates = getUploadCandidateNames(args.fileName)

  let storedName = candidates.first
  let absolutePath = path.join(uploadDir, storedName)
  let counter = 1

  while (true) {
    try {
      const handle = await open(absolutePath, "wx")
      try {
        await handle.writeFile(args.bytes)
      } finally {
        await handle.close()
      }
      break
    } catch (error) {
      const code = error instanceof Error && "code" in error ? (error as NodeJS.ErrnoException).code : undefined
      if (code !== "EEXIST") {
        throw error
      }

      storedName = candidates.withCounter(counter)
      absolutePath = path.join(uploadDir, storedName)
      counter += 1
    }
  }

  return {
    id: randomUUID(),
    kind: mimeType.startsWith(IMAGE_MIME_PREFIX) ? "image" : "file",
    displayName: args.fileName,
    absolutePath,
    relativePath: `./.vispark-code/uploads/${storedName}`,
    contentUrl: `/api/projects/${args.projectId}/uploads/${encodeURIComponent(storedName)}/content`,
    mimeType,
    size: args.bytes.byteLength,
  }
}

export function inferAttachmentContentType(fileName: string, fallbackType?: string): string {
  const extension = path.extname(fileName).toLowerCase()
  const mappedType = TEXT_CONTENT_TYPE_BY_EXTENSION.get(extension)
  if (mappedType) {
    return mappedType
  }

  if (TEXT_LIKE_EXTENSIONS.has(extension)) {
    return TEXT_PLAIN_CONTENT_TYPE
  }

  return fallbackType || DEFAULT_BINARY_MIME_TYPE
}

export function inferProjectFileContentType(fileName: string, fallbackType?: string): string {
  return inferAttachmentContentType(fileName, fallbackType)
}

export async function deleteProjectUpload(args: {
  localPath: string
  storedName: string
}): Promise<boolean> {
  const storedName = args.storedName
  if (!storedName || storedName.includes("/") || storedName.includes("\\") || storedName === "." || storedName === "..") {
    return false
  }

  const absolutePath = path.join(getProjectUploadDir(args.localPath), storedName)
  try {
    await rm(absolutePath, { force: true })
    return true
  } catch {
    return false
  }
}
