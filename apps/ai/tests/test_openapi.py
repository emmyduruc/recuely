"""SPEC.md §B5.1 completeness checks for the AI service's OpenAPI document."""

import re
from typing import Any, cast

from fastapi.routing import APIRoute

from app.main import TAG_DESCRIPTIONS, app

ERROR_STATUSES = {"400", "404", "409", "422", "500", "503"}
API_ERROR_REF = "#/components/schemas/ApiError"
OPERATION_ID = re.compile(r"^[a-z][a-zA-Z0-9]*$")
SUMMARY_MAX = 60
METHODS = {"get", "post", "put", "patch", "delete"}

Json = dict[str, Any]


def document() -> Json:
    return app.openapi()


def operations(doc: Json) -> list[tuple[str, Json]]:
    paths = cast(Json, doc["paths"])
    return [
        (f"{method.upper()} {path}", cast(Json, op))
        for path, item in paths.items()
        for method, op in cast(Json, item).items()
        if method in METHODS
    ]


def operation_violations(at: str, op: Json, registered: set[str], schemas: Json) -> list[str]:
    out: list[str] = []
    tags = cast(list[str], op.get("tags", []))
    if len(tags) != 1 or tags[0] not in registered:
        out.append(f"{at}: must have exactly one registered tag (rule 1)")
    if not OPERATION_ID.match(cast(str, op.get("operationId", ""))):
        out.append(f"{at}: operationId must be camelCase (rule 2)")
    summary = cast(str, op.get("summary", ""))
    if not summary or len(summary) > SUMMARY_MAX:
        out.append(f"{at}: summary must be 1-{SUMMARY_MAX} characters (rule 3)")
    if not op.get("description"):
        out.append(f"{at}: missing description (rule 4)")
    for status, response in cast(Json, op["responses"]).items():
        schema = cast(Json, response.get("content", {}).get("application/json", {}).get("schema", {}))
        ref = cast(str | None, schema.get("$ref"))
        if status.startswith("2") and (ref is None or ref.split("/")[-1] not in schemas):
            out.append(f"{at} {status}: success response needs a resolvable $ref schema (rule 7)")
        if status in ERROR_STATUSES and ref != API_ERROR_REF:
            out.append(f"{at} {status}: error response must reference ApiError (rule 7)")
    return out


def schema_violations(name: str, schema: Json) -> list[str]:
    out: list[str] = []
    if not schema.get("description"):
        out.append(f"schema {name}: missing description (rule 8)")
    # An enum schema lists its values, which serve as its examples.
    if not schema.get("examples") and not schema.get("enum"):
        out.append(f"schema {name}: missing example (rule 8)")
    for prop, value in cast(Json, schema.get("properties", {})).items():
        if not cast(Json, value).get("description"):
            out.append(f"schema {name}.{prop}: missing description (rule 8)")
    return out


def violations(doc: Json) -> list[str]:
    registered = {cast(str, tag["name"]) for tag in cast(list[Json], doc.get("tags", []))}
    schemas = cast(Json, doc.get("components", {}).get("schemas", {}))
    out: list[str] = []
    ids = [cast(str, op.get("operationId", "")) for _, op in operations(doc)]
    if len(ids) != len(set(ids)):
        out.append("operationIds must be unique (rule 2)")
    for at, op in operations(doc):
        out.extend(operation_violations(at, op, registered, schemas))
    for name, schema in schemas.items():
        out.extend(schema_violations(name, cast(Json, schema)))
    return out


def test_t1_every_tag_is_registered_with_a_description():
    tags = cast(list[Json], document()["tags"])
    assert [tag["name"] for tag in tags] == [tag.value for tag in TAG_DESCRIPTIONS]
    assert all(tag["description"] for tag in tags)


def test_t1_document_meets_the_documentation_standard():
    assert violations(document()) == []


def test_t1_health_is_documented_under_the_health_tag():
    op = cast(Json, document()["paths"]["/v0/health"]["get"])
    assert op["tags"] == ["Health"]
    assert op["operationId"] == "getHealth"


def test_t1_every_route_is_documented():
    documented = {at for at, _ in operations(document())}
    routes = {
        f"{method} {route.path}"
        for route in app.routes
        if isinstance(route, APIRoute) and route.include_in_schema
        for method in route.methods or set()
    }
    assert routes == documented


def test_t1_checker_fails_on_a_route_without_tag_or_description():
    doc = document()
    undocumented: Json = {"get": {"responses": {"200": {"description": "OK"}}}}
    bad = {**doc, "paths": {**doc["paths"], "/v0/bad": undocumented}}
    found = violations(bad)
    assert "GET /v0/bad: must have exactly one registered tag (rule 1)" in found
    assert "GET /v0/bad: missing description (rule 4)" in found
