import os
from urllib.error import HTTPError
from urllib.parse import quote
from urllib.request import Request, urlopen
import json


def _url(object_name):
    base = os.environ["SUPABASE_URL"].rstrip("/")
    bucket = quote(os.getenv("SUPABASE_STORAGE_BUCKET", "face-scans"), safe="")
    return f"{base}/storage/v1/object/{bucket}/{quote(object_name, safe='/')}"


def _headers():
    key = os.environ["SUPABASE_SECRET_KEY"]
    headers = {"apikey": key}
    if not key.startswith("sb_secret_"):
        headers["Authorization"] = f"Bearer {key}"
    return headers


def upload_image(object_name, data, content_type):
    request = Request(
        _url(object_name),
        data=data,
        method="POST",
        headers={**_headers(), "Content-Type": content_type, "x-upsert": "false"},
    )
    with urlopen(request, timeout=30):
        pass
    return object_name


def signed_upload_url(object_name):
    """Create one short-lived, one-object upload grant without exposing the service key."""
    request = Request(
        _url(object_name).replace("/object/", "/object/upload/sign/"),
        data=b"{}",
        method="POST",
        headers={**_headers(), "Content-Type": "application/json"},
    )
    with urlopen(request, timeout=30) as response:
        body = json.loads(response.read())
    path = body.get("url") or body["signedURL"]
    return path if path.startswith("http") else f"{os.environ['SUPABASE_URL'].rstrip('/')}/storage/v1{path}"


def download_image(object_name, max_bytes=None):
    with urlopen(Request(_url(object_name), headers=_headers()), timeout=30) as response:
        return response.read(max_bytes + 1 if max_bytes is not None else -1)


def delete_image(object_name):
    try:
        with urlopen(Request(_url(object_name), method="DELETE", headers=_headers()), timeout=30):
            pass
    except HTTPError as exc:
        if exc.code != 404:
            raise


def signed_url(object_name, expires_in=900):
    request = Request(
        f"{_url(object_name).replace('/object/', '/object/sign/')}",
        data=json.dumps({"expiresIn": expires_in}).encode(),
        method="POST",
        headers={**_headers(), "Content-Type": "application/json"},
    )
    with urlopen(request, timeout=30) as response:
        path = json.loads(response.read())["signedURL"]
    return path if path.startswith("http") else f"{os.environ['SUPABASE_URL'].rstrip('/')}/storage/v1{path}"
