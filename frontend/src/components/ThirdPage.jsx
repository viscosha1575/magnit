import { useLayoutEffect } from 'react'
import { logEvent } from '../lib/logger.js'

export default function ThirdPage({
  impactSlide,
  impactSlides,
  impactTransition,
  slideDirection,
  onSlideChange,
  onSwipeStart,
  onSwipeEnd,
  onSwipeCancel,
  onTransitionEnd,
  viewportRef,
  cardsRef,
}) {
  useLayoutEffect(() => {
    const viewport = viewportRef.current
    const cards = cardsRef.current
    if (!viewport || !cards) return undefined

    const fitCards = () => {
      if (window.innerWidth < 900) return
      const naturalWidth = cards.offsetWidth
      const naturalHeight = cards.offsetHeight
      if (!naturalWidth || !naturalHeight || !viewport.clientWidth || !viewport.clientHeight) return
      const scale = Math.min(1.2, viewport.clientWidth / naturalWidth, viewport.clientHeight / naturalHeight)
      viewport.style.setProperty('--impact-cards-scale', String(Math.max(.1, scale)))
    }

    const observer = new ResizeObserver(fitCards)
    observer.observe(viewport)
    observer.observe(cards)
    fitCards()
    document.fonts?.ready.then(fitCards)

    return () => observer.disconnect()
  }, [cardsRef, viewportRef])

  return (
    <main className="third-page page-enter">
      <picture aria-hidden="true">
        <source media="(min-width: 900px)" srcSet="/svg/circles2-desktop.svg?v=20260722" />
        <img className="third-page__circles" src="/svg/circles.svg?v=20260722" alt="" />
      </picture>
      <section className="impact">
        <div className="impact__desktop-mark" aria-hidden="true">
          <img src="/svg/magnit.svg?v=20260722" alt="" /><span /><img src="/svg/star2.svg?v=20260722" alt="" />
        </div>
        <div className="impact__heading">
          <picture aria-hidden="true">
            <source media="(min-width: 900px)" srcSet="/svg/do2.svg?v=20260722" />
            <img src="/svg/do.svg?v=20260722" alt="" />
          </picture>
          <h2 className="impact__title impact__title--mobile"><span>Создавай ритейл</span><span>будущего вместе</span><span>с «Магнит»</span></h2>
          <h2 className="impact__title impact__title--desktop"><span>Создавай ритейл будущего</span><span>вместе с «Магнит»</span></h2>
        </div>
        <article className="impact__card" onTouchStart={onSwipeStart} onTouchEnd={onSwipeEnd} onTouchCancel={onSwipeCancel}>
          {impactTransition && (
            <div className={`impact__slide impact__slide--${impactTransition.from} impact__slide--out impact__slide--${impactTransition.direction}`}>
              <h3>{impactSlides[impactTransition.from].title}</h3><p>{impactSlides[impactTransition.from].text}</p>
            </div>
          )}
          <div key={impactSlide} className={`impact__slide impact__slide--${impactSlide}${impactTransition ? ` impact__slide--in impact__slide--${slideDirection}` : ''}`} onAnimationEnd={onTransitionEnd} onAnimationCancel={onTransitionEnd}>
            <h3>{impactSlides[impactSlide].title}</h3><p>{impactSlides[impactSlide].text}</p>
          </div>
        </article>
        <div ref={viewportRef} className="impact__desktop-cards-viewport">
          <div ref={cardsRef} className="impact__desktop-cards">
            {impactSlides.map((slide) => <article className="impact__desktop-card" key={slide.title}><h3>{slide.title}</h3><p>{slide.desktopText}</p></article>)}
          </div>
        </div>
        <div className="impact__dots" aria-label={`Слайд ${impactSlide + 1} из 3`}>
          {impactSlides.map((slide, index) => <button className={index === impactSlide ? 'is-active' : ''} key={slide.title} type="button" aria-label={`Перейти к слайду ${index + 1}`} onClick={() => onSlideChange(index)} />)}
        </div>
        <div className="impact__actions">
          <button type="button" onClick={() => window.history.back()}>Назад</button>
          <a className="impact__vacancies" href="https://rabota.magnit.ru/?utm_source=translater-magnit&utm_medium=banner&utm_campaign=drt2026" target="_blank" rel="noopener noreferrer" onClick={() => logEvent('vacancies_opened', 'third')}>К вакансиям</a>
        </div>
      </section>
    </main>
  )
}
