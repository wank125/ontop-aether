from pydantic import BaseModel
from typing import Optional


class BilingualLabel(BaseModel):
    zh: str = ""
    en: str = ""


class OwlClass(BaseModel):
    name: str
    local_name: str
    labels: BilingualLabel
    comments: BilingualLabel
    examples: list[str] = []
    domain_tag: str = ""  # W/H/F/E


class OwlObjectProperty(BaseModel):
    name: str
    local_name: str
    labels: BilingualLabel
    comments: BilingualLabel
    domain: str = ""
    range: str = ""
    inverse_of: str = ""


class OwlDataProperty(BaseModel):
    name: str
    local_name: str
    labels: BilingualLabel
    comments: BilingualLabel
    domain: str = ""
    range: str = ""


class ShaclPropertyConstraint(BaseModel):
    path: str = ""
    path_inverse: str = ""
    min_count: Optional[int] = None
    min_inclusive: Optional[float] = None
    min_exclusive: Optional[float] = None
    datatype: str = ""
    has_value: str = ""
    in_values: list[str] = []


class ShaclSparqlConstraint(BaseModel):
    message: str = ""
    select: str = ""


class ShaclConstraint(BaseModel):
    name: str
    local_name: str
    labels: BilingualLabel
    comments: BilingualLabel
    target_class: str = ""
    properties: list[ShaclPropertyConstraint] = []
    sparql_constraints: list[ShaclSparqlConstraint] = []


class OntologyMetadata(BaseModel):
    labels: BilingualLabel = BilingualLabel()
    comments: BilingualLabel = BilingualLabel()
    version: str = ""
    version_iri: str = ""


class TtlOntology(BaseModel):
    metadata: OntologyMetadata = OntologyMetadata()
    classes: list[OwlClass] = []
    object_properties: list[OwlObjectProperty] = []
    data_properties: list[OwlDataProperty] = []
    shacl_constraints: list[ShaclConstraint] = []
