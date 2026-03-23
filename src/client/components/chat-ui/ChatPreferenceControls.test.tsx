import { describe, expect, test } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import { PROVIDERS } from "../../../shared/types"
import { ChatPreferenceControls } from "./ChatPreferenceControls"

describe("ChatPreferenceControls", () => {
  test("renders vision controls and can omit plan mode", () => {
    const html = renderToStaticMarkup(
      <ChatPreferenceControls
        availableProviders={PROVIDERS}
        selectedProvider="vision"
        model="vispark/vision-large"
        modelOptions={{ continualLearning: true }}
        onProviderChange={() => {}}
        onModelChange={() => {}}
        onVisionContinualLearningChange={() => {}}
        includePlanMode={false}
      />
    )

    expect(html).toContain("Vision")
    expect(html).toContain("Large")
    expect(html).toContain("Learning On")
    expect(html).not.toContain("Plan Mode")
  })

  test("renders plan mode controls when enabled", () => {
    const html = renderToStaticMarkup(
      <ChatPreferenceControls
        availableProviders={PROVIDERS}
        selectedProvider="vision"
        model="vispark/vision-medium"
        modelOptions={{ continualLearning: false }}
        onProviderChange={() => {}}
        onModelChange={() => {}}
        onVisionContinualLearningChange={() => {}}
        planMode
        onPlanModeChange={() => {}}
        includePlanMode
      />
    )

    expect(html).toContain("Vision")
    expect(html).toContain("Medium")
    expect(html).toContain("Learning Off")
    expect(html).toContain("Plan Mode")
  })
})
