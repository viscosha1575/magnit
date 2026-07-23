import { getSourceTextLayout, SOURCE_TEXT_LAYOUT } from './shareTextLayout.js'

const VERSION = 'v=20260722'
const asset = (name) => `/svg/${name}?${VERSION}`

const loadImage = (source) => new Promise((resolve, reject) => {
  const image = new Image()
  image.onload = () => resolve(image)
  image.onerror = reject
  image.src = source
})

const loadSvg = async (source, transform = (value) => value) => {
  const svg = transform(await fetch(source).then((response) => response.text()))
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }))
  try { return await loadImage(url) } finally { URL.revokeObjectURL(url) }
}

const wrappedLines = (context, text, maxWidth) => {
  const words = text.replace(/\n/g, ' \n ').split(/\s+/)
  const lines = []
  let line = ''
  words.forEach((word) => {
    if (word === '\n') { if (line) lines.push(line); line = ''; return }
    if (context.measureText(word).width > maxWidth) {
      if (line) { lines.push(line); line = '' }
      let fragment = ''
      ;[...word].forEach((character) => {
        const nextFragment = fragment + character
        if (fragment && context.measureText(nextFragment).width > maxWidth) {
          lines.push(fragment)
          fragment = character
        } else {
          fragment = nextFragment
        }
      })
      line = fragment
      return
    }
    const next = line ? `${line} ${word}` : word
    if (line && context.measureText(next).width > maxWidth) { lines.push(line); line = word } else line = next
  })
  if (line) lines.push(line)
  return lines
}

const drawText = (context, text, x, y, maxWidth, maxHeight, options = {}) => {
  const { maximumSize = 32, minimumSize = 6, maximumLines = Infinity, weight = 600, lineHeightRatio = 1.16 } = options
  const layoutAt = (size) => {
    context.font = `${weight} ${size}px "Arha Magnit", Arial`
    const lines = wrappedLines(context, text, maxWidth)
    const lineHeight = size * lineHeightRatio
    const height = size + Math.max(0, lines.length - 1) * lineHeight
    return { size, lines, lineHeight, fits: lines.length <= maximumLines && height <= maxHeight }
  }

  let low = Math.min(minimumSize, maximumSize)
  let high = maximumSize
  let layout = layoutAt(low)
  for (let iteration = 0; iteration < 14; iteration += 1) {
    const middle = (low + high) / 2
    const candidate = layoutAt(middle)
    if (candidate.fits) {
      layout = candidate
      low = middle
    } else {
      high = middle
    }
  }
  context.font = `${weight} ${layout.size}px "Arha Magnit", Arial`
  const { lines, lineHeight } = layout
  lines.forEach((line, index) => context.fillText(line, x, y + index * lineHeight))
  return {
    lines: lines.length,
    size: layout.size,
    lineHeight,
    bottom: y + Math.max(0, lines.length - 1) * lineHeight + layout.size * .2,
  }
}

const roundRect = (context, x, y, width, height, radius, fill = true) => {
  context.beginPath()
  context.roundRect(x, y, width, height, radius)
  if (fill) context.fill()
  else context.stroke()
}

export async function createResultImage(inputText, translatedText) {
  await document.fonts?.ready
  const sourceTextLayout = getSourceTextLayout(inputText)
  const [title, star, logo, audience] = await Promise.all([
    loadSvg('/svg/moya_rabota.svg?v=20260723-4', (svg) => svg.replace(/<defs>[\s\S]*?<\/defs>/, '').replace(/<style>[\s\S]*?<\/style>/, '')),
    loadImage(asset('star2.svg')),
    loadSvg(asset('magnit.svg'), (svg) => svg.replace(/#[0-9a-f]{6}/gi, '#FFFFFF')),
    loadImage(asset('all.svg')),
  ])
  const canvas = document.createElement('canvas')
  canvas.width = 1200; canvas.height = 2154
  const context = canvas.getContext('2d')
  context.scale(2, 2)
  const background = context.createLinearGradient(0, 0, 600, 1077)
  background.addColorStop(0, '#ff5614'); background.addColorStop(1, '#ff1710')
  context.fillStyle = background; roundRect(context, 0, 0, 600, 1077, 60)
  context.globalAlpha = .5; context.drawImage(title, 18, 4, 564, 260); context.globalAlpha = 1
  context.drawImage(star, 142, 224, 62, 62)
  context.fillStyle = '#fff'; context.font = '700 30px "Arha Magnit", Arial'
  context.fillText('влияет на жизнь', 218, 249); context.fillText('миллионов', 218, 279)

  context.save(); context.translate(300, 490); context.rotate(-7 * Math.PI / 180)
  context.shadowColor = 'rgba(100,0,0,.2)'; context.shadowBlur = 22; context.fillStyle = '#fff'
  roundRect(context, -270, -165, 540, 330, 34); context.shadowColor = 'transparent'
  context.drawImage(audience, -232, -126, 42, 42)
  context.fillStyle = '#1d1d1d'; context.font = '500 28px "Arha Magnit", Arial'; context.fillText('Для всех', -170, -94)
  context.strokeStyle = '#ccc'; context.lineWidth = 2; roundRect(context, -230, -65, 460, 190, 32, false)
  context.fillStyle = '#1d1d1d'
  const arrowWidth = 128.2
  const arrowHeight = 108.3
  const arrowGap = 18
  const arrowLeft = 195 - arrowWidth
  const sourceTextWidth = 390 - arrowWidth - arrowGap
  const sourceImageSize = sourceTextLayout.size * SOURCE_TEXT_LAYOUT.imageScale
  drawText(context, inputText, -195, -15, sourceTextWidth, SOURCE_TEXT_LAYOUT.height * SOURCE_TEXT_LAYOUT.imageScale, {
    maximumSize: sourceImageSize,
    minimumSize: 12,
    weight: 400,
    lineHeightRatio: SOURCE_TEXT_LAYOUT.lineHeightRatio,
  })
  const arrowTop = -65 + (190 - arrowHeight) / 2
  context.save(); context.translate(arrowLeft, arrowTop); context.scale(arrowWidth / 46, arrowHeight / 47)
  context.fillStyle = '#e30613'
  context.fill(new Path2D('M0.416412 0.779436C0.144156 0.825601 -0.0391278 1.08373 0.0070364 1.35599C0.0532006 1.62824 0.311331 1.81153 0.583588 1.76536L0.5 1.2724L0.416412 0.779436ZM39.7281 45.7577C39.8035 46.0234 40.0799 46.1776 40.3456 46.1022L44.6747 44.874C44.9404 44.7986 45.0946 44.5221 45.0193 44.2565C44.9439 43.9908 44.6674 43.8366 44.4018 43.9119L40.5537 45.0037L39.4619 41.1556C39.3865 40.89 39.11 40.7357 38.8444 40.8111C38.5787 40.8865 38.4245 41.1629 38.4998 41.4286L39.7281 45.7577ZM0.5 1.2724L0.583588 1.76536C5.01715 1.0136 12.3038 1.559103 19.7112 1.6462C27.1282 2.73469 34.586 5.35659 39.4565 10.6861L39.8256 10.3487L40.1947 10.0114C35.0988 4.43527 27.3717 1.75971 19.8564 0.656793C12.3316 -0.44752 4.9387 0.012629 0.416412 0.779436L0.5 1.2724ZM39.8256 10.3487L39.4565 10.6861C44.3103 15.9972 45.4053 22.8495 44.7666 29.3204C44.1276 35.7935 41.7578 41.8195 39.7725 45.3776L40.2091 45.6212L40.6458 45.8649C42.6853 42.2095 45.107 36.052 45.7617 29.4187C46.4167 22.7832 45.3074 15.6059 40.1947 10.0114L39.8256 10.3487Z'))
  context.restore(); context.restore()

  context.save(); context.translate(302, 750); context.rotate(6 * Math.PI / 180)
  context.shadowColor = 'rgba(100,0,0,.32)'; context.shadowBlur = 32; context.fillStyle = '#ed001b'
  roundRect(context, -270, -175, 540, 350, 34); context.shadowColor = 'transparent'
  context.drawImage(logo, -230, -137, 38, 38)
  context.fillStyle = '#fff'; context.font = '500 28px "Arha Magnit", Arial'; context.fillText('Магнит', -174, -108)
  roundRect(context, -230, -76, 460, 210, 32)
  context.fillStyle = '#1d1d1d'; drawText(context, translatedText, -195, -24, 385, 158)
  context.restore()

  context.drawImage(logo, 128, 995, 44, 44); context.drawImage(star, 430, 989, 54, 54)
  context.fillStyle = '#fff'; context.fillRect(182, 1013, 238, 4)
  return new Promise((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('PNG creation failed')), 'image/png'))
}
