import {
  isMittwaldThinkingModel,
  resolveAiTaskModel,
  toMittwaldReasoningEffort
} from '../../shared/aiModelProfiles'

describe('AI model profiles', () => {
  it('uses Qwen 3.6 for the automatic invoice profile', () => {
    expect(
      resolveAiTaskModel({
        provider: 'mittwald',
        task: 'invoice',
        profile: 'auto',
        configuredModel: 'GLM-OCR',
        availableModels: ['GLM-OCR', 'Qwen3.6-35B-A3B-FP8']
      })
    ).toBe('Qwen3.6-35B-A3B-FP8')
  })

  it('uses the compact model for fast invoice batches', () => {
    expect(
      resolveAiTaskModel({
        provider: 'mittwald',
        task: 'invoice',
        profile: 'fast',
        configuredModel: 'Qwen3.6-35B-A3B-FP8',
        availableModels: ['Qwen3.5-0.8B', 'Qwen3.6-35B-A3B-FP8']
      })
    ).toBe('Qwen3.5-0.8B')
  })

  it('reserves Qwen 3.8 for the thorough text and agent profile', () => {
    expect(
      resolveAiTaskModel({
        provider: 'mittwald',
        task: 'text',
        profile: 'quality',
        configuredModel: 'Qwen3.6-35B-A3B-FP8',
        availableModels: ['Qwen3.6-35B-A3B-FP8', 'Qwen3.8-27B-NVFP4']
      })
    ).toBe('Qwen3.8-27B-NVFP4')
    expect(isMittwaldThinkingModel('Qwen3.8-27B-NVFP4')).toBe(true)
    expect(toMittwaldReasoningEffort('high')).toBe('xhigh')
  })

  it('keeps a custom model untouched', () => {
    expect(
      resolveAiTaskModel({
        provider: 'mittwald',
        task: 'text',
        profile: 'custom',
        configuredModel: 'new-model-from-mittwald',
        availableModels: ['Qwen3.6-35B-A3B-FP8']
      })
    ).toBe('new-model-from-mittwald')
  })
})
