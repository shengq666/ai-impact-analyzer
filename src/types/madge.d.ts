declare module 'madge' {
  interface MadgeOptions {
    baseDir?: string
    includeNpm?: boolean
    tsConfig?: string
  }

  interface MadgeInstance {
    obj(): Record<string, string[]>
  }

  function madge(path: string, options?: MadgeOptions): Promise<MadgeInstance>
  export = madge
}
