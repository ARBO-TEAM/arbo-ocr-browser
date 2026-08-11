# arbo-ocr-browser

> Fork of [@gutenye/ocr](https://github.com/gutenye/ocr) with **ImageBitmap support**

**OCR Javascript library for Browser with extended image input support**

Based on [PaddleOCR](https://github.com/PaddlePaddle/PaddleOCR) and [ONNX Runtime](https://github.com/microsoft/onnxruntime), supports PP-OCRv6 models

## What's New in This Fork

- **ImageBitmap support**: Pass `ImageBitmap` directly to `ocr.detect()`
- **HTMLImageElement support**: Pass `<img>` elements directly
- **HTMLCanvasElement support**: Pass `<canvas>` elements directly
- **HTMLVideoElement support**: Capture current frame from `<video>` elements

## Getting Started

### Browser

```ts
bun add arbo-ocr-browser
```

```ts
import Ocr from 'arbo-ocr-browser'

const ocr = await Ocr.create({
  models: {
    detectionPath: '/assets/PP-OCRv6_det_tiny.onnx',
    recognitionPath: '/assets/PP-OCRv6_rec_tiny.onnx',
    dictionaryPath: '/assets/PP-OCRv6_rec_tiny_dict.txt'
  }
})

// URL string (original)
const result = await ocr.detect('/image.jpg')

// ImageBitmap (NEW)
const bitmap = await createImageBitmap(file)
const result = await ocr.detect(bitmap)

// HTMLImageElement (NEW)
const img = document.querySelector('img')
const result = await ocr.detect(img)

// HTMLCanvasElement (NEW)
const canvas = document.querySelector('canvas')
const result = await ocr.detect(canvas)

// HTMLVideoElement - captures current frame (NEW)
const video = document.querySelector('video')
const result = await ocr.detect(video)

// Raw pixel data (original)
const result = await ocr.detect({
  data: imageData.data,  // Uint8ClampedArray
  width: 800,
  height: 600
})
```

## API Reference

```ts
Ocr.create({
  models?: {
    detectionPath: string
    recognitionPath: string
    dictionaryPath: string
  },
  isDebug?: boolean
}): Promise<Ocr>

// Browser - Extended input types
ocr.detect(
  image: string                 // URL or data URL
        | ImageBitmap           // from createImageBitmap()
        | HTMLImageElement      // <img> element
        | HTMLCanvasElement     // <canvas> element
        | HTMLVideoElement      // <video> element (current frame)
        | {                     // Raw pixel data
            data: Uint8Array | Uint8ClampedArray,
            width: number,
            height: number
          }
): Promise<{
  texts: TextLine[],
  resizedImageWidth: number,
  resizedImageHeight: number
}>

TextLine {
  text: string
  mean: number
  box?: number[][]
}
```

## ImageRaw Static Methods

For advanced use cases, you can use `ImageRaw` directly:

```ts
import { ImageRaw } from 'arbo-ocr-browser'

// Universal factory method
const imageRaw = await ImageRaw.from(input)

// Specific converters
const imageRaw = await ImageRaw.fromImageBitmap(bitmap)
const imageRaw = await ImageRaw.fromHTMLImageElement(img)
const imageRaw = await ImageRaw.fromHTMLCanvasElement(canvas)
const imageRaw = await ImageRaw.fromHTMLVideoElement(video)

// Type guards
ImageRaw.isImageBitmap(input)
ImageRaw.isHTMLImageElement(input)
ImageRaw.isHTMLCanvasElement(input)
ImageRaw.isHTMLVideoElement(input)
ImageRaw.isImageRawData(input)
```

## Memory Management

When using `ImageBitmap`, the library automatically calls `bitmap.close()` after conversion to free GPU/CPU memory. You don't need to manage this manually.

```ts
const bitmap = await createImageBitmap(file)
await ocr.detect(bitmap)  // bitmap is automatically closed after use
// bitmap is now invalid - don't reuse it
```

If you need to reuse the bitmap, create a new one for each OCR call.

## Credits

This is a fork of [@gutenye/ocr](https://github.com/gutenye/ocr) by [Guten Ye](https://github.com/gutenye).

Original project features:
- High accuracy OCR based on PaddleOCR PP-OCRv4 model
- ONNX Runtime for cross-platform inference
- Support for Node.js, Browser, React Native, and C++

## License

MIT - See [LICENSE](./LICENSE) for details.
