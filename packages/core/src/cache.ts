/** Subconjunto de `Storage` (localStorage, sessionStorage...) que o cache usa. */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/**
 * Cache de traduções indexado pelo texto de origem. Se o desenvolvedor mudar
 * um texto base, a chave muda junto e a tradução antiga deixa de ser usada,
 * sem precisar de invalidação manual.
 */
export class TranslationCache {
  private memory = new Map<string, Map<string, string>>();

  constructor(
    private storage: StorageLike | null = null,
    private prefix = "poly",
  ) {}

  private bucket(source: string, target: string): Map<string, string> {
    const id = `${source}>${target}`;
    let b = this.memory.get(id);
    if (b) return b;

    b = new Map();
    try {
      const raw = this.storage?.getItem(`${this.prefix}:${id}`);
      if (raw) {
        for (const [k, v] of Object.entries(JSON.parse(raw) as Record<string, string>)) {
          b.set(k, v);
        }
      }
    } catch {
      // Storage indisponível ou corrompido: segue só com memória.
    }
    this.memory.set(id, b);
    return b;
  }

  get(source: string, target: string, text: string): string | undefined {
    return this.bucket(source, target).get(text);
  }

  setMany(source: string, target: string, entries: Iterable<[string, string]>): void {
    const b = this.bucket(source, target);
    for (const [k, v] of entries) b.set(k, v);
    try {
      this.storage?.setItem(
        `${this.prefix}:${source}>${target}`,
        JSON.stringify(Object.fromEntries(b)),
      );
    } catch {
      // Cota excedida ou storage bloqueado: o cache em memória continua valendo.
    }
  }
}
