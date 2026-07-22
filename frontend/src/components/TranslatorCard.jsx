import { useLayoutEffect, useRef, useState } from 'react'

function TranslatorCard({
  inputRef,
  inputText,
  translatedText,
  displayedTranslation,
  translationError,
  isTranslating,
  canTranslate,
  canShare,
  onInputChange,
  onInputBlur,
  onSubmit,
  onShare,
  onNext,
}) {
  const requiredPrefix = 'Я работаю '
  const viewportRef = useRef(null)
  const mobileStageRef = useRef(null)
  const shellRef = useRef(null)
  const [showProfessionHint, setShowProfessionHint] = useState(true)

  useLayoutEffect(() => {
    const viewport = viewportRef.current
    const mobileStage = mobileStageRef.current
    const shell = shellRef.current
    if (!viewport || !mobileStage || !shell) return undefined

    const fitTranslator = () => {
      if (window.innerWidth < 900) {
        viewport.style.removeProperty('--translator-scale')
        const grid = viewport.parentElement
        const title = grid?.querySelector('.translator__title')
        const joinButton = viewport.querySelector('.translator__join-mobile')
        const gridStyle = grid ? window.getComputedStyle(grid) : null
        const gridVerticalSpace = gridStyle
          ? parseFloat(gridStyle.paddingTop) + parseFloat(gridStyle.paddingBottom) + (parseFloat(gridStyle.rowGap) * 2)
          : 0
        const gridHorizontalSpace = gridStyle
          ? parseFloat(gridStyle.paddingLeft) + parseFloat(gridStyle.paddingRight)
          : 0
        const availableHeight = Math.max(
          0,
          (grid?.clientHeight ?? 0) - gridVerticalSpace - (title?.offsetHeight ?? 0) - (joinButton?.offsetHeight ?? 0),
        )
        const availableWidth = Math.max(0, (grid?.clientWidth ?? 0) - gridHorizontalSpace)
        const naturalWidth = shell.offsetWidth
        const naturalHeight = shell.offsetHeight
        if (availableWidth < 1 || availableHeight < 1 || naturalWidth < 1 || naturalHeight < 1) {
          requestAnimationFrame(fitTranslator)
          return
        }
        const scale = Math.min(
          1,
          availableWidth / naturalWidth,
          availableHeight / naturalHeight,
        )
        const safeScale = Math.max(.1, scale)
        mobileStage.style.setProperty('--translator-mobile-scale', String(safeScale))
        mobileStage.style.setProperty('--translator-mobile-height', `${naturalHeight * safeScale}px`)
        return
      }

      mobileStage.style.removeProperty('--translator-mobile-scale')
      mobileStage.style.removeProperty('--translator-mobile-height')
      const availableWidth = viewport.clientWidth
      const availableHeight = viewport.clientHeight
      const naturalWidth = shell.offsetWidth
      const naturalHeight = shell.offsetHeight
      const scale = Math.min(
        1.35,
        availableWidth / naturalWidth,
        availableHeight / naturalHeight,
      )

      viewport.style.setProperty('--translator-scale', String(Math.max(0, scale)))
    }

    const observer = new ResizeObserver(fitTranslator)
    observer.observe(viewport)
    observer.observe(mobileStage)
    observer.observe(shell)
    fitTranslator()

    return () => observer.disconnect()
  }, [])

  return (
    <div ref={viewportRef} className="translator__viewport">
    <div ref={mobileStageRef} className="translator__mobile-stage">
    <div ref={shellRef} className="translator__shell">
      <div className="translator__card-stage">
        <form className="translator__card" onSubmit={onSubmit}>
        <div className="field-label">
          <img className="field-label__icon" src="/svg/all.svg" alt="" />
          <span className="field-label__value">Для всех</span>
        </div>

        <div className="text-field">
          {showProfessionHint && (
            <span className="text-field__placeholder" aria-hidden="true">
              <span>Я работаю&nbsp;</span><em>в логистике</em>
            </span>
          )}
          <textarea
            className={showProfessionHint ? 'has-styled-value' : ''}
            ref={inputRef}
            maxLength="200"
            value={inputText}
            aria-label="Чем вы занимаетесь"
            onFocus={(event) => {
              if (!showProfessionHint) return
              const input = event.currentTarget
              requestAnimationFrame(() => input.setSelectionRange('Я работаю '.length, 'Я работаю '.length))
            }}
            onKeyDown={(event) => {
              if (showProfessionHint) return
              const input = event.currentTarget
              if (!['Backspace', 'Delete'].includes(event.key)) return

              const selectionStart = input.selectionStart
              const selectionEnd = input.selectionEnd
              const hasSelection = selectionStart !== selectionEnd

              if (hasSelection && selectionStart < requiredPrefix.length) {
                event.preventDefault()
                if (selectionEnd <= requiredPrefix.length) return

                input.value = requiredPrefix + input.value.slice(selectionEnd)
                onInputChange({ target: input, currentTarget: input })
                requestAnimationFrame(() => {
                  input.setSelectionRange(requiredPrefix.length, requiredPrefix.length)
                })
                return
              }

              if (event.key === 'Backspace' && selectionStart <= requiredPrefix.length) {
                event.preventDefault()
              }
              if (event.key === 'Delete' && selectionStart < requiredPrefix.length) {
                event.preventDefault()
              }
            }}
            onChange={(event) => {
              const previousContent = inputText.startsWith(requiredPrefix)
                ? inputText.slice(requiredPrefix.length)
                : ''
              if (showProfessionHint) {
                const valueWithoutHint = event.target.value.replace('в логистике', '')
                const content = valueWithoutHint.startsWith('Я работаю')
                  ? valueWithoutHint.slice('Я работаю'.length).trimStart()
                  : valueWithoutHint
                event.target.value = requiredPrefix + content
              } else if (!event.target.value.startsWith(requiredPrefix)) {
                const retainedContent = previousContent && event.target.value.endsWith(previousContent)
                  ? previousContent
                  : event.target.value
                event.target.value = requiredPrefix + retainedContent
              }
              setShowProfessionHint(false)
              onInputChange(event)
            }}
            onBlur={onInputBlur}
          />
          <span className="text-field__hint">＊ Напиши, кем работаешь</span>
        </div>

        <div className="field-label field-label--brand">
          <img className="field-label__icon field-label__icon--brand" src="/svg/magnit.svg" alt="" />
          <span className="field-label__value">Магнит</span>
        </div>

        <article className={`result-card${isTranslating ? ' is-loading' : ''}`} aria-live="polite" aria-busy={isTranslating}>
          <p className="result-card__typing">
            {translationError || displayedTranslation}
            {!translationError && displayedTranslation !== translatedText && <span className="result-card__cursor" aria-hidden="true" />}
          </p>
        </article>

        <span className={`translator__direction${isTranslating ? ' is-loading' : ''}`} aria-hidden="true">
          <img src={isTranslating ? '/svg/loading.svg' : '/svg/arrows.svg'} alt="" />
        </span>

        <div className="result-card__actions">
          <button type="button" aria-label="Поделиться" onClick={onShare} disabled={!canShare}>
            <img className="result-card__share" src="/svg/share.svg" alt="" />
          </button>
          <button className="result-card__next" type="button" aria-label="Перейти на следующую страницу" onClick={onNext}>
            <img className="result-card__star" src="/svg/star-icon.svg" alt="" />
          </button>
          <button className="result-card__translate" type="submit" disabled={isTranslating || !canTranslate}>Перевести</button>
        </div>

          <button className="translator__join" type="button" onClick={onNext}>Присоединиться к команде</button>
        </form>
      </div>
    </div>
    </div>
    <button className="translator__join-mobile" type="button" onClick={onNext}>Присоединиться к команде</button>
    </div>
  )
}

export default TranslatorCard
