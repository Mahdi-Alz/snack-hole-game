/** Uniform spatial hash grid over a square map, storing items by their centre point. */
export interface GridItem {
  x: number;
  z: number;
  cell: number;
}

export class SpatialGrid<T extends GridItem> {
  readonly cellSize: number;
  readonly half: number;
  readonly n: number;
  private cells: T[][];

  constructor(size: number, cellSize = 8) {
    this.cellSize = cellSize;
    this.half = size / 2;
    this.n = Math.ceil(size / cellSize) + 2;
    this.cells = Array.from({ length: this.n * this.n }, () => []);
  }

  private coord(v: number): number {
    const c = Math.floor((v + this.half) / this.cellSize) + 1;
    return c < 0 ? 0 : c >= this.n ? this.n - 1 : c;
  }

  keyFor(x: number, z: number): number {
    return this.coord(x) + this.coord(z) * this.n;
  }

  insert(item: T): void {
    item.cell = this.keyFor(item.x, item.z);
    this.cells[item.cell].push(item);
  }

  remove(item: T): void {
    if (item.cell < 0) return;
    const arr = this.cells[item.cell];
    const i = arr.indexOf(item);
    if (i >= 0) {
      arr[i] = arr[arr.length - 1];
      arr.pop();
    }
    item.cell = -1;
  }

  /** Call after changing an item's position. */
  update(item: T): void {
    const key = this.keyFor(item.x, item.z);
    if (key === item.cell) return;
    this.remove(item);
    item.cell = key;
    this.cells[key].push(item);
  }

  /** Visits every item whose cell overlaps the square around (x, z) with half-size r. */
  query(x: number, z: number, r: number, visit: (item: T) => void): void {
    const x0 = this.coord(x - r);
    const x1 = this.coord(x + r);
    const z0 = this.coord(z - r);
    const z1 = this.coord(z + r);
    for (let cz = z0; cz <= z1; cz++) {
      const row = cz * this.n;
      for (let cx = x0; cx <= x1; cx++) {
        const arr = this.cells[row + cx];
        // Iterate backwards so visitors may remove the current item safely.
        for (let i = arr.length - 1; i >= 0; i--) {
          if (i < arr.length) visit(arr[i]);
        }
      }
    }
  }

  count(): number {
    let c = 0;
    for (const arr of this.cells) c += arr.length;
    return c;
  }
}
