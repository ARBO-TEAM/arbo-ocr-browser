import { InferenceSession } from 'onnxruntime-common'
import { ImageRawBase as ImageRaw } from '#common/backend/ImageRawBase'
import type { splitIntoLineImages } from '#common/backend/splitIntoLineImages'

export { FileUtilsBase as FileUtils } from '#common/backend/FileUtilsBase'
export { ImageRaw, InferenceSession }

export type SplitIntoLineImages = typeof splitIntoLineImages

export type ReshapeOptions = {
  mean?: number[]
  std?: number[]
}

export type ImageRawData = {
  data: Uint8Array | Uint8ClampedArray // Uint8Array: Node Buffer, Uint8ClampedArray: Web ImageData
  width: number
  height: number
}

/**
 * Browser-specific image input types
 * Supports various browser image sources that can be converted to ImageRawData
 */
export type BrowserImageInput =
  | string // URL or data URL
  | ImageRawData // Raw pixel data
  | ImageBitmap // From createImageBitmap(), OffscreenCanvas, etc.
  | HTMLImageElement // <img> element
  | HTMLCanvasElement // <canvas> element
  | HTMLVideoElement // <video> element (captures current frame)

export type ModelData = {
  data: number[] | Uint8Array | Float32Array
  width: number
  height: number
}

export type Size = {
  width: number
  height: number
}

export type SizeOption = {
  width?: number
  height?: number
  fit?: 'contain' | 'cover' | 'fill' | 'inside' | 'outside'
}

export type LineImage = {
  image: ImageRaw
  // TODO: [top, right, bottom, left], top: [x,y]
  box: number[][]
}

export type Region = {
  left: number
  top: number
  width: number
  height: number
}

export type Line = {
  text: string
  mean: number
  box?: number[][]
}

export type Dictionary = string[]

export type Point = [x: number, y: number]

export interface ModelBaseConstructorArg {
  model: InferenceSession
  options: ModelBaseOptions
}

export interface ModelBaseOptions {
  isDebug?: boolean
  debugOutputDir?: string
  /**
   * Longest side, in pixels, that the detector input is downscaled to before
   * inference. Aspect ratio is preserved and images already smaller are left
   * alone. Defaults to 960, matching PaddleOCR's `det_limit_side_len`.
   *
   * Without a cap, detection runs at the source resolution: a 34.8 MP scan
   * takes ~10 s instead of ~0.6 s, and the largest models can exhaust memory.
   * Set to `0` to disable the cap and restore the old unbounded behaviour.
   */
  detectionMaxSize?: number
}

export interface ModelCreateOptions extends ModelBaseOptions {
  models?: {
    detectionPath: string
    recognitionPath: string
    dictionaryPath: string
  }
  onnxOptions?: InferenceSession.SessionOptions
}
