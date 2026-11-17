/** Use known IDs; retain name compatibility for pinned/older clients. */
export function projectSelection(name: string, projects: readonly { id: number; name: string }[]): { project_id: number | null } | { project_name: string } {
  if (!name || name === "No Project") return { project_id: null };
  const project = projects.find(p => p.name === name);
  return project ? { project_id: project.id } : { project_name: name };
}
