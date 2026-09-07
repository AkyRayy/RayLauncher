import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useI18n } from '@renderer/i18n'
import { cn } from '@renderer/lib/cn'
import { listSpring } from '@renderer/lib/motion'
import { Page } from '@renderer/components/chrome/Page'
import { Card } from '@renderer/components/ui/Card'
import { Button } from '@renderer/components/ui/Button'
import { EmptyState } from '@renderer/components/ui/EmptyState'
import { Skeleton } from '@renderer/components/ui/Skeleton'
import { Select, TextInput } from '@renderer/components/ui/Field'
import { SegmentedControl } from '@renderer/components/ui/SegmentedControl'
import { CatalogIcon, CheckIcon, PackageIcon, ProfilesIcon, SearchIcon, WarningIcon } from '@renderer/components/icons'
import { ModVersionSheet } from '@renderer/features/ModVersionSheet'
import { useModsStore, type SortId } from '@renderer/stores/mods.store'
import { useProfilesStore } from '@renderer/stores/profiles.store'
import { useSettingsStore } from '@renderer/stores/settings.store'
import type { ContentKind, ModSearchHit, Profile } from '@shared/types'

export function ModsCatalogPage(): React.ReactElement {
  const t = useI18n()
  const profiles = useProfilesStore((state) => state.profiles)
  const hydrate = useProfilesStore((state) => state.hydrate)
  const activeId = useSettingsStore((state) => state.settings.activeProfileId)
  const curseforgeEnabled = useSettingsStore((state) => state.settings.curseforgeEnabled)

  const source = useModsStore((state) => state.source)
  const query = useModsStore((state) => state.query)
  const sort = useModsStore((state) => state.sort)
  const kind = useModsStore((state) => state.kind)
  const hits = useModsStore((state) => state.hits)
  const total = useModsStore((state) => state.total)
  const searching = useModsStore((state) => state.searching)
  const loadingMore = useModsStore((state) => state.loadingMore)
  const searchError = useModsStore((state) => state.searchError)
  const setSource = useModsStore((state) => state.setSource)
  const setQuery = useModsStore((state) => state.setQuery)
  const setSort = useModsStore((state) => state.setSort)
  const setKind = useModsStore((state) => state.setKind)
  const search = useModsStore((state) => state.search)
  const loadMore = useModsStore((state) => state.loadMore)

  const navigate = useNavigate()
  const [profileId, setProfileId] = useState(activeId)
  const [opened, setOpened] = useState<ModSearchHit | null>(null)

  useEffect(() => {
    void hydrate()
  }, [hydrate])

  const moddable = useMemo(
    () =>
      kind === 'mod'
        ? profiles.filter((profile) => profile.loader.kind !== 'vanilla')
        : profiles,
    [profiles, kind]
  )

  const profile: Profile | null = useMemo(() => {
    const chosen = moddable.find((item) => item.id === profileId)
    return chosen ?? moddable[0] ?? null
  }, [moddable, profileId])

  useEffect(() => {
    if (!profile) return
    void search(profile.id)
  }, [profile, search, source, sort, kind])

  if (profiles.length > 0 && moddable.length === 0) {
    return (
      <Page title={t.mods.title} subtitle={t.mods.subtitle}>
        <EmptyState
          icon={<ProfilesIcon size={26} />}
          title={t.mods.vanillaTitle}
          body={t.mods.vanillaBody}
          action={
            <Button variant="secondary" onClick={() => navigate('/profiles')}>
              {t.nav.profiles}
            </Button>
          }
        />
      </Page>
    )
  }

  if (!profile) {
    return (
      <Page title={t.mods.title} subtitle={t.mods.subtitle}>
        <EmptyState
          icon={<ProfilesIcon size={26} />}
          title={t.mods.noProfileTitle}
          body={t.mods.noProfileBody}
        />
      </Page>
    )
  }

  return (
    <Page
      title={t.mods.title}
      subtitle={t.mods.forProfile(profile.name)}
      actions={
        moddable.length > 1 ? (
          <Select
            aria-label={t.nav.profiles}
            value={profile.id}
            onChange={(event) => setProfileId(event.target.value)}
          >
            {moddable.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </Select>
        ) : undefined
      }
    >
      <div className="mx-auto max-w-4xl">
        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={(event) => {
            event.preventDefault()
            void search(profile.id)
          }}
        >
          <label className="relative min-w-56 flex-1">
            <SearchIcon
              size={15}
              className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-faint"
            />
            <TextInput
              className="h-[30px] w-full pl-7"
              placeholder={t.mods.searchPlaceholder}
              aria-label={t.mods.searchPlaceholder}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>

          <Select
            aria-label={t.mods.sortRelevance}
            value={sort}
            onChange={(event) => setSort(event.target.value as SortId)}
          >
            <option value="relevance">{t.mods.sortRelevance}</option>
            <option value="downloads">{t.mods.sortDownloads}</option>
            <option value="follows">{t.mods.sortFollows}</option>
            <option value="newest">{t.mods.sortNewest}</option>
            <option value="updated">{t.mods.sortUpdated}</option>
          </Select>

          {curseforgeEnabled && (
            <SegmentedControl
              ariaLabel={t.mods.sourceModrinth}
              value={source === 'curseforge' ? 'curseforge' : 'modrinth'}
              onChange={(value) => setSource(value)}
              options={[
                { value: 'modrinth', label: t.mods.sourceModrinth },
                { value: 'curseforge', label: t.mods.sourceCurseforge }
              ]}
            />
          )}

          <SegmentedControl
            ariaLabel={t.mods.kindMod}
            value={kind}
            onChange={(value: ContentKind) => setKind(value)}
            options={[
              { value: 'mod', label: t.mods.kindMod },
              { value: 'resourcepack', label: t.mods.kindResourcepack },
              { value: 'shader', label: t.mods.kindShader }
            ]}
          />

          <Button type="submit" variant="primary" disabled={searching}>
            {searching ? t.mods.checking : t.mods.search}
          </Button>
        </form>

        {searchError && (
          <div role="alert" className="mt-4 flex items-start gap-2.5 rounded-md bg-surface px-4 py-3 shadow-soft">
            <WarningIcon size={16} className="mt-0.5 shrink-0 text-warning" />
            <p className="min-w-0 flex-1 text-sm text-ink">{searchError.message}</p>
          </div>
        )}

        <section className="mt-5">
          {searching && hits.length === 0 && (
            <ul className="space-y-2">
              {[0, 1, 2, 3, 4].map((index) => (
                <li key={index}>
                  <Skeleton className="h-20 rounded-lg" />
                </li>
              ))}
            </ul>
          )}

          {!searching && hits.length === 0 && !searchError && (
            <EmptyState icon={<CatalogIcon size={26} />} title={t.mods.emptyTitle} body={t.mods.emptyBody} />
          )}

          {hits.length > 0 && (
            <>
              <ul className="space-y-2">
                {hits.map((hit) => (
                  <ModHitCard key={`${hit.source}-${hit.projectId}`} hit={hit} onOpen={() => setOpened(hit)} />
                ))}
              </ul>

              <footer className="mt-5 flex items-center justify-between">
                <span className="text-xs text-faint">{t.mods.total(hits.length, total)}</span>
                {hits.length < total && (
                  <Button size="sm" disabled={loadingMore} onClick={() => void loadMore(profile.id)}>
                    {loadingMore ? t.common.loading : t.mods.loadMore}
                  </Button>
                )}
              </footer>
            </>
          )}
        </section>
      </div>

      {opened && (
        <ModVersionSheet
          profile={profile}
          projectId={opened.projectId}
          source={opened.source}
          kind={kind}
          title={opened.title}
          onClose={() => setOpened(null)}
        />
      )}
    </Page>
  )
}

function ModHitCard({ hit, onOpen }: { hit: ModSearchHit; onOpen: () => void }): React.ReactElement {
  const t = useI18n()
  const language = useSettingsStore((state) => state.settings.language)
  const busyId = useModsStore((state) => state.busyId)
  const busy = busyId === hit.projectId

  return (
    <motion.li layout initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={listSpring}>
      <Card className="flex items-center gap-4 p-4">
        <ModIcon url={hit.iconUrl} title={hit.title} />

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate text-sm font-semibold text-ink">{hit.title}</h3>
            {hit.installed && (
              <span className="inline-flex items-center gap-1 rounded-sm bg-success/12 px-1.5 py-0.5 text-[11px] font-medium text-success">
                <CheckIcon size={11} />
                {t.mods.installed}
              </span>
            )}
          </div>
          <p className="mt-1 line-clamp-2 text-sm text-muted">{hit.description}</p>
          <p className="mt-1.5 text-xs text-faint">{t.mods.downloads(formatCount(hit.downloads, language))}</p>
        </div>

        <Button size="sm" variant={hit.installed ? 'secondary' : 'primary'} disabled={busy} onClick={onOpen}>
          {busy ? t.mods.installing : hit.installed ? t.common.ok : t.mods.install}
        </Button>
      </Card>
    </motion.li>
  )
}

function ModIcon({ url, title }: { url?: string; title: string }): React.ReactElement {
  if (!url) {
    return (
      <div className="grid h-12 w-12 shrink-0 place-items-center rounded-md bg-fill text-faint">
        <PackageIcon size={20} />
      </div>
    )
  }
  return (
    <img
      src={url}
      alt=""
      width={48}
      height={48}
      loading="lazy"
      className={cn('h-12 w-12 shrink-0 rounded-md bg-fill object-cover')}
      title={title}
    />
  )
}

function formatCount(value: number, language: 'ru' | 'en'): string {
  return new Intl.NumberFormat(language, { notation: 'compact', maximumFractionDigits: 1 }).format(value)
}
