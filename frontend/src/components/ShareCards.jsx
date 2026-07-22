import { useLayoutEffect, useRef } from 'react'
import './ShareCards.css'

function ShareCards({
  audience = 'Для всех',
  sourceText = 'Я работаю',
  sourceAccent = 'в логистике',
  sourceCount = '19/200',
  brand = '«Магнит»',
  resultLead = 'Я решаю, как',
  resultAccent = '30 000 магазинов',
  resultLine = 'получают товар',
  resultEnd = 'вовремя',
  sourceValue,
  resultValue,
}) {
  const sourcePanelRef = useRef(null)
  const sourceCopyRef = useRef(null)
  const resultPanelRef = useRef(null)
  const resultCopyRef = useRef(null)

  useLayoutEffect(() => {
    const targets = [
      [sourcePanelRef.current, sourceCopyRef.current, 8],
      [resultPanelRef.current, resultCopyRef.current, 7],
    ].filter(([panel, copy]) => panel && copy)
    if (!targets.length) return undefined

    let animationFrame = 0
    const fitText = (panel, copy, minimumSize) => {
      copy.style.removeProperty('font-size')
      const maximumSize = Number.parseFloat(window.getComputedStyle(copy).fontSize)
      const panelStyle = window.getComputedStyle(panel)
      const availableWidth = panel.clientWidth
        - Number.parseFloat(panelStyle.paddingLeft)
        - Number.parseFloat(panelStyle.paddingRight)
      const availableHeight = panel.clientHeight
        - Number.parseFloat(panelStyle.paddingTop)
        - Number.parseFloat(panelStyle.paddingBottom)
      if (!maximumSize || availableWidth <= 0 || availableHeight <= 0) return

      const fits = () => (
        copy.scrollWidth <= availableWidth + 1
        && copy.scrollHeight <= availableHeight + 1
      )
      copy.style.fontSize = `${maximumSize}px`
      if (fits()) return

      let low = Math.min(minimumSize, maximumSize)
      let high = maximumSize
      let best = low
      copy.style.fontSize = `${low}px`
      for (let iteration = 0; iteration < 12; iteration += 1) {
        const middle = (low + high) / 2
        copy.style.fontSize = `${middle}px`
        if (fits()) {
          best = middle
          low = middle
        } else {
          high = middle
        }
      }
      copy.style.fontSize = `${best}px`
    }

    const fitAllText = () => {
      window.cancelAnimationFrame(animationFrame)
      animationFrame = window.requestAnimationFrame(() => {
        targets.forEach(([panel, copy, minimumSize]) => fitText(panel, copy, minimumSize))
      })
    }
    const observer = new ResizeObserver(fitAllText)
    targets.forEach(([panel]) => observer.observe(panel))
    document.fonts?.ready.then(fitAllText)
    fitAllText()

    return () => {
      window.cancelAnimationFrame(animationFrame)
      observer.disconnect()
    }
  }, [sourceValue, resultValue])

  const renderLines = (value) => value.split('\n').map((line, index) => (
    <span key={`${line}-${index}`}>{index > 0 && <br />}{line}</span>
  ))

  return (
    <div className="share-stack">
      <div className="share-stack__source">
        <div className="share-stack__label">
          <img src="/svg/all.svg" alt="" />
          {audience}
        </div>
        <p ref={sourcePanelRef} className="share-stack__panel share-stack__source-text">
          {sourceValue ? (
            <span ref={sourceCopyRef} className="share-stack__source-copy share-stack__source-copy--dynamic">{renderLines(sourceValue)}</span>
          ) : (
            <span className="share-stack__source-copy">
              {sourceText}<br /><span className="share-stack__source-accent">
                {sourceAccent}
                <svg viewBox="0 0 99 20" preserveAspectRatio="none" aria-hidden="true">
                  <path d="M34.4491 0.67313C22.5404 -0.163897 -0.621753 1.95787 0.543187 8.71435C2.36261 19.2668 42.4667 19.0201 51.1006 18.933C59.7344 18.8459 98.8994 17.9454 98.0185 8.04655C97.1375 -1.85221 51.467 1.19591 28.6317 2.71999" />
                </svg>
              </span>
            </span>
          )}
          <svg className="share-stack__source-arrow" viewBox="0 0 46 47" aria-hidden="true">
            <path d="M0.416412 0.779436C0.144156 0.825601 -0.0391278 1.08373 0.0070364 1.35599C0.0532006 1.62824 0.311331 1.81153 0.583588 1.76536L0.5 1.2724L0.416412 0.779436ZM39.7281 45.7577C39.8035 46.0234 40.0799 46.1776 40.3456 46.1022L44.6747 44.874C44.9404 44.7986 45.0946 44.5221 45.0193 44.2565C44.9439 43.9908 44.6674 43.8366 44.4018 43.9119L40.5537 45.0037L39.4619 41.1556C39.3865 40.89 39.11 40.7357 38.8444 40.8111C38.5787 40.8865 38.4245 41.1629 38.4998 41.4286L39.7281 45.7577ZM0.5 1.2724L0.583588 1.76536C5.01715 1.0136 12.3038 0.559103 19.7112 1.6462C27.1282 2.73469 34.586 5.35659 39.4565 10.6861L39.8256 10.3487L40.1947 10.0114C35.0988 4.43527 27.3717 1.75971 19.8564 0.656793C12.3316 -0.44752 4.9387 0.012629 0.416412 0.779436L0.5 1.2724ZM39.8256 10.3487L39.4565 10.6861C44.3103 15.9972 45.4053 22.8495 44.7666 29.3204C44.1276 35.7935 41.7578 41.8195 39.7725 45.3776L40.2091 45.6212L40.6458 45.8649C42.6853 42.2095 45.107 36.052 45.7617 29.4187C46.4167 22.7832 45.3074 15.6059 40.1947 10.0114L39.8256 10.3487Z" fill="#E30613" />
          </svg>
          <span className="share-stack__source-count">{sourceCount}</span>
        </p>

        <div className="share-stack__result">
          <div className="share-stack__brand">
            <img src="/svg/magnit.svg" alt="" />
            {brand}
          </div>
          <p ref={resultPanelRef} className="share-stack__panel share-stack__result-text">
            {resultValue ? (
              <span ref={resultCopyRef} className="share-stack__result-copy--dynamic">{resultValue}</span>
            ) : (
              <span>{resultLead}<br /><strong>{resultAccent}</strong><br />{resultLine}<br />{resultEnd}</span>
            )}
          </p>
        </div>
      </div>
    </div>
  )
}

export default ShareCards
