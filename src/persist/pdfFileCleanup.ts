export const takeObsoletePdfIds = (pending: Set<string>, currentId: string | null): string[] => {
  const obsolete = [...pending].filter((id) => id !== currentId)
  pending.clear()
  return obsolete
}
