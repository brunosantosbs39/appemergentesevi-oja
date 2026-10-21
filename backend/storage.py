import os

import requests

APP_NAME = "servicoja"
storage_key = None


def _use_vercel() -> bool:
    return os.environ.get("STORAGE_PROVIDER", "vercel").lower() == "vercel"


def _storage_url() -> str:
    base = (os.environ.get("INTEGRATION_PROXY_URL") or "").strip() or "https://integrations.emergentagent.com"
    return base.rstrip("/") + "/objstore/api/v1/storage"


def init_storage(force: bool = False):
    if _use_vercel():
        if not os.environ.get("BLOB_READ_WRITE_TOKEN"):
            raise RuntimeError("Connect the Vercel Blob store to this project's environment")
        return "vercel"
    global storage_key
    if storage_key and not force:
        return storage_key
    resp = requests.post(f"{_storage_url()}/init", json={"emergent_key": os.environ.get("EMERGENT_LLM_KEY")}, timeout=30)
    resp.raise_for_status()
    storage_key = resp.json()["storage_key"]
    return storage_key


def put_object(path: str, data: bytes, content_type: str) -> dict:
    if _use_vercel():
        from vercel.blob import sync as blob

        init_storage()
        result = blob.put_blob(path, data, access="private", content_type=content_type,
                               add_random_suffix=False)
        return {"path": result.pathname, "size": len(data)}
    key = init_storage()
    resp = requests.put(
        f"{_storage_url()}/objects/{path}",
        headers={"X-Storage-Key": key, "Content-Type": content_type},
        data=data, timeout=120,
    )
    resp.raise_for_status()
    return resp.json()


def get_object(path: str) -> tuple:
    if _use_vercel():
        from vercel.blob import sync as blob

        init_storage()
        result = blob.get_blob(path, access="private")
        return result.body, result.metadata.content_type or "application/octet-stream"
    key = init_storage()
    resp = requests.get(f"{_storage_url()}/objects/{path}", headers={"X-Storage-Key": key}, timeout=60)
    resp.raise_for_status()
    return resp.content, resp.headers.get("Content-Type", "application/octet-stream")
