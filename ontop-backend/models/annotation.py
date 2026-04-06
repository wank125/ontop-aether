"""语义注释层数据模型 — 独立于 TTL 文件管理的本体业务标注。"""
from enum import Enum
from typing import Optional
from pydantic import BaseModel


class AnnotationStatus(str, Enum):
    pending  = "pending"    # LLM 自动生成，待人工审核
    accepted = "accepted"   # 人工确认，将合并入 active TTL
    rejected = "rejected"   # 人工拒绝，不写入 TTL


class AnnotationSource(str, Enum):
    llm   = "llm"    # 由语义增强服务自动生成
    human = "human"  # 人工创建或覆盖


class SemanticAnnotation(BaseModel):
    """数据库行的完整表示。"""
    id:          str
    ds_id:       str
    entity_uri:  str                  # 本体实体局部名（如 'OrderItem'）或完整 URI
    entity_kind: str                  # 'class' | 'data_property' | 'object_property'
    lang:        str                  # 'zh' | 'en'
    label:       str  = ""
    comment:     str  = ""
    source:      AnnotationSource
    status:      AnnotationStatus
    created_at:  str
    updated_at:  Optional[str] = None


class AnnotationUpsert(BaseModel):
    """新增或覆盖单条注释的请求体（人工调用）。"""
    entity_uri:  str
    entity_kind: str
    lang:        str
    label:       str = ""
    comment:     str = ""
    source:      AnnotationSource = AnnotationSource.human


class AnnotationStatusUpdate(BaseModel):
    """更新状态的请求体。"""
    status: AnnotationStatus


class BatchStatusUpdate(BaseModel):
    """批量更新状态的请求体。"""
    ids:    list[str]
    status: AnnotationStatus


class AnnotationStats(BaseModel):
    """各状态数量统计。"""
    pending:  int = 0
    accepted: int = 0
    rejected: int = 0
    total:    int = 0
