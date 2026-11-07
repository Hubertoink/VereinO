/** Provider reasoning is not part of the user-facing answer, including unfinished blocks. */
export function visibleAiText(text: string): string {
  return text
    .replace(/<think\b[^>]*>[\s\S]*?<\/think\s*>/gi, '')
    .replace(/<think\b[^>]*>[\s\S]*$/gi, '')
    .replace(/<\/think\s*>/gi, '')
    .trim()
}

/** Keep additional findings without repeating a report's summary verbatim. */
export function reportSupplement(text: string, reports: Array<{ summary: string }> = []): string {
  const normalize = (value: string) => value.replace(/\s+/g, ' ').trim()
  const summaries = reports.map(report => normalize(report.summary)).filter(Boolean)
  return visibleAiText(text).split(/\n\s*\n/).filter(paragraph => {
    const normalized = normalize(paragraph)
    return normalized && !summaries.includes(normalized) && normalized !== summaries.join(' ')
  }).join('\n\n')
}
