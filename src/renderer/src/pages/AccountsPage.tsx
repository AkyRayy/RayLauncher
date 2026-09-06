import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useI18n } from '@renderer/i18n'
import { Page } from '@renderer/components/chrome/Page'
import { Card, ListGroup } from '@renderer/components/ui/Card'
import { Button } from '@renderer/components/ui/Button'
import { SegmentedControl } from '@renderer/components/ui/SegmentedControl'
import { TextInput } from '@renderer/components/ui/Field'
import { AccountIcon, CheckIcon, WarningIcon } from '@renderer/components/icons'
import { useAccountsStore } from '@renderer/stores/accounts.store'
import { api } from '@renderer/lib/api'
import { cn } from '@renderer/lib/cn'
import { listSpring } from '@renderer/lib/motion'
import { uuidWithDashes } from '@shared/util'
import type { PublicAccount } from '@shared/types'

type AddMode = 'microsoft' | 'guest' | 'yggdrasil'

const SkinViewer3D = lazy(async () => ({
  default: (await import('@renderer/components/skin/SkinViewer3D')).SkinViewer3D
}))

export function AccountsPage(): React.ReactElement {
  const t = useI18n()
  const accounts = useAccountsStore((state) => state.accounts)
  const activeId = useAccountsStore((state) => state.activeId)
  const ready = useAccountsStore((state) => state.ready)
  const busy = useAccountsStore((state) => state.busy)
  const error = useAccountsStore((state) => state.error)
  const pending = useAccountsStore((state) => state.pending)
  const skins = useAccountsStore((state) => state.skins)
  const hydrate = useAccountsStore((state) => state.hydrate)
  const setActive = useAccountsStore((state) => state.setActive)
  const remove = useAccountsStore((state) => state.remove)
  const refresh = useAccountsStore((state) => state.refresh)
  const loadSkin = useAccountsStore((state) => state.loadSkin)
  const importSkin = useAccountsStore((state) => state.importSkin)
  const clearError = useAccountsStore((state) => state.clearError)

  const [selectedId, setSelectedId] = useState<string | null>(null)

  useEffect(() => {
    void hydrate()
  }, [hydrate])

  const selected = useMemo(
    () => accounts.find((item) => item.id === (selectedId ?? activeId)) ?? accounts[0] ?? null,
    [accounts, selectedId, activeId]
  )

  useEffect(() => {
    if (selected) void loadSkin(selected.id)
  }, [selected, loadSkin])

  return (
    <Page title={t.accounts.title} subtitle={t.accounts.subtitle}>
      {error && (
        <div
          role="alert"
          className="mx-auto mb-4 flex max-w-5xl items-start gap-2.5 rounded-md bg-surface px-4 py-3 shadow-soft"
        >
          <WarningIcon size={16} className="mt-0.5 shrink-0 text-warning" />
          <p className="min-w-0 flex-1 text-sm text-ink">{error.message}</p>
          <Button size="sm" variant="ghost" onClick={clearError}>
            {t.accounts.cancel}
          </Button>
        </div>
      )}

      <div className="mx-auto grid max-w-5xl gap-6 lg:grid-cols-[minmax(0,1fr)_280px]">
        <div className="min-w-0 space-y-6">
          {accounts.length === 0 && ready ? (
            <Card className="px-6 py-8 text-center">
              <AccountIcon size={26} className="mx-auto mb-3 text-faint" />
              <h2 className="text-base font-semibold text-ink">{t.accounts.emptyTitle}</h2>
              <p className="mx-auto mt-1 max-w-sm text-sm text-muted">{t.accounts.emptyBody}</p>
            </Card>
          ) : (
            <ListGroup title={t.accounts.listTitle}>
              {accounts.map((account) => (
                <AccountRow
                  key={account.id}
                  account={account}
                  skinUrl={skins[account.id] ?? null}
                  active={account.id === activeId}
                  selected={account.id === selected?.id}
                  onSelect={() => setSelectedId(account.id)}
                  onActivate={() => void setActive(account.id)}
                  onRemove={() => void remove(account.id)}
                />
              ))}
            </ListGroup>
          )}

          <AddAccountSection />
        </div>

        <aside className="lg:sticky lg:top-0 lg:self-start">
          {selected ? (
            <SkinPanel
              key={selected.id}
              account={selected}
              skinUrl={skins[selected.id] ?? null}
              busy={busy}
              onImport={(variant) => void importSkin(selected.id, variant)}
              onRefresh={() => void refresh(selected.id)}
            />
          ) : (
            <Card className="grid h-[380px] place-items-center px-6 text-center">
              <p className="text-sm text-muted">{t.accounts.emptyTitle}</p>
            </Card>
          )}
        </aside>
      </div>

      <AnimatePresence>{pending && <ProfileChooser />}</AnimatePresence>
    </Page>
  )
}

function AccountRow({
  account,
  skinUrl,
  active,
  selected,
  onSelect,
  onActivate,
  onRemove
}: {
  account: PublicAccount
  skinUrl: string | null
  active: boolean
  selected: boolean
  onSelect: () => void
  onActivate: () => void
  onRemove: () => void
}): React.ReactElement {
  const t = useI18n()

  const kindLabel =
    account.kind === 'microsoft'
      ? t.accounts.kindMicrosoft
      : account.kind === 'guest'
        ? t.accounts.kindGuest
        : (account.yggdrasil?.serverName ?? t.accounts.kindYggdrasil)

  return (
    <div
      className={cn(
        'flex items-center gap-3 px-4 py-2.5 transition-colors duration-100',
        selected ? 'bg-fill/60' : 'hover:bg-fill/40'
      )}
    >
      <button
        type="button"
        onClick={onSelect}
        className="no-drag flex min-w-0 flex-1 items-center gap-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 rounded-sm"
      >
        <SkinHead skinUrl={skinUrl} />
        <span className="min-w-0">
          <span className="flex items-center gap-1.5">
            <span className="truncate text-sm font-medium text-ink">{account.username}</span>
            {active && <CheckIcon size={13} className="shrink-0 text-accent" />}
          </span>
          <span className="mt-0.5 flex items-center gap-1.5 text-xs text-muted">
            {kindLabel}
            {account.expired && <span className="text-warning">· {t.accounts.expired}</span>}
          </span>
        </span>
      </button>

      {!active && (
        <Button size="sm" variant="secondary" onClick={onActivate}>
          {t.accounts.makeActive}
        </Button>
      )}
      <Button size="sm" variant="ghost" onClick={onRemove}>
        {t.accounts.signOut}
      </Button>
    </div>
  )
}

function SkinHead({ skinUrl }: { skinUrl: string | null }): React.ReactElement {
  if (!skinUrl) {
    return <span className="grid size-8 shrink-0 place-items-center rounded-sm bg-fill text-faint">
      <AccountIcon size={15} />
    </span>
  }

  const layer = {
    backgroundImage: `url(${skinUrl})`,
    backgroundSize: '800% 800%',
    imageRendering: 'pixelated' as const
  }

  return (
    <span className="relative size-8 shrink-0 overflow-hidden rounded-sm bg-fill">
      <span className="absolute inset-0" style={{ ...layer, backgroundPosition: '-100% -100%' }} />
      <span className="absolute inset-0" style={{ ...layer, backgroundPosition: '-500% -100%' }} />
    </span>
  )
}

function SkinPanel({
  account,
  skinUrl,
  busy,
  onImport,
  onRefresh
}: {
  account: PublicAccount
  skinUrl: string | null
  busy: string | null
  onImport: (variant: 'classic' | 'slim') => void
  onRefresh: () => void
}): React.ReactElement {
  const t = useI18n()
  const [hovering, setHovering] = useState(false)
  const [variant, setVariant] = useState<'classic' | 'slim'>(account.skin?.variant ?? 'classic')

  return (
    <Card className="overflow-hidden">
      <div
        className="grid place-items-center bg-fill/40 py-4"
        onMouseEnter={() => setHovering(true)}
        onMouseLeave={() => setHovering(false)}
      >
        <Suspense
          fallback={<div className="h-[300px] w-[220px] animate-pulse rounded-md bg-fill" aria-hidden />}
        >
          <SkinViewer3D skinUrl={skinUrl} variant={variant} walking={hovering} width={220} height={300} />
        </Suspense>
      </div>

      <div className="space-y-3 px-4 py-4">
        <div>
          <h2 className="text-sm font-semibold text-ink">{account.username}</h2>
          <p className="mt-0.5 select-text font-mono text-[11px] text-faint">
            {uuidWithDashes(account.uuid)}
          </p>
        </div>

        <SegmentedControl
          value={variant}
          size="sm"
          ariaLabel={t.accounts.skinModel}
          options={[
            { value: 'classic', label: t.accounts.skinClassic },
            { value: 'slim', label: t.accounts.skinSlim }
          ]}
          onChange={setVariant}
        />

        <div className="space-y-1.5">
          <Button size="sm" full onClick={() => onImport(variant)} disabled={busy === 'skin'}>
            {t.accounts.skinChange}
          </Button>
          <p className="text-center text-[11px] text-faint">{t.accounts.skinHint}</p>
        </div>

        {account.kind !== 'guest' && (
          <Button size="sm" variant="ghost" full onClick={onRefresh} disabled={busy === 'refresh'}>
            {busy === 'refresh' ? t.accounts.refreshing : t.accounts.refresh}
          </Button>
        )}
      </div>
    </Card>
  )
}

function AddAccountSection(): React.ReactElement {
  const t = useI18n()
  const [mode, setMode] = useState<AddMode>('microsoft')
  const busy = useAccountsStore((state) => state.busy)
  const signInMicrosoft = useAccountsStore((state) => state.signInMicrosoft)
  const cancelSignIn = useAccountsStore((state) => state.cancelSignIn)
  const addGuest = useAccountsStore((state) => state.addGuest)
  const signInYggdrasil = useAccountsStore((state) => state.signInYggdrasil)

  const [nickname, setNickname] = useState('')
  const [remembered, setRemembered] = useState<string[]>([])
  const [apiRoot, setApiRoot] = useState('')
  const [login, setLogin] = useState('')
  const [password, setPassword] = useState('')

  useEffect(() => {
    void api.accounts.guestNicknames().then(setRemembered)
  }, [])

  const nicknameValid = /^[A-Za-z0-9_]{3,16}$/.test(nickname)

  return (
    <section>
      <h2 className="mb-1.5 px-3 text-xs font-semibold uppercase tracking-[0.04em] text-faint">
        {t.accounts.addTitle}
      </h2>

      <Card className="p-4">
        <SegmentedControl
          value={mode}
          ariaLabel={t.accounts.addTitle}
          options={[
            { value: 'microsoft', label: t.accounts.kindMicrosoft },
            { value: 'guest', label: t.accounts.kindGuest },
            { value: 'yggdrasil', label: t.accounts.kindYggdrasil }
          ]}
          onChange={setMode}
        />

        <div className="mt-4">
          {mode === 'microsoft' && (
            <div className="space-y-3">
              <p className="max-w-lg text-sm text-muted">{t.accounts.microsoftBody}</p>
              {busy === 'microsoft' ? (
                <div className="flex items-center gap-3">
                  <span className="text-sm text-ink">{t.accounts.microsoftWaiting}</span>
                  <Button size="sm" variant="ghost" onClick={() => void cancelSignIn()}>
                    {t.accounts.cancelSignIn}
                  </Button>
                </div>
              ) : (
                <Button variant="primary" onClick={() => void signInMicrosoft()}>
                  {t.accounts.microsoftAction}
                </Button>
              )}
            </div>
          )}

          {mode === 'guest' && (
            <form
              className="space-y-3"
              onSubmit={(event) => {
                event.preventDefault()
                if (nicknameValid) void addGuest(nickname)
              }}
            >
              <p className="max-w-lg text-sm text-muted">{t.accounts.guestBody}</p>
              <label className="flex items-center gap-3 text-sm text-ink">
                <span className="w-28 shrink-0">{t.accounts.guestNickname}</span>
                <TextInput
                  value={nickname}
                  list="ray-guest-nicknames"
                  onChange={(event) => setNickname(event.target.value)}
                  placeholder="Player"
                  className="w-56"
                  autoComplete="off"
                  spellCheck={false}
                />
              </label>
              <datalist id="ray-guest-nicknames">
                {remembered.map((item) => (
                  <option key={item} value={item} />
                ))}
              </datalist>
              <p className="text-xs text-faint">{t.accounts.guestHint}</p>
              <Button type="submit" disabled={!nicknameValid || busy === 'guest'}>
                {t.accounts.guestAction}
              </Button>
            </form>
          )}

          {mode === 'yggdrasil' && (
            <form
              className="space-y-3"
              onSubmit={(event) => {
                event.preventDefault()
                void signInYggdrasil({ apiRoot, username: login, password })
                setPassword('')
              }}
            >
              <p className="max-w-lg text-sm text-muted">{t.accounts.yggdrasilBody}</p>
              <label className="flex items-center gap-3 text-sm text-ink">
                <span className="w-28 shrink-0">{t.accounts.yggdrasilRoot}</span>
                <TextInput
                  value={apiRoot}
                  onChange={(event) => setApiRoot(event.target.value)}
                  placeholder="https://authserver.ely.by"
                  className="w-80"
                  spellCheck={false}
                />
              </label>
              <label className="flex items-center gap-3 text-sm text-ink">
                <span className="w-28 shrink-0">{t.accounts.yggdrasilLogin}</span>
                <TextInput
                  value={login}
                  onChange={(event) => setLogin(event.target.value)}
                  className="w-80"
                  autoComplete="username"
                  spellCheck={false}
                />
              </label>
              <label className="flex items-center gap-3 text-sm text-ink">
                <span className="w-28 shrink-0">{t.accounts.yggdrasilPassword}</span>
                <TextInput
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="w-80"
                  autoComplete="current-password"
                />
              </label>
              <Button
                type="submit"
                disabled={busy === 'yggdrasil' || apiRoot.length === 0 || login.length === 0}
              >
                {t.accounts.yggdrasilAction}
              </Button>
            </form>
          )}
        </div>
      </Card>
    </section>
  )
}

function ProfileChooser(): React.ReactElement {
  const t = useI18n()
  const pending = useAccountsStore((state) => state.pending)
  const choose = useAccountsStore((state) => state.chooseProfile)
  const dismiss = useAccountsStore((state) => state.dismissPending)

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-40 grid place-items-center bg-black/25 px-6"
      role="presentation"
      onClick={dismiss}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.97, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.98 }}
        transition={listSpring}
        role="dialog"
        aria-modal="true"
        aria-label={t.accounts.chooseProfile}
        className="material-pop w-full max-w-sm rounded-lg p-5"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 className="text-base font-semibold text-ink">{t.accounts.chooseProfile}</h2>
        <p className="mt-1 text-sm text-muted">{t.accounts.chooseProfileBody}</p>

        <ul className="mt-4 space-y-1">
          {pending?.profiles.map((profile) => (
            <li key={profile.id}>
              <button
                type="button"
                onClick={() => void choose(profile.id)}
                className="flex w-full items-center justify-between rounded-sm px-3 py-2 text-left text-sm text-ink transition-colors duration-100 hover:bg-fill focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
              >
                {profile.name}
                <span className="font-mono text-[11px] text-faint">{profile.id.slice(0, 8)}</span>
              </button>
            </li>
          ))}
        </ul>

        <div className="mt-4 flex justify-end">
          <Button size="sm" variant="ghost" onClick={dismiss}>
            {t.accounts.cancel}
          </Button>
        </div>
      </motion.div>
    </motion.div>
  )
}
