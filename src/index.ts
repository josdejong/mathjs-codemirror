import { EditorState } from '@codemirror/state'
import {
  crosshairCursor,
  drawSelection,
  dropCursor,
  EditorView,
  highlightActiveLine,
  highlightActiveLineGutter,
  highlightSpecialChars,
  keymap,
  lineNumbers,
  rectangularSelection,
  ViewUpdate
} from '@codemirror/view'
import { copyLineDown, defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { lintGutter, lintKeymap } from '@codemirror/lint'
import {
  bracketMatching,
  defaultHighlightStyle,
  foldKeymap,
  indentOnInput,
  StreamLanguage,
  syntaxHighlighting
} from '@codemirror/language'

import { mathjsLang } from './mathjs-lang.js'

import { highlightSelectionMatches, search, searchKeymap } from '@codemirror/search'
import {
  autocompletion,
  closeBrackets,
  closeBracketsKeymap,
  completionKeymap
} from '@codemirror/autocomplete'
import { all, create, parse } from 'mathjs'
import {
  Line,
  mathjsResultsPlugin,
  recalculateEffect,
  Result
} from './widgets/mathjsResultsPlugin.js'
import { debounce, isEqual, last } from 'lodash-es'

const recalculateDelay = 500 // ms

const localStorageKey = 'mathjs-codemirror-expressions'

const defaultExpressions = `1.2 * (2 + 4.5)

12.7 cm to inch

sin(45 deg) ^ 2

9 / 3 + 2i

det([-1, 2; 3, 1])

simplify('5x + 2x + 240/2.5')
`

function init() {
  const math = create(all)

  let scope = new Map()

  function splitLines(expressions: string): Line[] {
    return expressions.split('\n').reduce((all, text, index) => {
      const prevLine = last(all)
      const pos = (prevLine ? prevLine.pos + 1 : 0) + text.length
      const line = { pos, index, text }
      return [...all, line]
    }, [])
  }

  let prevResults: Result[] = []

  function recalculate() {
    console.time('recalculate')
    const expressions = editor.state.doc.toString()
    localStorage[localStorageKey] = expressions

    const lines = splitLines(expressions)

    const results = lines
      .filter((line) => line.text.trim() !== '')
      .map((line, index) => {
        const scopeBefore = scope
        scope = cloneScope(scope)
        const prevResult: Result | undefined = prevResults[index]

        let canBeParsed
        let parsedLine

        try {
          parsedLine = math.parse(line.text)
          canBeParsed = true
        } catch (error) {
          parsedLine = math.parse("")
          canBeParsed = false
        }

        const usedSymbols = new Set()
        if (canBeParsed) {
          parsedLine.traverse(
            node => {
              // this only gets the symbols in the expression,
              // doesn't differentiate if the symbol is the output of an assignment
              // TODO: filter only the input symbols
              if (node.isSymbolNode) {
                usedSymbols.add(node.name)
              }
            }
          )
        }

        if (
          prevResult && canBeParsed && prevResult.canBeParsed &&
          // checks if the expressions are equally parsed
          parsedLine.equals(prevResult.parsedLine) &&
          prevResults.scopeAfter && // check if the filtered scope is equal to the previous results filtered scope
          isEqual(
            // filter the scopes, to only check for symbols in the expression
            new Map([...scope].filter(([key]) => usedSymbols.has(key))),
            new Map([...prevResults.scopeAfter].filter(([key]) => usedSymbols.has(key)))
          )
        ) {
          // no changes, use previous result
          scope = prevResult.scopeAfter

          return { ...prevResult, line }
        } else {
          // evaluate
          const { answer, error } = tryEvaluate(line, scope)
          const scopeAfter = scope

          return { line, scopeBefore, scopeAfter, answer, error, parsedLine, canBeParsed }
        }
      })

    prevResults = results

    editor.dispatch({
      effects: recalculateEffect.of(results)
    })

    console.timeEnd('recalculate')
  }

  function tryEvaluate(line: Line, scope: Map<string, unknown>) {
    try {
      console.log('evaluate', line)
      console.log(scope)
      return {
        answer: line.text.trim() !== '' ? math.evaluate(line.text, scope) : undefined,
        error: undefined
      }
    } catch (error) {
      return {
        answer: undefined,
        error
      }
    }
  }

  function cloneScope(scope: Map<string, unknown>): Map<string, unknown> {
    const clone = new Map<string, unknown>()

    scope.forEach((value, key) => {
      clone.set(key,
        typeof value === 'function' ? value.bind({}) : math.clone(value)
      )
    })

    return clone
  }

  const recalculateDebounced = debounce(recalculate, recalculateDelay)

  const state = EditorState.create({
    doc:
      localStorage[localStorageKey] !== undefined
        ? localStorage[localStorageKey]
        : defaultExpressions,
    extensions: [
      StreamLanguage.define(mathjsLang(() => math, () => scope)),
      keymap.of([indentWithTab]),
      lintGutter(),
      lineNumbers(),
      highlightActiveLineGutter(),
      highlightSpecialChars(),
      history(),
      drawSelection(),
      dropCursor(),
      indentOnInput(),
      syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
      bracketMatching(),
      closeBrackets(),
      autocompletion(),
      mathjsResultsPlugin({ format: math.format }),
      rectangularSelection(),
      crosshairCursor(),
      highlightActiveLine(),
      highlightSelectionMatches(),
      keymap.of([
        ...closeBracketsKeymap,
        ...defaultKeymap,
        ...searchKeymap,
        ...historyKeymap,
        ...foldKeymap,
        ...completionKeymap,
        ...lintKeymap
      ]),
      search({
        top: true
      }),
      EditorView.updateListener.of((update: ViewUpdate) => {
        if (update.docChanged) {
          console.log('docChanged')
          recalculateDebounced()
        }
      })
    ]
  })

  const editorDiv = document.getElementById('editor')
  const editor = new EditorView({
    state,
    parent: editorDiv
  })

  const resetLink = document.getElementById('reset')
  resetLink.addEventListener('click', () => {
    editor.dispatch({
      changes: {
        from: 0,
        to: editor.state.doc.length,
        insert: defaultExpressions
      }
    })
    recalculate()
  })

  recalculate()
}

init()
