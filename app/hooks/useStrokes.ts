/*
Manage all strokes locally and in yjs doc
1. listen for changes in the strokes on yjs
2. provide a function to add new strokes to the shared array
*/

import { useCallback, useEffect, useState } from 'react'
import * as Y from 'yjs'
import { Stroke } from '@/interfaces/drawing'

export function useStrokes(ydoc: Y.Doc | null, arrayName = 'strokes') {
  const [strokes, setStrokes] = useState<Stroke[]>([])

  useEffect(() => {
    if (!ydoc) return

    // create a new shared Y.Array under name strokes or get the array if already exist
    const yStrokes = ydoc.getArray<Stroke>(arrayName)

    const callback = () => {
      setStrokes(yStrokes.toArray())
    }

    // calls callback function everytime yStrokes changes
    yStrokes.observe(callback)

    // prevent memory leaks
    return () => {
      yStrokes.unobserve(callback)
    }
  }, [ydoc, arrayName]) // run only once bc does not get updated when yStrokes is updated, need to use yStrokes observe

  const addStroke = useCallback(
    (stroke: Stroke) => {
      if (!ydoc) return
      const yStrokes = ydoc.getArray<Stroke>(arrayName)
      // no need to append to stroke locally because it will be updated by observer anyway
      yStrokes.push([stroke])
    },
    [ydoc, arrayName]
  )

  return { strokes, addStroke }
}
