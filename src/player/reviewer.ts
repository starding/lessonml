// Judging lessonml:write answers. Hosts plug in their own (an LLM, a teacher
// queue); the default needs no server: required words present, long enough.

export type Reviewer = (input: { text: string; prompt: string; targets: string[]; minWords: number; language: string }) => Promise<{ pass: boolean; feedback?: string }>

export const defaultReviewer: Reviewer = async ({ text, targets, minWords }) => {
  const words = text.toLowerCase().match(/[a-z']+/g) || []
  const missing = targets.filter((target) => !words.some((word) => word.startsWith(target.toLowerCase().replace(/e$/, ''))))
  if (missing.length) return { pass: false, feedback: `Use: ${missing.join(', ')}` }
  if (words.length < minWords) return { pass: false, feedback: `Write at least ${minWords} words.` }
  return { pass: true }
}
