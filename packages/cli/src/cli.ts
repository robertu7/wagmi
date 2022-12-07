#!/usr/bin/env node
import { cac } from 'cac'

import packageJson from '../package.json'
import { generate, init } from './commands'
import * as logger from './logger'

const cli = cac('wagmi')

cli
  .command('generate', 'generate code based on configuration')
  .option('-c, --config <path>', '[string] path to config file')
  .option('-r, --root <path>', '[string] root path')
  .action(generate)

cli
  .command('init', 'create configuration file')
  .example((name) => `${name} init`)
  .action(init)

cli.help()
cli.version(packageJson.version)

void (async () => {
  try {
    // Parse CLI args without running command
    cli.parse(process.argv, { run: false })
    await cli.runMatchedCommand()
  } catch (error) {
    logger.error((error as Error).message)
    process.exit(1)
  }
})()