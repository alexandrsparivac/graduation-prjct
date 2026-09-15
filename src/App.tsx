import { useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { ArrowRight, ArrowUpRight, Award, BarChart3, Bell, BookOpen, ChartNoAxesColumnIncreasing, Check, ChevronDown, Circle, CircleHelp, Clock3, Flame, Home, Layers3, Library as LibraryIcon, Mail, MessageCircle, Mic2, Presentation, Search, Settings as SettingsIcon, ShieldCheck, Sparkles, Square, Target, Users, X, type LucideIcon } from 'lucide-react'
import './App.css'

type View = 'overview' | 'plan' | 'paths' | 'library' | 'progress' | 'settings' | 'assessment' | 'recommendations' | 'speaking' | 'trainer' | 'admin'
type Role = 'learner' | 'trainer' | 'admin'
type User = { id: string; name: string; email: string; role: Role; profileComplete?: boolean }
type Lesson = { title: string; meta: string; progress: number; color: string; level: string; duration: string }
type LearningPath = { id: string; language: string; domain: string; level: string; progress: number; lessons: number; active: boolean }

const demoUsers: User[] = [
  { id: 'learner-demo', name: 'Andrei Mureșan', email: 'learner@linguapro.demo', role: 'learner', profileComplete: true },
  { id: 'trainer-demo', name: 'Irina Popescu', email: 'trainer@linguapro.demo', role: 'trainer', profileComplete: true },
  { id: 'admin-demo', name: 'Admin LinguaPro', email: 'admin@linguapro.demo', role: 'admin', profileComplete: true },
]

const modules = [
  { label: 'Conversații', icon: MessageCircle, detail: 'Învață să conduci conversații naturale.' },
  { label: 'Scriere profesională', icon: Mail, detail: 'Scrie emailuri clare și convingătoare.' },
  { label: 'Prezentări', icon: Presentation, detail: 'Prezintă idei cu siguranță.' },
  { label: 'Vocabular', icon: BookOpen, detail: 'Construiește un vocabular relevant pentru rolul tău.' },
]

const initialLessons: Lesson[] = [
  { title: 'Small talk la conferințe', meta: 'Conversații', progress: 72, color: 'peach', level: 'B2', duration: '12 min' },
  { title: 'Emailuri clare și concise', meta: 'Scriere profesională', progress: 38, color: 'blue', level: 'B2', duration: '18 min' },
  { title: 'Idei convingătoare', meta: 'Prezentări', progress: 0, color: 'green', level: 'B2', duration: '15 min' },
]

const makePaths = (language: string, domains: string[], level: string): LearningPath[] => domains.map((domain, index) => ({ id: `${language}-${domain}-${Date.now()}-${index}`, language, domain, level, progress: index === 0 ? 24 : 0, lessons: index === 0 ? 8 : 6, active: index === 0 }))

function App() {
  const [view, setView] = useState<View>('overview')
  const [user, setUser] = useState<User | null>(() => {
    const saved = localStorage.getItem('linguapro-session')
    return saved ? JSON.parse(saved) : null
  })
  const [lessons, setLessons] = useState<Lesson[]>(() => {
    const saved = localStorage.getItem('altera-lessons')
    return saved ? JSON.parse(saved) : initialLessons
  })
  const [paths, setPaths] = useState<LearningPath[]>(() => {
    const saved = localStorage.getItem('linguapro-paths')
    return saved ? JSON.parse(saved) : []
  })
  const [activeLesson, setActiveLesson] = useState<Lesson | null>(null)
  const [activeModule, setActiveModule] = useState('Conversații')
  const [answer, setAnswer] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const searchRef = useRef<HTMLInputElement>(null)
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const [compactMode, setCompactMode] = useState(false)

  useEffect(() => localStorage.setItem('altera-lessons', JSON.stringify(lessons)), [lessons])
  useEffect(() => {
    if (user) localStorage.setItem('linguapro-session', JSON.stringify(user))
    else localStorage.removeItem('linguapro-session')
  }, [user])
  useEffect(() => localStorage.setItem('linguapro-paths', JSON.stringify(paths)), [paths])

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

  const enterSession = (nextUser: User) => {
    setUser(nextUser)
    setView(nextUser.role === 'learner' && !nextUser.profileComplete ? 'assessment' : nextUser.role === 'trainer' ? 'trainer' : nextUser.role === 'admin' ? 'admin' : 'overview')
  }

  if (!user) return <AuthPortal onEnter={enterSession} />

  const initials = user.name.split(' ').map((word) => word[0]).join('').slice(0, 2).toUpperCase()

  return (
    <div className={compactMode ? 'app-shell compact-mode' : 'app-shell'}>
      <aside className="sidebar">
        <div className="brand"><span className="brand-mark">A</span><span>altera</span></div>
        <div className="profile-mini"><span className="avatar">{initials}</span><div><strong>{user.name}</strong><small>{roleLabel(user.role)}</small></div><span><ChevronDown size={16} /></span></div>
        <nav aria-label="Navigare principală">
          <p className="nav-label">{user.role === 'learner' ? 'Spațiul meu' : 'Management'}</p>
          {user.role === 'learner' && <>
            <NavButton icon={Home} label="Overview" view="overview" current={view} onClick={setView} />
            <NavButton icon={Clock3} label="Planul meu" badge={3} view="plan" current={view} onClick={setView} />
            <NavButton icon={Layers3} label="Path-urile mele" view="paths" current={view} onClick={setView} />
            <NavButton icon={LibraryIcon} label="Biblioteca" view="library" current={view} onClick={setView} />
            <NavButton icon={BarChart3} label="Progres" view="progress" current={view} onClick={setView} />
            <NavButton icon={Sparkles} label="Recomandări" view="recommendations" current={view} onClick={setView} />
            <NavButton icon={Mic2} label="Practică orală" view="speaking" current={view} onClick={setView} />
          </>}
          {user.role === 'trainer' && <NavButton icon={Users} label="Conținut și cursanți" view="trainer" current={view} onClick={setView} />}
          {user.role === 'admin' && <NavButton icon={ShieldCheck} label="Utilizatori" view="admin" current={view} onClick={setView} />}
          <p className="nav-label">Cont</p>
          <NavButton icon={SettingsIcon} label="Setări" view="settings" current={view} onClick={setView} />
        </nav>
        <div className="sidebar-bottom"><div className="streak"><span><Flame size={17} /></span><div><strong>7 zile la rând</strong><small>Ține ritmul!</small></div></div><button className="help" aria-label="Ajutor"><CircleHelp size={16} /></button></div>
      </aside>

      <main className="main-content">
        <header className="topbar"><div className="breadcrumb">Marți, 24 septembrie 2024 <span>/</span> {viewLabel(view)}</div><div className="top-actions">
          <div className="search-control"><input ref={searchRef} className="search-input" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Caută o lecție..." /><button className="icon-button" aria-label="Activează căutarea" onClick={() => searchRef.current?.focus()}><Search size={19} strokeWidth={2} /></button></div>
          <button className="notification" aria-label="Notificări" onClick={() => setNotificationsOpen(!notificationsOpen)}><Bell size={18} strokeWidth={2} /><i />{notificationsOpen && <span className="notification-popover">Ai un obiectiv nou pentru săptămâna aceasta.</span>}</button>
          <div className="avatar avatar-large">{initials}</div>
        </div></header>

        <div className="content-inner">
          {view === 'overview' && <Overview lessons={filteredLessons} activeModule={activeModule} setActiveModule={setActiveModule} beginLesson={beginLesson} activeLesson={activeLesson} answer={answer} setAnswer={setAnswer} finishLesson={finishLesson} user={user} />}
          {view === 'plan' && <Plan lessons={filteredLessons} beginLesson={beginLesson} />}
          {view === 'paths' && <Paths paths={paths} onAdd={() => setView('assessment')} />}
          {view === 'library' && <Library activeModule={activeModule} setActiveModule={setActiveModule} lessons={filteredLessons} beginLesson={beginLesson} />}
          {view === 'progress' && <Progress lessons={lessons} completed={completed} />}
          {view === 'assessment' && <LearningPathSetup user={user} onComplete={(profile) => { const updated = { ...user, profileComplete: true }; setUser(updated); setPaths((current) => [...current, ...makePaths(profile.language, profile.domains, profile.level)]); localStorage.setItem('linguapro-profile', JSON.stringify(profile)); setView('paths') }} />}
          {view === 'recommendations' && <Recommendations lessons={lessons} beginLesson={beginLesson} />}
          {view === 'speaking' && <SpeakingPractice />}
          {view === 'trainer' && <TrainerWorkspace />}
          {view === 'admin' && <AdminPanel />}
          {view === 'settings' && <Settings compactMode={compactMode} setCompactMode={setCompactMode} user={user} onLogout={() => { setUser(null); setView('overview') }} onAssessment={() => setView('assessment')} />}
        </div>
      </main>
    </div>
  )
}

function AuthPortal({ onEnter }: { onEnter: (user: User) => void }) {
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [role, setRole] = useState<Role>('learner')
  const [error, setError] = useState('')
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const email = String(data.get('email') || '').trim().toLowerCase()
    const name = String(data.get('name') || '').trim()
    if (!email.includes('@')) return setError('Introdu o adresă de email validă.')
    if (mode === 'login') {
      const user = demoUsers.find((candidate) => candidate.email === email)
      if (!user) return setError('Folosește unul dintre conturile demo sau creează un cont nou.')
      onEnter(user)
      return
    }
    if (name.length < 2) return setError('Introdu numele tău pentru a continua.')
    onEnter({ id: crypto.randomUUID(), name, email, role, profileComplete: role !== 'learner' })
  }
  return <main className="auth-layout"><section className="auth-intro"><div className="brand"><span className="brand-mark">L</span><span>linguapro</span></div><p className="eyebrow">ÎNVĂȚARE ÎN CONTEXT PROFESIONAL</p><h1>O limbă care lucrează <em>pentru tine.</em></h1><p>Construiește încredere în situațiile reale din profesia ta, de la primul email până la următoarea prezentare.</p></section><section className="auth-card"><p className="eyebrow">{mode === 'login' ? 'BINE AI REVENIT' : 'CREEAZĂ UN CONT'}</p><h2>{mode === 'login' ? 'Intră în spațiul tău' : 'Începe parcursul personalizat'}</h2><form onSubmit={submit}><label>{mode === 'register' && <>Nume complet<input name="name" placeholder="Ex. Elena Rusu" /></>}<span>Adresă de email</span><input name="email" type="email" placeholder="nume@companie.md" required /></label><label><span>Parolă</span><input name="password" type="password" minLength={6} placeholder="Minimum 6 caractere" required /></label>{mode === 'register' && <fieldset><legend>Rol în platformă</legend><div className="role-picker">{(['learner', 'trainer', 'admin'] as Role[]).map((item) => <button type="button" className={role === item ? 'active' : ''} onClick={() => setRole(item)} key={item}>{roleLabel(item)}</button>)}</div></fieldset>}{error && <p className="form-error">{error}</p>}<button className="primary-button" type="submit">{mode === 'login' ? 'Autentificare' : 'Creează contul'} <ArrowRight size={15} /></button></form><button className="text-button auth-switch" onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError('') }}>{mode === 'login' ? 'Nu ai cont? Înregistrează-te' : 'Ai deja cont? Autentifică-te'}</button><div className="demo-accounts"><strong>Conturi demo</strong>{demoUsers.map((account) => <button onClick={() => onEnter(account)} key={account.email}>{account.email} · {roleLabel(account.role)}</button>)}</div></section></main>
}

function roleLabel(role: Role) { return { learner: 'Cursant', trainer: 'Formator', admin: 'Administrator' }[role] }

function NavButton({ icon: Icon, label, badge, view, current, onClick }: { icon: LucideIcon; label: string; badge?: number; view: View; current: View; onClick: (view: View) => void }) {
  return <button className={current === view ? 'nav-item selected' : 'nav-item'} onClick={() => onClick(view)}><span><Icon size={16} strokeWidth={2} /></span> {label} {badge && <b>{badge}</b>}</button>
}

function Overview({ lessons, activeModule, setActiveModule, beginLesson, activeLesson, answer, setAnswer, finishLesson, user }: { lessons: Lesson[]; activeModule: string; setActiveModule: (value: string) => void; beginLesson: (lesson: Lesson) => void; activeLesson: Lesson | null; answer: string | null; setAnswer: (answer: string) => void; finishLesson: () => void; user: User }) {
  const featured = lessons[0]
  return <>
    <section className="welcome reveal"><div><p className="eyebrow">Bun venit înapoi, {user.name.split(' ')[0]}</p><h1>Construiește-ți vocea<br /><em>profesională.</em></h1><p className="intro">Învață engleză relevantă pentru munca ta, în ritmul tău.</p></div><div className="weekly-card"><span className="weekly-icon"><Target size={20} /></span><div><small>OBIECTIV SĂPTĂMÂNAL</small><strong>3 din 5 sesiuni</strong></div><div className="progress-ring">60%</div></div></section>
    {activeLesson ? <Practice lesson={activeLesson} answer={answer} setAnswer={setAnswer} finishLesson={finishLesson} /> : <section className="focus-card reveal"><div className="focus-copy"><div className="section-kicker"><span className="live-dot" /> RECOMANDAT PENTRU TINE</div><h2>{featured.title}</h2><p>Învață să începi conversații naturale și să lași o impresie memorabilă.</p><div className="focus-meta"><span><Clock3 size={13} /> {featured.duration}</span><span><MessageCircle size={13} /> {featured.meta}</span><span><Award size={13} /> Nivel {featured.level}</span></div><button className="primary-button" onClick={() => beginLesson(featured)}>Începe sesiunea <ArrowRight size={15} /></button></div><div className="focus-visual"><div className="sun-shape" /><div className="visual-label">Ready when you are</div><span className="visual-line line-one" /><span className="visual-line line-two" /></div></section>}
    <section className="module-section reveal"><div className="section-heading"><div><p className="eyebrow">Continuă explorarea</p><h2>Învață pentru lumea ta</h2></div><button className="text-button">Vezi tot <ArrowRight size={14} /></button></div><div className="module-tabs">{modules.map((module) => { const ModuleIcon = module.icon; return <button key={module.label} className={activeModule === module.label ? 'module-tab active' : 'module-tab'} onClick={() => setActiveModule(module.label)}><span><ModuleIcon size={17} strokeWidth={2} /></span>{module.label}</button> })}</div></section>
    <section className="bottom-grid reveal"><div className="lessons-panel"><div className="section-heading"><div><p className="eyebrow">Planul tău</p><h2>Următoarele sesiuni</h2></div><button className="text-button">Plan complet <ArrowRight size={14} /></button></div><div className="lesson-list">{lessons.map((lesson) => <LessonRow key={lesson.title} lesson={lesson} onClick={() => beginLesson(lesson)} />)}</div></div><aside className="focus-panel"><div className="focus-panel-icon"><ChartNoAxesColumnIncreasing size={19} /></div><p className="eyebrow">FOCUS PENTRU AZI</p><h3>12 minute pentru un pas înainte</h3><p>Continuă sesiunea începută și exersează o conversație reală.</p><div className="focus-panel-meta"><span><Clock3 size={13} /> 12 min</span><span><BarChart3 size={13} /> 72%</span></div><button className="focus-link" onClick={() => beginLesson(lessons[0])}>Continuă lecția <ArrowRight size={14} /></button></aside></section>
  </>
}

function Practice({ lesson, answer, setAnswer, finishLesson }: { lesson: Lesson; answer: string | null; setAnswer: (answer: string) => void; finishLesson: () => void }) {
  const options = ['Hi, what brings you to the conference?', 'Tell me your job title.', 'You are from here, right?']
  return <section className="practice-card reveal"><div className="practice-header"><div><p className="eyebrow">Exercițiul 1 din 4 · {lesson.title}</p><h2>Întâlnești un coleg nou la o conferință. Cum începi?</h2><p className="practice-prompt">Alege replica ce sună cel mai natural într-un context profesional.</p></div><button className="close-practice" onClick={() => window.location.reload()} aria-label="Închide exercițiul"><X size={19} /></button></div><div className="answers">{options.map((option) => <button key={option} className={answer === option ? `answer ${option.startsWith('Hi') ? 'correct' : 'wrong'}` : 'answer'} onClick={() => setAnswer(option)}>{option}<span>{answer === option ? (option.startsWith('Hi') ? <Check size={15} /> : <X size={15} />) : <Circle size={15} />}</span></button>)}</div>{answer && <p className={answer.startsWith('Hi') ? 'feedback good' : 'feedback'}>{answer.startsWith('Hi') ? 'Foarte bine. Este o întrebare deschisă și invită la conversație.' : 'Încearcă o formulare mai deschisă și mai puțin directă.'}</p>}<div className="practice-footer"><span>Progres salvat automat</span><button className="primary-button" disabled={!answer} onClick={finishLesson}>Finalizează lecția <ArrowRight size={15} /></button></div></section>
}

function LessonRow({ lesson, onClick }: { lesson: Lesson; onClick: () => void }) { const LessonIcon = lesson.color === 'peach' ? MessageCircle : lesson.color === 'blue' ? Mail : Presentation; return <article className="lesson" onClick={onClick} role="button" tabIndex={0} onKeyDown={(event) => event.key === 'Enter' && onClick()}><div className={`lesson-art ${lesson.color}`}><LessonIcon size={19} /></div><div className="lesson-body"><div className="lesson-title"><strong>{lesson.title}</strong><span>{lesson.progress === 0 ? 'Nou' : `${lesson.progress}%`}</span></div><small>{lesson.duration} · {lesson.meta}</small><div className="bar"><i style={{ width: `${lesson.progress}%` }} /></div></div><button className="more" aria-label={`Deschide ${lesson.title}`}><ArrowUpRight size={16} /></button></article> }

function Plan({ lessons, beginLesson }: { lessons: Lesson[]; beginLesson: (lesson: Lesson) => void }) { return <Page title="Planul tău de învățare" eyebrow="Ritmul tău, obiectivele tale" description="Sesiunile tale sunt organizate în funcție de rolul profesional și timpul disponibil."><div className="plan-summary"><div><strong>3</strong><span>sesiuni<br />săptămâna aceasta</span></div><div><strong>42</strong><span>minute<br />învățate</span></div><div><strong>B2</strong><span>nivel<br />curent</span></div></div><div className="full-list">{lessons.map((lesson) => <LessonRow key={lesson.title} lesson={lesson} onClick={() => beginLesson(lesson)} />)}</div></Page> }
function Paths({ paths, onAdd }: { paths: LearningPath[]; onAdd: () => void }) { return <Page title="Path-urile mele" eyebrow="PARCURSURI PERSONALIZATE" description="Învață mai multe limbi sau aplică aceeași limbă în domenii profesionale diferite."><div className="path-toolbar"><div><strong>{paths.length || 0} path-uri active</strong><small>Fiecare are propriul progres și obiectiv.</small></div><button className="primary-button" onClick={onAdd}>Adaugă path <ArrowRight size={15} /></button></div>{paths.length ? <div className="paths-grid">{paths.map((path) => <article className={path.active ? 'path-card active' : 'path-card'} key={path.id}><div className="path-card-top"><span className="path-language">{path.language}</span><span className="path-status">{path.active ? 'Activ' : 'În așteptare'}</span></div><h2>{path.language} pentru {path.domain}</h2><p>Nivel {path.level} · {path.lessons} lecții profesionale</p><div className="path-progress"><div><span>Progres</span><strong>{path.progress}%</strong></div><div className="bar"><i style={{ width: `${path.progress}%` }} /></div></div><button className="path-link">Deschide path <ArrowRight size={14} /></button></article>)}</div> : <div className="empty-paths"><Layers3 size={26} /><h2>Construiește primul tău path</h2><p>Alege limba și domeniile care contează pentru munca ta.</p><button className="primary-button" onClick={onAdd}>Începe configurarea <ArrowRight size={15} /></button></div>}</Page> }

function LearningPathSetup({ user, onComplete }: { user: User; onComplete: (profile: { language: string; domains: string[]; level: string; goal: string }) => void }) {
  const [step, setStep] = useState(0)
  const [language, setLanguage] = useState('Engleză')
  const [domains, setDomains] = useState<string[]>(['IT'])
  const [goal, setGoal] = useState('Să pot susține prezentări și conversații profesionale.')
  const domainOptions = ['IT', 'Marketing', 'Finanțe', 'Medicină', 'Drept', 'Afaceri']
  const toggleDomain = (domain: string) => setDomains((current) => current.includes(domain) ? current.filter((item) => item !== domain) : [...current, domain])
  return <Page title="Construiește-ți parcursul" eyebrow={`BUN VENIT, ${user.name.split(' ')[0].toUpperCase()}`} description="Alege ce vrei să înveți. Vom genera un path separat pentru fiecare domeniu selectat."><div className="setup-card"><div className="setup-steps"><span className={step === 0 ? 'active' : ''}>01 Preferințe</span><span className={step === 1 ? 'active' : ''}>02 Obiectiv</span></div>{step === 0 ? <><h2>În ce limbă vrei să lucrezi?</h2><div className="language-grid">{['Engleză', 'Germană', 'Franceză', 'Italiană'].map((item) => <button className={language === item ? 'selected-choice' : ''} onClick={() => setLanguage(item)} key={item}>{item}<Check size={15} /></button>)}</div><h2>Ce domenii vrei să înveți?</h2><p className="setup-hint">Poți alege mai multe domenii. Pentru fiecare vom crea un learning path separat.</p><div className="domain-grid">{domainOptions.map((domain) => <button className={domains.includes(domain) ? 'selected-choice' : ''} onClick={() => toggleDomain(domain)} key={domain}>{domain}<Check size={15} /></button>)}</div><button className="primary-button setup-next" disabled={!domains.length} onClick={() => setStep(1)}>Continuă <ArrowRight size={15} /></button></> : <><h2>Care este obiectivul tău?</h2><p className="setup-hint">Acest obiectiv ne ajută să prioritizăm lecțiile din fiecare path.</p><textarea className="goal-input" value={goal} onChange={(event) => setGoal(event.target.value)} /><div className="setup-summary"><strong>{language}</strong><span>{domains.join(' · ')}</span></div><div className="setup-actions"><button className="text-button" onClick={() => setStep(0)}>Înapoi</button><button className="primary-button" onClick={() => onComplete({ language, domains, level: 'B1', goal })}>Generează {domains.length} path-uri <ArrowRight size={15} /></button></div></>}</div></Page>
}
function Library({ activeModule, setActiveModule, lessons, beginLesson }: { activeModule: string; setActiveModule: (value: string) => void; lessons: Lesson[]; beginLesson: (lesson: Lesson) => void }) { return <Page title="Biblioteca de practică" eyebrow="Alege-ți direcția" description="Conținut scurt, aplicabil și construit pentru situațiile pe care le întâlnești la muncă."><div className="library-tabs">{modules.map((module) => { const ModuleIcon = module.icon; return <button className={activeModule === module.label ? 'library-tab active' : 'library-tab'} key={module.label} onClick={() => setActiveModule(module.label)}><span><ModuleIcon size={21} strokeWidth={2} /></span><strong>{module.label}</strong><small>{module.detail}</small></button> })}</div><div className="section-heading library-heading"><h2>Lecții recomandate în {activeModule.toLowerCase()}</h2></div><div className="full-list">{lessons.map((lesson) => <LessonRow key={lesson.title} lesson={lesson} onClick={() => beginLesson(lesson)} />)}</div></Page> }
function Progress({ lessons, completed }: { lessons: Lesson[]; completed: number }) { const average = Math.round(lessons.reduce((sum, lesson) => sum + lesson.progress, 0) / lessons.length); return <Page title="Progresul tău" eyebrow="Vezi cât de departe ai ajuns" description="Micile sesiuni repetate se transformă în încredere reală la muncă."><div className="progress-hero"><div className="big-progress">{average}%<small>progres total</small></div><div className="progress-copy"><strong>Construiești un obicei solid.</strong><p>Ai finalizat {completed} lecții și ai o serie activă de 7 zile.</p><div className="bar large"><i style={{ width: `${average}%` }} /></div></div></div><div className="progress-breakdown">{lessons.map((lesson) => <div key={lesson.title}><div><strong>{lesson.title}</strong><span>{lesson.progress}%</span></div><div className="bar"><i style={{ width: `${lesson.progress}%` }} /></div></div>)}</div></Page> }
function Recommendations({ lessons, beginLesson }: { lessons: Lesson[]; beginLesson: (lesson: Lesson) => void }) { const recommended = lessons.filter((lesson) => lesson.progress < 70); return <Page title="Recomandări pentru tine" eyebrow="ÎNVĂȚARE ADAPTIVĂ" description="Am identificat zonele în care încă poți câștiga claritate și încredere."><div className="recommendation-list">{recommended.map((lesson) => <article className="recommendation" key={lesson.title}><span className="recommendation-icon"><Sparkles size={17} /></span><div><strong>{lesson.title}</strong><p>Recomandată deoarece progresul tău actual este {lesson.progress}%. O sesiune scurtă consolidează această competență.</p><button className="text-button" onClick={() => beginLesson(lesson)}>Începe exercițiul <ArrowRight size={14} /></button></div></article>)}{!recommended.length && <p>Excelent — nu ai recomandări de recuperare acum.</p>}</div></Page> }

function SpeakingPractice() { const [recording, setRecording] = useState(false); const [transcript, setTranscript] = useState(''); const [feedback, setFeedback] = useState(''); const analyse = () => { const words = transcript.trim().split(/\s+/).filter(Boolean).length; setFeedback(words >= 8 ? 'Foarte bine. Ai folosit o formulare completă. Încearcă să accentuezi cuvintele “project” și “timeline”.' : 'Adaugă un detaliu despre proiect pentru un răspuns mai natural și mai precis.') }; return <Page title="Practică orală" eyebrow="SIMULARE CONVERSAȚIONALĂ" description="Exersează răspunsuri scurte pentru situații reale. În producție, acest modul poate folosi Speech-to-Text; acum poți introduce transcrierea sau o poți simula."><div className="speaking-card"><p className="scenario-label">SCENARIU · ȘEDINȚĂ DE PROIECT</p><h2>“Could you give us a quick update on the project?”</h2><textarea value={transcript} onChange={(event) => setTranscript(event.target.value)} placeholder="Scrie răspunsul tău în engleză sau pornește simularea înregistrării..." /><div className="speaking-actions"><button className={recording ? 'recording' : 'record-button'} onClick={() => setRecording(!recording)}>{recording ? <><Square size={14} /> Oprește înregistrarea</> : <><Mic2 size={14} /> Simulează înregistrarea</>}</button><button className="primary-button" onClick={analyse} disabled={!transcript.trim()}>Primește feedback <ArrowRight size={15} /></button></div>{feedback && <p className="feedback good">{feedback}</p>}</div></Page> }

function TrainerWorkspace() { const [courses, setCourses] = useState([{ title: 'English for Product Teams', domain: 'IT', lessons: 8 }, { title: 'Clinical communication essentials', domain: 'Medicină', lessons: 6 }]); const [title, setTitle] = useState(''); const addCourse = (event: FormEvent) => { event.preventDefault(); if (!title.trim()) return; setCourses([...courses, { title, domain: 'Afaceri', lessons: 0 }]); setTitle('') }; return <Page title="Spațiul formatorului" eyebrow="CONȚINUT ȘI CURSANȚI" description="Creează conținut profesional și urmărește cursanții înscriși în modulele tale."><div className="trainer-grid"><section><h2>Cursuri publicate</h2>{courses.map((course) => <article className="management-row" key={course.title}><div><strong>{course.title}</strong><small>{course.domain} · {course.lessons} lecții</small></div><button className="text-button">Editează</button></article>)}</section><form className="create-card" onSubmit={addCourse}><h2>Curs nou</h2><input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Titlul cursului" /><button className="primary-button">Adaugă curs <ArrowRight size={15} /></button></form></div><section className="learner-table"><h2>Activitatea cursanților</h2><div className="management-row"><div><strong>Andrei Mureșan</strong><small>B2 · 68% progres</small></div><span className="status-pill">activ</span></div><div className="management-row"><div><strong>Maria Lupu</strong><small>B1 · 42% progres</small></div><span className="status-pill">necesită atenție</span></div></section></Page> }

function AdminPanel() { const [users, setUsers] = useState(demoUsers); const toggle = (id: string) => setUsers(users.map((account) => account.id === id ? { ...account, role: account.role === 'learner' ? 'trainer' : 'learner' } : account)); return <Page title="Administrare utilizatori" eyebrow="CONTROL ACCES" description="Gestionează rolurile și accesul în platformă. Schimbările sunt păstrate numai în acest demo local."><div className="user-table"><div className="table-head"><span>Utilizator</span><span>Rol</span><span>Acțiune</span></div>{users.map((account) => <div className="table-row" key={account.id}><div><strong>{account.name}</strong><small>{account.email}</small></div><span className="role-chip">{roleLabel(account.role)}</span><button className="text-button" onClick={() => toggle(account.id)}>Schimbă rolul</button></div>)}</div></Page> }

function Settings({ compactMode, setCompactMode, user, onLogout, onAssessment }: { compactMode: boolean; setCompactMode: (value: boolean) => void; user: User; onLogout: () => void; onAssessment: () => void }) { return <Page title="Setări" eyebrow="PERSONALIZEAZĂ EXPERIENȚA" description="Alege cum vrei să arate și să funcționeze spațiul tău de învățare."><div className="settings-list"><label><span><strong>Interfață compactă</strong><small>Mai mult conținut vizibil pe ecran.</small></span><input type="checkbox" checked={compactMode} onChange={(event) => setCompactMode(event.target.checked)} /></label><label><span><strong>Remindere zilnice</strong><small>Primește un reminder pentru sesiunea de azi.</small></span><input type="checkbox" defaultChecked /></label><label><span><strong>Feedback după exerciții</strong><small>Vezi explicația imediat după răspuns.</small></span><input type="checkbox" defaultChecked /></label>{user.role === 'learner' && <button className="text-button settings-action" onClick={onAssessment}>Refă evaluarea inițială</button>}<button className="logout-button" onClick={onLogout}>Deconectare</button></div></Page> }
function Page({ title, eyebrow, description, children }: { title: string; eyebrow: string; description: string; children: React.ReactNode }) { return <section className="page-view reveal"><p className="eyebrow">{eyebrow}</p><h1 className="page-title">{title}</h1><p className="page-description">{description}</p><div className="page-content">{children}</div></section> }
function viewLabel(view: View) { return { overview: 'Overview', plan: 'Planul meu', paths: 'Path-urile mele', library: 'Biblioteca', progress: 'Progres', settings: 'Setări', assessment: 'Evaluare inițială', recommendations: 'Recomandări', speaking: 'Practică orală', trainer: 'Formator', admin: 'Administrare' }[view] }

export default App
