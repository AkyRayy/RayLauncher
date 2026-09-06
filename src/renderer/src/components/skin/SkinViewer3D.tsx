import { useEffect, useRef } from 'react'
import { SkinViewer, IdleAnimation, WalkingAnimation } from 'skinview3d'

interface SkinViewer3DProps {
  skinUrl: string | null
  variant: 'classic' | 'slim'
  walking?: boolean
  width?: number
  height?: number
  className?: string
}

export function SkinViewer3D({
  skinUrl,
  variant,
  walking = false,
  width = 220,
  height = 320,
  className
}: SkinViewer3DProps): React.ReactElement {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const viewerRef = useRef<SkinViewer | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const viewer = new SkinViewer({ canvas, width, height })
    viewer.autoRotate = false
    viewer.zoom = 0.82
    viewer.animation = new IdleAnimation()
    viewer.controls.enablePan = false
    viewer.controls.enableZoom = false
    viewer.renderer.setClearColor(0x000000, 0)
    viewerRef.current = viewer

    return () => {
      viewer.dispose()
      viewerRef.current = null
    }
  }, [width, height])

  useEffect(() => {
    const viewer = viewerRef.current
    if (!viewer) return

    if (!skinUrl) {
      viewer.resetSkin()
      return
    }

    void viewer.loadSkin(skinUrl, { model: variant === 'slim' ? 'slim' : 'default' }).catch(() => {
      viewer.resetSkin()
    })
  }, [skinUrl, variant])

  useEffect(() => {
    const viewer = viewerRef.current
    if (!viewer) return
    viewer.animation = walking ? new WalkingAnimation() : new IdleAnimation()
  }, [walking])

  return (
    <canvas
      ref={canvasRef}
      className={className}
      width={width}
      height={height}
      role="img"
      aria-label={`Скин игрока, модель ${variant === 'slim' ? 'Алекс' : 'Стив'}`}
    />
  )
}
