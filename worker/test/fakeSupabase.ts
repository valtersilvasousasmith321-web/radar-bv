/**
 * Supabase falso, em memória, que implementa só o subconjunto da API do
 * @supabase/supabase-js que o worker realmente usa (from/select/insert/
 * update/eq/lte/limit/maybeSingle/single + await direto). Serve pra testar
 * a lógica real do worker (Trava de Silêncio, Fila de Gotejamento,
 * Isolamento de Fontes etc.) sem precisar de um projeto Supabase de verdade.
 */
export class FakeSupabase {
  tables: Record<string, any[]> = {};

  reset() {
    this.tables = {};
  }

  from(table: string) {
    if (!this.tables[table]) this.tables[table] = [];
    return new FakeQueryBuilder(this, table);
  }
}

class FakeQueryBuilder implements PromiseLike<{ data: any; error: any }> {
  private op: "select" | "insert" | "update" | null = null;
  private payload: any = null;
  private filters: Array<[string, "eq" | "lte" | "gte", any]> = [];
  private limitN: number | null = null;
  private orderCol: string | null = null;
  private orderAsc = true;

  constructor(private db: FakeSupabase, private table: string) {}

  select(_cols?: string) {
    if (!this.op) this.op = "select";
    return this;
  }
  insert(payload: any) {
    this.op = "insert";
    this.payload = payload;
    return this;
  }
  update(payload: any) {
    this.op = "update";
    this.payload = payload;
    return this;
  }
  eq(col: string, val: any) {
    this.filters.push([col, "eq", val]);
    return this;
  }
  lte(col: string, val: any) {
    this.filters.push([col, "lte", val]);
    return this;
  }
  gte(col: string, val: any) {
    this.filters.push([col, "gte", val]);
    return this;
  }
  order(col: string, opts?: { ascending?: boolean }) {
    this.orderCol = col;
    this.orderAsc = opts?.ascending ?? true;
    return this;
  }
  limit(n: number) {
    this.limitN = n;
    return this;
  }

  private matchRows(): any[] {
    const rows: any[] = this.db.tables[this.table];
    let resultado = rows.filter((r) =>
      this.filters.every(([col, kind, val]) => {
        if (kind === "eq") return r[col] === val;
        if (kind === "lte") return r[col] <= val;
        return r[col] >= val;
      })
    );
    if (this.orderCol) {
      const col = this.orderCol;
      const dir = this.orderAsc ? 1 : -1;
      resultado = [...resultado].sort((a, b) => (a[col] > b[col] ? 1 : a[col] < b[col] ? -1 : 0) * dir);
    }
    return resultado;
  }

  private newId(): string {
    return Math.random().toString(36).slice(2) + Date.now().toString(36);
  }

  async maybeSingle(): Promise<{ data: any; error: any }> {
    const rows = this.limitN ? this.matchRows().slice(0, this.limitN) : this.matchRows();
    return { data: rows[0] ?? null, error: null };
  }

  async single(): Promise<{ data: any; error: any }> {
    if (this.op === "insert") {
      const row = { id: this.newId(), ...this.payload };
      this.db.tables[this.table].push(row);
      return { data: row, error: null };
    }
    const rows = this.matchRows();
    return rows[0] ? { data: rows[0], error: null } : { data: null, error: { message: "not found" } };
  }

  // Permite `await supabase.from(x)...` direto, sem .single()/.maybeSingle()
  then<TResult1 = { data: any; error: any }, TResult2 = never>(
    onfulfilled?: ((value: { data: any; error: any }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null
  ): PromiseLike<TResult1 | TResult2> {
    const executar = async (): Promise<{ data: any; error: any }> => {
      if (this.op === "insert") {
        const row = { id: this.newId(), ...this.payload };
        this.db.tables[this.table].push(row);
        return { data: [row], error: null };
      }
      if (this.op === "update") {
        const rows = this.matchRows();
        for (const r of rows) Object.assign(r, this.payload);
        return { data: rows, error: null };
      }
      let rows = this.matchRows();
      if (this.limitN) rows = rows.slice(0, this.limitN);
      return { data: rows, error: null };
    };
    return executar().then(onfulfilled as any, onrejected as any);
  }
}
