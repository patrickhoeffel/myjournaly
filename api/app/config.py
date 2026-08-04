from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    project_id: str = ""
    anthropic_api_key: str = ""
    cors_origins: list[str] = ["http://localhost:5173", "http://localhost:5174"]
    storage_bucket: str = "myjournaly-assets"
    environment: str = "development"
    google_client_id: str = ""
    google_client_secret: str = ""

    model_config = {"env_prefix": "JOURNALY_", "env_file": ".env"}


settings = Settings()
