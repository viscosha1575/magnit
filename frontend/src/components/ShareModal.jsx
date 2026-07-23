import ShareCards from './ShareCards.jsx'

export default function ShareModal({ inputText, translatedText, downloadStatus, isResultShareable, copyStatus, onClose, onTelegram, onDownload, onCopy }) {
  return (
    <div className="share-modal" role="dialog" aria-modal="true" aria-label="Поделиться результатом">
      <div className="share-modal__panel">
        <button className="share-modal__close" type="button" aria-label="Закрыть" onClick={onClose}>×</button>
        <div className="share-modal__preview">
          <img className="share-modal__preview-title" src="/svg/moya_rabota.svg?v=20260723-4" alt="" />
          <div className="share-modal__preview-subtitle"><img src="/svg/star2.svg?v=20260722" alt="" /><span>влияет на жизнь<br />миллионов</span></div>
          <ShareCards sourceValue={inputText} sourceCount={`${inputText.length}/200`} resultValue={translatedText} />
          <div className="share-modal__preview-mark"><img src="/svg/magnit.svg?v=20260722" alt="" /><span /><img src="/svg/star2.svg?v=20260722" alt="" /></div>
        </div>
        <div className="share-modal__content">
          <h2><strong>Поделись результатом<br />и предложи коллегам<br />и друзьям тоже перевести<br />свою профессию.</strong> Возможно,<br />их вклад масштабнее, чем<br />они привыкли думать.<img className="share-modal__title-star" src="/svg/star2.svg?v=20260722" alt="" /></h2>
          <div className="share-modal__actions">
            <button type="button" onClick={onTelegram} disabled={!isResultShareable}>Поделиться в TG</button>
            <button type="button" onClick={onDownload} disabled={downloadStatus === 'loading' || !isResultShareable}>{downloadStatus === 'loading' ? 'Подготовка…' : downloadStatus === 'error' ? 'Не удалось скачать' : 'Скачать результат'}</button>
            <button className="share-modal__copy" type="button" onClick={onCopy} aria-live="polite">{copyStatus === 'copied' ? 'Ссылка скопирована' : copyStatus === 'error' ? 'Не удалось скопировать' : 'Просто скопировать ссылку'}</button>
          </div>
        </div>
      </div>
    </div>
  )
}
