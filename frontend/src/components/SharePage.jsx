import ShareCards from './ShareCards.jsx'

export default function SharePage({ inputText, translatedText, downloadStatus, isResultShareable, copyStatus, onDownload, onCopy, onTelegram }) {
  return (
    <main className="share-page page-enter">
      <img className="share-page__circles" src="/svg/circles.svg?v=20260722" alt="" />
      <section className="share-view">
        <button className="share-view__back" type="button" aria-label="Вернуться" onClick={() => window.history.back()}><img src="/svg/back.svg?v=20260722" alt="" /></button>
        <div className="share-view__heading">
          <div className="share-view__heading-logo" aria-hidden="true">
            <img className="share-view__heading-word" src="/svg/moya_rabota_mobile.svg?v=20260723-4" alt="" />
          </div>
          <h2><img className="share-view__asterisk" src="/svg/star2.svg?v=20260722" alt="" /><span className="share-view__heading-text">влияет на жизнь<br />миллионов</span></h2>
        </div>
        <div className="share-view__cards"><ShareCards sourceValue={inputText} sourceCount={`${inputText.length}/200`} resultValue={translatedText} /></div>
        <div className="share-view__actions">
          <button className="share-view__download" type="button" aria-label="Скачать результат" onClick={onDownload} disabled={downloadStatus === 'loading' || !isResultShareable}><img src="/svg/save.svg?v=20260722" alt="" /></button>
          <button className="share-view__copy" type="button" onClick={onCopy} aria-live="polite">{copyStatus === 'copied' ? 'Ссылка скопирована' : copyStatus === 'error' ? 'Не удалось скопировать' : 'Скопировать ссылку'}</button>
          <button className="share-view__telegram" type="button" onClick={onTelegram} disabled={!isResultShareable}>Поделиться с другом в TG</button>
        </div>
      </section>
    </main>
  )
}
