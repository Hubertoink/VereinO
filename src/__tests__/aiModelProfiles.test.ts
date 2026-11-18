import {
  isMittwaldThinkingModel,
  resolveAiTaskModel,
  toMittwaldReasoningEffort
} from '../../shared/aiModelProfiles'

describe('AI model profiles', () => {
  it.each([
    ['openai', 'gpt-6-luna', 'gpt-6.1-terra', 'gpt-6.2-sol'],
    ['anthropic', 'claude-haiku-5-5', 'claude-sonnet-5-5', 'claude-opus-5-5']
  ] as const)('resolves economical, document and quality models for %s', (provider, fast, balanced, quality) => {
    const input = { provider, configuredModel: 'old-id' }
    expect(resolveAiTaskModel({ ...input, task: 'invoice', profile: 'auto' })).toBe(balanced)
    expect(resolveAiTaskModel({ ...input, task: 'text', profile: 'auto' })).toBe(fast)
    expect(resolveAiTaskModel({ ...input, task: 'invoice', profile: 'fast' })).toBe(fast)
    expect(resolveAiTaskModel({ ...input, task: 'text', profile: 'quality' })).toBe(quality)
    expect(resolveAiTaskModel({ ...input, task: 'invoice', profile: 'quality', availableModels: [balanced] })).toBe(balanced)
  })

  it('selects Qwen 3.8 for demanding documents even if the retiring 122B model is still listed', () => {
    expect(resolveAiTaskModel({ provider: 'mittwald', task: 'invoice', profile: 'quality',
      configuredModel: 'Qwen3.5-122B-A10B-FP8', availableModels: ['Qwen3.8-27B-NVFP4', 'Qwen3.5-122B-A10B-FP8']
    })).toBe('Qwen3.8-27B-NVFP4')
  })
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
