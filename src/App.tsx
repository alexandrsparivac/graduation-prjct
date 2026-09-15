import { useState } from 'react'
import './App.css'

const modules = [
  { label: 'Conversații', icon: '◌' },
  { label: 'Scriere profesională', icon: '▤' },
  { label: 'Prezentări', icon: '▱' },
  { label: 'Vocabular', icon: '✦' },
]

const lessons = [
  { title: 'Small talk la conferințe', meta: '12 min · Conversații', progress: 72, color: 'peach' },
  { title: 'Emailuri clare și concise', meta: '18 min · Scriere profesională', progress: 38, color: 'blue' },
  { title: 'Idei convingătoare', meta: '15 min · Prezentări', progress: 0, color: 'green' },
]

function App() {
  const [activeModule, setActiveModule] = useState('Conversații')
  const [started, setStarted] = useState(false)

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand"><span className="brand-mark">A</span><span>altera</span></div>
        <div className="profile-mini"><span className="avatar">AM</span><div><strong>Andrei Mureșan</strong><small>Product manager</small></div><span>⌄</span></div>
        <nav aria-label="Navigare principală">
          <p className="nav-label">Spațiul meu</p>
          <button className="nav-item selected"><span>⌂</span> Overview</button>
          <button className="nav-item"><span>◷</span> Planul meu <b>3</b></button>
          <button className="nav-item"><span>▣</span> Biblioteca</button>
          <button className="nav-item"><span>◎</span> Progres</button>
          <p className="nav-label">Cont</p>
          <button className="nav-item"><span>⚙</span> Setări</button>
        </nav>
        <div className="sidebar-bottom"><div className="streak"><span>✦</span><div><strong>7 zile la rând</strong><small>Ține ritmul!</small></div></div><button className="help">?</button></div>
      </aside>

      <main className="main-content">
        <header className="topbar"><div className="breadcrumb">Marți, 24 septembrie 2024 <span>/</span> Săptămâna 4</div><div className="top-actions"><button className="icon-button" aria-label="Caută">⌕</button><button className="notification" aria-label="Notificări">♧<i /></button><div className="avatar avatar-large">AM</div></div></header>
        <div className="content-inner">
          <section className="welcome reveal"><div><p className="eyebrow">Bun venit înapoi, Andrei</p><h1>Construiește-ți vocea<br /><em>profesională.</em></h1><p className="intro">Învață engleză relevantă pentru munca ta, în ritmul tău.</p></div><div className="weekly-card"><span className="weekly-icon">◒</span><div><small>OBIECTIV SĂPTĂMÂNAL</small><strong>3 din 5 sesiuni</strong></div><div className="progress-ring">60%</div></div></section>

          <section className="focus-card reveal"><div className="focus-copy"><div className="section-kicker"><span className="live-dot" /> RECOMANDAT PENTRU TINE</div><h2>Small talk la conferințe</h2><p>Învață să începi conversații naturale și să lași o impresie memorabilă.</p><div className="focus-meta"><span>◷ 12 minute</span><span>◌ Conversații</span><span>● Nivel B2</span></div><button className="primary-button" onClick={() => setStarted(!started)}>{started ? 'Sesiune începută' : 'Începe sesiunea'} <span>→</span></button></div><div className="focus-visual"><div className="sun-shape" /><div className="visual-label">{started ? 'Hai să vorbim' : 'Ready when you are'}</div><span className="visual-line line-one" /><span className="visual-line line-two" /></div></section>

          <section className="module-section reveal"><div className="section-heading"><div><p className="eyebrow">Continuă explorarea</p><h2>Învață pentru lumea ta</h2></div><button className="text-button">Vezi tot <span>→</span></button></div><div className="module-tabs">{modules.map((module) => <button key={module.label} className={activeModule === module.label ? 'module-tab active' : 'module-tab'} onClick={() => setActiveModule(module.label)}><span>{module.icon}</span>{module.label}</button>)}</div></section>

          <section className="bottom-grid reveal"><div className="lessons-panel"><div className="section-heading"><div><p className="eyebrow">Planul tău</p><h2>Următoarele sesiuni</h2></div><button className="text-button">Plan complet <span>→</span></button></div><div className="lesson-list">{lessons.map((lesson) => <article className="lesson" key={lesson.title}><div className={`lesson-art ${lesson.color}`}><span>{lesson.color === 'peach' ? '◌' : lesson.color === 'blue' ? '✉' : '↗'}</span></div><div className="lesson-body"><div className="lesson-title"><strong>{lesson.title}</strong><span>{lesson.progress === 0 ? 'Nou' : `${lesson.progress}%`}</span></div><small>{lesson.meta}</small><div className="bar"><i style={{ width: `${lesson.progress}%` }} /></div></div><button className="more" aria-label={`Opțiuni pentru ${lesson.title}`}>•••</button></article>)}</div></div><aside className="quote-panel"><span className="quote-mark">“</span><blockquote>Consistency is<br /><em>the language</em><br />of progress.</blockquote><small>— James Clear</small><div className="quote-dots"><i /><i /><i /></div></aside></section>
        </div>
      </main>
    </div>
  )
}

export default App
