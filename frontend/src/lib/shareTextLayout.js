export const SOURCE_TEXT_LAYOUT = Object.freeze({
  width: 249,
  height: 35,
  maximumSize: 21.6,
  minimumSize: 4,
  lineHeightRatio: 1,
  imageScale: 390 / 249,
})

const splitWrappedLines = (context, text, maxWidth) => {
  const words = text.replace(/\n/g, ' \n ').split(/\s+/)
  const lines = []
  let line = ''

  words.forEach((word) => {
    if (word === '\n') {
      if (line) lines.push(line)
      line = ''
      return
    }

    if (context.measureText(word).width > maxWidth) {
      if (line) {
        lines.push(line)
        line = ''
      }
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

    const nextLine = line ? `${line} ${word}` : word
    if (line && context.measureText(nextLine).width > maxWidth) {
      lines.push(line)
      line = word
    } else {
      line = nextLine
    }
  })

  if (line) lines.push(line)
  return lines
}

export const getSourceTextLayout = (text) => {
  const context = document.createElement('canvas').getContext('2d')
  const { width, height, maximumSize, minimumSize, lineHeightRatio } = SOURCE_TEXT_LAYOUT

  const layoutAt = (size) => {
    context.font = `400 ${size}px "Arha Magnit", Arial`
    const lines = splitWrappedLines(context, text, width)
    const lineHeight = size * lineHeightRatio
    const textHeight = size + Math.max(0, lines.length - 1) * lineHeight
    return { size, lines, lineHeight, fits: textHeight <= height }
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

  return layout
}
