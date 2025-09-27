export const sanitizeSearch = (input: string): string => {
  return input
  .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  .replace(/\\/g, '\\\\')
  .replace(/'/g, '\\\'')
  .replace(/"/g, '\\"')
}
