export interface DiffOptions<T> {
    identity: (item: T) => string
    equals: (a: T, b: T) => boolean
}

export interface DiffResult<T> {
    toAdd: T[]
    changed: Array<{ current: T; desired: T }>
    unchanged: T[]
    extra: T[]
}

export function diff<T>(current: T[], desired: T[], options: DiffOptions<T>): DiffResult<T> {
    const currentById = new Map<string, T>()
    const desiredById = new Map<string, T>()

    for (const item of current) {
        currentById.set(options.identity(item), item)
    }

    for (const item of desired) {
        desiredById.set(options.identity(item), item)
    }

    const toAdd: T[] = []
    const changed: Array<{ current: T; desired: T }> = []
    const unchanged: T[] = []
    const extra: T[] = []

    for (const [id, desiredItem] of desiredById) {
        const currentItem = currentById.get(id)

        if (!currentItem) {
            toAdd.push(desiredItem)
            continue
        }

        if (options.equals(currentItem, desiredItem)) {
            unchanged.push(desiredItem)
        } else {
            changed.push({ current: currentItem, desired: desiredItem })
        }
    }

    for (const [id, currentItem] of currentById) {
        if (!desiredById.has(id)) {
            extra.push(currentItem)
        }
    }

    return { toAdd, changed, unchanged, extra }
}

export function hasChanges<T>(result: DiffResult<T>): boolean {
    return result.toAdd.length > 0 || result.changed.length > 0
}
