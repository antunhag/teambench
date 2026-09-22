/** Gera um slug simples a partir do nome da equipa, com sufixo aleatório para evitar colisões (slug é único). */
export function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // remove acentos
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const suffix = Math.random().toString(36).slice(2, 7);
  return `${base || "equipa"}-${suffix}`;
}
