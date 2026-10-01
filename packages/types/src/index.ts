export type ValueOfEnum<T> = T extends any[] ? T[number] : T[keyof T];
