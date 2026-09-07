import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { useI18n } from '@renderer/i18n'
import { listSpring } from '@renderer/lib/motion'
import { Page } from '@renderer/components/chrome/Page'
import { Card } from '@renderer/components/ui/Card'
import { Button } from '@renderer/components/ui/Button'
import { EmptyState } from '@renderer/components/ui/EmptyState'
import { Select, TextInput } from '@renderer/components/ui/Field'
import { PlayIcon, PlusIcon, ProfilesIcon, RefreshIcon, TrashIcon, WarningIcon } from '@renderer/components/icons'
import { useServersStore } from '@renderer/stores/servers.store'
import { useProfilesStore } from '@renderer/stores/profiles.store'
import { useSettingsStore } from '@renderer/stores/settings.store'
import type { GameServer, ServerStatus } from '@shared/types'

export function ServersPage(): React.ReactElement {
  const t = useI18n()
  const servers = useServersStore((state) => state.servers)
  const statuses = useServersStore((state) => state.statuses)
  const busy = useServersStore((state) => state.busy)
  const error = useServersStore((state) => state.error)
  const hydrate = useServersStore((state) => state.hydrate)
  const pingAll = useServersStore((state) => state.pingAll)
  const clearError = useServersStore((state) => state.clearError)

  const profiles = useProfilesStore((state) => state.profiles)
  const hydrateProfiles = useProfilesStore((state) => state.hydrate)
  const activeId = useSettingsStore((state) => state.settings.activeProfileId)
  const [profileId, setProfileId] = useState(activeId)
  const [adding, setAdding] = useState(false)

  useEffect(() => {
    void hydrate().then(() => pingAll())
    void hydrateProfiles()
  }, [hydrate, hydrateProfiles, pingAll])

  const profile = profiles.find((item) => item.id === profileId) ?? profiles[0] ?? null

  return (
    <Page
      title={t.servers.title}
      subtitle={t.servers.subtitle}
      actions={
        <>
          {profiles.length > 1 && (
            <Select
              aria-label={t.servers.profile}
              value={profile?.id ?? ''}
              onChange={(event) => setProfileId(event.target.value)}
            >
              {profiles.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </Select>
          )}
          <Button size="sm" icon={<RefreshIcon size={14} />} disabled={busy} onClick={() => void pingAll()}>
            {busy ? t.servers.refreshing : t.servers.refresh}
          </Button>
          <Button size="sm" variant="primary" icon={<PlusIcon size={14} />} onClick={() => setAdding((value) => !value)}>
            {t.servers.add}
          </Button>
        </>
      }
    >
      <div className="mx-auto max-w-4xl">
        {profiles.length === 0 && (
          <p className="mb-3 flex items-center gap-2 text-sm text-warning">
            <WarningIcon size={15} />
            {t.servers.needProfile}
          </p>
        )}

        {error && (
          <div role="alert" className="mb-3 flex items-start gap-2.5 rounded-md bg-surface px-4 py-3 shadow-soft">
            <WarningIcon size={16} className="mt-0.5 shrink-0 text-warning" />
            <p className="min-w-0 flex-1 text-sm text-ink">{error.message}</p>
            <Button size="sm" variant="ghost" onClick={clearError}>
              {t.common.cancel}
            </Button>
          </div>
        )}

        {adding && <AddServerCard onDone={() => setAdding(false)} />}

        {servers.length === 0 && !adding ? (
          <EmptyState
            icon={<ProfilesIcon size={26} />}
            title={t.servers.emptyTitle}
            body={t.servers.emptyBody}
            action={
              <Button variant="primary" onClick={() => setAdding(true)}>
                {t.servers.add}
              </Button>
            }
          />
        ) : (
          <ul className="space-y-2">
            {servers.map((server) => (
              <ServerCard key={server.id} server={server} status={statuses[server.id] ?? null} profileId={profile?.id ?? null} />
            ))}
          </ul>
        )}
      </div>
    </Page>
  )
}

function ServerCard({
  server,
  status,
  profileId
}: {
  server: GameServer
  status: ServerStatus | null
  profileId: string | null
}): React.ReactElement {
  const t = useI18n()
  const ping = useServersStore((state) => state.ping)
  const pinging = useServersStore((state) => state.pinging)
  const remove = useServersStore((state) => state.remove)
  const connect = useServersStore((state) => state.connect)
  const [joining, setJoining] = useState(false)

  const parts: string[] = []
  if (status?.motd) parts.push(status.motd)
  if (status?.version) parts.push(t.servers.version(status.version))
  if (status?.playersOnline !== undefined && status?.playersMax !== undefined) {
    parts.push(t.servers.online(status.playersOnline, status.playersMax))
  }
  if (status?.latencyMs !== undefined) parts.push(t.servers.ping(status.latencyMs))

  return (
    <motion.li layout initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={listSpring}>
      <Card className="flex items-center gap-4 p-4">
        <span
          aria-hidden
          className={
            status?.online
              ? 'h-2.5 w-2.5 shrink-0 rounded-full bg-success'
              : 'h-2.5 w-2.5 shrink-0 rounded-full bg-fill'
          }
          style={status?.online ? undefined : { boxShadow: 'inset 0 0 0 1px var(--hairline)' }}
        />

        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-semibold text-ink">{server.name}</h3>
          <p className="mt-0.5 truncate font-mono text-xs text-faint">
            {server.address}:{server.port}
          </p>
          {status?.online ? (
            <p className="mt-1 truncate text-xs text-muted">{parts.join(' · ')}</p>
          ) : (
            <p className="mt-1 text-xs text-faint">{status ? t.servers.offline : t.common.loading}</p>
          )}
        </div>

        <Button
          size="sm"
          variant="primary"
          icon={<PlayIcon size={14} />}
          disabled={!profileId || joining}
          onClick={() => {
            if (!profileId) return
            setJoining(true)
            void connect(server.id, profileId).finally(() => setJoining(false))
          }}
        >
          {joining ? t.servers.connecting : t.servers.connect}
        </Button>

        <Button
          size="sm"
          variant="ghost"
          icon={<RefreshIcon size={14} />}
          aria-label={t.servers.refresh}
          disabled={pinging === server.id}
          onClick={() => void ping(server.id)}
        >
          {t.servers.refresh}
        </Button>

        <Button
          size="sm"
          variant="ghost"
          icon={<TrashIcon size={14} />}
          aria-label={t.servers.remove}
          onClick={() => void remove(server.id)}
        >
          {t.servers.remove}
        </Button>
      </Card>
    </motion.li>
  )
}

function AddServerCard({ onDone }: { onDone: () => void }): React.ReactElement {
  const t = useI18n()
  const add = useServersStore((state) => state.add)
  const busy = useServersStore((state) => state.busy)
  const [name, setName] = useState('')
  const [address, setAddress] = useState('')
  const [port, setPort] = useState('25565')

  const save = (): void => {
    const host = address.trim()
    if (host.length === 0) return
    const parsed = Number.parseInt(port, 10)
    void add({
      name: name.trim() || host,
      address: host,
      ...(Number.isInteger(parsed) && parsed > 0 && parsed < 65536 ? { port: parsed } : {})
    }).then((server) => {
      if (server) onDone()
    })
  }

  return (
    <Card className="mb-3 p-4">
      <div className="grid gap-2 sm:grid-cols-[1fr_1fr_110px_auto]">
        <label className="flex flex-col gap-1 text-xs text-muted">
          {t.servers.name}
          <TextInput value={name} onChange={(event) => setName(event.target.value)} placeholder={t.servers.namePlaceholder} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted">
          {t.servers.address}
          <TextInput
            value={address}
            onChange={(event) => setAddress(event.target.value)}
            placeholder={t.servers.addressPlaceholder}
            onKeyDown={(event) => {
              if (event.key === 'Enter') save()
            }}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted">
          {t.servers.port}
          <TextInput value={port} inputMode="numeric" onChange={(event) => setPort(event.target.value)} />
        </label>
        <div className="flex items-end gap-2">
          <Button size="sm" variant="primary" disabled={busy || address.trim().length === 0} onClick={save}>
            {t.servers.save}
          </Button>
          <Button size="sm" variant="ghost" onClick={onDone}>
            {t.common.cancel}
          </Button>
        </div>
      </div>
    </Card>
  )
}
