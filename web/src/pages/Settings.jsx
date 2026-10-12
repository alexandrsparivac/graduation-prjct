import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { supabase } from '../lib/supabase.js';
import {
  t, tp, getLang, setLang, languageName, domainName, topicName, UI_LANGS,
  loadCatalogTranslations, saveProfileLanguage,
  getPrefs, setPref, resetPrefs, SPEECH_VOICES,
  BUILDER_SECTIONS, BUILDER_PRESETS,
  DASHBOARD_WIDGETS, createDashboardWidgets, buildAccountExport,
} from '../lib/legacy.js';
import { speak, stopSpeaking, toLocale, ttsSupported } from '../lib/speech.js';
import { signOut } from '../lib/auth.js';
import { applyThemePrefs } from '../lib/theme.js';
import { rememberActiveLanguage } from '../lib/lang.js';
import { list, rise, Panel, PanelTitle, BtnSecondary, Msg, useToast } from '../components/ui.jsx';

const THEMES = ['system', 'light', 'dark'];
const RATES = ['slow', 'normal', 'fast'];
const X_SVG = (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg>
);
const SLIDERS_SVG = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3" /><path d="M1 14h6M9 8h6M17 16h6" /></svg>
);

const iconBtnCls =
  'grid h-10 w-10 flex-none place-items-center rounded-[10px] border border-[var(--border)] bg-[var(--bg-container)] text-[var(--text-secondary)] transition-colors hover:text-[var(--text)] hover:border-[var(--text-tertiary)]';
const optCls = (on) =>
  `flex flex-col items-start gap-1 rounded-xl border p-3.5 text-left transition-colors ${
    on ? 'border-[var(--primary)] bg-[var(--fill)]' : 'border-[var(--border)] bg-[var(--bg-container)] hover:border-[var(--text-tertiary)]'
  }`;

function Toggle({ label, hint, checked, onChange }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-4 py-2.5">
      <span className="grid gap-0.5">
        <span className="text-sm font-medium">{label}</span>
        {hint && <span className="text-xs text-[var(--text-tertiary)]">{hint}</span>}
      </span>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="h-5 w-9 accent-[var(--primary)]" />
    </label>
  );
}

function download(name, text) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export default function Settings({ user, initialTab = 'appearance', onSignedOut }) {
  const [tab, setTab] = useState(initialTab);
  const [prefs, setPrefsState] = useState(() => getPrefs());
  const [toast, toastNode] = useToast();
  const [msg, setMsg] = useState('');

  // Study languages
  const [studyLangs, setStudyLangs] = useState(null);
  const [catalog, setCatalog] = useState([]);
  const [managing, setManaging] = useState(null);
  const [armedDel, setArmedDel] = useState(null);

  // Voice preview
  const [preview, setPreview] = useState({ active: false, loading: false, status: '' });

  // Widgets
  const [widgetMgr, setWidgetMgr] = useState(null);
  const [widgetTick, setWidgetTick] = useState(0);
  const [widgetStatus, setWidgetStatus] = useState('');

  // Account deletion
  const [delOpen, setDelOpen] = useState(false);
  const [delEmail, setDelEmail] = useState('');
  const [busy, setBusy] = useState(false);

  const refreshPrefs = () => {
    setPrefsState({ ...getPrefs() });
    applyThemePrefs();
  };
  const setP = (key, value) => {
    setPref(key, value);
    refreshPrefs();
  };

  useEffect(() => {
    applyThemePrefs();
    let alive = true;
    supabase.from('user_languages').select('language_code, level').eq('user_id', user.id).order('created_at')
      .then(({ data, error }) => {
        if (!alive) return;
        if (!error) setStudyLangs(data || []);
      });
    const mgr = createDashboardWidgets({
      sb: supabase,
      user,
      onChange: () => setWidgetTick((x) => x + 1),
      onStatus: (value) => setWidgetStatus(
        value === 'saving' ? t('common.moment')
          : value === 'saved' ? t('common.saved')
            : value === 'error' ? t('dash.widgets.saveFailed') : ''
      ),
    });
    setWidgetMgr(mgr);
    mgr.init();
    return () => { alive = false; stopSpeaking(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.id]);

  const activeStudy = (() => { try { return localStorage.getItem('activeLanguage'); } catch { return null; } })();

  const switchStudy = (code) => {
    rememberActiveLanguage(code);
    setWidgetTick((x) => x + 1);
    toast(t('common.saved'));
  };

  const deleteStudy = async (code) => {
    if ((studyLangs || []).length <= 1) {
      toast(t('set.studyLanguages.lastLanguage'), 'error');
      return;
    }
    if (armedDel !== code) {
      setArmedDel(code);
      toast(t('set.studyLanguages.confirm'));
      setTimeout(() => setArmedDel((a) => (a === code ? null : a)), 4000);
      return;
    }
    setArmedDel(null);
    try {
      const { error } = await supabase.rpc('delete_language', { p_language: code });
      if (error) throw error;
      const rest = (studyLangs || []).filter((l) => l.language_code !== code);
      setStudyLangs(rest);
      if (managing?.code === code) setManaging(null);
      if (activeStudy === code && rest[0]) {
        rememberActiveLanguage(rest[0].language_code);
      }
      toast(t('set.studyLanguages.deleted'));
    } catch (err) {
      toast(t('set.studyLanguages.deleteFailed'), 'error');
    }
  };

  const openManager = async (code) => {
    if (managing?.code === code) {
      setManaging(null);
      return;
    }
    const lang = (studyLangs || []).find((l) => l.language_code === code);
    if (!lang) return;
    try {
      const [udRes, catRes] = await Promise.all([
        supabase.from('user_domains').select('domain_slug, topics').eq('user_id', user.id).eq('language_code', code).order('domain_slug'),
        catalog.length ? { data: catalog } : supabase.from('domains').select('slug, name, topics').order('slug'),
      ]);
      if (udRes.error) throw udRes.error;
      if (catRes.error) throw catRes.error;
      setCatalog(catRes.data || []);
      setManaging({
        code,
        level: lang.level,
        ud: (udRes.data || []).map((d) => ({ domain_slug: d.domain_slug, topics: d.topics || [] })),
      });
    } catch (err) {
      toast(t('set.studyLanguages.deleteFailed'), 'error');
    }
  };

  const switchUiLang = async (code) => {
    if (code === getLang()) return;
    await setLang(code);
    try {
      await saveProfileLanguage(supabase, user.id);
      await loadCatalogTranslations(supabase);
    } catch (err) {
      toast(t('set.language.saveFailed'), 'error');
    }
  };

  const previewVoice = () => {
    if (preview.active) {
      stopSpeaking();
      return;
    }
    setPreview({ active: true, loading: true, status: t('common.moment') });
    speak(t('set.speechVoice.sample'), toLocale(getLang()), {
      onstart: () => setPreview({ active: true, loading: false, status: t('set.speechVoice.playing') }),
      onend: () => setPreview({ active: false, loading: false, status: t('set.speechVoice.finished') }),
      oncancel: () => setPreview({ active: false, loading: false, status: '' }),
      onerror: () => setPreview({ active: false, loading: false, status: t('audio.error') }),
    });
  };

  const saveSections = (sections) => {
    const picked = [...new Set(sections.filter((k) => BUILDER_SECTIONS.some((s) => s.key === k)))];
    if (!picked.length) return;
    setP('lessonSections', picked);
  };

  const doExport = async () => {
    setBusy(true);
    try {
      const payload = await buildAccountExport(supabase, user);
      const stamp = new Date().toISOString().slice(0, 10);
      download(`ld-platform-${stamp}.json`, JSON.stringify(payload, null, 2));
      toast(t('set.data.export.done'));
    } catch (err) {
      toast(t('set.data.export.failed'), 'error');
    } finally {
      setBusy(false);
    }
  };

  const doDelete = async () => {
    if (delEmail.trim().toLowerCase() !== String(user.email || '').toLowerCase()) {
      toast(t('set.data.delete.mismatch'), 'error');
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase.rpc('delete_account');
      if (error) throw error;
      await signOut();
      onSignedOut();
    } catch (err) {
      toast(err.code === 'PGRST202' ? t('set.data.delete.needsSetup') : t('set.data.delete.failed'), 'error');
      setBusy(false);
    }
  };

  const tabs = [
    { id: 'appearance', label: t('set.appearance') },
    { id: 'language', label: t('set.language') },
    { id: 'study', label: t('set.studyLanguages') },
    { id: 'lessons', label: t('set.lessons') },
    { id: 'dashboard', label: t('set.widgets') },
    { id: 'data', label: t('set.data') },
  ];

  const domainLabel = (slug) => {
    const found = catalog.find((d) => d.slug === slug);
    try { return (found && found.name) || slug; } catch { return slug; }
  };

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }} className="grid gap-4">
      {toastNode}
      <div role="tablist" aria-label={t('set.tabs')} className="flex flex-wrap gap-2">
        {tabs.map((tb) => (
          <button
            key={tb.id} role="tab" aria-selected={tab === tb.id}
            onClick={() => setTab(tb.id)}
            className={`rounded-full px-4 py-2 text-sm transition-colors ${
              tab === tb.id ? 'bg-[var(--primary)] font-semibold text-[var(--on-primary)]' : 'border border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--text)]'
            }`}
          >
            {tb.label}
          </button>
        ))}
      </div>

      {tab === 'appearance' && (
        <Panel>
          <PanelTitle>{t('set.appearance')}</PanelTitle>
          <div className="grid gap-2">
            <span className="text-sm font-medium">{t('set.theme')}</span>
            <div className="grid grid-cols-3 gap-2">
              {['system', 'light', 'dark'].map((x) => (
                <button key={x} onClick={() => setP('theme', x)} className={optCls(prefs.theme === x)}>
                  <span className={`block h-7 w-full overflow-hidden rounded-md border border-[var(--border-secondary)] ${x === 'light' ? 'bg-white' : x === 'dark' ? 'bg-[#141414]' : 'bg-gradient-to-r from-white from-50% to-[#141414] to-50%'}`} aria-hidden="true" />
                  <span className="text-sm">{t(`set.theme.${x}`)}</span>
                </button>
              ))}
            </div>
          </div>
        </Panel>
      )}

      {tab === 'language' && (
        <Panel>
          <PanelTitle>{t('set.language')}</PanelTitle>
          <p className="text-sm text-[var(--text-secondary)]">{t('set.language.hint')}</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {(UI_LANGS || []).map((l) => (
              <button key={l.code} onClick={() => switchUiLang(l.code)} lang={l.code} className={optCls(getLang() === l.code)}>
                <span className="text-sm">{l.flag} {l.label}</span>
                {l.country && <span className="text-xs text-[var(--text-secondary)]">{l.country}</span>}
              </button>
            ))}
          </div>
        </Panel>
      )}

      {tab === 'study' && (
        <Panel>
          <PanelTitle>{t('set.studyLanguages')}</PanelTitle>
          <p className="text-sm text-[var(--text-secondary)]">{t('set.studyLanguages.hint')}</p>
          {!studyLangs && <p className="text-sm text-[var(--text-tertiary)]">{t('common.moment')}</p>}
          {studyLangs && studyLangs.length === 0 && <p className="text-sm text-[var(--text-secondary)]">{t('set.studyLanguages.empty')}</p>}
          <div className="grid gap-2">
            {(studyLangs || []).map((l) => {
              const on = l.language_code === activeStudy;
              return (
                <div key={l.language_code} className="flex items-stretch gap-2">
                  <button onClick={() => switchStudy(l.language_code)} className={`${optCls(on)} flex-1`}>
                    <span className="text-sm font-medium">{languageName(l.language_code)} · {l.level}</span>
                  </button>
                  <button onClick={() => openManager(l.language_code)} aria-expanded={managing?.code === l.language_code}
                    aria-label={`${t('set.studyLanguages.manage')}: ${languageName(l.language_code)}`} className={iconBtnCls}>{SLIDERS_SVG}</button>
                  <button onClick={() => deleteStudy(l.language_code)}
                    aria-label={`${t('set.studyLanguages.delete')}: ${languageName(l.language_code)}`}
                    className={`${iconBtnCls} ${armedDel === l.language_code ? '!border-red-500 !bg-red-600 !text-white' : 'hover:!border-[var(--danger-border)] hover:!text-[var(--danger-text)]'}`}>{X_SVG}</button>
                </div>
              );
            })}
          </div>
          {managing && (
            <div className="grid gap-2.5 rounded-xl border border-[var(--border-secondary)] p-3">
              <div className="flex items-center gap-2.5">
                <strong className="text-sm">{languageName(managing.code)} · {managing.level}</strong>
                <span className="flex-1 text-xs text-[var(--text-tertiary)]">{t('set.studyLanguages.domains')}</span>
                <button onClick={() => setManaging(null)} aria-label={t('set.studyLanguages.close')} className={`${iconBtnCls} !h-[30px] !w-[30px]`}>{X_SVG}</button>
              </div>
              {managing.ud.map((d) => {
                const remaining = (catalog.find((c) => c.slug === d.domain_slug)?.topics || []).filter((n) => !(d.topics || []).includes(n));
                return (
                  <div key={d.domain_slug} className="grid gap-2 rounded-[10px] border border-[var(--border-secondary)] p-2.5">
                    <div className="flex items-center justify-between gap-2 text-sm font-semibold">
                      <span>{domainLabel(d.domain_slug)}</span>
                      <button
                        onClick={() => {
                          if (managing.ud.length <= 1) {
                            toast(t('set.studyLanguages.lastDomain'), 'error');
                            return;
                          }
                          mutateDeleteDomain(d.domain_slug);
                        }}
                        aria-label={`${t('set.studyLanguages.delDomain')}: ${domainLabel(d.domain_slug)}`}
                        className={`${iconBtnCls} !h-7 !w-7 hover:!border-red-500 hover:!text-red-400`}>{X_SVG}</button>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {(d.topics || []).map((name) => (
                        <span key={name} className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] py-1 pr-1.5 pl-2.5 text-[13px]">
                          {name}
                          <button
                            onClick={() => {
                              const rest = d.topics.filter((x) => x !== name);
                              if (!rest.length) {
                                if (managing.ud.length <= 1) {
                                  toast(t('set.studyLanguages.lastDomain'), 'error');
                                  return;
                                }
                                mutateManaging((ud) => ud.filter((x) => x.domain_slug !== d.domain_slug));
                              } else {
                                mutateManaging((ud) => ud.map((x) => (x.domain_slug === d.domain_slug ? { ...x, topics: rest } : x)));
                              }
                            }}
                            aria-label={`${t('set.studyLanguages.delTopic')}: ${name}`}
                            className="grid h-5 w-5 place-items-center rounded-full text-[var(--text-tertiary)] hover:bg-[var(--danger-bg)] hover:text-[var(--danger-text)]">{X_SVG}</button>
                        </span>
                      ))}
                    </div>
                    <div className="flex gap-2">
                      <select data-topic-sel={d.domain_slug} defaultValue=""
                        aria-label={t('set.studyLanguages.chooseTopic')}
                        className="min-w-0 flex-1 rounded-[10px] border border-[var(--border)] bg-[var(--bg-container)] px-2.5 py-2 text-sm">
                        <option value="">{t('set.studyLanguages.chooseTopic')}</option>
                        {remaining.map((name) => <option key={name} value={name}>{name}</option>)}
                      </select>
                      <button
                        onClick={(e) => {
                          const sel = e.currentTarget.parentElement.querySelector('[data-topic-sel]');
                          const name = sel?.value;
                          if (!name || d.topics.includes(name)) return;
                          mutateManaging((ud) => ud.map((x) => (x.domain_slug === d.domain_slug ? { ...x, topics: [...x.topics, name] } : x)));
                        }}
                        className="flex-none rounded-[10px] border border-[var(--border)] px-3 py-2 text-sm hover:border-[var(--text-tertiary)]">
                        {t('set.studyLanguages.addTopic')}
                      </button>
                    </div>
                  </div>
                );
              })}
              <div className="flex gap-2">
                <select id="study-new-domain" defaultValue="" aria-label={t('set.studyLanguages.chooseDomain')}
                  className="min-w-0 flex-1 rounded-[10px] border border-[var(--border)] bg-[var(--bg-container)] px-2.5 py-2 text-sm">
                  <option value="">{t('set.studyLanguages.chooseDomain')}</option>
                  {catalog.filter((c) => !managing.ud.some((d) => d.domain_slug === c.slug)).map((c) => (
                    <option key={c.slug} value={c.slug}>{domainLabel(c.slug)}</option>
                  ))}
                </select>
                <button
                  onClick={(e) => {
                    const sel = e.currentTarget.parentElement.querySelector('select');
                    const slug = sel?.value;
                    if (!slug || managing.ud.some((d) => d.domain_slug === slug)) return;
                    const first = (catalog.find((c) => c.slug === slug)?.topics || [])[0];
                    if (!first) return;
                    mutateManaging((ud) => [...ud, { domain_slug: slug, topics: [first] }]);
                  }}
                  className="flex-none rounded-[10px] border border-[var(--border)] px-3 py-2 text-sm hover:border-[var(--text-tertiary)]">
                  {t('set.studyLanguages.addDomain')}
                </button>
              </div>
            </div>
          )}
        </Panel>
      )}

      {tab === 'lessons' && (
        <Panel>
          <PanelTitle>{t('set.lessons')}</PanelTitle>
          <Toggle label={t('set.showTranslations')} hint={t('set.showTranslations.hint')} checked={!!prefs.showTranslations} onChange={(v) => setP('showTranslations', v)} />
          <div className="grid gap-2">
            <span className="grid gap-0.5">
              <span className="text-sm font-medium">{t('set.speechVoice')}</span>
              <span className="text-xs text-[var(--text-tertiary)]">{t('set.speechVoice.hint')}</span>
            </span>
            <div className="grid grid-cols-2 gap-2">
              {['male', 'female'].map((x) => (
                <button key={x} onClick={() => { try { stopSpeaking(); } catch { /* preview already idle */ } setP('speechVoice', x); }} className={optCls(prefs.speechVoice === x)}>
                  <span className="text-sm">{t(`set.speechVoice.${x}`)}</span>
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <BtnSecondary onClick={previewVoice} className="w-auto px-4">
                {preview.loading ? '…' : preview.active ? t('set.speechVoice.stop') : t('set.speechVoice.preview')}
              </BtnSecondary>
              {preview.status && <span className="text-xs text-[var(--text-secondary)]">{preview.status}</span>}
            </div>
          </div>
          <div className="grid gap-2">
            <span className="grid gap-0.5">
              <span className="text-sm font-medium">{t('set.speechRate')}</span>
              <span className="text-xs text-[var(--text-tertiary)]">{t('set.speechRate.hint')}</span>
            </span>
            <div className="grid grid-cols-3 gap-2">
              {RATES.map((x) => (
                <button key={x} onClick={() => { try { stopSpeaking(); } catch { /* preview already idle */ } setP('speechRate', x); }} className={optCls(prefs.speechRate === x)}>
                  <span className="text-sm">{t(`set.speechRate.${x}`)}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="grid gap-2">
            <span className="text-sm font-medium">{t('set.lessonContent')}</span>
            <span className="text-xs text-[var(--text-tertiary)]">{t('set.lessonContent.hint')}</span>
            <div className="flex flex-wrap gap-2">
              {BUILDER_PRESETS.map((preset) => (
                <button key={preset.id} onClick={() => saveSections(preset.sections)}
                  className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm hover:border-[var(--text-tertiary)]">
                  {t(`les.builder.preset.${preset.id}`)}
                </button>
              ))}
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {BUILDER_SECTIONS.map((section) => {
                const on = prefs.lessonSections.includes(section.key);
                return (
                  <button
                    key={section.key}
                    onClick={() => {
                      const picked = on
                        ? prefs.lessonSections.filter((k) => k !== section.key)
                        : [...prefs.lessonSections, section.key];
                      if (picked.length) saveSections(picked);
                    }}
                    aria-pressed={on}
                    className={`flex items-center justify-between gap-3 rounded-xl border px-3.5 py-2.5 text-sm transition-colors ${
                      on
                        ? 'border-[var(--border)] bg-[var(--bg-container)]'
                        : 'border-[var(--border-secondary)] opacity-60 hover:opacity-100'
                    }`}
                  >
                    <span className={on ? 'font-medium' : ''}>{t(section.tab)}</span>
                    <span
                      aria-hidden="true"
                      className={`flex h-5 w-9 flex-none items-center rounded-full px-0.5 transition-colors ${
                        on ? 'justify-end bg-[var(--primary)]' : 'justify-start bg-[var(--fill-strong)]'
                      }`}
                    >
                      <span className="h-4 w-4 rounded-full bg-white shadow" />
                    </span>
                  </button>
                );
              })}
            </div>
            <span className="text-xs text-[var(--text-secondary)]">{t('les.builder.selected', { n: prefs.lessonSections.length })}</span>
          </div>
        </Panel>
      )}

      {tab === 'dashboard' && (
        <Panel>
          <PanelTitle>{t('set.widgets')}</PanelTitle>
          <p className="text-sm text-[var(--text-secondary)]">{t('dash.widgets.hint')}</p>
          <div>
            <button
              onClick={() => { widgetMgr?.resetOrder().then((ok) => { if (ok) toast(t('common.saved')); }); }}
              className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm hover:border-[var(--text-tertiary)]"
            >
              {t('set.widgets.align')}
            </button>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {widgetMgr && DASHBOARD_WIDGETS.map((w) => {
              const on = widgetMgr.isVisible(w.id);
              return (
                <button
                  key={w.id}
                  onClick={() => widgetMgr.setVisible(w.id, !on)}
                  aria-pressed={on}
                  className={`flex items-center justify-between gap-3 rounded-xl border px-3.5 py-2.5 text-sm transition-colors ${
                    on
                      ? 'border-[var(--border)] bg-[var(--bg-container)]'
                      : 'border-[var(--border-secondary)] opacity-60 hover:opacity-100'
                  }`}
                >
                  <span className={on ? 'font-medium' : ''}>{t(w.label, { level: '' }).replace(/\s+$/, '')}</span>
                  <span
                    aria-hidden="true"
                    className={`flex h-5 w-9 flex-none items-center rounded-full px-0.5 transition-colors ${
                      on ? 'justify-end bg-[var(--primary)]' : 'justify-start bg-[var(--fill-strong)]'
                    }`}
                  >
                    <span className="h-4 w-4 rounded-full bg-white shadow" />
                  </span>
                </button>
              );
            })}
          </div>
          {widgetStatus && <span className="text-xs text-[var(--text-secondary)]">{widgetStatus}</span>}
        </Panel>
      )}

      {tab === 'data' && (
        <Panel>
          <PanelTitle>{t('set.data')}</PanelTitle>
          <div className="flex items-center justify-between gap-4 py-1">
            <span className="grid gap-0.5">
              <span className="text-sm font-medium">{t('set.data.export')}</span>
              <span className="text-xs text-[var(--text-tertiary)]">{t('set.data.export.hint')}</span>
            </span>
            <BtnSecondary onClick={doExport} className="w-auto flex-none px-4">{busy ? '…' : t('set.data.export.btn')}</BtnSecondary>
          </div>
          <div className="flex items-center justify-between gap-4 py-1">
            <span className="grid gap-0.5">
              <span className="text-sm font-medium">{t('set.data.delete')}</span>
              <span className="text-xs text-[var(--text-tertiary)]">{t('set.data.delete.hint')}</span>
            </span>
            <BtnSecondary onClick={() => setDelOpen(!delOpen)} className="w-auto flex-none px-4 !border-[var(--danger-border)] !text-[var(--danger-text)]">{t('set.data.delete.btn')}</BtnSecondary>
          </div>
          {delOpen && (
            <div className="grid gap-2.5 rounded-xl border border-[var(--danger-border)] bg-[var(--danger-bg)] p-3.5">
              <p className="text-sm">{t('set.data.delete.body')}</p>
              <label className="grid gap-1.5 text-sm">
                <span>{t('set.data.delete.typeEmail', { email: user.email || '' })}</span>
                <input type="email" value={delEmail} onChange={(e) => setDelEmail(e.target.value)} placeholder={user.email || ''} autoComplete="off" spellCheck="false"
                  className="rounded-lg border border-[var(--border)] bg-[var(--bg-container)] px-3 py-2 text-sm outline-none placeholder:text-[var(--text-tertiary)]" />
              </label>
              <div className="flex gap-2">
                <BtnSecondary onClick={() => { setDelOpen(false); setDelEmail(''); }} className="w-auto flex-none px-4">{t('set.data.delete.cancel')}</BtnSecondary>
                <button onClick={doDelete} disabled={busy} className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-500 disabled:opacity-50">
                  {t('set.data.delete.go')}
                </button>
              </div>
            </div>
          )}
          <div className="flex items-center justify-between gap-4 border-t border-[var(--border-secondary)] pt-3">
            <span className="text-sm font-medium">{t('set.reset')}</span>
            <BtnSecondary
              onClick={() => { stopSpeaking(); resetPrefs(); setPrefsState({ ...getPrefs() }); applyThemePrefs(); toast(t('set.resetDone')); }}
              className="w-auto flex-none px-4">
              {t('set.reset')}
            </BtnSecondary>
          </div>
        </Panel>
      )}
      <Msg text={msg} />
    </motion.div>
  );

  const persistUd = async (m, ud) => {
    const { error } = await supabase.rpc('save_onboarding', {
      p_language: m.code,
      p_level: m.level,
      p_domains: ud.map((d) => ({ domain_slug: d.domain_slug, topics: d.topics || [] })),
    });
    if (error) throw error;
    toast(t('common.saved'));
  };

  function mutateManaging(fn) {
    setManaging((m) => {
      if (!m) return m;
      const ud = m.ud.map((d) => ({ domain_slug: d.domain_slug, topics: [...(d.topics || [])] }));
      fn(ud);
      persistUd(m, ud)
        .then(() => setManaging((cur) => (cur && cur.code === m.code ? { ...cur, ud } : cur)))
        .catch(() => toast(t('set.studyLanguages.deleteFailed'), 'error'));
      return { ...m, ud };
    });
  }

  function mutateDeleteDomain(slug) {
    setManaging((m) => {
      if (!m || m.ud.length <= 1) return m;
      const ud = m.ud.filter((d) => d.domain_slug !== slug);
      persistUd(m, ud)
        .then(() => setManaging((cur) => (cur && cur.code === m.code ? { ...cur, ud } : cur)))
        .catch(() => toast(t('set.studyLanguages.deleteFailed'), 'error'));
      return { ...m, ud };
    });
  }
}
