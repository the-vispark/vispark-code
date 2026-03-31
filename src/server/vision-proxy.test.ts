import { afterEach, describe, expect, test } from "bun:test"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { buildVisionContent, extractInlineAttachmentsFromText, extractVisionVideoFailureMessage } from "./vision-proxy"

const tempDirs: string[] = []
const PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+yF9sAAAAASUVORK5CYII="

afterEach(async () => {
  delete process.env.VISPARK_PUBLIC_APP_URL
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

describe("extractInlineAttachmentsFromText", () => {
  test("strips the inline attachment block and returns parsed attachment metadata", () => {
    const parsed = extractInlineAttachmentsFromText([
      "Please inspect these files.",
      "",
      "<vispark-code-attachments>",
      '<attachment kind="image" mime_type="image/png" path="/tmp/project/.vispark-code/uploads/shot.png" project_path="./.vispark-code/uploads/shot.png" content_url="/api/projects/project-1/uploads/shot.png/content" size_bytes="512" display_name="shot.png" />',
      "</vispark-code-attachments>",
    ].join("\n"))

    expect(parsed.cleanText).toBe("Please inspect these files.")
    expect(parsed.attachments).toEqual([{
      kind: "image",
      mimeType: "image/png",
      path: "/tmp/project/.vispark-code/uploads/shot.png",
      projectPath: "./.vispark-code/uploads/shot.png",
      contentUrl: "/api/projects/project-1/uploads/shot.png/content",
      sizeBytes: 512,
      displayName: "shot.png",
    }])
  })
})

describe("buildVisionContent", () => {
  test("adds attachment-derived content items after the flattened prompt text", async () => {
    const tempDir = await mkdtemp(path.join(tmpdir(), "vispark-vision-content-"))
    tempDirs.push(tempDir)
    const imagePath = path.join(tempDir, "pixel.png")
    const textPath = path.join(tempDir, "notes.txt")

    await writeFile(imagePath, Buffer.from(PNG_BASE64, "base64"))
    await writeFile(textPath, "hello from attachment\n")

    const content = await buildVisionContent("USER:\nReview these attachments.", [
      {
        kind: "image",
        mimeType: "image/png",
        path: imagePath,
        projectPath: "./.vispark-code/uploads/pixel.png",
        contentUrl: "/api/projects/project-1/uploads/pixel.png/content",
        sizeBytes: 68,
        displayName: "pixel.png",
      },
      {
        kind: "file",
        mimeType: "text/plain",
        path: textPath,
        projectPath: "./.vispark-code/uploads/notes.txt",
        contentUrl: "/api/projects/project-1/uploads/notes.txt/content",
        sizeBytes: 22,
        displayName: "notes.txt",
      },
    ])

    expect(content[0]).toEqual({
      type: "text",
      content: "USER:\nReview these attachments.",
    })
    expect(content.some((item) => item.type === "image" && item.content.startsWith("data:image/png;base64,"))).toBe(true)
    expect(content.some((item) => item.type === "text" && item.content.includes("hello from attachment"))).toBe(true)
  })

  test("uses raw base64 for native video attachments by default", async () => {
    const tempDir = await mkdtemp(path.join(tmpdir(), "vispark-vision-video-"))
    tempDirs.push(tempDir)
    const videoPath = path.join(tempDir, "clip.mp4")

    await Bun.$`ffmpeg -f lavfi -i color=c=black:s=160x120:d=1 -pix_fmt yuv420p ${videoPath} -y`.quiet()
    const videoBytes = await Bun.file(videoPath).bytes()

    const content = await buildVisionContent("USER:\nSummarize this clip.", [
      {
        kind: "file",
        mimeType: "video/mp4",
        path: videoPath,
        projectPath: "./.vispark-code/uploads/clip.mp4",
        contentUrl: "/api/projects/project-1/uploads/clip.mp4/content",
        sizeBytes: videoBytes.byteLength,
        displayName: "clip.mp4",
      },
    ])

    expect(content).toEqual([
      {
        type: "text",
        content: "USER:\nSummarize this clip.",
      },
      {
        type: "video",
        content: Buffer.from(videoBytes).toString("base64"),
      },
    ])
  })

  test("uses a public attachment URL for native video when share mode is available", async () => {
    process.env.VISPARK_PUBLIC_APP_URL = "https://vispark.trycloudflare.com"

    const content = await buildVisionContent("USER:\nSummarize this clip.", [
      {
        kind: "file",
        mimeType: "video/mp4",
        path: "/tmp/project/.vispark-code/uploads/clip.mp4",
        projectPath: "./.vispark-code/uploads/clip.mp4",
        contentUrl: "/api/projects/project-1/uploads/clip.mp4/content",
        sizeBytes: 1234,
        displayName: "clip.mp4",
      },
    ])

    expect(content).toEqual([
      {
        type: "text",
        content: "USER:\nSummarize this clip.",
      },
      {
        type: "video",
        content: "https://vispark.trycloudflare.com/api/projects/project-1/uploads/clip.mp4/content",
      },
    ])
  })
})

describe("extractVisionVideoFailureMessage", () => {
  test("returns the provider message when Vision reports a native video ingest failure", () => {
    const message = extractVisionVideoFailureMessage({
      status: "success",
      data: {
        type: "text",
        content: "Oh, it looks like the video didn't load properly! I’m getting a padding error.",
      },
    })

    expect(message).toContain("padding error")
  })

  test("ignores normal successful text responses", () => {
    expect(extractVisionVideoFailureMessage({
      status: "success",
      data: {
        type: "text",
        content: "This video is a black screen.",
      },
    })).toBeNull()
  })
})
