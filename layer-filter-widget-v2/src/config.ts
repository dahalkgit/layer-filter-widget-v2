import { ImmutableObject } from 'seamless-immutable'

export interface Config {
  layerId: string
  allowedFields: string[]
}

export type IMConfig = ImmutableObject<Config>