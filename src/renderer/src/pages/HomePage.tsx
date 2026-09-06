import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { api } from '@renderer/lib/api'
import { pageTransition, pageVariants } from '@renderer/lib/motion'
import { HeroCard } from '@renderer/components/home/HeroCard'
import { InstallationsCard } from '@renderer/components/home/InstallationsCard'
import { NewsCard } from '@renderer/components/home/NewsCard'
import { StatusCards } from '@renderer/components/home/StatusCards'
import type { AppInfo, JavaRuntimeInfo, NewsItem } from '@shared/types'

export function HomePage(): React.ReactElement {
  const [info, setInfo] = useState<AppInfo | null>(null)
  const [runtimes, setRuntimes] = useState<JavaRuntimeInfo[] | null>(null)
  const [news, setNews] = useState<NewsItem[] | null>(null)

  useEffect(() => {
    let alive = true
    void api.app.info().then((result) => {
      if (alive) setInfo(result)
    })
    void api.java.list().then((result) => {
      if (alive) setRuntimes(result)
    })
    void api.news
      .list()
      .then((feed) => {
        if (alive) setNews(feed.items)
      })
      .catch(() => {
        if (alive) setNews([])
      })
    return () => {
      alive = false
    }
  }, [])

  return (
    <motion.main
      variants={pageVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      transition={pageTransition}
      className="min-h-0 flex-1 overflow-y-auto px-8 pb-10 pt-6"
    >
      <div className="mx-auto flex max-w-5xl flex-col gap-4">
        <HeroCard news={news ?? []} />

        <div className="grid gap-4 grid-cols-[repeat(auto-fit,minmax(320px,1fr))]">
          <InstallationsCard />
          <NewsCard items={news ?? []} loading={news === null} />
        </div>

        <StatusCards info={info} runtimes={runtimes} />
      </div>
    </motion.main>
  )
}
