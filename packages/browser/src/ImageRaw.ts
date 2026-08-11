import { ImageRawBase } from 'arbo-ocr-common'
import type { ImageRawData, LineImage, SizeOption, BrowserImageInput } from 'arbo-ocr-common'
import invariant from 'tiny-invariant'

// ===========================================
// Environment Detection & Canvas Factory
// (Cached for performance)
// ===========================================

type AnyCanvas = HTMLCanvasElement | OffscreenCanvas
type AnyCanvasContext = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D

// Cache environment checks (evaluated once at module load)
const IS_WORKER = typeof window === 'undefined' && typeof self !== 'undefined' && typeof document === 'undefined'
const HAS_OFFSCREEN_CANVAS = typeof OffscreenCanvas !== 'undefined'
const HAS_DOCUMENT = typeof document !== 'undefined'
const HAS_IMAGE = typeof Image !== 'undefined'
const HAS_CREATE_IMAGE_BITMAP = typeof createImageBitmap !== 'undefined'

// Cache canvas contexts for reuse (WeakMap allows GC when canvas is gone)
const contextCache = new WeakMap<AnyCanvas, AnyCanvasContext>()

/**
 * Create a canvas that works in both main thread and Web Worker
 * Prefers OffscreenCanvas for better performance
 */
function createCanvas(width: number, height: number): AnyCanvas {
  if (HAS_OFFSCREEN_CANVAS) {
    return new OffscreenCanvas(width, height)
  }
  if (HAS_DOCUMENT) {
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    return canvas
  }
  throw new Error('No canvas support available. Neither OffscreenCanvas nor document is available.')
}

/**
 * Get 2D context from any canvas type (cached for performance)
 */
function getContext2D(canvas: AnyCanvas, options?: CanvasRenderingContext2DSettings): AnyCanvasContext | null {
  // Check cache first
  const cached = contextCache.get(canvas)
  if (cached) return cached

  // Create new context with performance hints
  const ctx = canvas.getContext('2d', {
    willReadFrequently: true, // Optimize for getImageData() calls
    ...options
  }) as AnyCanvasContext | null

  if (ctx) {
    contextCache.set(canvas, ctx)
  }
  return ctx
}

/**
 * Get ImageData from any canvas type
 */
function getImageData(canvas: AnyCanvas): ImageData {
  const ctx = getContext2D(canvas)
  if (!ctx) {
    throw new Error('Failed to get 2D context')
  }
  return ctx.getImageData(0, 0, canvas.width, canvas.height)
}

/**
 * Create ImageBitmap with optimized options for OCR
 * - premultiplyAlpha: 'none' - avoid alpha premultiplication overhead
 * - colorSpaceConversion: 'none' - avoid color space conversion overhead
 */
async function createOptimizedImageBitmap(source: ImageBitmapSource): Promise<ImageBitmap> {
  if (!HAS_CREATE_IMAGE_BITMAP) {
    throw new Error('createImageBitmap is not supported')
  }
  
  try {
    // Try with optimization options (may not be supported in all browsers)
    return await createImageBitmap(source, {
      premultiplyAlpha: 'none',
      colorSpaceConversion: 'none',
    })
  } catch {
    // Fallback without options
    return await createImageBitmap(source)
  }
}

export class ImageRaw extends ImageRawBase {
  data: Uint8ClampedArray
  #imageData: ImageData
  #canvas: AnyCanvas

  // ===========================================
  // Type Guards
  // ===========================================

  /**
   * Check if the input is an ImageBitmap
   */
  static isImageBitmap(input: unknown): input is ImageBitmap {
    return typeof ImageBitmap !== 'undefined' && input instanceof ImageBitmap
  }

  /**
   * Check if the input is an HTMLImageElement
   */
  static isHTMLImageElement(input: unknown): input is HTMLImageElement {
    return typeof HTMLImageElement !== 'undefined' && input instanceof HTMLImageElement
  }

  /**
   * Check if the input is an HTMLCanvasElement
   */
  static isHTMLCanvasElement(input: unknown): input is HTMLCanvasElement {
    return typeof HTMLCanvasElement !== 'undefined' && input instanceof HTMLCanvasElement
  }

  /**
   * Check if the input is an HTMLVideoElement
   */
  static isHTMLVideoElement(input: unknown): input is HTMLVideoElement {
    return typeof HTMLVideoElement !== 'undefined' && input instanceof HTMLVideoElement
  }

  /**
   * Check if the input is an OffscreenCanvas
   */
  static isOffscreenCanvas(input: unknown): input is OffscreenCanvas {
    return HAS_OFFSCREEN_CANVAS && input instanceof OffscreenCanvas
  }

  /**
   * Check if the input is ImageRawData
   */
  static isImageRawData(input: unknown): input is ImageRawData {
    return (
      typeof input === 'object' &&
      input !== null &&
      'data' in input &&
      'width' in input &&
      'height' in input &&
      (input.data instanceof Uint8Array || input.data instanceof Uint8ClampedArray)
    )
  }

  // ===========================================
  // Factory Methods
  // ===========================================

  /**
   * Universal factory method that accepts all browser image input types
   * Works in both main thread and Web Worker
   * @param input - URL string, ImageRawData, ImageBitmap, HTMLImageElement, HTMLCanvasElement, OffscreenCanvas, or HTMLVideoElement
   * @returns Promise<ImageRaw>
   */
  static async from(input: BrowserImageInput | OffscreenCanvas): Promise<ImageRaw> {
    // String (URL or data URL)
    if (typeof input === 'string') {
      return ImageRaw.open(input)
    }

    // ImageBitmap - Works in both main thread and Worker (most efficient)
    if (ImageRaw.isImageBitmap(input)) {
      return ImageRaw.fromImageBitmap(input)
    }

    // OffscreenCanvas - Works in both main thread and Worker
    if (ImageRaw.isOffscreenCanvas(input)) {
      return ImageRaw.fromOffscreenCanvas(input)
    }

    // HTMLImageElement - Main thread only
    if (ImageRaw.isHTMLImageElement(input)) {
      if (IS_WORKER) {
        throw new Error('HTMLImageElement is not available in Web Worker. Use ImageBitmap instead.')
      }
      return ImageRaw.fromHTMLImageElement(input)
    }

    // HTMLCanvasElement - Main thread only
    if (ImageRaw.isHTMLCanvasElement(input)) {
      if (IS_WORKER) {
        throw new Error('HTMLCanvasElement is not available in Web Worker. Use OffscreenCanvas instead.')
      }
      return ImageRaw.fromHTMLCanvasElement(input)
    }

    // HTMLVideoElement - Main thread only
    if (ImageRaw.isHTMLVideoElement(input)) {
      if (IS_WORKER) {
        throw new Error('HTMLVideoElement is not available in Web Worker. Use ImageBitmap instead.')
      }
      return ImageRaw.fromHTMLVideoElement(input)
    }

    // ImageRawData (fallback) - Works everywhere
    if (ImageRaw.isImageRawData(input)) {
      return new ImageRaw(input)
    }

    throw new Error('Unsupported image input type')
  }

  /**
   * Create ImageRaw from a URL
   * Works in both main thread and Web Worker
   * Uses fetch + createImageBitmap for best performance
   */
  static async open(url: string): Promise<ImageRaw> {
    // Prefer fetch + createImageBitmap (works everywhere, better performance)
    if (HAS_CREATE_IMAGE_BITMAP) {
      const response = await fetch(url)
      const blob = await response.blob()
      const bitmap = await createOptimizedImageBitmap(blob)
      return ImageRaw.fromImageBitmap(bitmap)
    }
    
    // Fallback: use Image element (main thread only)
    if (!IS_WORKER && HAS_IMAGE) {
      const image = await imageFromUrl(url)
      const canvas = createCanvas(image.naturalWidth, image.naturalHeight)
      canvasDrawImage(canvas, image, image.naturalWidth, image.naturalHeight)
      const imageData = getImageData(canvas)
      return new ImageRaw({
        data: imageData.data,
        width: imageData.width,
        height: imageData.height,
      })
    }

    throw new Error('Cannot load image from URL: no supported method available')
  }

  /**
   * Create ImageRaw from an ImageBitmap
   * Works in both main thread and Web Worker
   * Note: This method will close the ImageBitmap after conversion to free memory
   * @param bitmap - ImageBitmap to convert
   * @returns Promise<ImageRaw>
   */
  static async fromImageBitmap(bitmap: ImageBitmap): Promise<ImageRaw> {
    // Validate bitmap
    if (bitmap.width === 0 || bitmap.height === 0) {
      throw new Error('Invalid ImageBitmap: dimensions are zero (bitmap may be closed or neutered)')
    }

    const canvas = createCanvas(bitmap.width, bitmap.height)
    const ctx = getContext2D(canvas)
    
    if (!ctx) {
      // Cleanup before throwing
      try { bitmap.close() } catch { /* ignore */ }
      throw new Error('Failed to create canvas 2D context')
    }

    try {
      ctx.drawImage(bitmap, 0, 0)
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)

      return new ImageRaw({
        data: imageData.data,
        width: imageData.width,
        height: imageData.height,
      })
    } finally {
      // Always close the bitmap to free GPU/CPU memory
      try { bitmap.close() } catch { /* ignore */ }
    }
  }

  /**
   * Create ImageRaw from an OffscreenCanvas
   * Works in both main thread and Web Worker
   * @param canvas - OffscreenCanvas to convert
   * @returns Promise<ImageRaw>
   */
  static async fromOffscreenCanvas(canvas: OffscreenCanvas): Promise<ImageRaw> {
    const imageData = getImageData(canvas)

    return new ImageRaw({
      data: imageData.data,
      width: imageData.width,
      height: imageData.height,
    })
  }

  /**
   * Create ImageRaw from an HTMLImageElement
   * Main thread only
   * @param img - HTMLImageElement to convert (must be loaded/decoded)
   * @returns Promise<ImageRaw>
   */
  static async fromHTMLImageElement(img: HTMLImageElement): Promise<ImageRaw> {
    if (IS_WORKER) {
      throw new Error('HTMLImageElement is not available in Web Worker. Use ImageBitmap instead.')
    }

    // Ensure image is loaded
    if (!img.complete || img.naturalWidth === 0) {
      await img.decode()
    }

    // Use createImageBitmap if available (more efficient)
    if (HAS_CREATE_IMAGE_BITMAP) {
      const bitmap = await createOptimizedImageBitmap(img)
      return ImageRaw.fromImageBitmap(bitmap)
    }

    // Fallback to canvas
    const canvas = createCanvas(img.naturalWidth, img.naturalHeight)
    canvasDrawImage(canvas, img, img.naturalWidth, img.naturalHeight)
    const imageData = getImageData(canvas)

    return new ImageRaw({
      data: imageData.data,
      width: imageData.width,
      height: imageData.height,
    })
  }

  /**
   * Create ImageRaw from an HTMLCanvasElement
   * Main thread only
   * @param canvas - HTMLCanvasElement to convert
   * @returns Promise<ImageRaw>
   */
  static async fromHTMLCanvasElement(canvas: HTMLCanvasElement): Promise<ImageRaw> {
    if (IS_WORKER) {
      throw new Error('HTMLCanvasElement is not available in Web Worker. Use OffscreenCanvas instead.')
    }

    const imageData = getImageData(canvas)

    return new ImageRaw({
      data: imageData.data,
      width: imageData.width,
      height: imageData.height,
    })
  }

  /**
   * Create ImageRaw from an HTMLVideoElement (captures current frame)
   * Main thread only
   * @param video - HTMLVideoElement to capture from
   * @returns Promise<ImageRaw>
   */
  static async fromHTMLVideoElement(video: HTMLVideoElement): Promise<ImageRaw> {
    if (IS_WORKER) {
      throw new Error('HTMLVideoElement is not available in Web Worker. Use ImageBitmap instead.')
    }

    if (video.readyState < 2) {
      throw new Error('Video is not ready. Ensure video has loaded metadata and data.')
    }

    // Use createImageBitmap if available (more efficient, direct GPU access)
    if (HAS_CREATE_IMAGE_BITMAP) {
      const bitmap = await createOptimizedImageBitmap(video)
      return ImageRaw.fromImageBitmap(bitmap)
    }

    // Fallback to canvas
    const canvas = createCanvas(video.videoWidth, video.videoHeight)
    const ctx = getContext2D(canvas)
    
    if (!ctx) {
      throw new Error('Failed to create canvas 2D context')
    }

    ctx.drawImage(video, 0, 0)
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)

    return new ImageRaw({
      data: imageData.data,
      width: imageData.width,
      height: imageData.height,
    })
  }

  // ===========================================
  // Constructor & Instance Methods
  // ===========================================

  constructor({ data, width, height }: ImageRawData) {
    // Avoid unnecessary copy if already Uint8ClampedArray
    const newData = data instanceof Uint8ClampedArray 
      ? new Uint8ClampedArray(data.buffer, data.byteOffset, data.length)
      : new Uint8ClampedArray(data)
    
    super({
      data: newData,
      width,
      height,
    })
    
    const canvas = createCanvas(width, height)
    const imageData = new ImageData(new Uint8ClampedArray(newData), width, height)
    canvasPutImageData(canvas, imageData)
    this.#canvas = canvas
    this.#imageData = imageData
    this.data = newData
  }

  /**
   * Debug method - appends canvas to document body
   * Main thread only, no-op in Worker
   */
  async write(path: string) {
    if (!IS_WORKER && HAS_DOCUMENT && this.#canvas instanceof HTMLCanvasElement) {
      document.body.append(this.#canvas)
    }
    // In Worker environment, this is a no-op
  }

  async resize({ width, height }: SizeOption) {
    invariant(width !== undefined || height !== undefined, 'both width and height are undefined')
    const newWidth = width || Math.round((this.width / this.height) * height!)
    const newHeight = height || Math.round((this.height / this.width) * width!)
    const newCanvas = createCanvas(newWidth, newHeight)
    canvasDrawImage(newCanvas, this.#canvas, newWidth, newHeight)
    const newImageData = getImageData(newCanvas)
    return this.#apply(newImageData)
  }

  async drawBox(lineImages: LineImage[]) {
    const ctx = getContext2D(this.#canvas)
    if (!ctx) {
      throw new Error('Failed to get 2D context')
    }
    ctx.strokeStyle = 'red'
    for (const lineImage of lineImages) {
      const [first, ...rests] = lineImage.box
      ctx.beginPath()
      ctx.moveTo(first[0], first[1])
      for (const rest of rests) {
        ctx.lineTo(rest[0], rest[1])
      }
      ctx.closePath()
      ctx.stroke()
    }
    return this
  }

  #apply(imageData: ImageData) {
    canvasPutImageData(this.#canvas, imageData)
    this.#imageData = imageData
    this.data = imageData.data
    this.width = imageData.width
    this.height = imageData.height
    return this
  }
}

// ===========================================
// Helper Functions
// ===========================================

function canvasDrawImage(canvas: AnyCanvas, image: CanvasImageSource, width?: number, height?: number) {
  canvas.width = width || (image as any).width
  canvas.height = height || (image as any).height
  const ctx = getContext2D(canvas)
  if (!ctx) {
    throw new Error('Failed to get 2D context')
  }
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height)
}

function canvasPutImageData(canvas: AnyCanvas, imageData: ImageData, width?: number, height?: number) {
  canvas.width = width || imageData.width
  canvas.height = height || imageData.height
  const ctx = getContext2D(canvas)
  if (!ctx) {
    throw new Error('Failed to get 2D context')
  }
  ctx.putImageData(imageData, 0, 0)
}

async function imageFromUrl(url: string): Promise<HTMLImageElement> {
  const image = new Image()
  image.src = url
  await image.decode()
  return image
}
