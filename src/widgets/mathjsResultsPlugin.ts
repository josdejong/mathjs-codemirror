import { RangeCursor, StateEffect, StateField, Text } from '@codemirror/state'
import { Decoration, DecorationSet, EditorView, WidgetType } from '@codemirror/view'
import { isEqual } from 'lodash-es'
import { MathJsStatic, MathType } from 'mathjs'

export interface Line {
  index: number
  pos: number
  text: string
}

export interface Result {
  line: Line
  scopeBefore: Map<string, unknown>
  scopeAfter: Map<string, unknown>
  answer: MathType | undefined
  error: Error | undefined
}

interface Change {
  fromA: number
  toA: number
  fromB: number
  toB: number
  inserted: Text
}

export const recalculateEffect = StateEffect.define<Result[]>()

// docs and examples: https://codemirror.net/examples/decoration/
export function mathjsResultsPlugin({ format }: { format: MathJsStatic['format'] }) {
  class ResultWidget extends WidgetType {
    props: Result

    constructor(props: Result) {
      super()
      this.props = props
    }

    eq(other: ResultWidget) {
      // Note: this is probably slow when the result is a large matrix,
      // look into that as soon as we can render large matrix output in some viewer
      return isEqual(this.props, other.props)
    }

    toDOM() {
      const { answer, error } = this.props
      const answerNotEmpty = answer === null || (answer !== undefined && (!(typeof answer === 'object' && answer.isResultSet && answer.entries.length === 0)))
      
      const resultStr = error
        ? String(error)
        : answerNotEmpty
        ? format(answer, { precision: 14 })
        : undefined

      const resultContainer = document.createElement('span')
      resultContainer.setAttribute('aria-hidden', 'true')
      resultContainer.className = 'cm-line cm-mathjs-result' + (error ? ' cm-mathjs-error' : '')

      if (resultStr) {
        const resultInner = document.createElement('span')
        resultInner.className = 'cm-mathjs-result-inner'
        resultInner.appendChild(document.createTextNode(resultStr))
        resultInner.title = 'Click to copy the result to the clipboard'

        const copyButton = document.createElement('button')
        const copyText = 'copy'
        copyButton.className = 'copy'
        copyButton.innerText = copyText
        resultInner.onclick = async () => {
          await navigator.clipboard?.writeText(resultStr)
          copyButton.innerText = 'copied!'
          setTimeout(() => (copyButton.innerText = copyText), 1000)
        }
        resultInner.appendChild(copyButton)

        resultContainer.appendChild(resultInner)
      }

      return resultContainer
    }

    ignoreEvent() {
      return false
    }

    destroy(dom: HTMLElement) {
      super.destroy(dom)
    }
  }

  function updateResults(prevDecorations: DecorationSet, results: Result[]): DecorationSet {
    // TODO: reuse previous decorations
    const decorations = results.map((result) => {
      const widget = new ResultWidget(result)
      const decoration = Decoration.widget({
        widget,
        side: 1, // right side
        block: true // render as a block after the line
      })

      return decoration.range(result.line.pos)
    })

    return Decoration.set(decorations)
  }

  function updateDecorations(
    decorations: DecorationSet,
    { fromA, toA, fromB, toB, inserted }: Change
  ): DecorationSet {
    const getPos = (decoration: Decoration) => decoration.spec.widget.props.line.pos
    const setPos = (decoration: Decoration, newPos: number) => {
      decoration.spec.widget.props.line = { ...decoration.spec.widget.props.line, pos: newPos }
      return newPos
    }

    // TODO: figure out if we can simplify this code with methods like decorations.map or decorations.update
    const removing = toB - toA < 0
    const stepOver = inserted.toString() === '\n' // enter at the end of a line must be inserted after the decoration

    const updatedDecorations = rangeCursorToArray(decorations.iter(0))
      .filter((decoration) => {
        // remove decorations inside a removed text
        const pos = getPos(decoration)
        const removeIt = removing && ((pos >= fromA && pos <= toA) || (pos >= fromB && pos <= toB))
        return !removeIt
      })
      .map((decoration) => {
        // shift decorations after the removed/inserted text
        const pos = getPos(decoration)
        const shift = (stepOver && !removing ? pos > fromA : pos >= fromA) ? toB - toA : 0
        const newPos = pos + shift
        setPos(decoration, newPos)
        return decoration.range(newPos)
      })

    return Decoration.set(updatedDecorations)
  }

  return StateField.define<DecorationSet>({
    create() {
      return Decoration.none
    },
    update(decorations, transaction) {
      // when typing in the document, immediately shift and remove the existing decorations
      // to keep them at the right position
      if (transaction.docChanged) {
        let updatedDecorations = decorations

        transaction.changes.iterChanges((fromA, toA, fromB, toB, inserted) => {
          updatedDecorations = updateDecorations(updatedDecorations, {
            fromA,
            toA,
            fromB,
            toB,
            inserted
          })
        })

        return updatedDecorations
      }

      // when calculation results come in, replace the decorations
      const effect = transaction.effects.find((effect) => effect.is(recalculateEffect))
      if (effect) {
        return updateResults(decorations, effect.value)
      }

      return decorations
    },
    provide: (f) => EditorView.decorations.from(f)
  })
}

function rangeCursorToArray(range: RangeCursor<Decoration>): Decoration[] {
  const items = []

  while (range.value) {
    items.push(range.value)
    range.next()
  }

  return items
}
