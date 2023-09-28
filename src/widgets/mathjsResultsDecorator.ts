import { EditorState, StateField } from '@codemirror/state'
import { Decoration, DecorationSet, EditorView, WidgetType } from '@codemirror/view'
import { last } from 'lodash-es'
import { MathJsStatic } from 'mathjs'

interface Result {
  index: number
  pos: number
  text: string
  result: unknown | undefined
  error: Error | undefined
}

// docs and examples: https://codemirror.net/examples/decoration/
export function mathjsResultsDecorator({
  evaluate,
  format
}: {
  evaluate: MathJsStatic['evaluate']
  format: MathJsStatic['format']
}) {
  function mathjsResults(state: EditorState) {
    let widgets = []

    const expressions = state.doc.toString()
    const scope = new Map()

    // FIXME: re-calculate only after a delay of 300 ms
    const results: Result[] = expressions.split('\n').reduce((all, text, index) => {
      const prevLine = last(all)
      const pos = (prevLine ? prevLine.pos + 1 : 0) + text.length

      const { result, error } = tryEvaluate(text, scope)

      all.push({
        pos,
        index,
        text,
        result,
        error
      })
      return all
    }, [])

    results
      .filter(({ text }) => {
        // filter empty lines
        return text.trim().length > 0
      })
      .forEach((result) => {
        const decoration = Decoration.widget({
          widget: new MathjsResultWidget(result),
          side: 1, // right side
          block: true // render as a block after the line
        })
        widgets.push(decoration.range(result.pos))
      })

    return Decoration.set(widgets)
  }

  function tryEvaluate(expression: string, scope: Map<string, unknown>) {
    try {
      return {
        result: evaluate(expression, scope),
        error: undefined
      }
    } catch (error) {
      return {
        result: undefined,
        error
      }
    }
  }

  class MathjsResultWidget extends WidgetType {
    result: Result

    constructor(result: Result) {
      super()

      this.result = result
    }

    eq(other: MathjsResultWidget) {
      // FIXME: look at all lines up until now to determine whether the line should be recalculated
      return other.result.index === this.result.index && other.result.text === this.result.text
    }

    toDOM() {
      const resultStr = this.result.error
        ? String(this.result.error)
        : format(this.result.result, { precision: 14 })

      const resultSpan = document.createElement('span')
      resultSpan.setAttribute('aria-hidden', 'true')
      resultSpan.className =
        'cm-line cm-mathjs-result' + (this.result.error ? ' cm-mathjs-error' : '')
      resultSpan.appendChild(document.createTextNode(resultStr))

      return resultSpan
    }

    ignoreEvent() {
      return false
    }
  }

  return StateField.define<DecorationSet>({
    create(state) {
      return mathjsResults(state)
    },
    update(decorations, transaction) {
      // FIXME: keep the previous decorations that are unchanged
      if (transaction.docChanged) {
        return mathjsResults(transaction.state)
      }

      return decorations
    },
    provide: (f) => EditorView.decorations.from(f)
  })
}
