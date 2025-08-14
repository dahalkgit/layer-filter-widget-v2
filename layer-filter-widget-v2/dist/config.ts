import { ImmutableObject } from 'seamless-immutable'

export interface Config {
  /** DataSource ID of the layer to filter */
  layerId: string
  /** Whitelisted field names selectable in the widget */
  allowedFields: string[]
}

export type IMConfig = ImmutableObject<Config>
