import { useCallback, useEffect, useRef, useState } from 'react'
import './App.css'
import ShareCards from './components/ShareCards.jsx'
import TranslatorCard from './components/TranslatorCard.jsx'
import { getUserId, logEvent, startAutomaticLogging } from './lib/logger.js'

const loadImage = (source) => new Promise((resolve, reject) => {
  const image = new Image()
  image.onload = () => resolve(image)
  image.onerror = reject
  image.src = source
})

const loadStaticSvg = async (source) => {
  const svg = await fetch(source).then((response) => response.text())
  const staticSvg = svg.replace(/<defs>[\s\S]*?<\/defs>/, '').replace(/<style>[\s\S]*?<\/style>/, '')
  const url = URL.createObjectURL(new Blob([staticSvg], { type: 'image/svg+xml' }))
  try {
    return await loadImage(url)
  } finally {
    URL.revokeObjectURL(url)
  }
}

const loadColoredSvg = async (source, color) => {
  const svg = await fetch(source).then((response) => response.text())
  const coloredSvg = svg.replace(/#[0-9a-f]{6}/gi, color)
  const url = URL.createObjectURL(new Blob([coloredSvg], { type: 'image/svg+xml' }))
  try {
    return await loadImage(url)
  } finally {
    URL.revokeObjectURL(url)
  }
}

const drawWrappedText = (context, text, x, y, maxWidth, lineHeight, maxLines = 4) => {
  const words = text.replace(/\n/g, ' \n ').split(/\s+/)
  const lines = []
  let line = ''

  words.forEach((word) => {
    if (word === '\n') {
      if (line) lines.push(line)
      line = ''
      return
    }
    const nextLine = line ? `${line} ${word}` : word
    if (context.measureText(nextLine).width > maxWidth && line) {
      lines.push(line)
      line = word
    } else {
      line = nextLine
    }
  })
  if (line) lines.push(line)

  lines.slice(0, maxLines).forEach((value, index) => context.fillText(value, x, y + index * lineHeight))
}

const isIOSDevice = () => {
  const userAgent = navigator.userAgent
  const isIOSUserAgent = /iPhone|iPad|iPod/i.test(userAgent)
  const isIPadDesktopMode = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1
  return isIOSUserAgent || isIPadDesktopMode
}

const saveBlob = (blob, fileName) => {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.download = fileName
  link.href = url
  link.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

const getInitialInputCaretPosition = (value, hasUserEdited) => (
  !hasUserEdited && value === 'Я работаю в логистике' ? 'Я работаю '.length : null
)

function App() {
  const [page, setPage] = useState(() => {
    const historyPage = window.history.state?.magnitPage
    return ['intro', 'next', 'third', 'share'].includes(historyPage) ? historyPage : 'intro'
  })
  const [isLeaving, setIsLeaving] = useState(false)
  const [impactSlide, setImpactSlide] = useState(0)
  const [slideDirection, setSlideDirection] = useState('next')
  const [impactTransition, setImpactTransition] = useState(null)
  const [isShareModalOpen, setIsShareModalOpen] = useState(false)
  const [inputText, setInputText] = useState('Я работаю в логистике')
  const [translatedText, setTranslatedText] = useState('')
  const [displayedTranslation, setDisplayedTranslation] = useState('')
  const [isTranslating, setIsTranslating] = useState(false)
  const [translationError, setTranslationError] = useState('')
  const [isResultShareable, setIsResultShareable] = useState(false)
  const [copyStatus, setCopyStatus] = useState('idle')
  const [downloadStatus, setDownloadStatus] = useState('idle')
  const inputRef = useRef(null)
  const hasUserEditedInputRef = useRef(false)
  const inputFocusFrameRef = useRef(null)
  const shareModalOpenRef = useRef(isShareModalOpen)
  shareModalOpenRef.current = isShareModalOpen
  const swipeStartX = useRef(null)
  const pageRef = useRef(page)
  const typingTimerRef = useRef(null)
  const autoTranslateTimerRef = useRef(null)
  const translationRequestRef = useRef(null)
  const impactCardsViewportRef = useRef(null)
  const impactCardsRef = useRef(null)
  const copyStatusTimerRef = useRef(null)
  const lastTranslatedSourceRef = useRef('Я работаю в логистике')

  const navigateToPage = useCallback((nextPage, { replace = false } = {}) => {
    if (pageRef.current === nextPage) return
    const state = { ...window.history.state, magnitPage: nextPage }
    window.history[replace ? 'replaceState' : 'pushState'](state, '', window.location.href)
    pageRef.current = nextPage
    setPage(nextPage)
  }, [])

  useEffect(() => {
    if (!window.history.state?.magnitPage) {
      window.history.replaceState({ ...window.history.state, magnitPage: pageRef.current }, '', window.location.href)
    }

    const handlePopState = (event) => {
      const previousPage = event.state?.magnitPage
      if (!['intro', 'next', 'third', 'share'].includes(previousPage)) return
      pageRef.current = previousPage
      setIsLeaving(false)
      setPage(previousPage)
    }

    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  useEffect(() => {
    pageRef.current = page
    logEvent('page_view', page)
  }, [page])

  useEffect(() => {
    if (page !== 'third') return undefined

    const viewport = impactCardsViewportRef.current
    const cards = impactCardsRef.current
    if (!viewport || !cards) return undefined

    const fitImpactCards = () => {
      if (window.innerWidth < 900) return
      const naturalWidth = cards.offsetWidth
      const naturalHeight = cards.offsetHeight
      if (!naturalWidth || !naturalHeight || !viewport.clientWidth || !viewport.clientHeight) return

      const scale = Math.min(
        1.2,
        viewport.clientWidth / naturalWidth,
        viewport.clientHeight / naturalHeight,
      )
      viewport.style.setProperty('--impact-cards-scale', String(Math.max(.1, scale)))
    }

    const observer = new ResizeObserver(fitImpactCards)
    observer.observe(viewport)
    observer.observe(cards)
    fitImpactCards()

    return () => observer.disconnect()
  }, [page])

  useEffect(() => startAutomaticLogging(() => pageRef.current), [])

  useEffect(() => () => {
    window.clearInterval(typingTimerRef.current)
    window.clearTimeout(autoTranslateTimerRef.current)
    window.clearTimeout(copyStatusTimerRef.current)
    cancelAnimationFrame(inputFocusFrameRef.current)
    translationRequestRef.current?.abort()
  }, [])

  const animateTranslation = useCallback((text) => {
    window.clearInterval(typingTimerRef.current)
    setDisplayedTranslation('')
    let visibleLength = 0
    const delay = Math.max(18, Math.min(42, Math.round(1400 / text.length)))
    typingTimerRef.current = window.setInterval(() => {
      visibleLength += 1
      setDisplayedTranslation(text.slice(0, visibleLength))
      if (visibleLength >= text.length) window.clearInterval(typingTimerRef.current)
    }, delay)
  }, [])

  const requestTranslation = useCallback(async (rawText, trigger = 'manual') => {
    const text = rawText.trim()
    if (text.length < 2 || text.length > 200) return

    translationRequestRef.current?.abort()
    const controller = new AbortController()
    translationRequestRef.current = controller

    setIsTranslating(true)
    setTranslationError('')
    setIsResultShareable(false)
    setTranslatedText('')
    setDisplayedTranslation('')
    logEvent('translation_requested', 'next', { length: text.length, trigger })

    try {
      const response = await fetch('/api/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, userId: getUserId() }),
        signal: controller.signal,
      })
      const payload = await response.json()
      if (!response.ok) {
        const requestError = new Error(payload.error || 'Не удалось выполнить перевод')
        requestError.code = payload.code
        throw requestError
      }

      setTranslatedText(payload.translatedText)
      setIsResultShareable(true)
      lastTranslatedSourceRef.current = text
      animateTranslation(payload.translatedText)
      logEvent('translation_succeeded', 'next', { resultLength: payload.translatedText.length, trigger })
    } catch (error) {
      if (error.name === 'AbortError') return
      setTranslationError(error.code === 'BLOCKED_INPUT'
        ? 'Переводчик споткнулся об этот запрос. Введи реальную профессию из сферы работы в «Магните»'
        : 'Не удалось перевести. Попробуйте ещё раз.')
      logEvent('translation_failed', 'next', { message: error.message, trigger })
    } finally {
      if (translationRequestRef.current === controller) {
        translationRequestRef.current = null
        setIsTranslating(false)
      }
    }
  }, [animateTranslation])

  const handleTranslate = (event) => {
    event.preventDefault()
    window.clearTimeout(autoTranslateTimerRef.current)
    requestTranslation(inputText, 'manual')
  }

  const restoreInputFocus = () => {
    if (window.matchMedia('(max-width: 899px)').matches) return
    cancelAnimationFrame(inputFocusFrameRef.current)
    inputFocusFrameRef.current = requestAnimationFrame(() => {
      if (pageRef.current !== 'next' || shareModalOpenRef.current) return
      const input = inputRef.current
      if (!input) return
      input.focus({ preventScroll: true })
      const caretPosition = getInitialInputCaretPosition(input.value, hasUserEditedInputRef.current)
      if (caretPosition !== null) input.setSelectionRange(caretPosition, caretPosition)
    })
  }

  const copyPageLink = async () => {
    const link = window.location.href

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(link)
      } else {
        const textArea = document.createElement('textarea')
        textArea.value = link
        textArea.setAttribute('readonly', '')
        textArea.style.position = 'fixed'
        textArea.style.opacity = '0'
        document.body.appendChild(textArea)
        textArea.select()
        const copied = document.execCommand('copy')
        textArea.remove()
        if (!copied) throw new Error('Copy command failed')
      }

      setCopyStatus('copied')
      logEvent('share_link_copied', pageRef.current)
    } catch {
      setCopyStatus('error')
    }

    window.clearTimeout(copyStatusTimerRef.current)
    copyStatusTimerRef.current = window.setTimeout(() => setCopyStatus('idle'), 2500)
  }

  const shareInTelegram = () => {
    if (!isResultShareable || !translatedText) return
    const telegramShareUrl = new URL('https://t.me/share/url')
    const sharedTranslation = translatedText.replace(/[.!?]+$/g, '')
    const telegramText = `${sharedTranslation}. Это моя работа в «Магните»!\n\nЗнаешь, как твоя должность меняет ритейл? Загляни в переводчик и проверь свой вклад.`
    telegramShareUrl.searchParams.set('url', 'https://translate.magnit.ru/')
    telegramShareUrl.searchParams.set('text', telegramText)

    const telegramWindow = window.open(telegramShareUrl.toString(), '_blank')
    if (telegramWindow) telegramWindow.opener = null
    else window.location.assign(telegramShareUrl.toString())
    logEvent('telegram_share_opened', pageRef.current)
  }

  const downloadResult = async () => {
    if (downloadStatus === 'loading' || !isResultShareable || !translatedText) return

    const fileName = 'moy-vklad-v-magnit.png'
    setDownloadStatus('loading')
    try {
      await document.fonts?.ready
      const [titleImage, starImage, logoImage, audienceImage] = await Promise.all([
        loadStaticSvg('/svg/your-work2.svg'),
        loadImage('/svg/star2.svg'),
        loadColoredSvg('/svg/magnit.svg', '#FFFFFF'),
        loadImage('/svg/all.svg'),
      ])
      const canvas = document.createElement('canvas')
      canvas.width = 1200
      canvas.height = 2154
      const context = canvas.getContext('2d')
      context.scale(2, 2)

      const background = context.createLinearGradient(0, 0, 600, 1077)
      background.addColorStop(0, '#ff5614')
      background.addColorStop(1, '#ff1710')
      context.fillStyle = background
      context.beginPath()
      context.roundRect(0, 0, 600, 1077, 60)
      context.fill()

      context.globalAlpha = 0.5
      context.drawImage(titleImage, 18, 4, 564, 260)
      context.globalAlpha = 1
      context.drawImage(starImage, 142, 224, 62, 62)
      context.fillStyle = '#fff'
      context.font = '700 30px "Arha Magnit", Arial'
      context.fillText('влияет на жизнь', 218, 249)
      context.fillText('миллионов', 218, 279)

      context.save()
      context.translate(300, 490)
      context.rotate(-7 * Math.PI / 180)
      context.shadowColor = 'rgba(100, 0, 0, .2)'
      context.shadowBlur = 22
      context.fillStyle = '#fff'
      context.beginPath()
      context.roundRect(-270, -165, 540, 330, 34)
      context.fill()
      context.shadowColor = 'transparent'
      context.drawImage(audienceImage, -232, -126, 42, 42)
      context.fillStyle = '#1d1d1d'
      context.font = '500 28px "Arha Magnit", Arial'
      context.fillText('Для всех', -170, -94)
      context.strokeStyle = '#ccc'
      context.lineWidth = 2
      context.beginPath()
      context.roundRect(-230, -65, 460, 190, 32)
      context.stroke()
      context.fillStyle = '#1d1d1d'
      context.font = '400 34px "Arha Magnit", Arial'
      drawWrappedText(context, inputText, -195, -15, 350, 39, 3)
      context.save()
      context.translate(32, 7)
      context.scale(101 / 46, 85 / 47)
      context.fillStyle = '#e30613'
      context.fill(new Path2D('M0.416412 0.779436C0.144156 0.825601 -0.0391278 1.08373 0.0070364 1.35599C0.0532006 1.62824 0.311331 1.81153 0.583588 1.76536L0.5 1.2724L0.416412 0.779436ZM39.7281 45.7577C39.8035 46.0234 40.0799 46.1776 40.3456 46.1022L44.6747 44.874C44.9404 44.7986 45.0946 44.5221 45.0193 44.2565C44.9439 43.9908 44.6674 43.8366 44.4018 43.9119L40.5537 45.0037L39.4619 41.1556C39.3865 40.89 39.11 40.7357 38.8444 40.8111C38.5787 40.8865 38.4245 41.1629 38.4998 41.4286L39.7281 45.7577ZM0.5 1.2724L0.583588 1.76536C5.01715 1.0136 12.3038 0.559103 19.7112 1.6462C27.1282 2.73469 34.586 5.35659 39.4565 10.6861L39.8256 10.3487L40.1947 10.0114C35.0988 4.43527 27.3717 1.75971 19.8564 0.656793C12.3316 -0.44752 4.9387 0.012629 0.416412 0.779436L0.5 1.2724ZM39.8256 10.3487L39.4565 10.6861C44.3103 15.9972 45.4053 22.8495 44.7666 29.3204C44.1276 35.7935 41.7578 41.8195 39.7725 45.3776L40.2091 45.6212L40.6458 45.8649C42.6853 42.2095 45.107 36.052 45.7617 29.4187C46.4167 22.7832 45.3074 15.6059 40.1947 10.0114L39.8256 10.3487Z'))
      context.restore()
      context.restore()

      context.save()
      context.translate(302, 750)
      context.rotate(6 * Math.PI / 180)
      context.shadowColor = 'rgba(100, 0, 0, .32)'
      context.shadowBlur = 32
      context.fillStyle = '#ed001b'
      context.beginPath()
      context.roundRect(-270, -175, 540, 350, 34)
      context.fill()
      context.shadowColor = 'transparent'
      context.save()
      context.filter = 'brightness(0) invert(1)'
      context.drawImage(logoImage, -230, -137, 38, 38)
      context.restore()
      context.fillStyle = '#fff'
      context.font = '500 28px "Arha Magnit", Arial'
      context.fillText('Магнит', -174, -108)
      context.fillStyle = '#fff'
      context.beginPath()
      context.roundRect(-230, -76, 460, 210, 32)
      context.fill()
      context.fillStyle = '#1d1d1d'
      context.font = '600 32px "Arha Magnit", Arial'
      drawWrappedText(context, translatedText, -195, -24, 385, 37, 4)
      context.restore()

      context.save()
      context.filter = 'brightness(0) invert(1)'
      context.drawImage(logoImage, 128, 995, 44, 44)
      context.drawImage(starImage, 430, 989, 54, 54)
      context.restore()
      context.fillStyle = '#fff'
      context.fillRect(182, 1013, 238, 4)

      const blob = await new Promise((resolve, reject) => {
        canvas.toBlob((result) => result ? resolve(result) : reject(new Error('PNG creation failed')), 'image/png')
      })
      if (isIOSDevice() && navigator.share) {
        const file = new File([blob], fileName, { type: 'image/png' })
        let fileShared = false

        try {
          if (!navigator.canShare || navigator.canShare({ files: [file] })) {
            await navigator.share({ files: [file], title: 'Мой вклад в Магнит' })
            fileShared = true
          }
        } catch (error) {
          if (error.name === 'AbortError') {
            setDownloadStatus('idle')
            return
          }
        }

        if (!fileShared) {
          try {
            await navigator.share({
              title: 'Мой вклад в Магнит',
              text: 'Узнайте, как звучит ваш вклад в масштабе компании',
              url: window.location.href,
            })
          } catch (error) {
            if (error.name === 'AbortError') {
              setDownloadStatus('idle')
              return
            }
            saveBlob(blob, fileName)
          }
        }
      } else {
        saveBlob(blob, fileName)
      }

      setDownloadStatus('done')
      logEvent(isIOSDevice() ? 'result_shared' : 'result_downloaded', pageRef.current)
    } catch {
      setDownloadStatus('error')
    }

    window.setTimeout(() => setDownloadStatus('idle'), 2500)
  }

  useEffect(() => {
    window.clearTimeout(autoTranslateTimerRef.current)
    if (page !== 'next') return undefined

    const text = inputText.trim()
    if (text.length < 2 || text.length > 200 || text === lastTranslatedSourceRef.current) return undefined

    autoTranslateTimerRef.current = window.setTimeout(() => {
      requestTranslation(text, 'automatic')
    }, 2000)

    return () => window.clearTimeout(autoTranslateTimerRef.current)
  }, [inputText, page, requestTranslation])

  useEffect(() => {
    if (page !== 'next' || window.matchMedia('(max-width: 899px)').matches) return undefined

    const focusInput = () => {
      cancelAnimationFrame(inputFocusFrameRef.current)
      inputFocusFrameRef.current = requestAnimationFrame(() => {
        if (shareModalOpenRef.current) return
        const input = inputRef.current
        if (!input) return
        input.focus({ preventScroll: true })
        const caretPosition = getInitialInputCaretPosition(input.value, hasUserEditedInputRef.current)
        if (caretPosition !== null) input.setSelectionRange(caretPosition, caretPosition)
      })
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') focusInput()
    }

    focusInput()
    document.addEventListener('pointerup', focusInput)
    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('focus', focusInput)

    return () => {
      document.removeEventListener('pointerup', focusInput)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('focus', focusInput)
      cancelAnimationFrame(inputFocusFrameRef.current)
    }
  }, [page])

  const impactSlides = [
    {
      title: 'Видение',
      text: <>Мы хотим стать частью повседневной жизни и выбором номер 1 для клиентов всех поколений. Наша цель — сделать «Магнит» местом притяжения, которому искренне доверяют и куда возвращаются.</>,
      desktopText: <>Мы хотим стать частью повседневной жизни<br />и выбором номер 1 для клиентов всех поколений.<br />Наша цель — сделать «Магнит» местом притяжения,<br />которому искренне доверяют и куда возвращаются.</>,
    },
    {
      title: 'Миссия',
      text: <>Мы повышаем качество жизни покупателей, делая привычное удобным, а новое — возможным. Наша команда каждый день дарит миллионам людей искреннюю заботу и комфорт.</>,
      desktopText: <>Мы повышаем качество жизни покупателей,<br />делая привычное удобным, а новое — возможным.<br />Наша команда каждый день дарит миллионам людей<br />искреннюю заботу и комфорт.</>,
    },
    {
      title: 'Ценности',
      text: <>Мы работаем с душой, умом и полной отдачей. Эти принципы позволяют нам сохранять баланс между порядком в бизнесе и искренней заботой о людях.</>,
      desktopText: <>Мы работаем с душой, умом и полной отдачей.<br />Эти принципы позволяют нам сохранять баланс<br />между порядком в бизнесе и искренней заботой о людях.</>,
    },
  ]

  const changeImpactSlide = (nextIndex) => {
    const normalizedIndex = (nextIndex + impactSlides.length) % impactSlides.length
    if (normalizedIndex === impactSlide || impactTransition) return
    const direction = normalizedIndex > impactSlide || (impactSlide === 2 && normalizedIndex === 0) ? 'next' : 'prev'
    setSlideDirection(direction)
    setImpactTransition({ from: impactSlide, to: normalizedIndex, direction })
    setImpactSlide(normalizedIndex)
  }

  const finishImpactSwipe = (clientX) => {
    if (swipeStartX.current === null) return
    const distance = clientX - swipeStartX.current
    swipeStartX.current = null
    if (Math.abs(distance) < 40) return
    changeImpactSlide(impactSlide + (distance < 0 ? 1 : -1))
  }

  const openShare = () => {
    if (!isResultShareable || !translatedText) return
    if (window.matchMedia('(min-width: 900px)').matches) {
      setIsShareModalOpen(true)
    } else {
      navigateToPage('share')
    }
  }

  const goToNextPage = () => {
    if (isLeaving) return

    setIsLeaving(true)
    window.setTimeout(() => {
      navigateToPage('next')
      setIsLeaving(false)
    }, 420)
  }

  const goToThirdPage = () => {
    if (isLeaving) return

    setIsLeaving(true)
    window.setTimeout(() => {
      navigateToPage('third')
      setIsLeaving(false)
    }, 420)
  }

  if (page === 'third') {
    return (
      <main className="third-page page-enter">
        <picture aria-hidden="true">
          <source media="(min-width: 900px)" srcSet="/svg/circles2-desktop.svg" />
          <img className="third-page__circles" src="/svg/circles.svg" alt="" />
        </picture>
        <section className="impact">
          <div className="impact__desktop-mark" aria-hidden="true">
            <img src="/svg/magnit.svg" alt="" />
            <span />
            <img src="/svg/star2.svg" alt="" />
          </div>
          <div className="impact__heading">
            <picture aria-hidden="true">
              <source media="(min-width: 900px)" srcSet="/svg/do2.svg" />
              <img src="/svg/do.svg" alt="" />
            </picture>
            <h2 className="impact__title impact__title--mobile">
              <span>Создавай ритейл</span>
              <span>будущего вместе</span>
              <span>с «Магнит»</span>
            </h2>
            <h2 className="impact__title impact__title--desktop">
              <span>Создавай ритейл будущего</span>
              <span>вместе с «Магнит»</span>
            </h2>
          </div>
          <article
            className="impact__card"
            onTouchStart={(event) => { swipeStartX.current = event.touches[0].clientX }}
            onTouchEnd={(event) => finishImpactSwipe(event.changedTouches[0].clientX)}
          >
            {impactTransition && (
              <div className={`impact__slide impact__slide--${impactTransition.from} impact__slide--out impact__slide--${impactTransition.direction}`}>
                <h3>{impactSlides[impactTransition.from].title}</h3>
                <p>{impactSlides[impactTransition.from].text}</p>
              </div>
            )}
            <div
              key={impactSlide}
              className={`impact__slide impact__slide--${impactSlide}${impactTransition ? ` impact__slide--in impact__slide--${slideDirection}` : ''}`}
              onAnimationEnd={() => setImpactTransition(null)}
            >
              <h3>{impactSlides[impactSlide].title}</h3>
              <p>{impactSlides[impactSlide].text}</p>
            </div>
          </article>
          <div ref={impactCardsViewportRef} className="impact__desktop-cards-viewport">
            <div ref={impactCardsRef} className="impact__desktop-cards">
              {impactSlides.map((slide) => (
                <article className="impact__desktop-card" key={slide.title}>
                  <h3>{slide.title}</h3>
                  <p>{slide.desktopText}</p>
                </article>
              ))}
            </div>
          </div>
          <div className="impact__dots" aria-label={`Слайд ${impactSlide + 1} из 3`}>
            {impactSlides.map((slide, index) => (
              <button
                className={index === impactSlide ? 'is-active' : ''}
                key={slide.title}
                type="button"
                aria-label={`Перейти к слайду ${index + 1}`}
                onClick={() => changeImpactSlide(index)}
              />
            ))}
          </div>
          <div className="impact__actions">
            <button type="button" onClick={() => window.history.back()}>Назад</button>
            <a
              className="impact__vacancies"
              href="https://rabota.magnit.ru/?utm_source=translater-magnit&utm_medium=banner&utm_campaign=drt2026"
              target="_blank"
              rel="noopener noreferrer"
            >
              К вакансиям
            </a>
          </div>
        </section>
      </main>
    )
  }

  if (page === 'share') {
    return (
      <main className="share-page page-enter">
        <img className="share-page__circles" src="/svg/circles.svg" alt="" />
        <section className="share-view">
          <button className="share-view__back" type="button" aria-label="Вернуться" onClick={() => window.history.back()}>
            <img src="/svg/back.svg" alt="" />
          </button>
          <div className="share-view__heading">
            <img src="/svg/your-work2.svg" alt="" />
            <h2>
              <img className="share-view__asterisk" src="/svg/star2.svg" alt="" />
              <span className="share-view__heading-text">влияет на жизнь<br />миллионов</span>
            </h2>
          </div>
          <div className="share-view__cards">
            <ShareCards
              sourceValue={inputText}
              sourceCount={`${inputText.length}/200`}
              resultValue={translatedText}
            />
          </div>
          <div className="share-view__actions">
            <button className="share-view__download" type="button" aria-label="Скачать результат" onClick={downloadResult} disabled={downloadStatus === 'loading' || !isResultShareable}>
              <img src="/svg/save.svg" alt="" />
            </button>
            <button className="share-view__copy" type="button" onClick={copyPageLink} aria-live="polite">
              {copyStatus === 'copied' ? 'Ссылка скопирована' : copyStatus === 'error' ? 'Не удалось скопировать' : 'Скопировать ссылку'}
            </button>
            <button className="share-view__telegram" type="button" onClick={shareInTelegram} disabled={!isResultShareable}>Поделиться с другом в TG</button>
          </div>
        </section>
      </main>
    )
  }

  if (page === 'next') {
    return (
      <main className={`next-page page-enter${isLeaving ? ' page-leave' : ''}`}>
        <picture aria-hidden="true">
          <source media="(min-width: 900px)" srcSet="/svg/circles2-desktop.svg" />
          <img className="next-page__circles" src="/svg/circles2.svg" alt="" />
        </picture>
        <div className="next-page__content">
          <div className="translator__desktop-mark" aria-hidden="true">
            <img src="/svg/magnit.svg" alt="" />
            <span />
            <img src="/svg/star2.svg" alt="" />
          </div>
          <section className="translator">
          <h2 className="translator__title">
            Напиши, чем ты занимаешься,<br />
            и узнай, как звучит твой вклад<br />
            в масштабе компании
          </h2>

          <TranslatorCard
            inputRef={inputRef}
            inputText={inputText}
            translatedText={translatedText}
            displayedTranslation={displayedTranslation}
            translationError={translationError}
            isTranslating={isTranslating}
            canShare={isResultShareable}
            onInputChange={(event) => {
              hasUserEditedInputRef.current = true
              setIsResultShareable(false)
              setTranslatedText('')
              setDisplayedTranslation('')
              setTranslationError('')
              setInputText(event.target.value)
            }}
            onInputBlur={restoreInputFocus}
            onSubmit={handleTranslate}
            onShare={openShare}
            onNext={goToThirdPage}
          />

          </section>
        </div>
        {isShareModalOpen && (
          <div className="share-modal" role="dialog" aria-modal="true" aria-label="Поделиться результатом">
            <div className="share-modal__panel">
              <button className="share-modal__close" type="button" aria-label="Закрыть" onClick={() => setIsShareModalOpen(false)}>×</button>
              <div className="share-modal__preview">
                <img className="share-modal__preview-title" src="/svg/your-work2.svg" alt="" />
                <div className="share-modal__preview-subtitle">
                  <img src="/svg/star2.svg" alt="" />
                  <span>влияет на жизнь<br />миллионов</span>
                </div>
                <ShareCards
                  sourceValue={inputText}
                  sourceCount={`${inputText.length}/200`}
                  resultValue={translatedText}
                />
                <div className="share-modal__preview-mark"><img src="/svg/magnit.svg" alt="" /><span /><img src="/svg/star2.svg" alt="" /></div>
              </div>
              <div className="share-modal__content">
                <h2><strong>Поделись результатом<br />и предложи коллегам<br />и друзьям тоже перевести<br />свою профессию.</strong> Возможно,<br />их вклад масштабнее, чем<br />они привыкли думать.<img className="share-modal__title-star" src="/svg/star2.svg" alt="" /></h2>
                <div className="share-modal__actions">
                  <button type="button" onClick={shareInTelegram} disabled={!isResultShareable}>Поделиться в TG</button>
                  <button type="button" onClick={downloadResult} disabled={downloadStatus === 'loading' || !isResultShareable}>
                    {downloadStatus === 'loading' ? 'Подготовка…' : downloadStatus === 'error' ? 'Не удалось скачать' : 'Скачать результат'}
                  </button>
                  <button className="share-modal__copy" type="button" onClick={copyPageLink} aria-live="polite">
                    {copyStatus === 'copied' ? 'Ссылка скопирована' : copyStatus === 'error' ? 'Не удалось скопировать' : 'Просто скопировать ссылку'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    )
  }

  return (
    <main className={`hero page-enter${isLeaving ? ' page-leave' : ''}`}>
      <div className="hero__art" aria-hidden="true">
        <svg className="hero__desktop-art hero__desktop-art--top" viewBox="-60 -60 1841 1200" preserveAspectRatio="xMidYMid slice">
          <use href="/svg/your-work-desk.svg#your-word" />
        </svg>
        <svg className="hero__desktop-art hero__desktop-art--bottom" viewBox="-60 -60 1841 1200" preserveAspectRatio="xMidYMid slice">
          <use href="/svg/your-work-desk.svg#work-word-main" />
          <use href="/svg/your-work-desk.svg#work-word-detail" />
        </svg>
      </div>

      <section className="hero__content">
        <div className="hero__desktop-mark" aria-hidden="true">
          <img src="/svg/magnit.svg" alt="" />
          <span />
          <img src="/svg/star2.svg" alt="" />
        </div>
        <div className="hero__headline">
          <img className="hero__brush hero__brush--top" src="/svg/your.svg" alt="" />
          <img className="hero__brush hero__brush--bottom" src="/svg/work.svg" alt="" />
          <h1 className="hero__title">
            <span><img className="hero__title-star-desktop" src="/svg/star2.svg" alt="" /> влияет</span>
            <span>на жизнь</span>
            <span>миллионов</span>
          </h1>
        </div>

        <div className="hero__copy-wrap">
          <picture aria-hidden="true">
            <source media="(min-width: 900px)" srcSet="/svg/circles-desctop.svg" />
            <img className="hero__circles" src="/svg/circles.svg" alt="" />
          </picture>
          <div className="hero__copy">
            <p>
              <span>Работать в «Магните» — значит каждый</span>
              <span>день влиять на жизнь миллионов людей.</span>
              <span>И иногда мы даже не замечаем, насколько</span>
              <span>велик этот вклад.</span>
            </p>
            <p>
              <span>Мы создали этот переводчик, чтобы</span>
              <span>показать: за привычными названиями</span>
              <span>должностей скрываются реальные</span>
              <span>изменения. Потому что в «Магните» ты</span>
              <span>не только развиваешься сам, но и</span>
              <span>создаешь будущее ритейла.</span>
            </p>
          </div>
          <div className="hero__copy hero__copy--desktop">
            <p>
              <span>Работать в «Магните» — значит каждый день влиять на жизнь миллионов</span>
              <span>людей. И иногда мы даже не замечаем, насколько велик этот вклад.</span>
            </p>
            <p>
              <span>Мы создали этот переводчик, чтобы показать: за привычными</span>
              <span>названиями должностей скрываются реальные изменения. Потому что</span>
              <span>в «Магните» ты не только развиваешься сам, но и создаешь будущее ритейла.</span>
            </p>
          </div>
        </div>

        <button className="hero__button" type="button" onClick={goToNextPage}>
          Начать
        </button>
      </section>
    </main>
  )
}

export default App
