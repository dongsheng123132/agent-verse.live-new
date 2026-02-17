'use client'
import React, { createContext, useContext, useState, useEffect } from 'react'
import { Lang, getLang, setLang as saveLang, t, TKey } from './i18n'

type LangCtx = { lang: Lang; toggle: () => void; t: (key: TKey) => string }

const LangContext = createContext<LangCtx>({ lang: 'en', toggle: () => {}, t: (k) => k })

export function LangProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLang] = useState<Lang>('en')

  useEffect(() => { setLang(getLang()) }, [])

  const toggle = () => {
    const next = lang === 'en' ? 'zh' : 'en'
    setLang(next)
    saveLang(next)
  }

  const tr = (key: TKey) => t(key, lang)

  return <LangContext.Provider value={{ lang, toggle, t: tr }}>{children}</LangContext.Provider>
}

export function useLang() { return useContext(LangContext) }
