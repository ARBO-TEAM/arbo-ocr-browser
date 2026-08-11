import Ocr, { registerBackend } from 'arbo-ocr-common'
import { splitIntoLineImages } from 'arbo-ocr-common/splitIntoLineImages'
import { InferenceSession } from 'onnxruntime-web'
import { FileUtils } from './FileUtils'
import { ImageRaw } from './ImageRaw'

// Browser doesn't have default models - user must provide model paths via Ocr.create({ models: {...} })
registerBackend({ FileUtils, ImageRaw, InferenceSession, splitIntoLineImages, defaultModels: undefined })

export * from 'arbo-ocr-common'
export { ImageRaw } // Export ImageRaw for direct access to static methods (from, fromImageBitmap, etc.)
export default Ocr
