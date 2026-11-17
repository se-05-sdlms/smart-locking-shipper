export function createSessionGenerationGate<T>(
) {
  let generation = 0;
  let pending: Promise<T> | null = null;

  return {
    ensure(start: () => Promise<T>, commit: (value: T) => void): Promise<T> {
      if (pending) return pending;
      const owner = generation;
      const request = start()
        .then((value) => {
          if (owner !== generation) throw new Error("Delivery session request was superseded.");
          commit(value);
          return value;
        })
        .finally(() => {
          if (owner === generation) pending = null;
        });
      pending = request;
      return request;
    },
    reset() {
      generation += 1;
      pending = null;
    },
  };
}
