// Who goes by which name: a small registry the server keeps so that no
// two farmers anywhere share a name. Names are compared folded, the way
// the game compares them everywhere, so case and accents do not matter.
// The saves themselves are the record: the registry is rebuilt from
// them whenever the server starts and kept up to date as farmers move
// in. A farmer who already had a name before the registry existed
// keeps it, even if somebody else had it too. First farmers keep their
// names; new farmers pick another.
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { nameFold } from '../shared/rules.js';

export class NameRegistry {
  constructor(dir) {
    this.dir = dir;
    this.byName = new Map(); // folded name -> farm id
    this.byFarm = new Map(); // farm id -> folded name
    this.ready = this.build();
  }

  async build() {
    let files = [];
    try {
      files = await readdir(this.dir);
    } catch {
      return; // no saves yet, no names taken
    }
    for (const f of files) {
      if (!f.endsWith('.json')) continue;
      try {
        const save = JSON.parse(await readFile(join(this.dir, f), 'utf8'));
        const name = save?.profile?.name;
        if (typeof name !== 'string' || !name) continue;
        const folded = nameFold(name);
        if (!folded) continue;
        const id = f.slice(0, -'.json'.length);
        if (!this.byName.has(folded)) this.byName.set(folded, id);
        if (!this.byFarm.has(id)) this.byFarm.set(id, folded);
      } catch {
        // A half written save never breaks the registry.
      }
    }
  }

  ownerOf(name) {
    return this.byName.get(nameFold(name));
  }

  /** Tries to give a name to a farm. Succeeds when the name is
   *  free, when the farm already owns it, or when the farm is
   *  grandfathered: its stored farmer already bore the name before the
   *  registry, so it keeps the name while the registry keeps pointing
   *  at whoever was first. A fresh claim frees the farm's old name. */
  async tryClaim(id, name, grandfathered = false) {
    await this.ready;
    const folded = nameFold(name);
    const owner = this.byName.get(folded);
    if (owner !== undefined && owner !== id) {
      if (!grandfathered) return false;
      this.byFarm.set(id, folded);
      return true;
    }
    const old = this.byFarm.get(id);
    if (old && old !== folded && this.byName.get(old) === id) this.byName.delete(old);
    this.byName.set(folded, id);
    this.byFarm.set(id, folded);
    return true;
  }
}
