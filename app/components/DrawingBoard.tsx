
'use client'
import React, { memo, useCallback, useEffect, useRef, useState } from 'react'

import {
  Button,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Slider,
  Tooltip,
} from '@heroui/react'
import { Download, Eraser, Minus, Palette, Pencil, Plus, Trash2 } from 'lucide-react'

import { nanoid } from 'nanoid'
import { getStroke } from 'perfect-freehand'
import * as Y from 'yjs'

import { Stroke } from '@/app/interfaces/drawing'
import { useStroke } from '../hooks/useStroke'
import { useStrokes } from '../hooks/useStrokes'
import { getSvgPathFromStroke } from '../utils/drawing'

interface DrawingBoardProps {
  ydoc: Y.Doc | null
  tool: 'pen' | 'eraser'
  onToolChange?: (tool: 'pen' | 'eraser') => void
  backgroundColor?: string
  className?: string
  strokesArrayName?: string
  showToolbar?: boolean
}

type ColorType = '#000000' | '#ef4444' | '#22c55e' | '#3b82f6' | '#eab308' | '#a855f7'

const COLORS: { value: ColorType; label: string; tailwind: string }[] = [
  { value: '#000000', label: 'Black', tailwind: 'bg-black' },
  { value: '#ef4444', label: 'Red', tailwind: 'bg-red-500' },
  { value: '#eab308', label: 'Yellow', tailwind: 'bg-yellow-500' },
  { value: '#22c55e', label: 'Green', tailwind: 'bg-green-500' },
  { value: '#3b82f6', label: 'Blue', tailwind: 'bg-blue-500' },
  { value: '#a855f7', label: 'Purple', tailwind: 'bg-purple-500' },
]

type DrawingToolbarProps = {
  selectedTool: 'pen' | 'eraser'
  onToolChange: (tool: 'pen' | 'eraser') => void
  selectedColor: ColorType
  onColorChange: (color: ColorType) => void
  brushSize: number
  onBrushSizeChange: (size: number) => void
  onClear: () => void
  onExportPng: () => void
  onExportJpg: () => void
}

const ToolbarControls = ({
  selectedTool,
  onToolChange,
  selectedColor,
  onColorChange,
  brushSize,
  onBrushSizeChange,
  onClear,
  onExportPng,
  onExportJpg,
}: DrawingToolbarProps) => {
  return (
    <div
      className="flex flex-col gap-3 p-4"
      onDragStart={(e) => e.preventDefault()}
    >
      <div className="flex gap-4 justify-center md:grid md:grid-cols-3 md:gap-3 md:justify-items-center">
        {COLORS.map((color) => (
          <Tooltip key={color.value} content={color.label}>
            <button
              type="button"
              draggable={false}
              onClick={() => onColorChange(color.value)}
              className={`w-6 h-6 rounded-full border-2 transition-all ${color.tailwind} ${selectedColor === color.value
                ? 'border-primary ring-2 ring-primary ring-offset-2'
                : 'border-transparent hover:scale-110'
                }`}
              aria-label={`Select ${color.label}`}
            />
          </Tooltip>
        ))}
      </div>

      <div className="px-1">
        <Slider
          size="sm"
          step={1}
          maxValue={15}
          minValue={1}
          aria-label="Brush Size"
          value={brushSize}
          onChange={(val) => onBrushSizeChange(val as number)}
          startContent={<Minus size={10} className="text-default-900" />}
          endContent={<Plus size={10} className="text-default-900" />}
          className="max-w-40"
        />
      </div>

      <div className="flex gap-2 justify-center">
        <Tooltip content="Pen">
          <Button
            isIconOnly
            size="sm"
            variant={selectedTool === 'pen' ? 'solid' : 'light'}
            color={selectedTool === 'pen' ? 'primary' : 'default'}
            onPress={() => onToolChange('pen')}
          >
            <Pencil size={16} />
          </Button>
        </Tooltip>
        <Tooltip content="Eraser">
          <Button
            isIconOnly
            size="sm"
            variant={selectedTool === 'eraser' ? 'solid' : 'light'}
            color={selectedTool === 'eraser' ? 'primary' : 'default'}
            onPress={() => onToolChange('eraser')}
          >
            <Eraser size={16} />
          </Button>
        </Tooltip>
        <Tooltip content="Clear all">
          <Button
            isIconOnly
            size="sm"
            variant="light"
            color="danger"
            onPress={onClear}
            aria-label="Clear all drawings"
          >
            <Trash2 size={16} />
          </Button>
        </Tooltip>
      </div>

      <div className="border-t border-border-subtle pt-3 flex gap-2 justify-center">
        <Tooltip content="Export as PNG">
          <Button
            size="sm"
            variant="flat"
            onPress={onExportPng}
            aria-label="Export as PNG"
            className="text-xs px-2"
          >
            <Download size={14} />
            PNG
          </Button>
        </Tooltip>
        <Tooltip content="Export as JPG">
          <Button
            size="sm"
            variant="flat"
            onPress={onExportJpg}
            aria-label="Export as JPG"
            className="text-xs px-2"
          >
            <Download size={14} />
            JPG
          </Button>
        </Tooltip>
      </div>
    </div>
  )
}

export const DrawingToolbar = (props: DrawingToolbarProps) => {
  return (
    <>
      <div className="hidden md:flex absolute top-4 right-4 z-50 bg-surface-primary/80 backdrop-blur-md shadow-lg border border-border-subtle rounded-xl">
        <ToolbarControls {...props} />
      </div>

      <div className="md:hidden absolute top-4 right-4 z-50">
        <Popover placement="left-start" offset={10} showArrow>
          <PopoverTrigger>
            <Button
              isIconOnly
              color="primary"
              variant="shadow"
              size="lg"
              className="rounded-full"
              aria-label="Open Drawing Tools"
            >
              <Palette size={24} />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="p-0">
            <ToolbarControls {...props} />
          </PopoverContent>
        </Popover>
      </div>
    </>
  )
}

function DrawingBoard({ ydoc, tool, onToolChange, backgroundColor, className, strokesArrayName = 'strokes', showToolbar = true }: DrawingBoardProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const isDrawingRef = useRef(false)
  const isErasingRef = useRef(false)
  const { points, startStroke, updateStroke, finishStroke } = useStroke()
  const pointsRef = useRef<number[][]>([])
  const { strokes, addStroke } = useStrokes(ydoc, strokesArrayName)
  const [selectedColor, setSelectedColor] = useState<ColorType>('#000000')
  const [brushSize, setBrushSize] = useState(12)

  useEffect(() => {
    pointsRef.current = points
  }, [points])

  /*
  Must convert cursor absolute coordinate to a shared svg coordinate before broadcast
  other clients need to transform svg coor to their own cursor coor.
  */
  const mapScreenToSvgCoordinate = (x: number, y: number) => {
    const svg = svgRef.current
    if (!svg) return { x, y }

    const point = svg.createSVGPoint()
    point.x = x
    point.y = y
    const ctm = svg.getScreenCTM()
    if (ctm) {
      return (
        point.matrixTransform(ctm.inverse())
      )
    }
    return { x, y }
  }

  // useCallback prevents unnecessary re-creating new handler functions so the memoize component dont get rerendered
  const eraseAtPoint = useCallback(
    (x: number, y: number) => {
      if (!ydoc) return
      const yStrokes = ydoc.getArray<Stroke>(strokesArrayName)
      if (yStrokes.length === 0) return
      const eraserRadius = Math.max(brushSize, 10)

      const distSqPointToSegment = (
        px: number,
        py: number,
        x1: number,
        y1: number,
        x2: number,
        y2: number
      ) => {
        const dx = x2 - x1
        const dy = y2 - y1
        if (dx === 0 && dy === 0) {
          const sx = px - x1
          const sy = py - y1
          return sx * sx + sy * sy
        }
        const t = ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy)
        const clamped = Math.max(0, Math.min(1, t))
        const cx = x1 + clamped * dx
        const cy = y1 + clamped * dy
        const sx = px - cx
        const sy = py - cy
        return sx * sx + sy * sy
      }

      const getPoint = (
        pt: Stroke['points'][number]
      ): { x: number; y: number } | null => {
        if (Array.isArray(pt)) {
          const px = pt[0]
          const py = pt[1]
          if (typeof px !== 'number' || typeof py !== 'number') return null
          return { x: px, y: py }
        }
        if (typeof pt.x === 'number' && typeof pt.y === 'number') {
          return { x: pt.x, y: pt.y }
        }
        return null
      }

      const isHit = (stroke: Stroke) => {
        const strokeSize = stroke.thickness ?? brushSize
        const hitRadius = eraserRadius + strokeSize / 2
        const hitRadiusSq = hitRadius * hitRadius

        const pts: { x: number; y: number }[] = []
        for (const pt of stroke.points) {
          const p = getPoint(pt)
          if (p) pts.push(p)
        }

        if (pts.length === 0) return false
        if (pts.length === 1) {
          const dx = pts[0].x - x
          const dy = pts[0].y - y
          return dx * dx + dy * dy <= hitRadiusSq
        }

        for (let i = 0; i < pts.length - 1; i += 1) {
          const a = pts[i]
          const b = pts[i + 1]
          const dSq = distSqPointToSegment(x, y, a.x, a.y, b.x, b.y)
          if (dSq <= hitRadiusSq) return true
        }

        return false
      }

      const indices: number[] = []
      yStrokes.toArray().forEach((stroke, idx) => {
        if (isHit(stroke)) indices.push(idx)
      })

      if (indices.length > 0) {
        indices.sort((a, b) => b - a).forEach((idx) => {
          yStrokes.delete(idx, 1)
        })
      }
    },
    [ydoc, brushSize, strokesArrayName]
  )

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      e.preventDefault()
      e.currentTarget.setPointerCapture(e.pointerId)
      const point = mapScreenToSvgCoordinate(e.clientX, e.clientY)

      if (tool === 'eraser') {
        isErasingRef.current = true
        eraseAtPoint(point.x, point.y)
        return
      }

      isDrawingRef.current = true
      startStroke(point.x, point.y, e.pressure)
    },
    [eraseAtPoint, startStroke, tool]
  )

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      const point = mapScreenToSvgCoordinate(e.clientX, e.clientY)

      if (isErasingRef.current) {
        eraseAtPoint(point.x, point.y)
        return
      }

      if (!isDrawingRef.current) return
      updateStroke(point.x, point.y, e.pressure)
    },
    [eraseAtPoint, updateStroke]
  )

  const handlePointerUp = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      if (isErasingRef.current) {
        isErasingRef.current = false
        e.currentTarget.releasePointerCapture(e.pointerId)
        return
      }

      if (!isDrawingRef.current) return
      isDrawingRef.current = false
      e.currentTarget.releasePointerCapture(e.pointerId)
      const latestPoints = pointsRef.current
      if (latestPoints.length === 0) {
        finishStroke()
        return
      }
      const stroke: Stroke = {
        id: nanoid(),
        points: latestPoints,
        user: 'placeholder',
        color: selectedColor,
        thickness: brushSize,
      }
      addStroke(stroke)
      finishStroke()
    },
    [addStroke, finishStroke, selectedColor, brushSize]
  )

  const handlePointerCancel = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      if (!isDrawingRef.current && !isErasingRef.current) return
      isDrawingRef.current = false
      isErasingRef.current = false
      e.currentTarget.releasePointerCapture(e.pointerId)
      finishStroke()
    },
    [finishStroke]
  )

  const handleLostPointerCapture = useCallback(
    () => {
      if (!isDrawingRef.current) return
      isDrawingRef.current = false
      const latestPoints = pointsRef.current
      if (latestPoints.length > 0) {
        addStroke({
          id: nanoid(),
          points: latestPoints,
          user: 'placeholder',
          color: selectedColor,
          thickness: brushSize,
        })
      }
      finishStroke()
    },
    [addStroke, finishStroke, selectedColor, brushSize]
  )

  const handleClear = useCallback(() => {
    if (!ydoc) return
    const yStrokes = ydoc.getArray<Stroke>(strokesArrayName)
    if (yStrokes.length > 0) {
      yStrokes.delete(0, yStrokes.length)
    }
    finishStroke()
  }, [ydoc, finishStroke, strokesArrayName])

  const handleExport = useCallback((format: 'png' | 'jpg') => {
    const svg = svgRef.current
    if (!svg) return

    const { width, height } = svg.getBoundingClientRect()
    const svgData = new XMLSerializer().serializeToString(svg)
    const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' })
    const url = URL.createObjectURL(svgBlob)

    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')
      if (!ctx) return

      if (format === 'jpg') {
        ctx.fillStyle = backgroundColor ?? '#ffffff'
        ctx.fillRect(0, 0, canvas.width, canvas.height)
      }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
      URL.revokeObjectURL(url)

      const mimeType = format === 'jpg' ? 'image/jpeg' : 'image/png'
      const dataUrl = canvas.toDataURL(mimeType, 0.95)
      const a = document.createElement('a')
      a.href = dataUrl
      a.download = `drawing.${format}`
      a.click()
    }
    img.src = url
  }, [backgroundColor])

  const STROKE_OPTIONS = {
    size: brushSize,
    thinning: 0.5,
    smoothing: 0.5,
    streamline: 0.5,
  }

  const stroke = getStroke(points, STROKE_OPTIONS)
  const pathData = getSvgPathFromStroke(stroke)
  const containerClassName = ['relative w-full h-full', className]
    .filter(Boolean)
    .join(' ')

  return (
    <div className={containerClassName}>
      {showToolbar && <DrawingToolbar
        selectedTool={tool}
        onToolChange={(nextTool) => onToolChange?.(nextTool)}
        selectedColor={selectedColor}
        onColorChange={setSelectedColor}
        brushSize={brushSize}
        onBrushSizeChange={setBrushSize}
        onClear={handleClear}
        onExportPng={() => handleExport('png')}
        onExportJpg={() => handleExport('jpg')}
      />}
      <svg
        ref={svgRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
        onLostPointerCapture={handleLostPointerCapture}
        onDragStart={(e) => e.preventDefault()}
        style={{
          touchAction: 'none',
          width: '100%',
          height: '100%',
          backgroundColor: backgroundColor ?? '#ffffff',
          cursor: tool === 'eraser' ? 'cell' : 'crosshair',
        }}
      >
        {strokes.map((stroke) => {
          const strokeSize = stroke.thickness ?? 16
          const strokeColor = stroke.color ?? '#000000'
          const strokePath = getSvgPathFromStroke(
            getStroke(stroke.points, {
              ...STROKE_OPTIONS,
              size: strokeSize,
            })
          )
          return (
            <path key={stroke.id} d={strokePath} fill={strokeColor} stroke="none" />
          )
        })}
        {points && (
          <path d={pathData} fill={selectedColor} stroke="none" />
        )}
      </svg>
    </div>
  )
}

// Only re-render when dependency is updated.
// Prevents re-render when parent states change
export default memo(DrawingBoard)
