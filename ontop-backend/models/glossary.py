"""业务词汇表数据模型。"""
from typing import Optional
from pydantic import BaseModel


class GlossaryTerm(BaseModel):
    """数据库行的完整表示。"""
    id:                str
    ds_id:             str              # '' 表示全局词汇，查询时合并
    term:              str              # 主业务词汇（如"欠款"）
    aliases:           list[str] = []   # 别名列表（如["逾期金额","拖欠"]）
    entity_uri:        str              # 本体 local name（如 "bill#balance_overdue"）
    entity_kind:       str = "data_property"   # class / data_property / object_property
    description:       str = ""         # 一句话业务说明
    example_questions: list[str] = []   # 示例问法
    source:            str = "human"    # 'human' | 'llm'
    created_at:        str
    updated_at:        Optional[str] = None


class GlossaryTermCreate(BaseModel):
    """创建/更新词汇的请求体。"""
    term:              str
    aliases:           list[str] = []
    entity_uri:        str
    entity_kind:       str = "data_property"
    description:       str = ""
    example_questions: list[str] = []
    source:            str = "human"


class GlossaryImport(BaseModel):
    """批量导入词汇的请求体。"""
    terms: list[GlossaryTermCreate]
    overwrite: bool = False    # True 则覆盖已存在的同名词汇
