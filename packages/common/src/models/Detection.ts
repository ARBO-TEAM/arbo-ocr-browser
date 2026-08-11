import type { InferenceSession as InferenceSessionCommon, Tensor } from 'onnxruntime-common'
import invariant from 'tiny-invariant'
import { ImageRaw, InferenceSession, defaultModels, splitIntoLineImages } from '#common/backend'
import type { ImageRawData, BrowserImageInput, ImageRaw as ImageRawType, ModelCreateOptions, Size } from '#common/types'
import { ModelBase } from './ModelBase'

const BASE_SIZE = 32

/**
 * Default longest-side cap for the detector input. 960 is PaddleOCR's own
 * `det_limit_side_len` default and what the arboOCR C++ engine uses.
 */
const DEFAULT_DETECTION_MAX_SIZE = 960

export class Detection extends ModelBase {
  static async create({ models, onnxOptions = {}, ...restOptions }: ModelCreateOptions) {
    const detectionPath = models?.detectionPath || defaultModels?.detectionPath
    invariant(detectionPath, 'detectionPath is required')
    const mergedOptions = {
      executionProviders: ['webgpu', 'webgl', 'wasm'],
      graphOptimizationLevel: 'all' as const,
      enableCpuMemArena: true,
      enableMemPattern: true,
      ...onnxOptions,
    }
    const model = await InferenceSession.create(detectionPath, mergedOptions)
    return new Detection({ model, options: restOptions })
  }

  async run(
    input: string | ImageRawData | BrowserImageInput,
    { onnxOptions = {} }: { onnxOptions?: InferenceSessionCommon.RunOptions } = {},
  ) {
    // Use ImageRaw.from() factory method if available (browser), otherwise fallback to legacy handling
    const image =
      typeof (ImageRaw as any).from === 'function'
        ? await (ImageRaw as any).from(input)
        : typeof input === 'string'
          ? await ImageRaw.open(input)
          : new ImageRaw(input as ImageRawData)

    // Resize image to multiple of 32, capped on the longest side.
    //   - image width and height must be a multiple of 32
    //   - without the cap, detection runs at source resolution: cost grows with
    //     megapixels (a 34.8 MP scan took ~10 s vs ~0.6 s capped), and the
    //     larger models can exhaust memory outright.
    //   - detectionMaxSize: 0 opts back out.
    const maxSize = this.options.detectionMaxSize ?? DEFAULT_DETECTION_MAX_SIZE
    const inputImage = await image.resize(multipleOfBaseSize(image, { maxSize }))
    this.debugImage(inputImage, 'out1-multiple-of-base-size.jpg')

    // Covert image data to model data
    //   - Using `(RGB / 255 - mean) / std` formula
    //   - omit reshapeOptions (mean/std) is more accurate, can creaet a run option for them
    const modelData = this.imageToInput(inputImage, {
      // mean: [0.485, 0.456, 0.406],
      // std: [0.229, 0.224, 0.225],
    })

    // Run the model
    // console.time('Detection')
    const modelOutput = await this.runModel({ modelData, onnxOptions })
    // console.timeEnd('Detection')

    // Convert output data back to image data
    //   - output value is from 0 to 1, a probability, if value > 0.3, it is a text
    //   - returns a black and white image
    const outputImage = outputToImage(modelOutput, 0.03)
    this.debugImage(outputImage, 'out2-black-white.jpg')

    // Find text boxes, split image into lines
    //   - findContours from the image
    //   - returns text boxes and line images
    const lineImages = await splitIntoLineImages(outputImage, inputImage)
    this.debugBoxImage(inputImage, lineImages, 'boxes.jpg')

    return {
      lineImages,
      resizedImageWidth: inputImage.width,
      resizedImageHeight: inputImage.height,
    }
  }
}

function multipleOfBaseSize(image: ImageRawType, { maxSize }: { maxSize?: number } = {}): Size {
  let width = image.width
  let height = image.height
  if (maxSize && Math.max(width, height) > maxSize) {
    const ratio = width > height ? maxSize / width : maxSize / height
    width = width * ratio
    height = height * ratio
  }
  const newWidth = Math.max(
    // Math.round
    // Math.ceil
    Math.ceil(width / BASE_SIZE) * BASE_SIZE,
    BASE_SIZE,
  )
  const newHeight = Math.max(Math.ceil(height / BASE_SIZE) * BASE_SIZE, BASE_SIZE)
  return { width: newWidth, height: newHeight }
}

function outputToImage(output: Tensor, threshold: number): ImageRawType {
  const height = output.dims[2]
  const width = output.dims[3]
  const data = new Uint8Array(width * height * 4)
  for (const [outIndex, outValue] of output.data.entries()) {
    const n = outIndex * 4
    const value = (outValue as number) > threshold ? 255 : 0
    data[n] = value // R
    data[n + 1] = value // G
    data[n + 2] = value // B
    data[n + 3] = 255 // A
  }
  return new ImageRaw({ data, width, height })
}
