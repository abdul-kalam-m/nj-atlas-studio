"""python -m pipeline inspect <url>: read-only description of an ArcGIS layer for recipe writing."""
from pipeline.arcgis import http_get_json, layer_info, object_id_field, object_ids, record_count

MAX_DISTINCT = 60
MAX_STRING_FIELDS = 15


def distinct_values(url: str, field: str, get_json) -> list | None:
    """Distinct values of one field, or None when there are more than MAX_DISTINCT."""
    response = get_json(url + "/query", {"where": "1=1", "returnDistinctValues": "true", "outFields": field,
                                         "returnGeometry": "false", "f": "json"})
    values = [feature["attributes"].get(field) for feature in response.get("features", [])]
    if len(values) > MAX_DISTINCT or response.get("exceededTransferLimit"):
        return None
    return sorted(values, key=lambda v: (v is None, str(v)))


def describe(url: str, get_json=http_get_json, echo=print) -> None:
    info = layer_info(url, get_json)
    spatial_reference = info.get("extent", {}).get("spatialReference", {})
    echo(f"name: {info.get('name')}")
    echo(f"geometry: {info.get('geometryType')}")
    echo(f"count: {record_count(url, '1=1', get_json)}")
    echo(f"maxRecordCount: {info.get('maxRecordCount')}")
    echo(f"formats: {info.get('supportedQueryFormats')}")
    echo(f"source CRS: EPSG:{spatial_reference.get('latestWkid') or spatial_reference.get('wkid')}")
    echo("fields:")
    for field in info.get("fields", []):
        domain = field.get("domain") or {}
        note = ""
        if domain.get("type") == "codedValue":
            codes = ", ".join(f"{c.get('code')}={c.get('name')}" for c in domain.get("codedValues", [])[:12])
            note = f"  CODED VALUES (stop and ask before filtering): {codes}"
        echo(f"  {field['name']}  ({field.get('type', '').replace('esriFieldType', '')}){note}")
    oid = object_id_field(info)
    sample_ids = object_ids(url, "1=1", get_json)[:3]
    if sample_ids:
        rows = get_json(url + "/query", {"objectIds": ",".join(map(str, sample_ids)), "outFields": "*",
                                         "returnGeometry": "false", "f": "json"})
        echo(f"sample rows ({oid} {sample_ids}):")
        for feature in rows.get("features", []):
            echo(f"  {feature.get('attributes')}")
    strings = [f["name"] for f in info.get("fields", []) if f.get("type") == "esriFieldTypeString"][:MAX_STRING_FIELDS]
    echo("distinct values of text fields:")
    for name in strings:
        values = distinct_values(url, name, get_json)
        shown = f"more than {MAX_DISTINCT} values" if values is None else f"{len(values)}: {values}"
        echo(f"  {name}: {shown}")
