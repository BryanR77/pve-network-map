import os
from dataclasses import dataclass

import yaml


@dataclass
class ClusterConfig:
    id: str
    name: str
    host: str
    token_id: str
    token_secret: str
    verify_ssl: bool = False
    poll_interval_seconds: float | None = None


REQUIRED_FIELDS = ("id", "host", "token_id", "token_secret")


def _load_clusters(path: str) -> list[ClusterConfig]:
    if not os.path.exists(path):
        raise RuntimeError(
            f"cluster config file not found: {path} "
            "(copy clusters.yaml.example to clusters.yaml and fill it in)"
        )
    with open(path) as f:
        raw = yaml.safe_load(f) or {}

    entries = raw.get("clusters") or []
    if not entries:
        raise RuntimeError(f"no clusters defined under 'clusters:' in {path}")

    clusters: list[ClusterConfig] = []
    seen_ids: set[str] = set()
    for i, entry in enumerate(entries):
        for field in REQUIRED_FIELDS:
            if not entry.get(field):
                raise RuntimeError(f"cluster entry {i} in {path} is missing required field '{field}'")
        cid = entry["id"]
        if cid in seen_ids:
            raise RuntimeError(f"duplicate cluster id '{cid}' in {path}")
        seen_ids.add(cid)
        clusters.append(
            ClusterConfig(
                id=cid,
                name=entry.get("name") or cid,
                host=entry["host"],
                token_id=entry["token_id"],
                token_secret=entry["token_secret"],
                verify_ssl=bool(entry.get("verify_ssl", False)),
                poll_interval_seconds=(
                    float(entry["poll_interval_seconds"]) if entry.get("poll_interval_seconds") else None
                ),
            )
        )
    return clusters


class Settings:
    poll_interval_seconds: float = float(os.environ.get("POLL_INTERVAL_SECONDS", "30"))
    clusters: list[ClusterConfig] = _load_clusters(os.environ.get("CLUSTERS_CONFIG", "clusters.yaml"))


settings = Settings()
