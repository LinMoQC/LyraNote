import { http } from "@/lib/http-client"
import { KNOWLEDGE_GRAPH } from "@/lib/api-routes"

/**
 * @file 知识图谱服务
 * @description 提供知识图谱（实体和关系）的查询、构建、重建和实体管理接口。
 *              将后端 snake_case 字段映射为前端 camelCase 结构。
 */

/** 知识图谱节点（实体） */
export interface GraphNode {
  id: string
  name: string
  type: string
  description?: string | null
  mentionCount: number
}

/** 知识图谱边（关系） */
export interface GraphLink {
  source: string
  target: string
  relationType: string
  description?: string | null
  weight: number
}

/** 完整的知识图谱数据（节点 + 边） */
export interface KnowledgeGraphData {
  nodes: GraphNode[]
  links: GraphLink[]
}

/** 实体详情（含关联关系列表） */
export interface EntityDetail {
  id: string
  name: string
  type: string
  description?: string | null
  mentionCount: number
  sourceTitle?: string | null
  relations: {
    direction: "incoming" | "outgoing"
    relationType: string
    entityName: string
    entityId: string
    description?: string | null
  }[]
}

type RawNode = {
  id: string
  name: string
  type: string
  description?: string | null
  mention_count: number
}

type RawLink = {
  source: string
  target: string
  relation_type: string
  description?: string | null
  weight: number
}

type RawEntityDetail = {
  id: string
  name: string
  type: string
  description?: string | null
  mention_count: number
  source_title?: string | null
  relations: {
    direction: string
    relation_type: string
    entity_name: string
    entity_id: string
    description?: string | null
  }[]
}

/**
 * 将后端原始图谱数据映射为前端格式（snake_case → camelCase）
 * @param raw - 后端返回的原始图谱数据
 * @returns 映射后的知识图谱数据
 */
function mapGraphData(raw: { nodes: RawNode[]; links: RawLink[] }): KnowledgeGraphData {
  return {
    nodes: raw.nodes.map((n) => ({
      id: n.id,
      name: n.name,
      type: n.type,
      description: n.description,
      mentionCount: n.mention_count,
    })),
    links: raw.links.map((l) => ({
      source: l.source,
      target: l.target,
      relationType: l.relation_type,
      description: l.description,
      weight: l.weight,
    })),
  }
}

/**
 * 获取指定笔记本的知识图谱
 * @param notebookId - 笔记本 ID
 * @returns 知识图谱数据
 */
export async function getNotebookGraph(notebookId: string): Promise<KnowledgeGraphData> {
  const data = await http.get<{ nodes: RawNode[]; links: RawLink[] }>(KNOWLEDGE_GRAPH.notebook(notebookId))
  return mapGraphData(data)
}

/**
 * 获取全局知识图谱（跨笔记本聚合）
 * @returns 知识图谱数据
 */
export async function getGlobalGraph(): Promise<KnowledgeGraphData> {
  const data = await http.get<{ nodes: RawNode[]; links: RawLink[] }>(KNOWLEDGE_GRAPH.GLOBAL)
  return mapGraphData(data)
}

/**
 * 重建指定笔记本的知识图谱
 * @param notebookId - 笔记本 ID
 */
export async function rebuildGraph(notebookId: string): Promise<void> {
  await http.post(KNOWLEDGE_GRAPH.rebuild(notebookId))
}

/**
 * 重建所有笔记本的知识图谱
 */
export async function rebuildAllGraphs(): Promise<void> {
  await http.post(KNOWLEDGE_GRAPH.REBUILD_ALL)
}

/**
 * 获取单个实体的详细信息（含所有关联关系）
 * @param entityId - 实体 ID
 * @returns 实体详情
 */
export async function getEntityDetail(entityId: string): Promise<EntityDetail> {
  const raw = await http.get<RawEntityDetail>(KNOWLEDGE_GRAPH.entity(entityId))
  return {
    id: raw.id,
    name: raw.name,
    type: raw.type,
    description: raw.description,
    mentionCount: raw.mention_count,
    sourceTitle: raw.source_title,
    relations: raw.relations.map((r) => ({
      direction: r.direction as "incoming" | "outgoing",
      relationType: r.relation_type,
      entityName: r.entity_name,
      entityId: r.entity_id,
      description: r.description,
    })),
  }
}

/**
 * 删除知识图谱中的实体
 * @param entityId - 实体 ID
 */
export async function deleteEntity(entityId: string): Promise<void> {
  await http.delete(KNOWLEDGE_GRAPH.entity(entityId))
}

/** 图谱重建进度信息 */
export interface RebuildProgress {
  current: number
  total: number
  sourceTitle: string
  status: "idle" | "processing" | "done"
}

/**
 * 查询当前图谱重建进度
 * @returns 进度信息（当前/总数/状态）
 */
export async function getRebuildProgress(): Promise<RebuildProgress> {
  const raw = await http.get<{ current: number; total: number; source_title: string; status: string }>(
    KNOWLEDGE_GRAPH.REBUILD_PROGRESS,
    { skipToast: true }
  )
  return {
    current: raw.current,
    total: raw.total,
    sourceTitle: raw.source_title,
    status: raw.status as RebuildProgress["status"],
  }
}
