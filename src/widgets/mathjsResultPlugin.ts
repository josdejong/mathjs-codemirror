import {
  Decoration,
  DecorationSet,
  EditorView,
  ViewPlugin,
  ViewUpdate,
  WidgetType
} from '@codemirror/view'
import { last } from 'lodash-es'
import { MathJsStatic } from 'mathjs'

interface Result {
  index: number
  pos: number
  text: string
  result: unknown | undefined
  error: Error | undefined
}

// useful docs and examples:
// - https://codemirror.net/examples/decoration/
// - https://discuss.codemirror.net/t/block-decoration-error-uncaught-rangeerror-block-decorations-may-not-be-specified-via-plugins/4102/2
export function mathjsResultPlugin({
  evaluate,
  format
}: {
  evaluate: MathJsStatic['evaluate']
  format: MathJsStatic['format']
}) {
  function mathjsResults(view: EditorView) {
    let widgets = []

    const expressions = view.state.doc.toString()
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
          block: false // FIXME enable block decoration, set block:true
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
      // FIXME: look at all lines up until now
      return other.result.index === this.result.index && other.result.text === this.result.text
    }

    toDOM() {
      const resultStr = this.result.error
        ? String(this.result.error)
        : format(this.result.result, { precision: 14 })

      const resultSpan = document.createElement('span')
      resultSpan.setAttribute('aria-hidden', 'true')
      resultSpan.className =
        'cm-mathjs-result' + (this.result.error ? ' cm-mathjs-result-error' : '')
      resultSpan.appendChild(document.createTextNode(resultStr))

      return resultSpan
    }

    ignoreEvent() {
      return false
    }
  }

  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet

      constructor(view: EditorView) {
        this.decorations = mathjsResults(view)
      }

      update(update: ViewUpdate) {
        if (update.docChanged || update.viewportChanged) {
          this.decorations = mathjsResults(update.view)
        }
      }
    },
    {
      decorations: (v) => v.decorations,

      eventHandlers: {
        mousedown: (e, view) => {
          // TODO: should be able to copy the result. Add a copy button that is visible on hover?
        }
      }
    }
  )
}
