declare module 'semver' {
    export class SemVer {
        constructor(version: string | SemVer, optionsOrLoose?: boolean | unknown)
        version: string
        major: number
        minor: number
        patch: number
        prerelease: readonly (string | number)[]
        build: readonly string[]
        compare(other: string | SemVer): number
        toString(): string
    }
}
