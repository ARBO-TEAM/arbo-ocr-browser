import Ocr, { ImageRaw } from 'arbo-ocr-browser'
import type { BrowserImageInput } from 'arbo-ocr-browser'

async function main() {
  const ocr = await Ocr.create({
    isDebug: true,
    models: {
      detectionPath: '/assets/PP-OCRv6_det_tiny.onnx',
      recognitionPath: '/assets/PP-OCRv6_rec_tiny.onnx',
      dictionaryPath: '/assets/PP-OCRv6_rec_tiny_dict.txt',
    },
  })
  ;(document.querySelector('.hide') as HTMLElement).style.visibility = 'visible'
  document.querySelector('#title')!.textContent = 'OCR is ready'

  createApp(async ({ image, inputType }) => {
    const startTime = new Date().valueOf()
    const result = await ocr.detect(image)
    const duration = new Date().valueOf() - startTime

    return {
      text: result.texts.map((v) => `${v.mean.toFixed(2)} ${v.text}`).join('\n'),
      duration,
      inputType,
    }
  })
}

function createApp(
  runOcr: (params: {
    image: BrowserImageInput
    inputType: string
  }) => Promise<{ text: string; duration: number; inputType: string }>,
) {
  const resultTextEl = document.querySelector('#result-text') as HTMLDivElement
  const performanceEl = document.querySelector('#performance') as HTMLDivElement
  const resultImageEl = document.querySelector('#result-image') as HTMLImageElement
  const inputImageEl = document.querySelector('#input-image') as HTMLInputElement
  const inputMethodEl = document.querySelector('#input-method') as HTMLSelectElement

  // Create input method selector if it doesn't exist
  if (!inputMethodEl) {
    const selector = document.createElement('select')
    selector.id = 'input-method'
    selector.innerHTML = `
      <option value="url">URL (string)</option>
      <option value="imagebitmap">ImageBitmap</option>
      <option value="htmlimage">HTMLImageElement</option>
      <option value="canvas">HTMLCanvasElement</option>
    `
    selector.style.marginLeft = '10px'
    inputImageEl.parentElement?.appendChild(selector)
  }

  inputImageEl.addEventListener('change', async (event) => {
    const file = (event.target as HTMLInputElement).files?.[0]
    if (!file) {
      return
    }
    const imageUrl = URL.createObjectURL(file)
    const method = (document.querySelector('#input-method') as HTMLSelectElement)?.value || 'url'
    await handleChange(imageUrl, file, method)
  })

  const handleChange = async (imageUrl: string, file: File, method: string) => {
    document.querySelectorAll('canvas').forEach((el) => el.remove())
    resultTextEl.textContent = 'Working in progress...'
    resultImageEl.setAttribute('src', imageUrl)

    let image: BrowserImageInput
    let inputType: string

    switch (method) {
      case 'imagebitmap': {
        // Create ImageBitmap from File/Blob
        image = await createImageBitmap(file)
        inputType = 'ImageBitmap (from createImageBitmap)'
        break
      }
      case 'htmlimage': {
        // Create HTMLImageElement
        const img = new Image()
        img.src = imageUrl
        await img.decode()
        image = img
        inputType = 'HTMLImageElement'
        break
      }
      case 'canvas': {
        // Create HTMLCanvasElement
        const img = new Image()
        img.src = imageUrl
        await img.decode()
        const canvas = document.createElement('canvas')
        canvas.width = img.naturalWidth
        canvas.height = img.naturalHeight
        const ctx = canvas.getContext('2d')!
        ctx.drawImage(img, 0, 0)
        image = canvas
        inputType = 'HTMLCanvasElement'
        break
      }
      default: {
        // Use URL string (original behavior)
        image = imageUrl
        inputType = 'URL string'
        break
      }
    }

    const { text, duration } = await runOcr({ image, inputType })
    resultTextEl.textContent = text
    performanceEl.textContent = `Performance: ${duration}ms | Input: ${inputType} (Close Chrome DevTools to get accurate result)`
  }

  if (process.env.DEFAULT_IMAGE_PATH) {
    // For default image, use URL method
    fetch(process.env.DEFAULT_IMAGE_PATH)
      .then(res => res.blob())
      .then(blob => {
        const file = new File([blob], 'default.jpg', { type: blob.type })
        handleChange(process.env.DEFAULT_IMAGE_PATH!, file, 'url')
      })
  }
}

main()
