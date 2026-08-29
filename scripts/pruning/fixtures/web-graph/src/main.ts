import './styles.css'
import { feature } from './feature'
import type { Model } from './model'

const dynamicTarget = './dynamic-target'
void import(dynamicTarget)
void import('./lazy')

export const current: Model = feature
