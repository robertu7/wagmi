import dedent from 'dedent'
import { execa } from 'execa'
import { default as fse } from 'fs-extra'
import { globby } from 'globby'
import { basename, extname, resolve } from 'pathe'

import type { Plugin } from '../config'

const defaultExcludes = [
  'Common.sol/**',
  'Components.sol/**',
  'Script.sol/**',
  'StdAssertions.sol/**',
  'StdError.sol/**',
  'StdCheats.sol/**',
  'StdMath.sol/**',
  'StdJson.sol/**',
  'StdStorage.sol/**',
  'StdUtils.sol/**',
  'Vm.sol/**',
  'console.sol/**',
  'console2.sol/**',
  'test.sol/**',
  '**.s.sol/*.json',
  '**.t.sol/*.json',
]

type FoundryConfig = {
  /**
   * Project's artifacts directory.
   *
   * Same as your project's `--out` (`-o`) option.
   *
   * @default 'out/'
   */
  artifacts?: string
  /** Artifact files to exclude. */
  exclude?: string[]
  /** [Forge](https://book.getfoundry.sh/forge) configuration */
  forge?: {
    /** Remove build artifacts and cache directories on start up. */
    clean?: boolean
    /** Build Foundry project before fetching artifacts. */
    build?: boolean
    /**
     * Path to `forge` executable command
     *
     * @default "forge"
     */
    path?: string
    /** Rebuild every time a watched file or directory is changed. */
    rebuild?: boolean
  }
  /** Artifact files to include. */
  include?: string[]
  /** Optional prefix to prepend to artifact names. */
  namePrefix?: string
  /** Path to foundry project. */
  project: string
}

type FoundryResult = Omit<Plugin, 'contracts'> &
  Required<Pick<Plugin, 'contracts'>>

/**
 * Resolves ABIs from [Foundry](https://github.com/foundry-rs/foundry) project.
 */
export function foundry({
  artifacts = 'out',
  exclude = defaultExcludes,
  forge: {
    clean = false,
    build = true,
    path: forgeExecutable = 'forge',
    rebuild = true,
  } = {},
  include = ['*.json'],
  namePrefix = '',
  project,
}: FoundryConfig): FoundryResult {
  function getContractName(artifactPath: string) {
    const filename = basename(artifactPath)
    const extension = extname(artifactPath)
    return `${namePrefix}${filename.replace(extension, '')}`
  }

  async function getContract(artifactPath: string) {
    const artifact = await fse.readJSON(artifactPath)
    return {
      abi: artifact.abi,
      name: getContractName(artifactPath),
    }
  }

  async function getArtifactPaths(artifactsDirectory: string) {
    return await globby([
      ...include.map((x) => `${artifactsDirectory}/**/${x}`),
      ...exclude.map((x) => `!${artifactsDirectory}/**/${x}`),
    ])
  }

  const artifactsDirectory = `${project}/${artifacts}`

  return {
    async contracts() {
      if (clean)
        await execa(forgeExecutable, ['clean'], { cwd: resolve(project) })
      if (build)
        await execa(forgeExecutable, ['build'], { cwd: resolve(project) })
      if (!fse.pathExistsSync(artifactsDirectory))
        throw new Error('Artifacts not found.')

      const artifactPaths = await getArtifactPaths(artifactsDirectory)
      const contracts = []
      for (const artifactPath of artifactPaths) {
        const contract = await getContract(artifactPath)
        if (!contract.abi?.length) continue
        contracts.push(contract)
      }
      return contracts
    },
    name: 'Foundry',
    async validate() {
      if (clean || build || rebuild)
        try {
          await execa(forgeExecutable, ['--version'])
        } catch (error) {
          throw new Error(dedent`
            Forge not installed. Install with Foundry:
            https://book.getfoundry.sh/getting-started/installation
          `)
        }
    },
    watch: {
      command: rebuild
        ? async () => {
            await execa(forgeExecutable, ['build', '--watch'], {
              cwd: resolve(project),
            }).stdout?.pipe(process.stdout)
          }
        : undefined,
      paths: [artifactsDirectory],
      async onAdd(path) {
        const artifactPaths = await getArtifactPaths(artifactsDirectory)
        if (!artifactPaths.includes(path)) return
        return getContract(path)
      },
      async onChange(path) {
        const artifactPaths = await getArtifactPaths(artifactsDirectory)
        if (!artifactPaths.includes(path)) return
        return getContract(path)
      },
      onRemove(path) {
        return getContractName(path)
      },
    },
  }
}