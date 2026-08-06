import type { ModelInfo } from '@/live2d/websocketService'

export function setExpression(expressionValue: string | number, lappAdapter: any, logMessage?: string) {
  try {
    if (typeof expressionValue === 'string') {
      lappAdapter.setExpression(expressionValue)
    } else if (typeof expressionValue === 'number') {
      const expressionName = lappAdapter.getExpressionName(expressionValue)
      if (expressionName) lappAdapter.setExpression(expressionName)
    }
    if (logMessage) console.log(logMessage)
  } catch (error) {
    console.error('Failed to set expression:', error)
  }
}

export function resetExpression(lappAdapter: any, modelInfo?: ModelInfo) {
  if (!lappAdapter) return

  try {
    const model = lappAdapter.getModel()
    if (!model || !model._modelSetting) {
      console.log('Model or model settings not loaded yet, skipping expression reset')
      return
    }

    if (modelInfo?.defaultEmotion !== undefined) {
      setExpression(modelInfo.defaultEmotion, lappAdapter, `Reset expression to default: ${modelInfo.defaultEmotion}`)
      return
    }

    const expressionCount = lappAdapter.getExpressionCount()
    if (expressionCount > 0) {
      const defaultExpressionName = lappAdapter.getExpressionName(0)
      if (defaultExpressionName) setExpression(defaultExpressionName, lappAdapter)
    }
  } catch (error) {
    console.log('Failed to reset expression:', error)
  }
}
