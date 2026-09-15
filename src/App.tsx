import { useEffect, useMemo, useState } from 'react'
import './App.css'

type View = 'overview' | 'plan' | 'library' | 'progress' | 'settings'
type Lesson = { title: string; meta: string; progress: number; color: string; level: string; duration: string }

const modules = [
  { label: 'Conversații', icon: '◌', detail: 'Învață să conduci conversații naturale.' },
  { label: 'Scriere profesională', icon: '▤', detail: 'Scrie emailuri clare și convingătoare.' },
  { label: 'Prezentări', icon: '▱', detail: 'Prezintă idei cu siguranță.' },
  { label: 'Vocabular', icon: '✦', detail: 'Construiește un vocabular relevant pentru rolul tău.' },
]

const initialLessons: Lesson[] = [
  { title: 'Small talk la conferințe', meta: 'Conversații', progress: 72, color: 'peach', level: 'B2', duration: '12 min' },
  { title: 'Emailuri clare și concise', meta: 'Scriere profesională', progress: 38, color: 'blue', level: 'B2', duration: '18 min' },
  { title: 'Idei convingătoare', meta: 'Prezentări', progress: 0, color: 'green', level: 'B2', duration: '15 min' },
]

function App() {
  const [view, setView] = useState<View>('overview')
  const [lessons, setLessons] = useState<Lesson[]>(() => {
    const saved = localStorage.getItem('altera-lessons')
    return saved ? JSON.parse(saved) : initialLessons
  })
  const [activeLesson, setActiveLesson] = useState<Lesson | null>(null)
  const [activeModule, setActiveModule] = useState('Conversații')
  const [answer, setAnswer] = useState<string | null>(null)
  const [searchOpen, setSearchOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const [compactMode, setCompactMode] = useState(false)

  useEffect(() => localStorage.setItem('altera-lessons', JSON.stringify(lessons)), [lessons])

  const filteredLessons = useMemo(() => lessons.filter((lesson) => `${lesson.title} ${lesson.meta}`.toLowerCase().includes(search.toLowerCase())), [lessons, search])
  const completed = lessons.filter((lesson) => lesson.progress >= 100).length

  const beginLesson = (lesson: Lesson) => {
    setActiveLesson(lesson)
    setAnswer(null)
    setView('overview')
  }

  const finishLesson = () => {
    if (!activeLesson) return
    setLessons((current) => current.map((lesson) => lesson.title === activeLesson.title ? { ...lesson, progress: 100 } : lesson))
    setActiveLesson(null)
  }

  return (
    <div className={compactMode ? 'app-shell compact-mode' : 'app-shell'}>
      <aside className="sidebar">
        <div className="brand"><span className="brand-mark">A</span><span>altera</span></div>
        <div className="profile-mini"><span className="avatar">AM</span><div><strong>Andrei Mureșan</strong><small>Product manager</small></div><span>⌄</span></div>
        <nav aria-label="Navigare principală">
          <p className="nav-label">Spațiul meu</p>
          <NavButton icon="⌂" label="Overview" view="overview" current={view} onClick={setView} />
          <NavButton icon="◷" label="Planul meu" badge={3} view="plan" current={view} onClick={setView} />
          <NavButton icon="▣" label="Biblioteca" view="library" current={view} onClick={setView} />
          <NavButton icon="◎" label="Progres" view="progress" current={view} onClick={setView} />
          <p className="nav-label">Cont</p>
          <NavButton icon="⚙" label="Setări" view="settings" current={view} onClick={setView} />
        </nav>
        <div className="sidebar-bottom"><div className="streak"><span>✦</span><div><strong>7 zile la rând</strong><small>Ține ritmul!</small></div></div><button className="help" aria-label="Ajutor">?</button></div>
      </aside>

      <main className="main-content">
        <header className="topbar"><div className="breadcrumb">Marți, 24 septembrie 2024 <span>/</span> {viewLabel(view)}</div><div className="top-actions">
          {searchOpen && <input autoFocus className="search-input" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Caută o lecție..." />}
          <button className="icon-button" aria-label="Caută" onClick={() => setSearchOpen(!searchOpen)}>⌕</button>
          <button className="notification" aria-label="Notificări" onClick={() => setNotificationsOpen(!notificationsOpen)}>♧<i />{notificationsOpen && <span className="notification-popover">Ai un obiectiv nou pentru săptămâna aceasta.</span>}</button>
          <div className="avatar avatar-large">AM</div>
        </div></header>

        <div className="content-inner">
          {view === 'overview' && <Overview lessons={filteredLessons} activeModule={activeModule} setActiveModule={setActiveModule} beginLesson={beginLesson} activeLesson={activeLesson} answer={answer} setAnswer={setAnswer} finishLesson={finishLesson} />}
          {view === 'plan' && <Plan lessons={filteredLessons} beginLesson={beginLesson} />}
          {view === 'library' && <Library activeModule={activeModule} setActiveModule={setActiveModule} lessons={filteredLessons} beginLesson={beginLesson} />}
          {view === 'progress' && <Progress lessons={lessons} completed={completed} />}
          {view === 'settings' && <Settings compactMode={compactMode} setCompactMode={setCompactMode} />}
        </div>
      </main>
    </div>
  )
}

function NavButton({ icon, label, badge, view, current, onClick }: { icon: string; label: string; badge?: number; view: View; current: View; onClick: (view: View) => void }) {
  return <button className={current === view ? 'nav-item selected' : 'nav-item'} onClick={() => onClick(view)}><span>{icon}</span> {label} {badge && <b>{badge}</b>}</button>
}

function Overview({ lessons, activeModule, setActiveModule, beginLesson, activeLesson, answer, setAnswer, finishLesson }: { lessons: Lesson[]; activeModule: string; setActiveModule: (value: string) => void; beginLesson: (lesson: Lesson) => void; activeLesson: Lesson | null; answer: string | null; setAnswer: (answer: string) => void; finishLesson: () => void }) {
  const featured = lessons[0]
  return <>
    <section className="welcome reveal"><div><p className="eyebrow">Bun venit înapoi, Andrei</p><h1>Construiește-ți vocea<br /><em>profesională.</em></h1><p className="intro">Învață engleză relevantă pentru munca ta, în ritmul tău.</p></div><div className="weekly-card"><span className="weekly-icon">◒</span><div><small>OBIECTIV SĂPTĂMÂNAL</small><strong>3 din 5 sesiuni</strong></div><div className="progress-ring">60%</div></div></section>
    {activeLesson ? <Practice lesson={activeLesson} answer={answer} setAnswer={setAnswer} finishLesson={finishLesson} /> : <section className="focus-card reveal"><div className="focus-copy"><div className="section-kicker"><span className="live-dot" /> RECOMANDAT PENTRU TINE</div><h2>{featured.title}</h2><p>Învață să începi conversații naturale și să lași o impresie memorabilă.</p><div className="focus-meta"><span>◷ {featured.duration}</span><span>◌ {featured.meta}</span><span>● Nivel {featured.level}</span></div><button className="primary-button" onClick={() => beginLesson(featured)}>Începe sesiunea <span>→</span></button></div><div className="focus-visual"><div className="sun-shape" /><div className="visual-label">Ready when you are</div><span className="visual-line line-one" /><span className="visual-line line-two" /></div></section>}
    <section className="module-section reveal"><div className="section-heading"><div><p className="eyebrow">Continuă explorarea</p><h2>Învață pentru lumea ta</h2></div><button className="text-button">Vezi tot <span>→</span></button></div><div className="module-tabs">{modules.map((module) => <button key={module.label} className={activeModule === module.label ? 'module-tab active' : 'module-tab'} onClick={() => setActiveModule(module.label)}><span>{module.icon}</span>{module.label}</button>)}</div></section>
    <section className="bottom-grid reveal"><div className="lessons-panel"><div className="section-heading"><div><p className="eyebrow">Planul tău</p><h2>Următoarele sesiuni</h2></div><button className="text-button">Plan complet <span>→</span></button></div><div className="lesson-list">{lessons.map((lesson) => <LessonRow key={lesson.title} lesson={lesson} onClick={() => beginLesson(lesson)} />)}</div></div><aside className="quote-panel"><span className="quote-mark">“</span><blockquote>Consistency is<br /><em>the language</em><br />of progress.</blockquote><small>— James Clear</small><div className="quote-dots"><i /><i /><i /></div></aside></section>
  </>
}

function Practice({ lesson, answer, setAnswer, finishLesson }: { lesson: Lesson; answer: string | null; setAnswer: (answer: string) => void; finishLesson: () => void }) {
  const options = ['Hi, what brings you to the conference?', 'Tell me your job title.', 'You are from here, right?']
  return <section className="practice-card reveal"><div className="practice-header"><div><p className="eyebrow">Exercițiul 1 din 4 · {lesson.title}</p><h2>Întâlnești un coleg nou la o conferință. Cum începi?</h2><p className="practice-prompt">Alege replica ce sună cel mai natural într-un context profesional.</p></div><button className="close-practice" onClick={() => window.location.reload()} aria-label="Închide exercițiul">×</button></div><div className="answers">{options.map((option) => <button key={option} className={answer === option ? `answer ${option.startsWith('Hi') ? 'correct' : 'wrong'}` : 'answer'} onClick={() => setAnswer(option)}>{option}<span>{answer === option ? (option.startsWith('Hi') ? '✓' : '×') : '○'}</span></button>)}</div>{answer && <p className={answer.startsWith('Hi') ? 'feedback good' : 'feedback'}>{answer.startsWith('Hi') ? 'Foarte bine. Este o întrebare deschisă și invită la conversație.' : 'Încearcă o formulare mai deschisă și mai puțin directă.'}</p>}<div className="practice-footer"><span>Progres salvat automat</span><button className="primary-button" disabled={!answer} onClick={finishLesson}>Finalizează lecția <span>→</span></button></div></section>
}

function LessonRow({ lesson, onClick }: { lesson: Lesson; onClick: () => void }) { return <article className="lesson" onClick={onClick} role="button" tabIndex={0} onKeyDown={(event) => event.key === 'Enter' && onClick()}><div className={`lesson-art ${lesson.color}`}><span>{lesson.color === 'peach' ? '◌' : lesson.color === 'blue' ? '✉' : '↗'}</span></div><div className="lesson-body"><div className="lesson-title"><strong>{lesson.title}</strong><span>{lesson.progress === 0 ? 'Nou' : `${lesson.progress}%`}</span></div><small>{lesson.duration} · {lesson.meta}</small><div className="bar"><i style={{ width: `${lesson.progress}%` }} /></div></div><button className="more" aria-label={`Deschide ${lesson.title}`}>→</button></article> }

function Plan({ lessons, beginLesson }: { lessons: Lesson[]; beginLesson: (lesson: Lesson) => void }) { return <Page title="Planul tău de învățare" eyebrow="Ritmul tău, obiectivele tale" description="Sesiunile tale sunt organizate în funcție de rolul profesional și timpul disponibil."><div className="plan-summary"><div><strong>3</strong><span>sesiuni<br />săptămâna aceasta</span></div><div><strong>42</strong><span>minute<br />învățate</span></div><div><strong>B2</strong><span>nivel<br />curent</span></div></div><div className="full-list">{lessons.map((lesson) => <LessonRow key={lesson.title} lesson={lesson} onClick={() => beginLesson(lesson)} />)}</div></Page> }
function Library({ activeModule, setActiveModule, lessons, beginLesson }: { activeModule: string; setActiveModule: (value: string) => void; lessons: Lesson[]; beginLesson: (lesson: Lesson) => void }) { return <Page title="Biblioteca de practică" eyebrow="Alege-ți direcția" description="Conținut scurt, aplicabil și construit pentru situațiile pe care le întâlnești la muncă."><div className="library-tabs">{modules.map((module) => <button className={activeModule === module.label ? 'library-tab active' : 'library-tab'} key={module.label} onClick={() => setActiveModule(module.label)}><span>{module.icon}</span><strong>{module.label}</strong><small>{module.detail}</small></button>)}</div><div className="section-heading library-heading"><h2>Lecții recomandate în {activeModule.toLowerCase()}</h2></div><div className="full-list">{lessons.map((lesson) => <LessonRow key={lesson.title} lesson={lesson} onClick={() => beginLesson(lesson)} />)}</div></Page> }
function Progress({ lessons, completed }: { lessons: Lesson[]; completed: number }) { const average = Math.round(lessons.reduce((sum, lesson) => sum + lesson.progress, 0) / lessons.length); return <Page title="Progresul tău" eyebrow="Vezi cât de departe ai ajuns" description="Micile sesiuni repetate se transformă în încredere reală la muncă."><div className="progress-hero"><div className="big-progress">{average}%<small>progres total</small></div><div className="progress-copy"><strong>Construiești un obicei solid.</strong><p>Ai finalizat {completed} lecții și ai o serie activă de 7 zile.</p><div className="bar large"><i style={{ width: `${average}%` }} /></div></div></div><div className="progress-breakdown">{lessons.map((lesson) => <div key={lesson.title}><div><strong>{lesson.title}</strong><span>{lesson.progress}%</span></div><div className="bar"><i style={{ width: `${lesson.progress}%` }} /></div></div>)}</div></Page> }
function Settings({ compactMode, setCompactMode }: { compactMode: boolean; setCompactMode: (value: boolean) => void }) { return <Page title="Setări" eyebrow="Personalizează experiența" description="Alege cum vrei să arate și să funcționeze spațiul tău de învățare."><div className="settings-list"><label><span><strong>Interfață compactă</strong><small>Mai mult conținut vizibil pe ecran.</small></span><input type="checkbox" checked={compactMode} onChange={(event) => setCompactMode(event.target.checked)} /></label><label><span><strong>Remindere zilnice</strong><small>Primește un reminder pentru sesiunea de azi.</small></span><input type="checkbox" defaultChecked /></label><label><span><strong>Feedback după exerciții</strong><small>Vezi explicația imediat după răspuns.</small></span><input type="checkbox" defaultChecked /></label></div></Page> }
function Page({ title, eyebrow, description, children }: { title: string; eyebrow: string; description: string; children: React.ReactNode }) { return <section className="page-view reveal"><p className="eyebrow">{eyebrow}</p><h1 className="page-title">{title}</h1><p className="page-description">{description}</p><div className="page-content">{children}</div></section> }
function viewLabel(view: View) { return { overview: 'Overview', plan: 'Planul meu', library: 'Biblioteca', progress: 'Progres', settings: 'Setări' }[view] }

export default App
