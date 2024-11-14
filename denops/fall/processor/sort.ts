import type { Denops } from "jsr:@denops/std@^7.3.2";
import type { Detail, IdItem } from "jsr:@vim-fall/std@^0.4.0/item";
import type { Sorter } from "jsr:@vim-fall/std@^0.4.0/sorter";

import { ItemBelt } from "../lib/item_belt.ts";
import { dispatch } from "../event.ts";

export class SortProcessor<T extends Detail> implements Disposable {
  readonly #controller: AbortController = new AbortController();
  readonly #sorters: ItemBelt<Sorter<T>>;
  #processing?: Promise<void>;
  #reserved?: () => void;
  #items: IdItem<T>[] = [];

  constructor(sorters: readonly Sorter<T>[]) {
    this.#sorters = new ItemBelt(sorters);
  }

  get #sorter(): Sorter<T> | undefined {
    return this.#sorters.current;
  }

  get sorterCount(): number {
    return this.#sorters.count;
  }

  get sorterIndex(): number {
    return this.#sorters.index;
  }

  set sorterIndex(index: number | "$") {
    if (index === "$") {
      index = this.#sorters.count;
    }
    this.#sorters.index = index;
  }

  get items() {
    return this.#items;
  }

  #validateAvailability(): void {
    try {
      this.#controller.signal.throwIfAborted();
    } catch (err) {
      if (err === null) {
        throw new Error("The processor is already disposed");
      }
      throw err;
    }
  }

  start(denops: Denops, { items }: { items: IdItem<T>[] }): void {
    this.#validateAvailability();
    if (this.#processing) {
      // Keep most recent start request for later.
      this.#reserved = () => this.start(denops, { items });
      return;
    }
    this.#processing = (async () => {
      dispatch({ type: "sort-processor-started" });
      const signal = this.#controller.signal;

      await this.#sorter?.sort(
        denops,
        { items },
        { signal },
      );
      signal.throwIfAborted();

      this.#items = items;
      dispatch({ type: "sort-processor-succeeded" });
    })();
    this.#processing
      .catch((err) => {
        dispatch({ type: "sort-processor-failed", err });
      })
      .finally(() => {
        this.#processing = undefined;
      })
      .then(() => {
        this.#reserved?.();
        this.#reserved = undefined;
      });
  }

  [Symbol.dispose](): void {
    try {
      this.#controller.abort(null);
    } catch {
      // Ignore
    }
  }
}
