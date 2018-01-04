import { Parser } from 'xml2js'

const parser = new Parser({
  explicitArray: false,
  normalize: false,
  normalizeTags: true,
  trim: true
})

export function parseStringAsync (input) {
  return new Promise((resolve, reject) => {
    parser.parseString(input, (err, output) => {
      if (err) {
        reject(err)
      } else {
        resolve(output)
      }
    })
  })
}
