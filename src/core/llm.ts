import OpenAI from 'openai'
import { buildLLMMessages } from './prompt'
import type { StrictJSONShape } from './types'

/**
 * analyzeImpactWithLLM
 * - If OPENAI_API_KEY is set, make a simple call to OpenAI's chat completion.
 * - Otherwise return a deterministic heuristic mock based on file names.
 */
export async function analyzeImpactWithLLM(
  changedFiles: string[],
  affected: any[],
  dependencyGraph: any,
  opts?: {
    base?: string
    head?: string
    repoUrl?: string
    changedDetails?: Array<{
      file: string
      added: number
      deleted: number
      hunks: string[]
    }>
    policy?: {
      risk_threshold?: 'conservative' | 'balanced' | 'aggressive'
      max_test_suggestions?: number
    }
    project_hints?: {
      routing?: string[]
      test_conventions?: string[]
      component_roots?: string[]
    }
  }
) {
  // const apiKey = 'sk-xxxxxx'
  const apiKey =
    process.env.OPENAI_API_KEY ||
    process.env.OPENAI_API_KEY_ALT ||
    process.env.DEEPSEEK_API_KEY ||
    process.env.IMPACT_API_KEY ||
    process.env.AI_IMPACT_API_KEY
  console.log('====apiKey', apiKey)
  if (!apiKey) {
    // Heuristic mock: map filenames containing 'product' or 'cart' to pages/components.
    const affected_pages = new Set<string>()
    const affected_components = new Set<string>()
    const test_suggestions: string[] = []

    for (const f of changedFiles) {
      if (f.includes('product')) {
        affected_pages.add('/product/:id')
        affected_components.add('ProductCard')
        test_suggestions.push('test_product_flow.spec.ts')
      }
      if (f.includes('cart')) {
        affected_pages.add('/cart')
        affected_components.add('CartSummary')
        test_suggestions.push('test_cart.spec.ts')
      }
    }

    return {
      source: 'mock',
      affected_pages: Array.from(affected_pages),
      affected_components: Array.from(affected_components),
      test_suggestions: Array.from(new Set(test_suggestions)),
      confidence: 0.6,
      reason: 'No OPENAI_API_KEY provided — used filename heuristics.',
    }
  }

  // Call OpenAI with structured prompt
  const baseURL =
    process.env.IMPACT_LLM_BASE_URL ||
    process.env.OPENAI_BASE_URL ||
    'https://api.deepseek.com'
  const model = process.env.IMPACT_LLM_MODEL || 'deepseek-reasoner'

  console.log('LLM 配置信息:')
  console.log('  - Base URL:', baseURL)
  console.log('  - Model:', model)
  console.log('  - API Key:', apiKey ? `${apiKey.slice(0, 10)}...` : '未设置')

  const client = new OpenAI({
    baseURL,
    apiKey,
  })

  const inputPayload = {
    repo: { name: '', url: opts?.repoUrl || '' },
    diff: {
      base: opts?.base || '',
      head: opts?.head || '',
      changed_files: changedFiles,
      changed_summaries: (opts?.changedDetails || []).map((d) => ({
        file: d.file,
        added: d.added,
        deleted: d.deleted,
        hunks: d.hunks,
      })),
    },
    ast_snapshot: affected.map((a) => ({
      file: a.file,
      exportNames: a.exportNames || [],
      components: a.components || [],
    })),
    dependency_graph: dependencyGraph || {},
    project_hints: {
      routing: opts?.project_hints?.routing || [],
      test_conventions: opts?.project_hints?.test_conventions || [],
      component_roots: opts?.project_hints?.component_roots || [
        'src/components',
        'src/pages',
      ],
    },
    policy: {
      risk_threshold: opts?.policy?.risk_threshold || 'balanced',
      max_test_suggestions: opts?.policy?.max_test_suggestions ?? 8,
    },
  }

  const messages = buildLLMMessages(inputPayload)

  try {
    const resp = await client.chat.completions.create({
      model,
      messages,
      // max_tokens: 512,
      // temperature: 0.0,
    } as any)

    const txt = resp.choices?.[0]?.message?.content || ''
    console.log('LLM 原始返回长度:', txt.length)
    if (txt.length > 0 && txt.length < 500) {
      console.log('LLM 原始返回内容:', txt)
    }
    // Try to extract JSON from markdown code blocks or plain JSON
    let jsonStr = txt
    const jsonBlockMatch = txt.match(/```(?:json)?\s*(\{[\s\S]*\})\s*```/)
    if (jsonBlockMatch) {
      jsonStr = jsonBlockMatch[1]
    } else {
      const jsonStart = txt.indexOf('{')
      if (jsonStart >= 0) {
        const jsonEnd = txt.lastIndexOf('}')
        if (jsonEnd > jsonStart) {
          jsonStr = txt.slice(jsonStart, jsonEnd + 1)
        }
      }
    }

    try {
      const parsed = JSON.parse(jsonStr) as StrictJSONShape
      console.log('JSON 解析成功，包含字段:', Object.keys(parsed))
      if (!parsed.change_motivation) {
        console.warn('⚠️ 警告：LLM 返回结果中缺少 change_motivation 字段')
      }
      if (!parsed.page_impacts || parsed.page_impacts.length === 0) {
        console.warn('⚠️ 警告：LLM 返回结果中缺少 page_impacts 字段或为空')
      }
      return { source: 'openai', ...parsed }
    } catch (e) {
      console.error('JSON 解析失败:', e)
      console.log('尝试解析的 JSON 字符串（前500字符）:', jsonStr.slice(0, 500))
      // fallback: if markdown_report exists in raw text, try to extract it
      if (txt.includes('markdown_report') || txt.includes('##')) {
        return {
          source: 'openai_raw',
          raw: txt,
          confidence: 0.5,
          markdown_report: txt,
        }
      }
      return { source: 'openai_raw', raw: txt, confidence: 0.5 }
    }
  } catch (err: any) {
    const errorMsg = err?.message || String(err)
    const errorDetails = err?.response?.data || err?.status || ''
    console.error('LLM API 调用失败:', errorMsg)
    if (errorDetails) {
      console.error('错误详情:', JSON.stringify(errorDetails, null, 2))
    }
    return { 
      source: 'openai_error', 
      error: errorMsg,
      errorDetails: errorDetails ? JSON.stringify(errorDetails) : undefined
    }
  }
}
