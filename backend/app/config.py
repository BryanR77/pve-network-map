import os


def _bool_env(name: str, default: bool) -> bool:
    val = os.environ.get(name)
    if val is None:
        return default
    return val.strip().lower() in ("1", "true", "yes", "on")


class Settings:
    pve_host: str = os.environ["PVE_HOST"]
    pve_token_id: str = os.environ["PVE_TOKEN_ID"]
    pve_token_secret: str = os.environ["PVE_TOKEN_SECRET"]
    pve_verify_ssl: bool = _bool_env("PVE_VERIFY_SSL", False)
    poll_interval_seconds: float = float(os.environ.get("POLL_INTERVAL_SECONDS", "30"))


settings = Settings()
