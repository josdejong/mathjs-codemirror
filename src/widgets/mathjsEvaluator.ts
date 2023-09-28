import { EditorState, RangeCursor, StateField } from '@codemirror/state'
import { Decoration, DecorationSet, EditorView, WidgetType } from '@codemirror/view'
import { isEqual, last } from 'lodash-es'
import { MathJsStatic, MathType } from 'mathjs'

interface Line {
  index: number
  pos: number
  text: string
}

interface Result {
  answer: MathType | undefined
  error: Error | undefined
}

// docs and examples: https://codemirror.net/examples/decoration/
export function mathjsEvaluator({
  evaluate,
  format
}: {
  evaluate: MathJsStatic['evaluate']
  format: MathJsStatic['format']
}) {
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

      const resultStr = error
        ? String(error)
        : answer
        ? format(answer, { precision: 14 })
        : undefined

      const resultSpan = document.createElement('span')
      resultSpan.setAttribute('aria-hidden', 'true')
      resultSpan.className = 'cm-line cm-mathjs-result' + (error ? ' cm-mathjs-error' : '')

      if (resultStr) {
        resultSpan.appendChild(document.createTextNode(resultStr))
      }

      return resultSpan
    }

    ignoreEvent() {
      return false
    }

    destroy(dom: HTMLElement) {
      super.destroy(dom)
    }
  }

  function tryEvaluate(expression: string, scope: Map<string, unknown>) {
    try {
      console.log('evaluate', expression) // TODO: cleanup

      return {
        answer: expression.trim() !== '' ? evaluate(expression, scope) : undefined,
        error: undefined
      }
    } catch (error) {
      return {
        answer: undefined,
        error
      }
    }
  }

  function evaluateState(prevDecorations: DecorationSet, state: EditorState): DecorationSet {
    // const prevWidgets = rangeToArray(prevDecorations.iter(0))

    const expressions = state.doc.toString()
    const lines = splitLines(expressions)

    const scope = new Map()
    const decorations = lines.reduce((decorations, line) => {
      // TODO: only recalculate when there are actual changes (remember previous state)
      const result = tryEvaluate(line.text, scope)

      const widget = new ResultWidget(result)
      const decoration = Decoration.widget({
        widget,
        side: 1, // right side
        block: true // render as a block after the line
      })

      return [...decorations, decoration.range(line.pos)]
    }, [])

    return Decoration.set(decorations)
  }

  return StateField.define<DecorationSet>({
    create(state) {
      return evaluateState(Decoration.none, state)
    },
    update(decorations, transaction) {
      if (transaction.docChanged) {
        // FIXME: recalculate only after a delay of 300 ms,
        //  see https://discuss.codemirror.net/t/what-is-the-correct-way-to-set-decorations-asynchronously/3266
        return evaluateState(decorations, transaction.state)
      }

      return decorations
    },
    provide: (f) => EditorView.decorations.from(f)
  })
}

function splitLines(expressions: string): Line[] {
  return expressions.split('\n').reduce((all, text, index) => {
    const prevLine = last(all)
    const pos = (prevLine ? prevLine.pos + 1 : 0) + text.length
    const line = { pos, index, text }
    return [...all, line]
  }, [])
}

function rangeToArray(range: RangeCursor<Decoration>): Decoration[] {
  const items = []

  while (range.value) {
    items.push(range.value)
    range.next()
  }

  return items
}
