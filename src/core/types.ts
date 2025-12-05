/**
 * 核心类型定义
 */

export type StrictJSONShape = {
  markdown_report?: string // 完整的 markdown 格式报告
  change_motivation?: string // 变动动能分析（总体变更分析）
  confidence?: number // 分析置信度
  confidence_factors?: string[] // 置信度计算依据
  page_impacts?: Array<{
    page: string // 页面路径/路由
    page_name?: string // 页面名称
    changed_files?: string[] // 该页面相关的变更文件
    routes?: string[] // 该页面对应的路由
    affected_components?: Array<{
      component: string // 组件名称
      is_public?: boolean // 是否为公共组件
      affected_functions?: string[] // 受影响的具体函数/方法
      affected_features?: string[] // 受影响的功能点（如"搜索项从单选改为多选"）
    }>
    affected_modules?: Array<{
      module: string // 模块名称
      is_public?: boolean // 是否为公共模块
      affected_functions?: string[] // 受影响的具体函数/方法
    }>
    business_flows?: string[] // 受影响的业务流程
    business_logic?: string // 该页面的业务功能逻辑总结
    risks?: Array<{
      item: string // 风险项描述
      severity: 'high' | 'medium' | 'low' // 风险等级
      evidence: string // 风险证据
      affected_feature?: string // 受影响的具体功能点
    }>
  }>
  public_components?: Array<{
    component: string // 公共组件名称
    affected_pages?: string[] // 可能影响到的页面列表
    affected_functions?: string[] // 受影响的具体函数/方法
    affected_features?: string[] // 受影响的功能点
    business_logic?: string // 业务功能逻辑
    risks?: Array<{
      item: string
      severity: 'high' | 'medium' | 'low'
      evidence: string
    }>
  }>
  public_modules?: Array<{
    module: string // 公共模块名称
    affected_pages?: string[] // 可能影响到的页面列表
    affected_functions?: string[] // 受影响的具体函数/方法
    business_logic?: string // 业务功能逻辑
    risks?: Array<{
      item: string
      severity: 'high' | 'medium' | 'low'
      evidence: string
    }>
  }>
  test_suggestions?: string[]
  unknowns?: { question: string; why_it_matters: string; how_to_verify: string }[]
}

export type InputPayload = {
  repo: { name: string; url: string }
  diff: { base: string; head: string; changed_files: string[]; changed_summaries: any[] }
  ast_snapshot: { file: string; exportNames: string[]; components: string[] }[]
  dependency_graph: Record<string, string[]>
  project_hints: { routing: string[]; test_conventions: string[]; component_roots: string[] }
  policy: { risk_threshold: 'conservative' | 'balanced' | 'aggressive'; max_test_suggestions: number }
}

