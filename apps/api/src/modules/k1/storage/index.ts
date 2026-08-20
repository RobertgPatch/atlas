import { config } from '../../../config.js'
import type { K1ObjectStore } from './K1ObjectStore.js'
import { localK1ObjectStore } from './localK1ObjectStore.js'
import { S3K1ObjectStore } from './s3K1ObjectStore.js'

let selectedStore: K1ObjectStore | undefined

export const getK1ObjectStore = (): K1ObjectStore => {
  if (selectedStore) return selectedStore
  selectedStore = config.k1Ingestion.objectStore === 's3'
    ? new S3K1ObjectStore()
    : localK1ObjectStore
  return selectedStore
}

export const setK1ObjectStoreForTests = (store?: K1ObjectStore): void => {
  selectedStore = store
}

export type { K1ObjectStore } from './K1ObjectStore.js'
