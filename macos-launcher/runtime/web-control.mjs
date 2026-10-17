import { createHash } from 'node:crypto'
import { realpathSync } from 'node:fs'
import { join, resolve } from 'node:path'

export const webDirectory = dataRoot => join(resolve(dataRoot), 'global/.dsh-workflow/web')
export const webSocket = dataRoot => join('/private/tmp', `dsh-wfw-${process.getuid()}-${createHash('sha256')
  .update(realpathSync(resolve(dataRoot))).digest('hex').slice(0, 16)}`, 'control.sock')
